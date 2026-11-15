package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

@Service
public class MoneyProcessingService {
    static final String IGNORED_NON_FINANCIAL="IGNORED_NON_FINANCIAL";
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final Duration observationWindow,transferWindow;
    private final List<MoneyNotificationParser> parsers=List.of(new ShinhanNotificationParserV1(),new IbkNotificationParserV1(),
            new WooriNotificationParserV1(),new KakaoNotificationParserV1());
    @org.springframework.beans.factory.annotation.Autowired
    public MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager,
        @org.springframework.beans.factory.annotation.Value("${app.money.observation-window:PT10S}") Duration observationWindow,
        @org.springframework.beans.factory.annotation.Value("${app.money.transfer-window:PT60S}") Duration transferWindow){this(db,json,manager,Clock.systemUTC(),observationWindow,transferWindow);}
    public MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){this(db,json,manager,Clock.systemUTC());}
    MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager,Clock clock){
        this(db,json,manager,clock,VerifiedMoneyTransferMatcher.WAIT,VerifiedMoneyTransferMatcher.TRANSFER_WINDOW);
    }
    MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager,Clock clock,Duration observationWindow,Duration transferWindow){
        this.db=db;this.json=json;this.transactions=new TransactionTemplate(manager);this.clock=clock;
        this.observationWindow=observationWindow;this.transferWindow=transferWindow;
        new VerifiedMoneyTransferMatcher(clock,observationWindow,transferWindow);
    }
    private static boolean krw(String currency){return currency==null||"KRW".equals(currency);}
    /** Read-only context flag: never rewrite persisted currency or parser evidence for old scheduled observations. */
    private ParsedCandidate contextualCandidate(String payload,String rawCurrency,String candidateCurrency){
        if(payload==null)return null;var tree=json.readTree(payload);if(tree instanceof tools.jackson.databind.node.ObjectNode object)object.remove("currency");var c=json.treeToValue(tree,ParsedCandidate.class);
        if(krw(rawCurrency)&&krw(candidateCurrency)&&krw(c.evidence()==null?null:Objects.toString(c.evidence().get("currency"),null)))return c;
        return new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),c.occurredAt(),c.providerTimeText(),c.sourceAccountHint(),c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),ParseStatus.REVIEW_REQUIRED,c.postedAt(),c.providerOccurredAt(),c.timeSource(),c.parserVersion(),c.evidence());
    }
    private ParseAttempt contextualAttempt(java.sql.ResultSet rs)throws java.sql.SQLException{return new ParseAttempt(rs.getObject("id",UUID.class),rs.getObject("raw_event_id",UUID.class),rs.getString("parser_key"),rs.getString("parser_version"),rs.getString("status"),rs.getString("failure_code"),contextualCandidate(rs.getString("candidate"),rs.getString("raw_currency"),rs.getString("candidate_currency")),rs.getTimestamp("created_at").toInstant());}
    public int runDue(){
        // Owner IDs come exclusively from durable scheduled rows, never from an HTTP request parameter.
        var owners=db.queryForList("select user_id from money_raw_notifications where processing_due_at<=now() group by user_id order by min(processing_due_at) limit 50",UUID.class);
        int count=0;for(var owner:owners)count+=runOwner(owner);return count;
    }
    int runOwner(UUID owner){
        return Objects.requireNonNull(transactions.execute(status->{
            // Serializes matching/posting across application instances for this owner; no session identity mutation.
            if(!Boolean.TRUE.equals(db.queryForObject("select pg_try_advisory_xact_lock(hashtextextended(?,0))",Boolean.class,"money:"+owner)))return 0;
            var money=new MoneyService(db,()->owner,json);
            var raws=money.scheduledNotifications();
            if(raws.isEmpty()||raws.size()>500)return 0; // Never match against a truncated candidate set.
            var latest=new HashMap<UUID,ParseAttempt>();if(raws.stream().anyMatch(r->r.state()!=ProcessingState.RECEIVED))for(var a:db.query("select distinct on(p.raw_event_id) p.*,r.raw_payload->>'currency' as raw_currency,p.candidate->>'currency' as candidate_currency from money_parse_attempts p join money_raw_notifications r on r.id=p.raw_event_id and r.user_id=p.user_id where p.user_id=? and r.processing_due_at is not null and r.state<>'RECEIVED' order by p.raw_event_id,p.created_at desc,p.id desc",(rs,n)->contextualAttempt(rs),owner))latest.put(a.rawEventId(),a);
            var linked=new HashSet<UUID>();var archived=new HashSet<UUID>();
            for(var protection:db.queryForList("select r.id,r.review_deferred,exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id) as linked from money_raw_notifications r where r.user_id=? and r.id=any(?)",owner,raws.stream().map(MoneyRawNotification::id).toArray(UUID[]::new))){UUID id=(UUID)protection.get("id");if(Boolean.TRUE.equals(protection.get("linked")))linked.add(id);if(Boolean.TRUE.equals(protection.get("review_deferred")))archived.add(id);}
            List<ParseAttempt> attempts=new ArrayList<>();
            for(var raw:raws){
                if(linked.contains(raw.id())){money.finishProcessing(raw.id(),ProcessingState.PROCESSED,"POSTED");continue;}
                if(archived.contains(raw.id())){
                    db.update("update money_raw_notifications set processing_due_at=null where user_id=? and id=?",owner,raw.id());continue;
                }
                if(raw.state()==ProcessingState.PROCESSED){money.finishProcessing(raw.id(),raw.state(),"POSTED");continue;}
                ParseAttempt a;
                if(raw.state()==ProcessingState.RECEIVED){
                    var parser=parsers.stream().filter(p->p.supports(raw)).findFirst().orElse(parsers.getFirst());
                    a=money.process(raw.id(),parser);
                }else {
                    a=latest.get(raw.id());if(a==null){money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"MISSING_PARSE_ATTEMPT");continue;}
                }
                if(!"PARSED".equals(a.status())){
                    // Unrecognised text without transaction evidence is retained as audit only; the owner can restore it.
                    if("REVIEW_REQUIRED".equals(a.status())&&MoneyNoiseFilter.nonFinancial(raw)){
                        money.finishProcessing(raw.id(),ProcessingState.PROCESSED,IGNORED_NON_FINANCIAL);continue;}
                    money.finishProcessing(raw.id(),ProcessingState.valueOf(a.status()),a.failureCode()==null?"UNRECOGNIZED_SHAPE":a.failureCode());continue;
                }
                if(a.candidate()==null||a.candidate().parseStatus()!=ParseStatus.PARSED||!krw(Objects.toString(raw.rawPayload().get("currency"),null))||!"KRW".equals(MoneyOrdinaryAdmission.currency(a.candidate()))){money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"UNSUPPORTED_CURRENCY_OR_SOURCE");continue;}
                if(!Objects.equals(MoneyOrdinaryAdmission.PACKAGES.get(a.candidate().provider()),raw.sourcePackage())||!Objects.equals(a.candidate().provider().toLowerCase(Locale.ROOT)+"-push",a.parserKey())||!MoneyOrdinaryAdmission.supportedParserVersion(a.candidate().provider(),a.parserVersion())){money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"UNSUPPORTED_CURRENCY_OR_SOURCE");continue;}
                if(a.candidate().occurredAt()==null||a.candidate().timeSource()==null||a.candidate().postedAt()==null){
                    money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"INCOMPLETE_CANDIDATE");continue;
                }
                // Admission time starts at successful ingestion, including parser/job recovery after a restart.
                attempts.add(new ParseAttempt(a.id(),a.rawEventId(),a.parserKey(),a.parserVersion(),a.status(),a.failureCode(),a.candidate(),raw.receivedAt()));
            }
            if(attempts.isEmpty())return 0;
            Instant since=attempts.stream().map(a->a.candidate().occurredAt()).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(clock.instant()).minusSeconds(90);
            var existing=money.recentTransactions(since);if(existing.size()>500)return 0;
            var terminal=db.query("""
             select p.*,r.raw_payload->>'currency' as raw_currency,p.candidate->>'currency' as candidate_currency from money_raw_notifications r join lateral(select * from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true
             where r.user_id=? and r.processing_due_at is null and r.state in ('REVIEW_REQUIRED','FAILED','PROCESSED','PARSED')
              and p.status='PARSED' and (p.candidate->>'occurredAt')::timestamptz>=? and (p.candidate->>'occurredAt')::timestamptz<=?
              and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id)
             order by r.id limit 501
             """,(rs,n)->contextualAttempt(rs),owner,java.sql.Timestamp.from(since.minusSeconds(MoneyReviewService.PAIR_WINDOW_SECONDS)),java.sql.Timestamp.from(attempts.stream().map(a->a.candidate().occurredAt()).max(Comparator.naturalOrder()).orElse(clock.instant()).plusSeconds(MoneyReviewService.PAIR_WINDOW_SECONDS+90)));
            if(terminal.size()+attempts.size()>500)return 0;
            var graph=new ArrayList<>(attempts);graph.addAll(terminal);var terminalIds=new HashSet<>(terminal.stream().map(ParseAttempt::rawEventId).toList());
            var proposals=new VerifiedMoneyTransferMatcher(clock,observationWindow,transferWindow).propose(new MoneyTransferMatcher.Context(money.accounts(),graph,existing));
            Set<UUID> done=new HashSet<>();int posted=0;
            for(var p:proposals){
                var scheduled=p.sources().stream().filter(s->!terminalIds.contains(s.rawEventId())).toList();if(scheduled.isEmpty())continue;
                boolean terminalRelated=p.sources().stream().anyMatch(s->terminalIds.contains(s.rawEventId()));
                if(!terminalRelated&&p.transaction()!=null)for(var source:scheduled){var candidate=attempts.stream().filter(a->a.rawEventId().equals(source.rawEventId())).findFirst().orElseThrow().candidate();terminalRelated=terminal.stream().anyMatch(a->a.candidate().amount().compareTo(candidate.amount())==0&&VerifiedMoneyTransferMatcher.close(a.candidate(),candidate,transferWindow)&&Objects.equals(a.candidate().provider(),candidate.provider())&&Objects.equals(a.candidate().sourceAccountHint(),candidate.sourceAccountHint())&&Objects.equals(a.candidate().destinationAccountHint(),candidate.destinationAccountHint()));if(terminalRelated)break;}
                if(terminalRelated){for(var source:scheduled){money.finishProcessing(source.rawEventId(),ProcessingState.REVIEW_REQUIRED,"LATE_TERMINAL_EVIDENCE_REQUIRES_CONFIRMATION");done.add(source.rawEventId());}continue;}
                boolean sameFactCandidate=p.transaction()!=null||Set.of("POSSIBLE_ALREADY_POSTED_ROUTE","LATE_POSTED_TRANSFER_SOURCE_OVERLAP").contains(Objects.toString(p.evidence().get("reason"),""));
                if(sameFactCandidate&&scheduled.size()==1&&p.sources().size()==1&&attachProvenSameFact(money,owner,attempts.stream().filter(a->a.rawEventId().equals(scheduled.getFirst().rawEventId())).findFirst().orElseThrow(),existing)){
                    done.add(scheduled.getFirst().rawEventId());continue;
                }
                if(p.transaction()!=null){if(Boolean.TRUE.equals(p.evidence().get("meaningUnresolved")))money.recordUnresolvedTransactionId(p.transaction());else money.recordTransaction(p.transaction());posted++;
                    for(var s:p.sources()){money.finishProcessing(s.rawEventId(),ProcessingState.PROCESSED,"POSTED");done.add(s.rawEventId());}}
                else if(p.disposition()==MoneyTransferMatcher.Disposition.AUXILIARY){
                    for(var s:p.sources()){money.attachAuxiliary(p.existingTransactionId(),s);done.add(s.rawEventId());}}
                else if(p.disposition()==MoneyTransferMatcher.Disposition.REVIEW_REQUIRED){
                    for(var s:scheduled){money.finishProcessing(s.rawEventId(),ProcessingState.REVIEW_REQUIRED,(String)p.evidence().get("reason"));done.add(s.rawEventId());}}
            }
            for(var a:attempts)if(!done.contains(a.rawEventId()))money.deferProcessing(a.rawEventId(),
                    a.createdAt().plus(observationWindow).isAfter(clock.instant())?a.createdAt().plus(observationWindow):clock.instant().plusSeconds(5));
            return posted;
        }));
    }
    /** Similarity alone is insufficient: immutable provider precision/balance or a corroborated owned route is required. */
    private boolean attachProvenSameFact(MoneyService money,UUID owner,ParseAttempt incoming,List<MoneyTransaction> facts){
        var c=incoming.candidate();var accounts=money.accounts();var resolver=new MoneyAccountResolver();
        var own=resolver.resolve(accounts,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());if(!own.resolved())return false;
        var source=VerifiedMoneyTransferMatcher.source(incoming,SourceRelationship.PRIMARY,"VERIFIED_SAME_FACT_ATTACHMENT");
        var sameSide=new TransactionInput(c.direction()==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME,c.direction()==Direction.OUT?own.account().id():null,c.direction()==Direction.IN?own.account().id():null,c.amount(),"KRW",c.occurredAt(),c.counterpartyText(),List.of(source));
        var proposal=new MoneyTransferMatcher.Proposal(MoneyTransferMatcher.Disposition.NO_MATCH,sameSide,null,List.of(source),Map.of());
        var matches=new ArrayList<MoneyTransaction>();
        for(var t:facts){
            if(t.excluded()||t.mergedInto()!=null||!"KRW".equals(t.currency())||t.amount().compareTo(c.amount())!=0||!Objects.equals(own.account().id(),c.direction()==Direction.OUT?t.fromAccountId():t.toAccountId())||Duration.between(t.occurredAt(),c.occurredAt()).abs().compareTo(VerifiedMoneyTransferMatcher.PROVIDER_WINDOW)>0)continue;
            // Minute precision can describe separate equal-value movements with intervening cash.
            boolean proof=c.timeSource()==TimeSource.PROVIDER_SECOND&&t.sources().stream().anyMatch(s->Objects.equals(s.evidence().get("provider"),c.provider())&&Objects.equals(s.evidence().get("counterpartyText"),c.counterpartyText()))&&VerifiedMoneyTransferMatcher.sameBalanceIdentity(t,proposal);
            if(!proof&&t.type()==TransactionType.TRANSFER)for(var s:t.sources()){
                if(s.parseAttemptId()==null||s.relationship()!=SourceRelationship.PRIMARY)continue;
                var prior=money.attempts(s.rawEventId()).stream().filter(a->a.id().equals(s.parseAttemptId())).findFirst().orElse(null);if(prior==null||prior.candidate()==null)continue;
                var a=prior.candidate();var ar=new VerifiedMoneyTransferMatcher.Resolved(prior,resolver.resolve(accounts,a.provider(),a.sourceAccountHint()).account(),resolver.resolve(accounts,a.provider(),a.destinationAccountHint()).account());
                var br=new VerifiedMoneyTransferMatcher.Resolved(incoming,resolver.resolve(accounts,c.provider(),c.sourceAccountHint()).account(),resolver.resolve(accounts,c.provider(),c.destinationAccountHint()).account());
                String rule=VerifiedMoneyTransferMatcher.pairEvidence(ar,br);
                if(rule!=null&&!"UNIQUE_VERIFIED_OWNED_ACCOUNTS".equals(rule)){proof=true;break;}
            }
            if(proof)matches.add(t);
        }
        if(matches.size()!=1)return false;var target=matches.getFirst();
        db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY',cast(? as jsonb))",target.id(),owner,incoming.rawEventId(),incoming.id(),json.writeValueAsString(source.evidence()));
        db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner,target.id());
        db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",target.version()+1,owner,target.id(),target.version());
        money.finishProcessing(incoming.rawEventId(),ProcessingState.PROCESSED,"ATTACHED_VERIFIED_SAME_FACT");return true;
    }
}
