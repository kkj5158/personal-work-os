package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import static com.kafka.backend.money.MoneyService.*;

/** Owner-scoped Gate 0 projection. Financial review and recommendation stamps use their original projections. */
final class MoneyGateZeroReview {
 private final JdbcTemplate db;
 private final CurrentUserProvider users;
 private final ObjectMapper json;
 private final MoneyReviewAdmission admission;

 MoneyGateZeroReview(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money){
  this.db=db;this.users=users;this.json=json;this.admission=new MoneyReviewAdmission(db,users,json,money);
 }

 private static final String OPEN="r.state in ('REVIEW_REQUIRED','FAILED')";
 private static final String UNLINKED="not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id)";
 private static final String IGNORED="(r.state='PROCESSED' and r.processing_reason in ('IGNORED_NON_FINANCIAL','USER_EXCLUDED','USER_IGNORED_NON_FINANCIAL'))";
 private static final String PENDING=OPEN+" and not r.review_deferred and "+UNLINKED;
 private static final String PENDING_NOTICE="PENDING_NOTIFICATION";
 private static final String FAILED_NOTICE="FAILED_NOTIFICATION";
 private static boolean splitPending(String state){return PENDING_NOTICE.equals(state)||FAILED_NOTICE.equals(state);}
 private static final String DEFERRED="(("+OPEN+" and r.review_deferred) or "+IGNORED+") and "+UNLINKED;
 static final String PENDING_COUNT="select count(*) from money_raw_notifications r where r.user_id=? and "+PENDING;
 static boolean actionable(JdbcTemplate db,UUID owner,UUID id,String action){
  return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_raw_notifications r where r.user_id=? and r.id=? and "+("REOPEN".equals(action)?DEFERRED:PENDING)+")",Boolean.class,owner,id));
 }

 // A history row represents the most recent Gate 0 decision for a source. Its complete audit is still available in detail.
 private static final String EVENT_FILTER="(e.kind='MOVE_TO_BOOKKEEPING' or (e.payload->>'kind'='RAW' and e.kind in ('DEFER','REOPEN','NON_TRANSACTION','UNDO')))";
 private static final String HISTORY="exists(select 1 from money_ai_events e where e.user_id=r.user_id and e.subject_id=r.id and "+EVENT_FILTER+")";

 static Map<String,Object> counts(JdbcTemplate db, UUID owner){
  return db.queryForMap("select count(*) filter(where "+PENDING+") as \"PENDING\",count(*) filter(where "+DEFERRED+
   ") as \"DEFERRED\",count(*) filter(where "+HISTORY+") as \"COMPLETED\" from money_raw_notifications r where r.user_id=?",owner);
 }

 Map<String,Object> list(String state,String type,String search,UUID accountId,int limit,int offset,String reason){
  page(limit,offset);text(reason,100,false,"검토 사유");text(search,200,false,"검색");
  require(Set.of("PENDING","DEFERRED","COMPLETED",PENDING_NOTICE,FAILED_NOTICE).contains(state),"검토 상태를 확인하세요.");
  require(type==null||Set.of("CLASSIFICATION","NOISE","TRANSFER").contains(type),"검토 유형을 확인하세요.");
  boolean history="COMPLETED".equals(state);
  String base=records(state,false);
  UUID owner=users.getCurrentUserId();
  var args=new ArrayList<Object>(List.of(owner));String where=" from records where true";
  if(reason!=null&&!reason.isBlank()){where+=" and reason=?";args.add(reason);}
  if(type!=null){where+=" and \"reviewType\"=?";args.add(type);}
  if(accountId!=null){where+=" and \"accountId\"=?";args.add(accountId);}
  if(search!=null&&!search.isBlank()){where+=" and position(lower(?) in lower(concat_ws(' ',title,merchant,\"sourcePackage\")))>0";args.add(search.strip());}
  var counts=counts(db,owner);
  long total=args.size()==1&&!splitPending(state)?((Number)counts.get(state)).longValue():db.queryForObject(base+"select count(*)"+where,Long.class,args.toArray());
  args.add(limit);args.add(offset);
  var items=db.queryForList(base+"select *"+where+" order by "+(history?"\"decisionAt\"":"\"occurredAt\"")+" desc,id limit ? offset ?",args.toArray());
  enrich(items,"PENDING".equals(state)||splitPending(state));
  var reasons=db.queryForList(base+"select distinct reason from records order by reason",String.class,owner);
  return Map.of("items",items,"total",total,"counts",counts,"reasons",reasons,"bounded",false);
 }
 /** Restrict the source read before joins. A missing or processed selection never broadens the command. */
 List<Map<String,Object>> selected(List<MoneyReviewBatchService.Target> targets,String action){
  return selected(targets,action,null);
 }
 List<Map<String,Object>> selected(List<MoneyReviewBatchService.Target> targets,String action,String requestedState){
  String state=splitPending(requestedState)?requestedState:"REOPEN".equals(action)?"DEFERRED":"PENDING";
  UUID[] ids=targets.stream().filter(t->"RAW".equals(t.kind())).map(MoneyReviewBatchService.Target::id).toArray(UUID[]::new);
  var rows=db.queryForList(records(state,true)+" select * from records",users.getCurrentUserId(),ids);
  enrich(rows,"MOVE_TO_BOOKKEEPING".equals(action));
  var byId=new HashMap<UUID,Map<String,Object>>();
  for(var row:rows)byId.put((UUID)row.get("id"),row);
  var result=new ArrayList<Map<String,Object>>();
  for(var target:targets){
   var row="RAW".equals(target.kind())?byId.get(target.id()):null;
   result.add(row!=null?row:Map.of("id",target.id(),"kind",target.kind(),"state","UNAVAILABLE"));
  }
  return result;
 }
 private String records(String state,boolean selected){
  boolean history="COMPLETED".equals(state);
  String sourceWhere=switch(state){
   case PENDING_NOTICE -> PENDING+" and r.state='REVIEW_REQUIRED'";
   case FAILED_NOTICE -> PENDING+" and r.state='FAILED'";
   case "PENDING" -> PENDING;
   case "COMPLETED" -> HISTORY;
   case "DEFERRED" -> DEFERRED;
   default -> throw new IllegalArgumentException("Unknown review lane");
  };
  String rowState=splitPending(state)?"PENDING":state;
  if(selected)sourceWhere+=" and r.id=any(?)";
  String reasonColumn=history?"event_kind":"processing_reason";
  return """
   with me as (select ?::uuid uid),source as (
    select r.id,r.user_id,'RAW' as kind,r.posted_at,r.title,r.source_package,r.processing_version,
     coalesce(r.processing_reason,'UNRESOLVED_SOURCE') processing_reason,
     p.amount,p.candidate,r.raw_payload->>'currency' currency,e.id event_id,e.kind event_kind,e.created_at decision_at,
     e.active and (e.payload->'after'->>'version')::bigint=r.processing_version and e.kind in ('DEFER','NON_TRANSACTION')
       and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id) can_undo,
     t.id transaction_id,t.amount ledger_amount,t.currency ledger_currency,coalesce(t.from_account_id,t.to_account_id) ledger_account
    from money_raw_notifications r
    left join lateral(select amount,candidate from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true
    left join lateral(select id,kind,payload,active,created_at from money_ai_events e where e.user_id=r.user_id and e.subject_id=r.id and %s order by created_at desc,id desc limit 1) e on true
    left join money_transactions t on e.kind='MOVE_TO_BOOKKEEPING' and t.user_id=r.user_id and t.id=(e.payload->>'transactionId')::uuid
     and exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id and s.transaction_id=t.id)
    where r.user_id=(select uid from me) and %s
   ), records as (
    select q.id,q.kind,'%s' as state,%s as reason,q.posted_at as "occurredAt",q.title,
     q.source_package as "sourcePackage",q.candidate->>'counterpartyText' merchant,
     coalesce(q.ledger_amount,q.amount) as amount,coalesce(q.ledger_currency,q.currency,q.candidate->>'currency') as currency,
     coalesce(q.ledger_account,own.id) as "accountId",q.candidate::text as candidate,
     q.processing_version as version,q.event_id as "eventId",q.transaction_id as "transactionId",
     coalesce(q.can_undo,false) as "canUndo",q.decision_at as "decisionAt",
     case when q.processing_reason in (%s) then 'FORMAT' else 'DECISION' end as lane,
     case when q.processing_reason in (%s) then 'NOISE' when q.processing_reason like '%%TRANSFER%%' then 'TRANSFER' else 'CLASSIFICATION' end as "reviewType"
    from source q
   """.formatted(EVENT_FILTER,sourceWhere,rowState,reasonColumn,formatReasons(),formatReasons())+MoneyReviewService.RAW_ACCOUNT_JOIN+") ";
 }
 private void enrich(List<Map<String,Object>> items,boolean assessCash){
  var checks=assessCash?admission.assess(items.stream().map(r->(UUID)r.get("id")).toList()):Map.<UUID,MoneyReviewAdmission.Assessment>of();
  for(var row:items){
   row.replaceAll((k,v)->v instanceof Timestamp ts?ts.toInstant():v);
   if(row.get("candidate")!=null)row.put("candidate",json.readValue(row.get("candidate").toString(),Map.class));
   var check=checks.get(row.get("id"));
   row.put("moveToBookkeepingEligible",false);
   if(check!=null){check.enrich(row);if(check.eligible()){row.put("admissionFingerprint",admission.fingerprint(check));row.put("admissionMeaning","UNRESOLVED");}}
  }
 }

 private static String formatReasons(){return String.join(",",MoneyReviewService.FORMAT_REASONS.stream().map(s->"'"+s+"'").toList());}
}
