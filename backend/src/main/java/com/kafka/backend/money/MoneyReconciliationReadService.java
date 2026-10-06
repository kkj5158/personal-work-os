package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** One repeatable-read view of existing facts, candidates and evidence. Never writes an observation or a ledger fact. */
@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class MoneyReconciliationReadService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyService money;private final MoneyProductService product;private final ObjectMapper json;
 public MoneyReconciliationReadService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyProductService product,ObjectMapper json){this.db=db;this.users=users;this.money=money;this.product=product;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private record Evidence(UUID id,String kind,Instant at,BigDecimal amount,String currency,String title,String status,String reason,List<UUID> sourceIds,boolean bookkeepingVisible){}
 private record Observation(Instant at,BigDecimal amount,String kind,UUID sourceId){}
 public Map<String,Object> snapshot(UUID accountId,Instant requested,String expectedToken,String search,int offset){
  require(offset>=0&&offset<=10000,"증빙 페이지를 확인해 주세요.");text(search,200,false,"검색");var account=money.account(accountId);
  Instant cutoff=requested==null?Instant.now():requested;require(!cutoff.isAfter(Instant.now().plusSeconds(60)),"미래 기준시각은 비교할 수 없습니다.");
  var accounts=money.accounts();var observations=new ArrayList<Observation>();
  db.query("select amount,verified_at from money_balance_checkpoints where user_id=? and account_id=? and verified_at<=? order by verified_at,created_at,id",r->{observations.add(new Observation(r.getTimestamp("verified_at").toInstant(),r.getBigDecimal("amount"),"MANUAL",null));},owner(),accountId,Timestamp.from(cutoff));
  var raws=db.queryForList("""
   select r.id,r.title,r.posted_at,r.state,r.processing_version,r.processing_reason,r.review_deferred,p.id as attempt_id,p.parser_version,p.status,p.failure_code,p.created_at,p.candidate::text,
    s.transaction_id from money_raw_notifications r left join lateral(select * from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true
    left join money_transaction_sources s on s.user_id=r.user_id and s.raw_event_id=r.id
    where r.user_id=? and r.posted_at<=? order by r.posted_at,r.id limit 10001
   """,owner(),Timestamp.from(cutoff));
  boolean partial=raws.size()>10000;var attempts=new ArrayList<ParseAttempt>();var candidates=new HashMap<UUID,ParsedCandidate>();
  var rawById=new HashMap<UUID,Map<String,Object>>();long unknown=0;
  for(var raw:raws){UUID id=(UUID)raw.get("id");rawById.put(id,raw);if(raw.get("candidate")==null){if(!"PROCESSED".equals(raw.get("state")))partial=true;continue;}
   var c=json.readValue(raw.get("candidate").toString(),ParsedCandidate.class);candidates.put(id,c);
   var resolved=new MoneyAccountResolver().resolve(accounts,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());
   boolean belongs=resolved.resolved()&&resolved.account().id().equals(accountId);
   if(belongs&&c.postBalance()!=null&&c.postedAt()!=null&&!c.postedAt().isAfter(cutoff)&&c.timeSource()!=null&&!"IGNORED_NON_FINANCIAL".equals(raw.get("processing_reason"))){observations.add(new Observation(c.postedAt(),c.postBalance(),"NOTIFICATION",id));}
   if(raw.get("transaction_id")==null&&!"PROCESSED".equals(raw.get("state"))&&!Boolean.TRUE.equals(raw.get("review_deferred"))&&"PARSED".equals(raw.get("status"))&&c.occurredAt()!=null&&c.postedAt()!=null&&c.timeSource()!=null){attempts.add(new ParseAttempt((UUID)raw.get("attempt_id"),id,c.provider(),raw.get("parser_version").toString(),"PARSED",null,c,((Timestamp)raw.get("created_at")).toInstant()));}
  }
  observations.sort(Comparator.comparing(Observation::at).thenComparing(o->o.kind().equals("MANUAL")?1:0));
  Observation observed=observations.isEmpty()?null:observations.getLast();
  boolean conflict=observed!=null&&observations.stream().filter(o->o.at().equals(observed.at())&&o.kind().equals(observed.kind())).map(Observation::amount).map(BigDecimal::stripTrailingZeros).distinct().count()>1;
  Observation anchor=observed==null?null:observations.stream().filter(o->o.at().isBefore(observed.at())&&o.kind().equals("MANUAL")).reduce((a,b)->b).orElseGet(()->observations.stream().filter(o->o.at().isBefore(observed.at())).findFirst().orElse(null));
  if(observed!=null&&observed.kind().equals("MANUAL"))anchor=observed;
  boolean anchorConflict=anchor!=null&&conflicting(observations,anchor);
  Instant until=observed==null?cutoff:observed.at(),from=anchor==null?Instant.EPOCH:anchor.at();
  var facts=db.query("select t.* from money_transactions t where t.user_id=? and (t.from_account_id=? or t.to_account_id=?) and not t.excluded and t.merged_into is null and "+MoneyProductService.effectiveAt("?::uuid")+">? and "+MoneyProductService.effectiveAt("?::uuid")+"<=? order by t.occurred_at desc,t.id",money::transactionListRow,owner(),accountId,accountId,accountId,Timestamp.from(from),accountId,Timestamp.from(until));
  boolean unsupported=facts.stream().anyMatch(t->!"KRW".equals(t.currency()));
  var allSources=db.queryForList("select transaction_id,raw_event_id from money_transaction_sources where user_id=?",owner());var sources=new HashMap<UUID,List<UUID>>();for(var source:allSources)sources.computeIfAbsent((UUID)source.get("transaction_id"),key->new ArrayList<>()).add((UUID)source.get("raw_event_id"));
  var visible=new HashSet<>(db.queryForList(MoneyWebService.BOOK_BASE+"select id from effective e where not excluded and exists(select 1 from money_tracking_accounts ta join money_accounts a on a.id=ta.account_id and a.user_id=ta.user_id where ta.user_id=? and ta.kind=case when e.type='INCOME' then 'INCOME' else 'EXPENSE' end and not a.archived and ta.account_id=e.\"trackingAccountId\")",UUID.class,owner(),owner()));
  var evidence=new ArrayList<Evidence>();
  for(var t:facts){var ids=sources.getOrDefault(t.id(),List.of());evidence.add(new Evidence(t.id(),"TRANSACTION",t.occurredAt(),t.amount(),t.currency(),t.title()==null?t.counterpartyText():t.title(),"REGISTERED",visible.contains(t.id())?"가계부에 표시됨":t.type()==TransactionType.TRANSFER?"내부 이체 · 일반 수입·소비 제외":t.type()==TransactionType.LOAN_PAYMENT?"확인된 이자·수수료만 소비 · 추적 범위 확인":"가계부 추적 계좌·유형·제외 조건 확인",ids,visible.contains(t.id())));}
  // Use the same deterministic candidate graph as posting. The proposals are read-only; terminal items are never posted here.
  Instant since=attempts.stream().map(a->a.candidate().occurredAt()).min(Comparator.naturalOrder()).orElse(until).minusSeconds(90);
  var existing=money.recentTransactions(since);if(existing.size()>500)partial=true;
  var proposals=existing.size()>500?List.<MoneyTransferMatcher.Proposal>of():new VerifiedMoneyTransferMatcher(Clock.fixed(cutoff,ZoneOffset.UTC)).propose(new MoneyTransferMatcher.Context(accounts,attempts,existing));
  BigDecimal pendingDelta=BigDecimal.ZERO;var considered=new HashSet<UUID>();long eligible=0;
  for(var proposal:proposals){var t=proposal.transaction();List<UUID> ids=proposal.sources().stream().map(TransactionSource::rawEventId).toList();considered.addAll(ids);
   Instant candidateAt=ids.stream().map(candidates::get).filter(Objects::nonNull).filter(c->c.direction()==(accountId.equals(t==null?null:t.fromAccountId())?Direction.OUT:Direction.IN)).map(ParsedCandidate::postedAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(t==null?until:t.occurredAt());
   boolean inScope=t!=null&&(accountId.equals(t.fromAccountId())||accountId.equals(t.toAccountId()))&&candidateAt.isAfter(from)&&!candidateAt.isAfter(until);
   if(inScope){pendingDelta=pendingDelta.add(accountId.equals(t.toAccountId())?t.amount():t.amount().negate());eligible++;evidence.add(new Evidence(ids.getFirst(),"RAW",candidateAt,t.amount(),t.currency(),t.counterpartyText(),"ELIGIBLE_UNREGISTERED","명확한 미등록 후보 · 금융 확인 후 등록",ids,false));}
   else for(UUID id:ids){var c=candidates.get(id);if(c!=null&&touches(c,accounts,accountId)&&c.postedAt().isAfter(from)&&!c.postedAt().isAfter(until)){unknown++;evidence.add(rawEvidence(rawById.get(id),c,"NEEDS_CONFIRMATION",Objects.toString(proposal.evidence().get("reason"),"후보 관계·시각·금액을 확인해 주세요.")));}}
  }
  for(var raw:raws){UUID id=(UUID)raw.get("id");var c=candidates.get(id);if(raw.get("transaction_id")==null&&!considered.contains(id)&&c!=null&&touches(c,accounts,accountId)&&c.postedAt()!=null&&c.postedAt().isAfter(from)&&!c.postedAt().isAfter(until)&&!"PROCESSED".equals(raw.get("state"))){unknown++;evidence.add(rawEvidence(raw,c,"NEEDS_CONFIRMATION",Boolean.TRUE.equals(raw.get("review_deferred"))?"보류한 원문 · 참고 계산에서 제외":"파싱·계좌·시각 근거 확인 필요"));}}
  evidence.sort(Comparator.comparing((Evidence e)->e.status().equals("REGISTERED")?1:0).thenComparing(Evidence::at,Comparator.reverseOrder()).thenComparing(Evidence::id));
  BigDecimal ledger=anchor==null||conflict||anchorConflict||unsupported?null:anchor.amount().add(product.ledgerDelta(accountId,from,until));
  BigDecimal reference=ledger==null?null:ledger.add(pendingDelta),difference=ledger==null?null:observed.amount().subtract(ledger);
  String status=observed==null||anchor==null||conflict||anchorConflict||unsupported||partial||unknown>0?"INSUFFICIENT":difference.signum()==0?observed.kind().equals("MANUAL")?"MANUAL_ANCHOR":"REGISTERED_MATCH":reference.compareTo(observed.amount())==0?"EXPLAINED_UNREGISTERED":"UNEXPLAINED";
  var result=new LinkedHashMap<String,Object>();result.put("account",account);result.put("currency","KRW");result.put("cutoff",cutoff);result.put("comparisonAt",observed==null?null:observed.at());result.put("anchor",anchorConflict?null:anchor);result.put("observation",conflict?null:observed);result.put("registeredBalance",ledger);result.put("referenceBalance",reference);result.put("difference",difference);result.put("status",status);result.put("partial",partial||unknown>0);result.put("conflictingEvidence",conflict||anchorConflict);result.put("independentVerification",false);result.put("eligibleUnregistered",eligible);result.put("unresolved",unknown);result.put("registeredCount",facts.size());result.put("bookkeepingVisibleCount",evidence.stream().filter(Evidence::bookkeepingVisible).count());result.put("unsupportedCurrency",unsupported);
  String token=hash(result,observations,evidence,facts.stream().map(t->Arrays.asList(t.id(),t.version())).toList(),raws.stream().map(r->Arrays.asList(r.get("id"),r.get("processing_version"),r.get("attempt_id"),r.get("transaction_id"))).toList());
  if(expectedToken!=null&&!expectedToken.equals(token))throw new OptimisticLockConflictException("조사 근거가 변경되었습니다. 현재 선택을 유지하고 새 조사 자료를 불러와 주세요.");
  var filtered=evidence.stream().filter(e->search==null||search.isBlank()||Objects.toString(e.title(),"").toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))||e.reason().toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))).toList();
  result.put("token",token);result.put("totalEvidence",evidence.size());result.put("filteredEvidence",filtered.size());result.put("offset",offset);result.put("items",filtered.stream().skip(offset).limit(10).toList());return result;
 }
 private static boolean conflicting(List<Observation> observations,Observation target){return observations.stream().filter(o->o.at().equals(target.at())&&o.kind().equals(target.kind())).map(Observation::amount).map(BigDecimal::stripTrailingZeros).distinct().count()>1;}
 private static boolean touches(ParsedCandidate c,List<MoneyAccount> accounts,UUID id){var resolver=new MoneyAccountResolver();for(String hint:Arrays.asList(c.sourceAccountHint(),c.destinationAccountHint())){var r=resolver.resolve(accounts,c.provider(),hint);if(r.resolved()&&r.account().id().equals(id))return true;}return false;}
 private static Evidence rawEvidence(Map<String,Object> raw,ParsedCandidate c,String status,String reason){return new Evidence((UUID)raw.get("id"),"RAW",c.postedAt(),c.amount(),"KRW",Objects.toString(raw.get("title"),c.counterpartyText()),status,reason,List.of((UUID)raw.get("id")),false);}
 private String hash(Object... values){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(values).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}
