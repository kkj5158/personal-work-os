package com.kafka.backend.money;

import com.fasterxml.jackson.annotation.JsonInclude;
import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.*;

/** Account perspectives over the existing canonical facts. No posting or balance store is added. */
@Service
public class MoneyAccountLedgerService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;
 private final MoneyService money;private final MoneyUnifiedBookkeepingService unified;private final MoneyWebService web;
 private final MoneyCommandService commands;private final TransactionTemplate previewTransaction;
 private static final Set<String> TYPES=Set.of("EXPENSE","INCOME","TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL","LOAN_PAYMENT","LOAN_RECEIPT","REFUND","UNRESOLVED");
 private static final String DISPLAY=MoneyOwnerFinancialDecision.DISPLAY;
 public MoneyAccountLedgerService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyUnifiedBookkeepingService unified,MoneyWebService web,MoneyCommandService commands,PlatformTransactionManager manager){
  this.db=db;this.users=users;this.json=json;this.money=money;this.unified=unified;this.web=web;this.commands=commands;
  this.previewTransaction=new TransactionTemplate(manager);this.previewTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
 }
 private UUID owner(){return users.getCurrentUserId();}
 private record Query(String from,List<Object> args){}
 private Query filter(String from,String to,String type,String state,String search,boolean raw,String baseDirection){
  MoneyService.text(search,200,false,"검색");LocalDate first=LocalDate.parse(from),last=LocalDate.parse(to);require(!first.isAfter(last),"기간을 확인하세요.");
  require(type==null||type.isBlank()||TYPES.contains(type),"금융 유형 필터를 확인하세요.");require(Set.of("ALL","CONFIRMED","UNRESOLVED","RELATION_PENDING").contains(state),"금융 상태 필터를 확인하세요.");
  var args=new ArrayList<Object>();args.add(owner());args.add(Timestamp.from(first.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));args.add(Timestamp.from(last.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));
  String sql=raw?" from queue q where q.kind='RAW' and q.state in ('PENDING','DEFERRED') and q.\"occurredAt\">=? and q.\"occurredAt\"<?":" from money_transactions t"+MoneyOwnerFinancialDecision.JOIN+" where t.user_id=? and t.merged_into is null and not t.excluded and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') and t.occurred_at>=? and t.occurred_at<?";
  if(raw){
   // RAW has no confirmed financial meaning. A confirmed/type-specific filter cannot promote it into money.
   if("CONFIRMED".equals(state)||"RELATION_PENDING".equals(state)||type!=null&&!type.isBlank()&&!"UNRESOLVED".equals(type))sql+=" and false";
  }else{
   if("RELATION_PENDING".equals(state))sql+=" and ("+MoneyOwnerFinancialDecision.RELATION+")<>'NONE'";
   else if("UNRESOLVED".equals(state))sql+=" and ("+DISPLAY+")='UNRESOLVED'";
   else if("CONFIRMED".equals(state))sql+=" and t.meaning_state='CONFIRMED'";
   if(type!=null&&!type.isBlank()){sql+=" and "+DISPLAY+"=?";args.add(type);}
  }
  if(baseDirection!=null&&!baseDirection.isBlank()){
   require(Set.of("INCOME","EXPENSE","TRANSFER").contains(baseDirection),"입금·출금·이체 방향을 선택하세요.");
   if(raw){
    sql+=" and (case q.candidate::jsonb->>'direction' when 'IN' then 'INCOME' when 'OUT' then 'EXPENSE' end)=?";
   }else{
    sql+=" and ("+MoneyOwnerFinancialDecision.CASH_DIRECTION+")=?";
   }
   args.add(baseDirection);
  }
  if(search!=null&&!search.isBlank()){
   sql+=raw?" and position(lower(?) in lower(coalesce(q.title,'')||' '||coalesce(q.merchant,'')||' '||coalesce(q.memo,'')))>0":" and position(lower(?) in lower(coalesce(t.title,'')||' '||coalesce(t.memo,'')||' '||coalesce(t.counterparty_text,'')))>0";args.add(search);
  }
  return new Query(sql,args);
 }
 private Map<String,Object> clean(Map<String,Object> input){var row=new LinkedHashMap<>(input);row.remove("user_id");row.replaceAll((key,value)->value instanceof Timestamp t?t.toInstant():value);return row;}
 private void selected(UUID accountId){if(accountId!=null)money.account(accountId);}
 private List<Map<String,Object>> counts(Query q,boolean raw){
  if(raw)return db.queryForList(MoneyReviewService.QUEUE+"select q.\"accountId\" as \"accountId\",count(*) as count"+q.from()+" and q.\"accountId\" is not null group by q.\"accountId\"",q.args().toArray());
  return db.queryForList("with matching as (select t.id,t.from_account_id,t.to_account_id"+q.from()+"), legs as (select id,from_account_id account_id from matching where from_account_id is not null union select id,to_account_id from matching where to_account_id is not null) select account_id as \"accountId\",count(*) as count from legs group by account_id",q.args().toArray());
 }
 @Transactional(readOnly=true) public Map<String,Object> read(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset){return read(from,to,accountId,type,state,search,limit,offset,null);}
 @Transactional(readOnly=true) public Map<String,Object> read(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset,String baseDirection){
  MoneyService.page(limit,offset);selected(accountId);var query=filter(from,to,type,state,search,false,baseDirection);var accountCounts=counts(query,false);var args=new ArrayList<>(query.args());String where=query.from();
  if(accountId!=null){where+=" and (t.from_account_id=? or t.to_account_id=?)";args.add(accountId);args.add(accountId);}
  var summary=clean(db.queryForMap("select count(*) as total,count(*) filter(where ("+DISPLAY+")='UNRESOLVED') as unresolved,count(*) filter(where ("+MoneyOwnerFinancialDecision.RELATION+")<>'NONE') as \"relationPending\""+where,args.toArray()));
  var currencies=db.queryForList("select distinct t.currency"+where+" order by t.currency",String.class,args.toArray());summary.put("currencies",currencies);
  // Amounts are only meaningful under one account and one currency; ALL never exposes an aggregate balance.
  summary.put("incoming",null);summary.put("outgoing",null);
  if(accountId!=null&&currencies.size()<=1){var sums=new ArrayList<Object>();sums.add(accountId);sums.add(accountId);sums.addAll(args);summary.putAll(db.queryForMap("select coalesce(sum(t.amount) filter(where t.to_account_id=?),0) as incoming,coalesce(sum(t.amount) filter(where t.from_account_id=?),0) as outgoing"+where,sums.toArray()));}
  args.add(limit);args.add(offset);var items=db.queryForList("select t.*,"+MoneyOwnerFinancialDecision.FIELDS+where+" order by t.occurred_at desc,t.id limit ? offset ?",args.toArray()).stream().map(this::clean).toList();
  enrich(items,accountId);return Map.of("items",items,"total",summary.get("total"),"accountCounts",accountCounts,"summary",summary);
 }
 void enrich(List<Map<String,Object>> items,UUID accountId){
  if(items.isEmpty())return;UUID[] ids=items.stream().map(row->(UUID)row.get("id")).toArray(UUID[]::new);
  var books=new HashMap<UUID,Map<String,Object>>();for(var book:db.queryForList(MoneyWebService.V4_BOOK+"select * from effective where id=any(?)",owner(),ids))books.put((UUID)book.get("id"),web.decodeBook(clean(book)));
  var classificationVersions=new HashMap<UUID,Long>();
  for(var state:db.queryForList("select transaction_id,version from money_classification_state where user_id=? and transaction_id=any(?)",owner(),ids))
   classificationVersions.put((UUID)state.get("transaction_id"),((Number)state.get("version")).longValue());
  var tracked=new HashSet<UUID>(db.queryForList("select t.id from money_transactions t join money_accounts a on a.user_id=t.user_id and a.id=coalesce(t.from_account_id,t.to_account_id) join money_tracking_accounts k on k.user_id=t.user_id and k.account_id=a.id and k.kind=case when t.type in ('REFUND','LOAN_RECEIPT') then 'INCOME' when t.type='LOAN_PAYMENT' then 'EXPENSE' else t.type end where t.user_id=? and t.id=any(?) and not a.archived and coalesce(a.include_in_statistics,true)",UUID.class,owner(),ids));
  var sources=new HashMap<UUID,List<Map<String,Object>>>();for(var source:db.queryForList("select transaction_id,raw_event_id,parse_attempt_id,relationship from money_transaction_sources where user_id=? and transaction_id=any(?) order by raw_event_id",owner(),ids)){UUID id=(UUID)source.remove("transaction_id");sources.computeIfAbsent(id,k->new ArrayList<>()).add(source);}
  var origins=new HashMap<UUID,String>();
  for(var origin:db.queryForList("""
   select distinct on(a.subject_id) a.subject_id,a.next_value->>'origin' as origin
     from money_meaning_audit a join money_transactions t on t.user_id=a.user_id and t.id=a.subject_id
    where a.user_id=? and a.subject_id=any(?) and a.action in ('FINANCIAL_ENGINE_OWNER_CONFIRM','FINANCIAL_ENGINE_AUTO_CONFIRM')
      and a.next_value->>'version'=t.version::text and t.meaning_state='CONFIRMED'
    order by a.subject_id,a.created_at desc,a.id desc
   """,owner(),ids))origins.put((UUID)origin.get("subject_id"),(String)origin.get("origin"));
  List<MoneyAccount> accounts=null;
  for(var item:items){UUID id=(UUID)item.get("id");boolean eligible=MoneyOwnerFinancialDecision.meaningApplied(item)&&Set.of("EXPENSE","INCOME","REFUND","LOAN_PAYMENT","LOAN_RECEIPT").contains(item.get("type"));item.put("categoryEligible",eligible);
   item.put("classificationVersion",classificationVersions.getOrDefault(id,0L));
   if(eligible&&books.containsKey(id)){var book=books.get(id);boolean inScope=tracked.contains(id)&&!Boolean.TRUE.equals(book.get("excluded"));item.put("classificationInScope",inScope);book.put("categoryWritePath",inScope&&Set.of("INCOME","EXPENSE").contains(item.get("type"))?"RECOMMENDATION":"ACCOUNT_LEDGER");book.put("categoryScopeReason",inScope?"":"가계부 추적·통계 범위 밖입니다. 직접 분류는 이 거래에만 적용되며 통계 포함 설정은 바뀌지 않습니다.");item.put("book",book);item.put("title",book.get("title"));item.put("memo",book.get("memo"));item.put("category_id",book.get("categoryId"));}
   else item.put("category_id",item.get("semanticCategoryId"));
   var links=sources.getOrDefault(id,List.of());item.put("sources",links);item.put("sourceCount",links.size());
   item.put("meaningOrigin",item.get("declaredFinancialType")!=null?"OWNER":origins.get(id));
   item.put("meaningApplied",MoneyOwnerFinancialDecision.meaningApplied(item));
   boolean quick=false;
   if(item.get("declaredFinancialType")==null&&"UNRESOLVED".equals(item.get("meaning_state"))&&links.size()==1&&links.getFirst().get("parse_attempt_id")!=null){
    if(accounts==null)accounts=money.accounts();
    quick=MoneyFinancialEvidence.quickProof(db,owner(),money,money.transaction(id),accounts)!=null;
   }
   item.put("quickConfirmAvailable",quick);
   UUID from=(UUID)item.get("from_account_id"),to=(UUID)item.get("to_account_id");BigDecimal amount=(BigDecimal)item.get("amount");
   String direction;BigDecimal signed;
   if(accountId!=null){boolean out=accountId.equals(from),in=accountId.equals(to);direction=out&&in?"TRANSFER":out?"OUT":in?"IN":"UNKNOWN";signed=out&&in?BigDecimal.ZERO:out?amount.negate():in?amount:null;}
   else{direction=from!=null&&to!=null?"TRANSFER":from!=null?"OUT":to!=null?"IN":"UNKNOWN";signed="OUT".equals(direction)?amount.negate():"IN".equals(direction)?amount:null;}
   item.put("direction",direction);item.put("signedAmount",signed);
  }
 }
 @Transactional(readOnly=true) public Map<String,Object> pending(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset){return pending(from,to,accountId,type,state,search,limit,offset,null);}
 @Transactional(readOnly=true) public Map<String,Object> pending(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset,String baseDirection){
  MoneyService.page(limit,offset);selected(accountId);var query=filter(from,to,type,state,search,true,baseDirection);var accountCounts=counts(query,true);var args=new ArrayList<>(query.args());String where=query.from();if(accountId!=null){where+=" and q.\"accountId\"=?";args.add(accountId);}
  long total=db.queryForObject(MoneyReviewService.QUEUE+"select count(*)"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var items=db.queryForList(MoneyReviewService.QUEUE+"select q.*"+where+" order by q.\"occurredAt\" desc,q.id limit ? offset ?",args.toArray()).stream().map(this::clean).toList();
  items.forEach(row->{if(row.get("candidate")!=null)row.put("candidate",json.readValue(row.get("candidate").toString(),Map.class));});
  var summary=new LinkedHashMap<String,Object>();summary.put("total",total);summary.put("unresolved",0);summary.put("relationPending",0);summary.put("incoming",null);summary.put("outgoing",null);summary.put("currencies",List.of());
  return Map.of("items",items,"total",total,"accountCounts",accountCounts,"summary",summary);
 }
 private Map<String,Object> evidence(UUID id){
  var row=new LinkedHashMap<>(unified.row(id));
  row.put("sourceVersions",db.queryForList("select s.raw_event_id,r.processing_version,s.parse_attempt_id,p.candidate::text from money_transaction_sources s join money_raw_notifications r on r.user_id=s.user_id and r.id=s.raw_event_id left join money_parse_attempts p on p.user_id=s.user_id and p.id=s.parse_attempt_id where s.user_id=? and s.transaction_id=? order by s.raw_event_id",owner(),id));
  row.put("overrides",db.queryForList("select version,overrides::text from money_bookkeeping_overrides where user_id=? and transaction_id=? order by slot",owner(),id));
  row.put("projection",db.queryForList("select version,defaults::text from money_rule_projections where user_id=? and transaction_id=?",owner(),id));
  row.put("classificationState",db.queryForList("select version,decision_version,event_id,category_id,direct_protected from money_classification_state where user_id=? and transaction_id=?",owner(),id));
  row.put("accounts",db.queryForList("select a.id,a.version,a.archived,(select jsonb_agg(jsonb_build_object('effectiveAt',h.effective_at,'group',h.fund_group) order by h.effective_at) from money_account_fund_group_history h where h.user_id=a.user_id and h.account_id=a.id)::text as history from money_accounts a where a.user_id=? and a.id in (select from_account_id from money_transactions where user_id=? and id=? union select to_account_id from money_transactions where user_id=? and id=?) order by a.id",owner(),owner(),id,owner(),id));
  row.put("loan",db.queryForList("select l.id,l.version,l.remaining_principal,l.status from money_loans l join money_transactions t on t.loan_id=l.id and t.user_id=l.user_id where t.user_id=? and t.id=?",owner(),id));
  row.put("refundOriginal",db.queryForList("select p.id,p.version,p.amount,coalesce(b.version,0) override_version,coalesce(r.version,0) projection_version from money_transactions t join money_transactions p on p.id=t.refund_of and p.user_id=t.user_id left join money_bookkeeping_overrides b on b.transaction_id=p.id and b.user_id=p.user_id and b.slot=0 left join money_rule_projections r on r.transaction_id=p.id and r.user_id=p.user_id where t.user_id=? and t.id=?",owner(),id));return row;
 }
 @Transactional(readOnly=true) public Map<String,Object> row(UUID id){var evidence=evidence(id);String fingerprint=commands.fingerprint(evidence);var result=clean(new MoneyOwnerFinancialDecision(db,owner()).fact(id,false));enrich(List.of(result),null);result.put("fingerprint",fingerprint);result.put("audit",ledgerHistory(id));return result;}
 // Account Ledger exposes semantic history and evidence IDs. Full financial repair snapshots stay in audit storage.
 private List<Map<String,Object>> ledgerHistory(UUID id){
  String keys="('type','canonicalType','declaredFinancialType','relationStatus','version','meaning_state',"
      +"'decisionVersion','decisionRequestId','decisionActorId','requestId','origin','action','loanId','refundOf')";
  String historyFields="coalesce((select jsonb_object_agg(k,v) from jsonb_each(case when jsonb_typeof(%s)='object' then %s else '{}'::jsonb end) fields(k,v) where k in "+keys+" and jsonb_typeof(v) not in ('array','object')),'{}'::jsonb)::text";
  return db.queryForList("select action,created_at as \"createdAt\","+historyFields.formatted("previous_value","previous_value")
      +" as \"previousValue\","+historyFields.formatted("next_value","next_value")+" as \"nextValue\" from money_meaning_audit where user_id=? and subject_id=? order by created_at,id",owner(),id);
 }
 public record EditRequest(String fingerprint,MoneyUnifiedBookkeepingService.Edit edit,String previewToken,
      @JsonInclude(NON_NULL) UUID semanticCategoryId,
      @JsonInclude(NON_NULL) Long semanticPolicyVersion){
  public EditRequest(String fingerprint,MoneyUnifiedBookkeepingService.Edit edit,String previewToken){this(fingerprint,edit,previewToken,null,null);}

  public EditRequest(String fingerprint,MoneyUnifiedBookkeepingService.Edit edit){this(fingerprint,edit,null);}
 }
 public record FinancialType(UUID requestId,Long expectedVersion,String financialType,
      @JsonInclude(NON_NULL) Boolean v4){
  public FinancialType(UUID requestId,Long expectedVersion,String financialType){this(requestId,expectedVersion,financialType,null);}
 }
 public Map<String,Object> financialType(UUID id,FinancialType input){
  require(input!=null&&input.requestId()!=null&&input.expectedVersion()!=null&&input.financialType()!=null&&TYPES.contains(input.financialType()),"금융 유형을 선택하세요.");
  var receipt=commands.executeFinancialType(owner(),input.requestId(),List.of(id,input),()->{
   var decisions=new MoneyOwnerFinancialDecision(db,owner());
   var before=decisions.fact(id,true);
   decisions.apply(id,input,before);
   var latest=clean(decisions.fact(id,false));
   enrich(List.of(latest),null);
   String relation=latest.get("relationStatus").toString();
   var result=new LinkedHashMap<String,Object>();
   result.put("requestId",input.requestId());result.put("transactionId",id);
   result.put("status","NONE".equals(relation)?"APPLIED":"INTENT_SAVED_PENDING");
   result.put("intentSaved",true);result.put("meaningApplied",latest.get("meaningApplied"));
   result.put("baseFinancialType",latest.get("baseFinancialType"));result.put("declaredFinancialType",input.financialType());result.put("canonicalType",latest.get("canonicalType"));
   result.put("relationStatus",relation);result.put("currentVersion",latest.get("version"));
   audit(id,"ACCOUNT_LEDGER_FINANCIAL_TYPE",decisionSnapshot(before),decisionSnapshot(latest));
   result.put("row",latest);return result;
  });
  @SuppressWarnings("unchecked") var result=(Map<String,Object>)receipt.get("result");
  if("NOT_APPLIED".equals(receipt.get("status"))){
   String message=Objects.toString(result.get("message"),"금융 유형을 저장할 수 없습니다.");
   if("VERSION_CONFLICT".equals(result.get("reason")))throw new OptimisticLockConflictException(message);
   if("NOT_FOUND".equals(result.get("reason")))throw new ResourceNotFoundException(message);
   throw new InvalidRequestException(message);
  }
  return result;
 }
 public record UndoDirection(UUID requestId,Long expectedVersion,UUID decisionRequestId){}
 public Map<String,Object> undoDirection(UUID id,UndoDirection input){
  require(input!=null && input.requestId()!=null && input.decisionRequestId()!=null && input.expectedVersion()!=null,"실행 취소할 결정과 거래 버전이 필요합니다.");
  var receipt=commands.execute(owner(),input.requestId(),"ACCOUNT_LEDGER_DIRECTION_UNDO",List.of(id,input),()->{
   var decisions=new MoneyOwnerFinancialDecision(db,owner());
   var current=decisions.fact(id,true);
   MoneyMeaningService.version(((Number)current.get("version")).longValue(),input.expectedVersion());
   require(input.decisionRequestId().equals(current.get("decisionRequestId")),"이후 금융 유형이 변경되었습니다.");
   require("ACCOUNT_LEDGER_FINANCIAL_TYPE".equals(commands.outcome(owner(),input.decisionRequestId()).get("command")),"직접 유형 변경만 되돌릴 수 있습니다.");
   var snapshots=db.queryForList("""
      select previous_value::text from money_meaning_audit
       where user_id=? and subject_id=? and action='ACCOUNT_LEDGER_FINANCIAL_TYPE'
       and next_value->>'decisionRequestId'=? and (next_value->>'version')::bigint=?
       and jsonb_exists(previous_value,'storedSemanticCategoryId')
      """,String.class,owner(),id,input.decisionRequestId().toString(),input.expectedVersion());
   require(snapshots.size()==1,"되돌릴 직접 변경 내역을 확인할 수 없습니다.");
   var before=json.readValue(snapshots.getFirst(),Map.class);
   require(before.get("type")!=null && before.get("meaning_state")!=null,"변경 전 금융 유형이 필요합니다.");
   db.update("update money_transactions set type=?,meaning_state=?,version=version+1 where user_id=? and id=?",
       before.get("type"),before.get("meaning_state"),owner(),id);
   if(before.get("declaredFinancialType")==null){
    db.update("delete from money_owner_financial_decisions where user_id=? and transaction_id=? and request_id=?",owner(),id,input.decisionRequestId());
   }else{
    db.update("""
       update money_owner_financial_decisions set declared_type=?,relation_status=?,semantic_category_id=?::uuid,
        request_id=?,version=version+1,updated_at=now() where user_id=? and transaction_id=?
       """,before.get("declaredFinancialType"),before.get("storedRelationStatus"),before.get("storedSemanticCategoryId"),input.requestId(),owner(),id);
   }
   var restored=clean(decisions.fact(id,false));enrich(List.of(restored),null);
   audit(id,"ACCOUNT_LEDGER_DIRECTION_UNDO",decisionSnapshot(current),decisionSnapshot(restored));
   var result=new LinkedHashMap<String,Object>();
   result.put("requestId",input.requestId());result.put("transactionId",id);result.put("row",restored);result.put("intentSaved",true);
   result.put("status","UNDONE");result.put("currentVersion",restored.get("version"));result.put("meaningApplied",restored.get("meaningApplied"));
   for(String key:List.of("baseFinancialType","declaredFinancialType","canonicalType","relationStatus"))result.put(key,restored.get(key));
   return result;
  });
  if("NOT_APPLIED".equals(receipt.get("status")))throw new OptimisticLockConflictException("이후 거래가 변경되었거나 복원할 결정이 없습니다.");
  return (Map<String,Object>)receipt.get("result");
 }
 private static Map<String,Object> decisionSnapshot(Map<String,Object> row){
  var snapshot=new LinkedHashMap<String,Object>();
  for(String key:List.of("version","type","meaning_state","declaredFinancialType","canonicalType","relationStatus","decisionRequestId","decisionVersion","decisionActorId","storedRelationStatus","storedSemanticCategoryId"))
   snapshot.put(key,row.get(key));
  return snapshot;
 }
 public record Metadata(UUID requestId,Long expectedVersion,String fingerprint,String title,String memo){}
 public record Category(UUID requestId,Long expectedVersion,String fingerprint,UUID categoryId,Long expectedClassificationVersion,Boolean thisTransactionOnly,
      @JsonInclude(NON_NULL) Long semanticPolicyVersion,
      @JsonInclude(NON_NULL) String baseDirection){
  public Category(UUID requestId,Long expectedVersion,String fingerprint,UUID categoryId,Long expectedClassificationVersion,Boolean thisTransactionOnly){this(requestId,expectedVersion,fingerprint,categoryId,expectedClassificationVersion,thisTransactionOnly,null,null);}
  public Category(UUID requestId,Long expectedVersion,String fingerprint,UUID categoryId,Long expectedClassificationVersion,Boolean thisTransactionOnly,Long semanticPolicyVersion){this(requestId,expectedVersion,fingerprint,categoryId,expectedClassificationVersion,thisTransactionOnly,semanticPolicyVersion,null);}

 }
 private String previewToken(UUID id,EditRequest input){
  var edit=input.edit();var dependencies=new LinkedHashMap<String,Object>();
  dependencies.put("targetAccount",db.queryForList("select id,version,archived,fund_group from money_accounts where user_id=? and id=?",owner(),edit.accountId()));
  dependencies.put("targetLoan",db.queryForList("select id,version,remaining_principal,original_principal,status,start_date from money_loans where user_id=? and id=?",owner(),edit.loanId()));
  dependencies.put("targetTransactions",db.queryForList("select id,version,type,meaning_state,amount,currency,from_account_id,to_account_id,refund_of,excluded,merged_into from money_transactions where user_id=? and (id=? or id=?) order by id",owner(),edit.otherId(),edit.refundOf()));
  dependencies.put("targetRaw",db.queryForList("select r.id,r.processing_version,r.state,p.id as parse_id,p.candidate::text from money_raw_notifications r left join lateral(select id,candidate from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by p.created_at desc,p.id desc limit 1) p on true where r.user_id=? and r.id=?",owner(),edit.otherId()));
  if(input.semanticCategoryId()!=null||input.semanticPolicyVersion()!=null)dependencies.put("semanticPolicy",Arrays.asList(input.semanticCategoryId(),input.semanticPolicyVersion()));
  return commands.fingerprint(Arrays.asList(id,input.fingerprint(),edit,dependencies));
 }
 private void valid(UUID id,String fingerprint,Long expected){
  var t=money.transaction(id);MoneyMeaningService.version(t.version(),expected);require(!t.excluded()&&t.mergedInto()==null,"활성 정규 거래를 선택하세요.");
  if(fingerprint==null||!fingerprint.equals(commands.fingerprint(evidence(id))))throw new OptimisticLockConflictException("금융 사실·원본·분류가 변경되었습니다. 초안을 유지하고 최신 근거를 비교하세요.");
 }
 public Map<String,Object> preview(UUID id,EditRequest input){
  require(input!=null&&input.edit()!=null&&input.edit().requestId()!=null,"변경 요청이 필요합니다.");
  String token=previewToken(id,input);
  return previewTransaction.execute(status->{status.setRollbackOnly();var result=execute(id,new EditRequest(input.fingerprint(),input.edit(),token,input.semanticCategoryId(),input.semanticPolicyVersion()));var out=new LinkedHashMap<>(result);out.put("fingerprint",input.fingerprint());out.put("previewToken",token);out.put("previewOnly",true);return out;});
 }
 public Map<String,Object> execute(UUID id,EditRequest input){
  require(input!=null&&input.edit()!=null&&input.edit().action()!=null,"변경 요청이 필요합니다.");var edit=input.edit();
  return commands.execute(owner(),edit.requestId(),"ACCOUNT_LEDGER_"+edit.action(),Arrays.asList(id,input),()->{
   require(input.previewToken()!=null&&input.previewToken().equals(previewToken(id,input)),"초안 또는 연결 계좌·대출·원문 근거가 바뀌었습니다. 다시 미리보기한 뒤 확정하세요.");
   valid(id,input.fingerprint(),edit.expectedVersion());
   if(input.semanticCategoryId()!=null || input.semanticPolicyVersion()!=null){
    var policy=new MoneyCategoryFinancialPolicy(db,owner());
    require("TYPE".equals(edit.action()) && policy.resolve(input.semanticCategoryId(),input.semanticPolicyVersion()).equals(edit.type()),
       "카테고리와 금융 관계 유형이 다릅니다.");
   }
   if("QUICK_CONFIRM".equals(edit.action())){
    var old=money.transaction(id);
    var proof=MoneyFinancialEvidence.requireQuick(db,owner(),money,old,edit.type());
    var canonical=quickEdit(edit.requestId(),old,"TYPE");
    var result=unified.applyValidatedEdit(id,canonical);
    audit(id,"FINANCIAL_ENGINE_OWNER_CONFIRM",Map.of("version",old.version()),Map.of(
        "requestId",edit.requestId(),"origin","OWNER","type",old.type(),"version",old.version()+1,
        "engineVersion",MoneyFinancialEvidence.VERSION,"proof",proof));
    result.put("row",row(id));return result;
   }
   if("TYPE".equals(edit.action())&&"UNRESOLVED".equals(edit.type()))return unresolved(id,edit);
   if("TYPE".equals(edit.action())&&"LOAN_RECEIPT".equals(edit.type())){
    var result=loanReceipt(id,edit);
    return withFinancialCategory(id,input,result);
   }
   if("TYPE".equals(edit.action())){
    MoneyService.text(edit.reason(),500,false,"금융 의미 확인 사유");var old=money.transaction(id);
    if("REFUND".equals(edit.type()))require(edit.refundOf()!=null&&edit.otherVersion()!=null,"환불 원거래와 최신 버전을 확인하세요.");
    if("LOAN_PAYMENT".equals(edit.type()))require(edit.principal()!=null&&edit.interest()!=null&&edit.fee()!=null,"원금·이자·수수료를 각각 확인하세요.");
    if(old.type()==TransactionType.TRANSFER&&old.fromAccountId()!=null&&old.toAccountId()!=null&&Set.of("TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL").contains(Objects.toString(edit.type(),""))){
     String display=db.queryForObject("select "+MoneySavingsReadService.displayTypeSql("t")+" from money_transactions t where t.user_id=? and t.id=?",String.class,owner(),id);
     require(display.equals(edit.type()),"저축 표시는 거래 당시 계좌 자금그룹으로 결정됩니다. 실제 반대편 근거와 계좌 이력을 확인하세요.");return acknowledgeRelation(id,edit);
    }
    require(!Set.of("SAVINGS","SAVINGS_WITHDRAWAL").contains(Objects.toString(edit.type(),"")),"저축은 실제 반대편 거래를 연결한 이체와 거래 당시 자금그룹 근거가 필요합니다.");
    var result=unified.applyValidatedEdit(id,edit);
    if(!old.type().name().equals(edit.type())||!"CONFIRMED".equals(old.meaningState()))clearCategoryOverride(id);
    result.put("row",row(id));return withFinancialCategory(id,input,result);
   }
   var result=unified.applyValidatedEdit(id,edit);result.put("row",row(id));return result;
  });
 }
 private Map<String,Object> withFinancialCategory(UUID id,EditRequest input,Map<String,Object> result){
  if(input.semanticCategoryId()==null)return result;
  new MoneyCategoryFinancialPolicy(db,owner()).bind(id,input.edit().requestId(),input.semanticCategoryId(),input.semanticPolicyVersion(),input.edit().type());
  var classification=new MoneyClassificationService(db,users,json,web,null,money,commands);
  var state=classification.ownedState(id);
  var book=web.accountLedgerBookkeepingRow(id);
  if(!input.semanticCategoryId().toString().equals(Objects.toString(state.get("categoryId"),""))
      || !input.semanticCategoryId().toString().equals(Objects.toString(book.get("categoryId"),""))){
   classification.persistRecommendation(id,input.semanticCategoryId(),"DIRECT",true,input.edit().requestId(),book,
     Map.of("source","OWNER_CONFIRMED_FINANCIAL_CATEGORY"),state);
  }
  var mapped=new LinkedHashMap<>(result);mapped.put("row",row(id));return mapped;
 }
 static MoneyUnifiedBookkeepingService.Edit quickEdit(UUID requestId,MoneyTransaction fact,String action){
  return new MoneyUnifiedBookkeepingService.Edit(requestId,fact.version(),action,fact.type().name(),
      null,null,null,null,null,null,null,null,null,null,null,"원본 근거와 입출금 방향을 확인한 금융 의미 확정",null);
 }
 public Map<String,Object> metadata(UUID id,Metadata input){
  require(input!=null,"편집 내용이 필요합니다.");return commands.execute(owner(),input.requestId(),"ACCOUNT_LEDGER_METADATA",Arrays.asList(id,input),()->{
   valid(id,input.fingerprint(),input.expectedVersion());MoneyService.text(input.title(),240,false,"제목");MoneyService.text(input.memo(),2000,false,"메모");var before=unified.row(id);
   db.update("update money_transactions set title=?,memo=?,version=version+1 where user_id=? and id=?",input.title(),input.memo(),owner(),id);
   // Keep explicit Bookkeeping metadata overrides coherent while preserving every unrelated override.
   db.update("update money_bookkeeping_overrides set overrides=jsonb_set(jsonb_set(overrides,'{title}',cast(? as jsonb),true),'{memo}',cast(? as jsonb),true),version=version+1,updated_at=now() where user_id=? and transaction_id=?",json.writeValueAsString(input.title()),json.writeValueAsString(input.memo()),owner(),id);
   audit(id,"ACCOUNT_LEDGER_METADATA",before,input);return Map.of("row",row(id));
  });
 }
 public Map<String,Object> category(UUID id,Category input){
  require(input!=null,"직접 선택한 분류가 필요합니다.");return commands.execute(owner(),input.requestId(),"ACCOUNT_LEDGER_CATEGORY",Arrays.asList(id,input),()->{
   valid(id,input.fingerprint(),input.expectedVersion());
   var decisions=new MoneyOwnerFinancialDecision(db,owner());
   var before=decisions.fact(id,true);
   // Older direct editors only sent the category ID. Read the current mapping under the owner lock.
   Long policyVersion=input.semanticPolicyVersion();
   if(policyVersion==null && input.categoryId()!=null){
    var matches=db.queryForList("select policy_version from money_category_financial_policy where user_id=? and category_id=? for share",Long.class,owner(),input.categoryId());
    if(!matches.isEmpty())policyVersion=matches.getFirst();
   }
   var fact=money.transaction(id);
   String direction=fact.fromAccountId()!=null?"EXPENSE":"INCOME";
   if(input.baseDirection()!=null){
    require(input.baseDirection().equals(direction) && (fact.fromAccountId()==null ^ fact.toAccountId()==null),"선택한 계좌의 실제 방향과 다릅니다.");
    if(before.get("loan_id")!=null||fact.refundOf()!=null||Set.of(TransactionType.LOAN_PAYMENT,TransactionType.LOAN_RECEIPT,TransactionType.REFUND).contains(fact.type())){
     require(policyVersion!=null && new MoneyCategoryFinancialPolicy(db,owner())
       .resolve(input.categoryId(),policyVersion).equals(fact.type().name()),
       "대출·환불 분류는 상세 편집에서 정정하세요.");
    }
   }
   if("UNRESOLVED".equals(fact.meaningState()) && (input.baseDirection()!=null||policyVersion!=null)){
    require(Set.of(TransactionType.INCOME,TransactionType.EXPENSE).contains(fact.type()) &&
      (input.baseDirection()!=null || before.get("declaredFinancialType")==null || Set.of("UNRESOLVED",direction).contains(before.get("declaredFinancialType")) ||
       (policyVersion!=null && new MoneyCategoryFinancialPolicy(db,owner()).resolve(input.categoryId(),policyVersion).equals(before.get("declaredFinancialType")))),
      "기존 금융 의도나 연결 관계를 먼저 정정하세요.");
    decisions.apply(id,new FinancialType(input.requestId(),fact.version(),direction,true),before);
    if(input.baseDirection()!=null)
     audit(id,"ACCOUNT_LEDGER_FINANCIAL_TYPE",decisionSnapshot(before),decisionSnapshot(decisions.fact(id,false)));
    fact=money.transaction(id);
   }
   require(MoneyOwnerFinancialDecision.meaningApplied(decisions.fact(id,false))&&"CONFIRMED".equals(fact.meaningState())&&Set.of(TransactionType.EXPENSE,TransactionType.INCOME,TransactionType.REFUND,TransactionType.LOAN_PAYMENT,TransactionType.LOAN_RECEIPT).contains(fact.type()),"거래의 금융 관계를 먼저 확인하세요.");
   require(input.categoryId()!=null&&Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_categories c left join money_categories p on p.id=c.parent_id and p.user_id=c.user_id where c.user_id=? and c.id=? and c.kind=? and not c.archived and not coalesce(p.archived,false))",Boolean.class,owner(),input.categoryId(),Set.of(TransactionType.INCOME,TransactionType.REFUND,TransactionType.LOAN_RECEIPT).contains(fact.type())?"INCOME":"EXPENSE")),"현재 거래 유형에 맞는 소유 활성 분류를 선택하세요.");
   // Owner writes and recommendation outcomes share the owner lock and classification version.
   var classification=new MoneyClassificationService(db,users,json,web,null,money,commands);var state=classification.ownedState(id);MoneyMeaningService.version(((Number)state.get("version")).longValue(),input.expectedClassificationVersion());
   var book=web.accountLedgerBookkeepingRow(id);var event=classification.persistRecommendation(id,input.categoryId(),"DIRECT",Boolean.TRUE.equals(input.thisTransactionOnly()),input.requestId(),book,Map.of("source","ACCOUNT_LEDGER_EXPLICIT_CATEGORY"),state);
   if(policyVersion!=null){
    var policy=new MoneyCategoryFinancialPolicy(db,owner());
    String code=policy.resolve(input.categoryId(),policyVersion);
    require(code.equals(fact.type().name())||Set.of(TransactionType.INCOME,TransactionType.EXPENSE).contains(fact.type()),
      "기존 대출·환불 관계를 전용 정정에서 확인하세요.");
    policy.bind(id,input.requestId(),input.categoryId(),policyVersion,fact.type().name());
    audit(id,"ACCOUNT_LEDGER_CATEGORY_INTENT",fact,Map.of("categoryId",input.categoryId(),"semanticCode",code,"requestId",input.requestId()));
   }
   return Map.of("row",row(id),"classification",event);
  });
 }
 private void audit(UUID id,String action,Object before,Object after){db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,?,cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),id,action,json.writeValueAsString(before),json.writeValueAsString(after));}
 private void clearCategoryOverride(UUID id){
  db.update("insert into money_bookkeeping_overrides(id,user_id,transaction_id,overrides,version) values(?,?,?,'{\"categoryId\":null}'::jsonb,1) on conflict(user_id,transaction_id,slot) do update set overrides=money_bookkeeping_overrides.overrides||'{\"categoryId\":null}'::jsonb,version=money_bookkeeping_overrides.version+1,updated_at=now()",UUID.randomUUID(),owner(),id);
 }
 private Map<String,Object> acknowledgeRelation(UUID id, MoneyUnifiedBookkeepingService.Edit edit){
  // The verified transfer/draw can already be correct while an incompatible owner intent is pending.
  // Superseding that intent is itself a versioned edit, even with no change to either financial leg.
  var decisions=new MoneyOwnerFinancialDecision(db,owner());
  var before=decisions.fact(id,false);
  if(before.get("declaredFinancialType")!=null&&!edit.type().equals(before.get("declaredFinancialType"))){
   db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),id);
   decisions.supersede(id,edit.requestId(),edit.type());
   audit(id,"ACCOUNT_LEDGER_VERIFIED_RELATION",decisionSnapshot(before),decisionSnapshot(decisions.fact(id,false)));
  }
  return Map.of("row",row(id));
 }
 private Map<String,Object> unresolved(UUID id,MoneyUnifiedBookkeepingService.Edit edit){
  MoneyService.text(edit.reason(),500,true,"금융 의미 보류 사유");var t=money.transaction(id);require(Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(t.type())&&(t.fromAccountId()==null||t.toAccountId()==null),"대출·환불·연결 이체의 의미 보류는 전용 정정이 필요합니다.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of=? and not excluded and merged_into is null)",Boolean.class,owner(),id)),"연결된 환불을 먼저 확인하세요.");
  db.update("update money_transactions set meaning_state='UNRESOLVED',category_id=null,refund_of=null,version=version+1 where user_id=? and id=?",owner(),id);new MoneyOwnerFinancialDecision(db,owner()).supersede(id,edit.requestId(),"UNRESOLVED");audit(id,"ACCOUNT_LEDGER_UNRESOLVED",t,edit);return Map.of("row",row(id));
 }
 private Map<String,Object> loanReceipt(UUID id,MoneyUnifiedBookkeepingService.Edit edit){
  MoneyService.text(edit.reason(),500,true,"대출 수령 확인 사유");var t=money.transaction(id);require("KRW".equals(t.currency())&&t.fromAccountId()==null&&t.toAccountId()!=null&&Set.of(TransactionType.INCOME,TransactionType.LOAN_RECEIPT).contains(t.type()),"실제 입금 거래와 KRW 대출 관계가 필요합니다.");require(edit.loanId()!=null,"기존 대출을 선택하세요.");
  var loan=web.loan(edit.loanId());MoneyMeaningService.version(loan.version(),edit.loanVersion());require("ACTIVE".equals(loan.status()),"진행 중인 대출을 선택하세요.");
  require(loan.startDate()==null||!t.occurredAt().atZone(ZoneId.of("Asia/Seoul")).toLocalDate().isBefore(loan.startDate()),"대출 시작일보다 앞선 입금입니다.");
  if(t.type()==TransactionType.LOAN_RECEIPT){require(edit.loanId().equals(db.queryForObject("select loan_id from money_transactions where user_id=? and id=?",UUID.class,owner(),id)),"기존 대출 관계를 변경할 수 없습니다.");return acknowledgeRelation(id,edit);}
  require(loan.originalPrincipal()==null||loan.remainingPrincipal().add(t.amount()).compareTo(loan.originalPrincipal())<=0,"대출 약정 원금을 초과합니다. 기존 대출 잔액을 확인하세요.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_bookkeeping_overrides where user_id=? and transaction_id=? and (jsonb_exists(overrides,'amount') or jsonb_exists(overrides,'accountId') or jsonb_exists(overrides,'occurredAt')))",Boolean.class,owner(),id)),"기존 가계부 금융 표시 정정을 먼저 확인하세요.");
  db.update("update money_transactions set type='LOAN_RECEIPT',meaning_state='CONFIRMED',loan_id=?,principal=amount,interest=0,fee=0,category_id=null,version=version+1 where user_id=? and id=?",loan.id(),owner(),id);
  db.update("update money_loans set remaining_principal=remaining_principal+?,version=version+1,updated_at=now() where user_id=? and id=?",t.amount(),owner(),loan.id());new MoneyOwnerFinancialDecision(db,owner()).supersede(id,edit.requestId(),"LOAN_RECEIPT");audit(id,"ACCOUNT_LEDGER_LOAN_RECEIPT",t,edit);return Map.of("row",row(id));
 }
}
