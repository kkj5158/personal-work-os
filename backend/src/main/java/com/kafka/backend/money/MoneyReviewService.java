package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import static com.kafka.backend.money.MoneyService.*;

/** Lightweight work queue; full raw evidence and balance diagnostics are separate reads. */
@Service
@Transactional
public class MoneyReviewService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyWebService web;
 private final MoneyProductService product; private final MoneyMeaningService meaning; private final ObjectMapper json;
 public MoneyReviewService(JdbcTemplate db,CurrentUserProvider users,MoneyWebService web,MoneyProductService product,MoneyMeaningService meaning,ObjectMapper json){this.db=db;this.users=users;this.web=web;this.product=product;this.meaning=meaning;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 /** Parser/format diagnostics are separated from genuine financial decisions. */
 static final java.util.List<String> FORMAT_REASONS=java.util.List.of("UNRECOGNIZED_SHAPE","UNSUPPORTED","PARSER_ERROR","MISSING_PARSE_ATTEMPT","INCOMPLETE_CANDIDATE");
 /** Suggestion window only: a suggested pair is never posted without an explicit owner decision. */
 static final int PAIR_WINDOW_SECONDS=600;
 static final String QUEUE="""
  with me as (select ?::uuid uid),
  latest as (
   select r.id,r.posted_at,r.title,r.source_package,r.processing_reason,r.review_deferred,r.processing_version,p.amount,p.direction,p.candidate
   from me join money_raw_notifications r on r.user_id=me.uid
   left join lateral(select amount,direction,candidate from money_parse_attempts where user_id=r.user_id and raw_event_id=r.id order by created_at desc,id desc limit 1) p on true
   where r.state in ('REVIEW_REQUIRED','FAILED')
  ),
  raw_pairs as (
   select a.id a_id,b.id b_id from latest a join latest b on a.id<>b.id and a.amount=b.amount and a.direction<>b.direction
    and abs(extract(epoch from b.posted_at-a.posted_at))<=%1$d
  ),
  raw_partner as (select a_id,min(b_id::text)::uuid partner,count(*) n from raw_pairs group by a_id),
  tx_pairs as (
   select e.id eid,i.id iid from me join money_transactions e on e.user_id=me.uid and e.type='EXPENSE' and not e.excluded and e.merged_into is null
   join money_transactions i on i.user_id=e.user_id and i.type='INCOME' and not i.excluded and i.merged_into is null
    and i.amount=e.amount and i.currency=e.currency and i.to_account_id<>e.from_account_id
    and i.occurred_at between e.occurred_at-make_interval(secs=>%1$d) and e.occurred_at+make_interval(secs=>%1$d)
   where not exists(select 1 from money_transactions x where x.user_id=e.user_id and x.refund_of in (e.id,i.id))
    and not exists(select 1 from money_meaning_audit d where d.user_id=e.user_id and d.subject_id=e.id and d.action='TRANSFER_PAIR_DISMISSED' and d.next_value->>'otherId'=i.id::text)
  ),
  tx_unique as (select eid,iid from tx_pairs where eid in (select eid from tx_pairs group by eid having count(*)=1) and iid in (select iid from tx_pairs group by iid having count(*)=1)),
  tx_partner as (select eid id,iid partner from tx_unique union all select iid,eid from tx_unique),
  queue as (
   select l.id,'RAW' as kind,coalesce(l.processing_reason,'UNRESOLVED_SOURCE') as reason,
    case when coalesce(l.processing_reason,'') in (%2$s) then 'FORMAT' else 'DECISION' end as lane,
    case when l.review_deferred then 'DEFERRED' else 'PENDING' end state,
    l.posted_at as "occurredAt",l.title,coalesce(nullif(l.candidate->>'counterpartyText',''),case l.source_package when 'com.kakaobank.channel' then '카카오뱅크 알림' when 'com.ibk.android.ionebank' then 'IBK기업은행 알림' when 'com.wooribank.smart.npib' then '우리은행 알림' when 'com.shinhan.sbanking' then '신한은행 알림' else '원문 알림' end) as merchant,
    l.amount,null::uuid as "accountId",null::uuid as "categoryId",
    null::text as memo,null::text as type,l.processing_version as version,0::bigint as "overrideVersion",0::bigint as "projectionVersion",
    l.candidate::text as candidate,
    case when rp.n=1 and (select x.n from raw_partner x where x.a_id=rp.partner)=1 then rp.partner end as "transferPartnerId",
    coalesce(rp.n,0) as "transferCandidates",null::text as currency
   from latest l left join raw_partner rp on rp.a_id=l.id
   union all
   select t.id,'TRANSACTION',case when tp.partner is not null then 'POSSIBLE_INTERNAL_TRANSFER' when t.type='REFUND' and t.refund_of is null then 'REFUND_LINK_REQUIRED'
    when t.type='LOAN_PAYMENT' and t.principal is null then 'LOAN_SPLIT_REQUIRED' else 'CATEGORY_UNCONFIRMED' end,'DECISION',
    case when tp.partner is null and d.transaction_id is not null and d.transaction_version=t.version and d.override_version=coalesce(b.version,0) and d.projection_version=coalesce(p.version,0) then 'COMPLETED' else 'PENDING' end,
    coalesce((b.overrides->>'occurredAt')::timestamptz,t.occurred_at),
    case when jsonb_exists(b.overrides,'title') then b.overrides->>'title' else coalesce(p.defaults->>'title',t.title,coalesce(f.display_name,t.counterparty_text,'외부')||' → '||coalesce(a.display_name,t.counterparty_text,'외부')) end,
    case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end,
    coalesce((b.overrides->>'amount')::numeric,t.amount),coalesce((b.overrides->>'accountId')::uuid,t.from_account_id,t.to_account_id),
    case when jsonb_exists(b.overrides,'categoryId') then (b.overrides->>'categoryId')::uuid else coalesce((p.defaults->>'categoryId')::uuid,t.category_id) end,
    case when jsonb_exists(b.overrides,'memo') then b.overrides->>'memo' else coalesce(p.defaults->>'memo',t.memo) end,t.type,t.version,coalesce(b.version,0),coalesce(p.version,0),null,
    tp.partner,case when tp.partner is null then 0 else 1 end,t.currency
   from me join money_transactions t on t.user_id=me.uid
   left join money_accounts f on f.id=t.from_account_id and f.user_id=t.user_id
   left join money_accounts a on a.id=t.to_account_id and a.user_id=t.user_id
   left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id
   left join money_rule_projections p on p.user_id=t.user_id and p.transaction_id=t.id
   left join money_review_decisions d on d.user_id=t.user_id and d.transaction_id=t.id
   left join tx_partner tp on tp.id=t.id
   where not t.excluded and t.merged_into is null and (tp.partner is not null or
    (t.type in ('EXPENSE','INCOME') and t.category_id is null) or (t.type='REFUND' and t.refund_of is null) or (t.type='LOAN_PAYMENT' and t.principal is null))
  )
  """.formatted(PAIR_WINDOW_SECONDS,String.join(",",FORMAT_REASONS.stream().map(r->"'"+r+"'").toList()));
 /** Primary Review count: genuine financial decisions only; format diagnostics are shown in their own lane. */
 static final String DECISION_COUNT=QUEUE+"select count(*) from queue where state in ('PENDING','DEFERRED') and lane='DECISION'";
 @Transactional(readOnly=true) public Map<String,Object> queue(String reasons,String accounts,String types,String states,BigDecimal min,BigDecimal max,int limit,int offset){return queue(null,reasons,accounts,types,states,min,max,limit,offset);}
 @Transactional(readOnly=true) public Map<String,Object> queue(String lane,String reasons,String accounts,String types,String states,BigDecimal min,BigDecimal max,int limit,int offset){
  page(limit,offset);var args=new ArrayList<Object>(List.of(owner()));String where=" from queue where true";
  if(lane!=null){require(Set.of("DECISION","FORMAT").contains(lane),"Invalid lane");where+=" and lane=?";args.add(lane);}
  where+=filter(args,reasons,"reason",false);where+=filter(args,accounts,"accountId",true);where+=filter(args,types,"type",false);where+=filter(args,states==null?"PENDING,DEFERRED":states,"state",false);
  if(min!=null){require(min.signum()>=0,"Invalid minimum");where+=" and amount>=?";args.add(min);}if(max!=null){require(max.signum()>=0&&(min==null||max.compareTo(min)>=0),"Invalid maximum");where+=" and amount<=?";args.add(max);}
  long total=db.queryForObject(QUEUE+"select count(*)"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var items=db.queryForList(QUEUE+"select *"+where+" order by \"occurredAt\",id limit ? offset ?",args.toArray());
  items.forEach(row->{row.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);if(row.get("candidate")!=null)row.put("candidate",json.readValue(row.get("candidate").toString(),Map.class));});
  // Noise suspicion needs raw text; read it only for format-lane rows on this page and never return the bodies.
  var formatIds=items.stream().filter(r->"FORMAT".equals(r.get("lane"))).map(r->(UUID)r.get("id")).toList();
  Set<UUID> noise=new HashSet<>();
  if(!formatIds.isEmpty())db.query("select id,title,body,big_text from money_raw_notifications where user_id=? and id=any(?)",rs->{
   if(MoneyNoiseFilter.classify(rs.getString("title"),rs.getString("body"),rs.getString("big_text"))==MoneyNoiseFilter.Verdict.NON_FINANCIAL)noise.add(rs.getObject("id",UUID.class));},owner(),formatIds.toArray(new UUID[0]));
  items.forEach(row->row.put("noiseSuspected",noise.contains((UUID)row.get("id"))));
  // One facet query supplies both the reason filter options and the per-lane open counts.
  var reasonsList=new TreeSet<String>();var lanes=new LinkedHashMap<String,Object>(Map.of("DECISION",0L,"FORMAT",0L));
  db.query(QUEUE+"select lane,reason,count(*) filter(where state in ('PENDING','DEFERRED')) n from queue group by lane,reason",rs->{
   if(lane==null||lane.equals(rs.getString("lane")))reasonsList.add(rs.getString("reason"));lanes.merge(rs.getString("lane"),rs.getLong("n"),(x,y)->(Long)x+(Long)y);},owner());
  return Map.of("items",items,"total",total,"reasons",List.copyOf(reasonsList),"lanes",lanes,"diagnostics","/review/diagnostics");
 }
 public record PairDismissal(UUID expenseId,UUID incomeId){}
 /** Owner states that a suggested expense/income pair is not an internal transfer; the ledger is unchanged. */
 public Map<String,Object> dismissPair(PairDismissal input){
  lock();require(input!=null&&input.expenseId()!=null&&input.incomeId()!=null,"Select the suggested pair");
  var e=product.transactionFact(input.expenseId());var i=product.transactionFact(input.incomeId());
  require(e.type()==MoneyTypes.TransactionType.EXPENSE&&i.type()==MoneyTypes.TransactionType.INCOME,"Select an expense and an income");
  meaning.audit(e.id(),"TRANSFER_PAIR_DISMISSED",Map.of(),Map.of("otherId",i.id().toString()));
  meaning.audit(i.id(),"TRANSFER_PAIR_DISMISSED",Map.of(),Map.of("otherId",e.id().toString()));
  return Map.of("dismissed",true);
 }
 public record RawSelection(UUID id,Long expectedVersion){}
 public record RawSelections(List<RawSelection> items){}
 /** Owner-confirmed "not a financial transaction". Raw evidence is kept and can be restored. */
 public Map<String,Object> ignore(RawSelections input){
  lock();require(input!=null&&input.items()!=null&&!input.items().isEmpty()&&input.items().size()<=100,"Select 1–100 notifications");
  for(var item:input.items())product.ignoreNotification(item.id(),item.expectedVersion());
  return Map.of("ignored",input.items().size());
 }
 @Transactional(readOnly=true) public Map<String,Object> ignored(int limit,int offset){
  page(limit,offset);
  var items=db.queryForList("select id,title,source_package as merchant,posted_at as \"occurredAt\",processing_reason as reason,processing_version as version from money_raw_notifications where user_id=? and state='PROCESSED' and processing_reason in ('IGNORED_NON_FINANCIAL','USER_EXCLUDED','USER_IGNORED_NON_FINANCIAL') and not exists(select 1 from money_transaction_sources s where s.user_id=money_raw_notifications.user_id and s.raw_event_id=money_raw_notifications.id) order by posted_at desc,id limit ? offset ?",owner(),limit,offset);
  items.forEach(row->row.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v));
  long total=db.queryForObject("select count(*) from money_raw_notifications where user_id=? and state='PROCESSED' and processing_reason in ('IGNORED_NON_FINANCIAL','USER_EXCLUDED','USER_IGNORED_NON_FINANCIAL')",Long.class,owner());
  return Map.of("items",items,"total",total);
 }
 private String filter(List<Object> args,String csv,String field,boolean uuid){if(csv==null)return "";if(csv.isBlank()||csv.equals("none"))return " and false";var values=new LinkedHashSet<>(Arrays.asList(csv.split(",")));require(values.size()<=200,"Too many filters");for(String v:values){text(v,100,true,"Filter");args.add(uuid?MoneyMeaningService.uuid(v):v);}return " and \""+field+"\" in ("+String.join(",",Collections.nCopies(values.size(),"?"))+")";}
 @Transactional(readOnly=true) public Map<String,Object> diagnostics(){return Map.of("balanceIssues",product.balanceIssues(),"basis","LATEST_AVAILABLE");}
 public record Completion(UUID id,Long transactionVersion,Long overrideVersion,Long projectionVersion,Map<String,Object> overrides){}
 public record Complete(List<Completion> items){}
 public Map<String,Object> complete(Complete input){
  lock();require(input!=null&&input.items()!=null&&!input.items().isEmpty()&&input.items().size()<=100,"Select 1–100 rows");require(input.items().stream().map(Completion::id).distinct().count()==input.items().size(),"Duplicate selection");
  for(var item:input.items()){
   require(item.projectionVersion()!=null,"Projection version required");var row=web.bookkeepingRow(item.id());require(Set.of("EXPENSE","INCOME").contains(row.get("type")),"환불 연결과 대출 구성은 전용 상세에서 먼저 확인하세요.");
   require(item.overrides()!=null&&item.overrides().keySet().stream().allMatch(Set.of("title","memo","categoryId")::contains),"검토에서는 제목·메모·카테고리만 수정할 수 있습니다.");
   var all=new LinkedHashMap<String,Object>((Map<String,Object>)row.get("overrides"));all.putAll(item.overrides());
   web.saveBookkeeping(item.id(),new MoneyWebTypes.BookkeepingEdit(item.overrideVersion(),item.transactionVersion(),all,item.projectionVersion()));
   var displayed=web.bookkeepingRow(item.id());
   var previous=db.queryForList("select displayed::text from money_review_decisions where user_id=? and transaction_id=?",owner(),item.id());
   db.update("insert into money_review_decisions(user_id,transaction_id,transaction_version,override_version,projection_version,displayed) values(?,?,?,?,?,cast(? as jsonb)) on conflict(user_id,transaction_id) do update set transaction_version=excluded.transaction_version,override_version=excluded.override_version,projection_version=excluded.projection_version,displayed=excluded.displayed,completed_at=now()",owner(),item.id(),displayed.get("transactionVersion"),displayed.get("version"),displayed.get("projectionVersion"),json.writeValueAsString(displayed));
   meaning.audit(item.id(),"REVIEW_COMPLETE",previous,displayed);
  }return Map.of("completed",input.items().size());
 }
}
