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
 static final String QUEUE="""
  with queue as (
   select r.id,'RAW' as kind,coalesce(r.processing_reason,'UNRESOLVED_SOURCE') as reason,
    case when r.review_deferred then 'DEFERRED' else 'PENDING' end state,
    r.posted_at as "occurredAt",r.title,r.source_package as merchant,
    p.amount,null::uuid as "accountId",null::uuid as "categoryId",
    null::text as memo,null::text as type,r.processing_version as version,0::bigint as "overrideVersion",0::bigint as "projectionVersion",
    p.candidate::text as candidate
   from money_raw_notifications r
   left join lateral(select amount,candidate from money_parse_attempts where user_id=r.user_id and raw_event_id=r.id order by created_at desc,id desc limit 1) p on true
   where r.user_id=? and r.state in ('REVIEW_REQUIRED','FAILED')
   union all
   select t.id,'TRANSACTION',case when t.type='REFUND' and t.refund_of is null then 'REFUND_LINK_REQUIRED'
    when t.type='LOAN_PAYMENT' and t.principal is null then 'LOAN_SPLIT_REQUIRED' else 'CATEGORY_UNCONFIRMED' end,
    case when d.transaction_id is not null and d.transaction_version=t.version and d.override_version=coalesce(b.version,0) and d.projection_version=coalesce(p.version,0) then 'COMPLETED' else 'PENDING' end,
    coalesce((b.overrides->>'occurredAt')::timestamptz,t.occurred_at),
    case when jsonb_exists(b.overrides,'title') then b.overrides->>'title' else coalesce(p.defaults->>'title',t.title,coalesce(f.display_name,t.counterparty_text,'외부')||' → '||coalesce(a.display_name,t.counterparty_text,'외부')) end,
    case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end,
    coalesce((b.overrides->>'amount')::numeric,t.amount),coalesce((b.overrides->>'accountId')::uuid,t.from_account_id,t.to_account_id),
    case when jsonb_exists(b.overrides,'categoryId') then (b.overrides->>'categoryId')::uuid else coalesce((p.defaults->>'categoryId')::uuid,t.category_id) end,
    case when jsonb_exists(b.overrides,'memo') then b.overrides->>'memo' else coalesce(p.defaults->>'memo',t.memo) end,t.type,t.version,coalesce(b.version,0),coalesce(p.version,0),null
   from money_transactions t
   left join money_accounts f on f.id=t.from_account_id and f.user_id=t.user_id
   left join money_accounts a on a.id=t.to_account_id and a.user_id=t.user_id
   left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id
   left join money_rule_projections p on p.user_id=t.user_id and p.transaction_id=t.id
   left join money_review_decisions d on d.user_id=t.user_id and d.transaction_id=t.id
   where t.user_id=? and not t.excluded and t.merged_into is null and
    ((t.type in ('EXPENSE','INCOME') and t.category_id is null) or (t.type='REFUND' and t.refund_of is null) or (t.type='LOAN_PAYMENT' and t.principal is null))
  )
  """;
 @Transactional(readOnly=true) public Map<String,Object> queue(String reasons,String accounts,String types,String states,BigDecimal min,BigDecimal max,int limit,int offset){
  page(limit,offset);var args=new ArrayList<Object>(List.of(owner(),owner()));String where=" from queue where true";
  where+=filter(args,reasons,"reason",false);where+=filter(args,accounts,"accountId",true);where+=filter(args,types,"type",false);where+=filter(args,states==null?"PENDING,DEFERRED":states,"state",false);
  if(min!=null){require(min.signum()>=0,"Invalid minimum");where+=" and amount>=?";args.add(min);}if(max!=null){require(max.signum()>=0&&(min==null||max.compareTo(min)>=0),"Invalid maximum");where+=" and amount<=?";args.add(max);}
  long total=db.queryForObject(QUEUE+"select count(*)"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var items=db.queryForList(QUEUE+"select *"+where+" order by \"occurredAt\",id limit ? offset ?",args.toArray());
  items.forEach(row->{row.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);if(row.get("candidate")!=null)row.put("candidate",json.readValue(row.get("candidate").toString(),Map.class));});
  var reasonsList=db.queryForList(QUEUE+"select distinct reason from queue order by reason",String.class,owner(),owner());
  return Map.of("items",items,"total",total,"reasons",reasonsList,"diagnostics","/review/diagnostics");
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
