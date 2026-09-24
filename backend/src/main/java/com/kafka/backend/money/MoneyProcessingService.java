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
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final List<MoneyNotificationParser> parsers=List.of(new ShinhanNotificationParserV1(),new IbkNotificationParserV1(),
            new WooriNotificationParserV1(),new KakaoNotificationParserV1());
    @org.springframework.beans.factory.annotation.Autowired
    public MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){this(db,json,manager,Clock.systemUTC());}
    MoneyProcessingService(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager,Clock clock){
        this.db=db;this.json=json;this.transactions=new TransactionTemplate(manager);this.clock=clock;
    }
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
            List<ParseAttempt> attempts=new ArrayList<>();
            for(var raw:raws){
                if(raw.state()==ProcessingState.PROCESSED){money.finishProcessing(raw.id(),raw.state(),"POSTED");continue;}
                ParseAttempt a;
                if(raw.state()==ProcessingState.RECEIVED){
                    var parser=parsers.stream().filter(p->p.supports(raw)).findFirst().orElse(parsers.getFirst());
                    a=money.process(raw.id(),parser);
                }else {
                    var history=money.attempts(raw.id());if(history.isEmpty()){money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"MISSING_PARSE_ATTEMPT");continue;}
                    a=history.getLast();
                }
                if(!"PARSED".equals(a.status())){
                    money.finishProcessing(raw.id(),ProcessingState.valueOf(a.status()),a.failureCode()==null?"UNRECOGNIZED_SHAPE":a.failureCode());continue;
                }
                if(a.candidate().occurredAt()==null||a.candidate().timeSource()==null||a.candidate().postedAt()==null){
                    money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"INCOMPLETE_CANDIDATE");continue;
                }
                attempts.add(a);
            }
            if(attempts.isEmpty())return 0;
            Instant since=attempts.stream().map(a->a.candidate().occurredAt()).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(clock.instant()).minusSeconds(90);
            var existing=money.recentTransactions(since);if(existing.size()>500)return 0;
            var proposals=new VerifiedMoneyTransferMatcher(clock).propose(new MoneyTransferMatcher.Context(money.accounts(),attempts,existing));
            Set<UUID> done=new HashSet<>();int posted=0;
            for(var p:proposals){
                if(p.transaction()!=null){money.recordTransaction(p.transaction());posted++;
                    for(var s:p.sources()){money.finishProcessing(s.rawEventId(),ProcessingState.PROCESSED,"POSTED");done.add(s.rawEventId());}}
                else if(p.disposition()==MoneyTransferMatcher.Disposition.AUXILIARY){
                    for(var s:p.sources()){money.attachAuxiliary(p.existingTransactionId(),s);done.add(s.rawEventId());}}
                else if(p.disposition()==MoneyTransferMatcher.Disposition.REVIEW_REQUIRED){
                    for(var s:p.sources()){money.finishProcessing(s.rawEventId(),ProcessingState.REVIEW_REQUIRED,(String)p.evidence().get("reason"));done.add(s.rawEventId());}}
            }
            for(var a:attempts)if(!done.contains(a.rawEventId()))money.deferProcessing(a.rawEventId(),
                    a.createdAt().plus(VerifiedMoneyTransferMatcher.WAIT).isAfter(clock.instant())?a.createdAt().plus(VerifiedMoneyTransferMatcher.WAIT):clock.instant().plusSeconds(5));
            return posted;
        }));
    }
}
