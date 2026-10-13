package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static com.kafka.backend.money.MoneyTypes.*;

/** Read-only reassessment. Only an explicit guarded command may consume its transaction proposal. */
final class MoneyReviewAdmission {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyService money;
 MoneyReviewAdmission(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money){this.db=db;this.users=users;this.json=json;this.money=money;}
 private ParsedCandidate candidate(String payload){if(payload==null)return null;var tree=json.readTree(payload);if(tree instanceof tools.jackson.databind.node.ObjectNode object)object.remove("currency");return json.treeToValue(tree,ParsedCandidate.class);}
 record Assessment(TransactionInput transaction,String blockReason,String currency,UUID accountId,Direction direction,UUID parseAttemptId) {
  boolean eligible(){return transaction!=null&&blockReason==null;}
  void enrich(Map<String,Object> row){row.put("moveToBookkeepingEligible",eligible());row.put("moveToBookkeepingBlockReason",blockReason);row.put("effectiveCurrency",row.get("currency")!=null?row.get("currency"):currency);if(row.get("accountId")==null)row.put("accountId",accountId);if(direction!=null&&row.get("type")==null)row.put("type",direction==Direction.OUT?"EXPENSE":"INCOME");row.put("admissionParseAttemptId",parseAttemptId);}
 }
 String fingerprint(Assessment assessment){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(assessment.transaction()).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private static String reason(String code){return switch(Objects.toString(code,"")){
  case "ACCOUNT_RESOLUTION_REQUIRED","MISSING_OWN_SIDE"->"소유 계좌가 확인되지 않았습니다. 계좌 설정의 금융기관·식별 정보를 확인하세요.";
  case "UNSUPPORTED_CURRENCY_OR_SOURCE"->"지원되는 원화 알림 형식이나 통화가 확인되지 않았습니다.";
  case "UNMATCHED_OR_EXTERNAL_UNPROVEN"->"일반 수입·지출 근거가 부족합니다. 이체·환불·대출 여부를 확인하세요.";
  case "POSSIBLE_ALREADY_POSTED_ROUTE","INDISTINGUISHABLE_TRANSFER_EVIDENCE","MULTIPLE_ATTEMPTS_SUPPLIED"->"중복 거래 가능성이 있어 자동 등록할 수 없습니다.";
  default->"이체 또는 금융 근거가 충돌하여 전용 금융 확인이 필요합니다.";
 };}
 private static final String WINDOWS="with windows as (select (candidate->>'occurredAt')::timestamptz at from (select distinct on(raw_event_id) candidate from money_parse_attempts where user_id=? and raw_event_id=any(?) order by raw_event_id,created_at desc,id desc) p where candidate->>'occurredAt' is not null) ";
 Map<UUID,Assessment> assess(Collection<UUID> ids){
  if(ids.isEmpty())return Map.of();UUID owner=users.getCurrentUserId();var accounts=money.accounts();
  var selected=db.query("select p.*,r.source_package,r.raw_payload->>'currency' as raw_currency,p.candidate->>'currency' as candidate_currency from money_raw_notifications r left join lateral(select * from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true where r.user_id=? and r.id=any(?)",(rs,n)->{
   ParsedCandidate c=candidate(rs.getString("candidate"));
   ParseAttempt a=rs.getObject("id",UUID.class)==null?null:new ParseAttempt(rs.getObject("id",UUID.class),rs.getObject("raw_event_id",UUID.class),rs.getString("parser_key"),rs.getString("parser_version"),rs.getString("status"),rs.getString("failure_code"),c,rs.getTimestamp("created_at").toInstant());
   return new Object[]{a,rs.getString("source_package"),rs.getString("raw_currency"),rs.getString("candidate_currency")};
  },owner,ids.toArray(UUID[]::new));
  var result=new HashMap<UUID,Assessment>();for(UUID id:ids)result.put(id,new Assessment(null,"알림의 금융 형식·금액·방향·시각이 확인되지 않았습니다.",null,null,null,null));
  var verified=new ArrayList<ParseAttempt>();
  for(var row:selected){var a=(ParseAttempt)row[0];if(a==null)continue;var c=a.candidate();
   if(c==null)continue;String currency=row[2]!=null?row[2].toString():row[3]!=null?row[3].toString():MoneyOrdinaryAdmission.currency(c);
   var own=new MoneyAccountResolver().resolve(accounts,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint()).account();
   String blocked=null;
   if(!"PARSED".equals(a.status())||!MoneyOrdinaryAdmission.domestic(c)||!Objects.equals(c.provider().toLowerCase(Locale.ROOT)+"-push",a.parserKey())||!"1.0.0".equals(a.parserVersion())||!Objects.equals(MoneyOrdinaryAdmission.PACKAGES.get(c.provider()),row[1])||c.direction()==null||c.amount()==null||c.amount().signum()<=0||c.occurredAt()==null||c.postedAt()==null||c.timeSource()==null)blocked="알림의 금융 형식·금액·방향·시각이 확인되지 않았습니다.";
   else if(!"KRW".equals(currency))blocked=reason("UNSUPPORTED_CURRENCY_OR_SOURCE");
   else if(row[2]!=null&&row[3]!=null&&!row[2].equals(row[3])||row[3]!=null&&c.evidence()!=null&&c.evidence().get("currency")!=null&&!row[3].equals(c.evidence().get("currency")))blocked="원문과 분석 통화가 서로 다릅니다. 금융 근거를 확인하세요.";
   result.put(a.rawEventId(),new Assessment(null,blocked,currency,own==null?null:own.id(),c.direction(),a.id()));if(blocked==null)verified.add(a);
  }
  if(verified.isEmpty())return result;
  var opposing=new HashSet<>(db.queryForList("select distinct a.id from money_raw_notifications a join lateral(select amount,direction from money_parse_attempts p where p.user_id=a.user_id and p.raw_event_id=a.id order by created_at desc,id desc limit 1) p on true join money_raw_notifications b on b.user_id=a.user_id and b.id<>a.id and b.state in ('REVIEW_REQUIRED','FAILED','PARSED') and abs(extract(epoch from b.posted_at-a.posted_at))<=? join lateral(select amount,direction from money_parse_attempts q where q.user_id=b.user_id and q.raw_event_id=b.id order by created_at desc,id desc limit 1) q on p.amount=q.amount and p.direction<>q.direction where a.user_id=? and a.id=any(?)",UUID.class,MoneyReviewService.PAIR_WINDOW_SECONDS,owner,verified.stream().map(ParseAttempt::rawEventId).toArray(UUID[]::new)));
  var verifiedIds=verified.stream().map(ParseAttempt::rawEventId).toArray(UUID[]::new);
  // Include unposted neighbors, regardless of their queue/deferred state. Never admit against a truncated graph.
  var graph=db.query(WINDOWS+"select p.* from money_raw_notifications r join lateral(select * from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true where r.user_id=? and p.status='PARSED' and p.candidate->>'occurredAt' is not null and exists(select 1 from windows w where (p.candidate->>'occurredAt')::timestamptz between w.at-interval '90 seconds' and w.at+interval '90 seconds') and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id) order by r.id limit 501",(rs,n)->new ParseAttempt(rs.getObject("id",UUID.class),rs.getObject("raw_event_id",UUID.class),rs.getString("parser_key"),rs.getString("parser_version"),rs.getString("status"),rs.getString("failure_code"),candidate(rs.getString("candidate")),rs.getTimestamp("created_at").toInstant()),owner,verifiedIds,owner);
  var facts=db.query(WINDOWS+"select t.* from money_transactions t where t.user_id=? and not t.excluded and t.merged_into is null and exists(select 1 from windows w where t.occurred_at between w.at-interval '90 seconds' and w.at+interval '90 seconds') order by t.occurred_at,t.id limit 501",money::transactionListRow,owner,verifiedIds,owner);
  var sources=new HashMap<UUID,List<TransactionSource>>();if(!facts.isEmpty())db.query("select * from money_transaction_sources where user_id=? and transaction_id=any(?)",rs->{sources.computeIfAbsent(rs.getObject("transaction_id",UUID.class),id->new ArrayList<>()).add(new TransactionSource(rs.getObject("raw_event_id",UUID.class),rs.getObject("parse_attempt_id",UUID.class),SourceRelationship.valueOf(rs.getString("relationship")),json.readValue(rs.getString("evidence"),Map.class)));},owner,facts.stream().map(MoneyTransaction::id).toArray(UUID[]::new));
  var existing=facts.stream().map(t->new MoneyTransaction(t.id(),t.type(),t.fromAccountId(),t.toAccountId(),t.amount(),t.currency(),t.occurredAt(),t.counterpartyText(),sources.getOrDefault(t.id(),List.of()),t.categoryId(),t.memo(),t.excluded(),t.version(),t.manual(),t.refundOf(),t.mergedInto(),t.title())).toList();
  if(graph.size()>500||existing.size()>500){for(var a:verified){var old=result.get(a.rawEventId());result.put(a.rawEventId(),new Assessment(null,"관련 금융 근거가 많아 처리 범위를 좁혀 다시 확인해야 합니다.",old.currency(),old.accountId(),old.direction(),old.parseAttemptId()));}return result;}
  var proposals=new VerifiedMoneyTransferMatcher().propose(new MoneyTransferMatcher.Context(accounts,graph,existing));
  for(var a:verified){var old=result.get(a.rawEventId());var p=proposals.stream().filter(x->x.sources().stream().anyMatch(s->s.rawEventId().equals(a.rawEventId()))).findFirst().orElse(null);
   var input=p==null?null:p.transaction();String block=opposing.contains(a.rawEventId())?"같은 금액의 반대 방향 알림이 있어 이체 여부를 먼저 확인해야 합니다.":p==null?"반대편 알림·금융 근거 확인이 진행 중입니다. 잠시 후 다시 확인하세요.":input==null?reason(Objects.toString(p.evidence().get("reason"))):!Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(input.type())?"내 계좌 간 이체는 전용 금융 확인으로 처리하세요.":null;
   result.put(a.rawEventId(),new Assessment(block==null?input:null,block,old.currency(),old.accountId(),old.direction(),old.parseAttemptId()));
  }return result;
 }
}
