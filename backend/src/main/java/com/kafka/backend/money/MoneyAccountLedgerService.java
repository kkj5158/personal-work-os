package com.kafka.backend.money;

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
 private static final String DISPLAY="case when t.meaning_state='UNRESOLVED' then 'UNRESOLVED' else "+MoneySavingsReadService.displayTypeSql("t")+" end";
 public MoneyAccountLedgerService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyUnifiedBookkeepingService unified,MoneyWebService web,MoneyCommandService commands,PlatformTransactionManager manager){
  this.db=db;this.users=users;this.json=json;this.money=money;this.unified=unified;this.web=web;this.commands=commands;
  this.previewTransaction=new TransactionTemplate(manager);this.previewTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
 }
 private UUID owner(){return users.getCurrentUserId();}
 private record Query(String from,List<Object> args){}
 private Query filter(String from,String to,String type,String state,String search,boolean raw){
  MoneyService.text(search,200,false,"검색");LocalDate first=LocalDate.parse(from),last=LocalDate.parse(to);require(!first.isAfter(last),"기간을 확인하세요.");
  require(type==null||type.isBlank()||TYPES.contains(type),"금융 유형 필터를 확인하세요.");require(Set.of("ALL","CONFIRMED","UNRESOLVED").contains(state),"금융 상태 필터를 확인하세요.");
  var args=new ArrayList<Object>();args.add(owner());args.add(Timestamp.from(first.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));args.add(Timestamp.from(last.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));
  String sql=raw?" from queue q where q.kind='RAW' and q.state in ('PENDING','DEFERRED') and q.\"occurredAt\">=? and q.\"occurredAt\"<?":" from money_transactions t where t.user_id=? and t.merged_into is null and not t.excluded and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') and t.occurred_at>=? and t.occurred_at<?";
  if(raw){
   // RAW has no confirmed financial meaning. A confirmed/type-specific filter cannot promote it into money.
   if("CONFIRMED".equals(state)||type!=null&&!type.isBlank()&&!"UNRESOLVED".equals(type))sql+=" and false";
  }else{
   if(!"ALL".equals(state)){sql+=" and t.meaning_state=?";args.add(state);}
   if(type!=null&&!type.isBlank()){sql+=" and "+DISPLAY+"=?";args.add(type);}
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
 @Transactional(readOnly=true) public Map<String,Object> read(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset){
  MoneyService.page(limit,offset);selected(accountId);var query=filter(from,to,type,state,search,false);var accountCounts=counts(query,false);var args=new ArrayList<>(query.args());String where=query.from();
  if(accountId!=null){where+=" and (t.from_account_id=? or t.to_account_id=?)";args.add(accountId);args.add(accountId);}
  var summary=clean(db.queryForMap("select count(*) as total,count(*) filter(where t.meaning_state='UNRESOLVED') as unresolved"+where,args.toArray()));
  var currencies=db.queryForList("select distinct t.currency"+where+" order by t.currency",String.class,args.toArray());summary.put("currencies",currencies);
  // Amounts are only meaningful under one account and one currency; ALL never exposes an aggregate balance.
  summary.put("incoming",null);summary.put("outgoing",null);
  if(accountId!=null&&currencies.size()<=1){var sums=new ArrayList<Object>();sums.add(accountId);sums.add(accountId);sums.addAll(args);summary.putAll(db.queryForMap("select coalesce(sum(t.amount) filter(where t.to_account_id=?),0) as incoming,coalesce(sum(t.amount) filter(where t.from_account_id=?),0) as outgoing"+where,sums.toArray()));}
  args.add(limit);args.add(offset);var items=db.queryForList("select t.*,"+DISPLAY+" as display_type"+where+" order by t.occurred_at desc,t.id limit ? offset ?",args.toArray()).stream().map(this::clean).toList();
  enrich(items,accountId);return Map.of("items",items,"total",summary.get("total"),"accountCounts",accountCounts,"summary",summary);
 }
 private void enrich(List<Map<String,Object>> items,UUID accountId){
  if(items.isEmpty())return;UUID[] ids=items.stream().map(row->(UUID)row.get("id")).toArray(UUID[]::new);
  var books=new HashMap<UUID,Map<String,Object>>();for(var book:db.queryForList(MoneyWebService.BOOK_BASE+"select * from effective where id=any(?)",owner(),ids))books.put((UUID)book.get("id"),web.decodeBook(clean(book)));
  var sources=new HashMap<UUID,List<Map<String,Object>>>();for(var source:db.queryForList("select transaction_id,raw_event_id,parse_attempt_id,relationship,evidence::text from money_transaction_sources where user_id=? and transaction_id=any(?) order by raw_event_id",owner(),ids)){UUID id=(UUID)source.remove("transaction_id");sources.computeIfAbsent(id,k->new ArrayList<>()).add(source);}
  for(var item:items){UUID id=(UUID)item.get("id");boolean eligible="CONFIRMED".equals(item.get("meaning_state"))&&Set.of("EXPENSE","INCOME").contains(item.get("type"));item.put("categoryEligible",eligible);
   if(eligible&&books.containsKey(id)){var book=books.get(id);item.put("book",book);item.put("title",book.get("title"));item.put("memo",book.get("memo"));item.put("category_id",book.get("categoryId"));}
   else item.put("category_id",null);
   var links=sources.getOrDefault(id,List.of());item.put("sources",links);item.put("sourceCount",links.size());
   UUID from=(UUID)item.get("from_account_id"),to=(UUID)item.get("to_account_id");BigDecimal amount=(BigDecimal)item.get("amount");
   String direction;BigDecimal signed;
   if(accountId!=null){boolean out=accountId.equals(from),in=accountId.equals(to);direction=out&&in?"TRANSFER":out?"OUT":in?"IN":"UNKNOWN";signed=out&&in?BigDecimal.ZERO:out?amount.negate():in?amount:null;}
   else{direction=from!=null&&to!=null?"TRANSFER":from!=null?"OUT":to!=null?"IN":"UNKNOWN";signed="OUT".equals(direction)?amount.negate():"IN".equals(direction)?amount:null;}
   item.put("direction",direction);item.put("signedAmount",signed);
  }
 }
 @Transactional(readOnly=true) public Map<String,Object> pending(String from,String to,UUID accountId,String type,String state,String search,int limit,int offset){
  MoneyService.page(limit,offset);selected(accountId);var query=filter(from,to,type,state,search,true);var accountCounts=counts(query,true);var args=new ArrayList<>(query.args());String where=query.from();if(accountId!=null){where+=" and q.\"accountId\"=?";args.add(accountId);}
  long total=db.queryForObject(MoneyReviewService.QUEUE+"select count(*)"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var items=db.queryForList(MoneyReviewService.QUEUE+"select q.*"+where+" order by q.\"occurredAt\" desc,q.id limit ? offset ?",args.toArray()).stream().map(this::clean).toList();
  items.forEach(row->{if(row.get("candidate")!=null)row.put("candidate",json.readValue(row.get("candidate").toString(),Map.class));});
  var summary=new LinkedHashMap<String,Object>();summary.put("total",total);summary.put("unresolved",0);summary.put("incoming",null);summary.put("outgoing",null);summary.put("currencies",List.of());
  return Map.of("items",items,"total",total,"accountCounts",accountCounts,"summary",summary);
 }
 private Map<String,Object> evidence(UUID id){
  var row=new LinkedHashMap<>(unified.row(id));
  row.put("sourceVersions",db.queryForList("select s.raw_event_id,r.processing_version,s.parse_attempt_id,p.candidate::text from money_transaction_sources s join money_raw_notifications r on r.user_id=s.user_id and r.id=s.raw_event_id left join money_parse_attempts p on p.user_id=s.user_id and p.id=s.parse_attempt_id where s.user_id=? and s.transaction_id=? order by s.raw_event_id",owner(),id));
  row.put("overrides",db.queryForList("select version,overrides::text from money_bookkeeping_overrides where user_id=? and transaction_id=? order by slot",owner(),id));
  row.put("projection",db.queryForList("select version,defaults::text from money_rule_projections where user_id=? and transaction_id=?",owner(),id));
  row.put("accounts",db.queryForList("select a.id,a.version,a.archived,(select jsonb_agg(jsonb_build_object('effectiveAt',h.effective_at,'group',h.fund_group) order by h.effective_at) from money_account_fund_group_history h where h.user_id=a.user_id and h.account_id=a.id)::text as history from money_accounts a where a.user_id=? and a.id in (select from_account_id from money_transactions where user_id=? and id=? union select to_account_id from money_transactions where user_id=? and id=?) order by a.id",owner(),owner(),id,owner(),id));
  row.put("loan",db.queryForList("select l.id,l.version,l.remaining_principal,l.status from money_loans l join money_transactions t on t.loan_id=l.id and t.user_id=l.user_id where t.user_id=? and t.id=?",owner(),id));
  row.put("refundOriginal",db.queryForList("select p.id,p.version,p.amount,coalesce(b.version,0) override_version,coalesce(r.version,0) projection_version from money_transactions t join money_transactions p on p.id=t.refund_of and p.user_id=t.user_id left join money_bookkeeping_overrides b on b.transaction_id=p.id and b.user_id=p.user_id and b.slot=0 left join money_rule_projections r on r.transaction_id=p.id and r.user_id=p.user_id where t.user_id=? and t.id=?",owner(),id));return row;
 }
 @Transactional(readOnly=true) public Map<String,Object> row(UUID id){var evidence=evidence(id);String fingerprint=commands.fingerprint(evidence);var result=new LinkedHashMap<>(unified.row(id));enrich(List.of(result),null);result.put("fingerprint",fingerprint);result.put("audit",new MoneyMeaningService(db,users,json).history(id));return result;}
 public record EditRequest(String fingerprint,MoneyUnifiedBookkeepingService.Edit edit,String previewToken){
  public EditRequest(String fingerprint,MoneyUnifiedBookkeepingService.Edit edit){this(fingerprint,edit,null);}
 }
 public record Metadata(UUID requestId,Long expectedVersion,String fingerprint,String title,String memo){}
 private String previewToken(UUID id,EditRequest input){
  var edit=input.edit();var dependencies=new LinkedHashMap<String,Object>();
  dependencies.put("targetAccount",db.queryForList("select id,version,archived,fund_group from money_accounts where user_id=? and id=?",owner(),edit.accountId()));
  dependencies.put("targetLoan",db.queryForList("select id,version,remaining_principal,original_principal,status,start_date from money_loans where user_id=? and id=?",owner(),edit.loanId()));
  dependencies.put("targetTransactions",db.queryForList("select id,version,type,meaning_state,amount,currency,from_account_id,to_account_id,refund_of,excluded,merged_into from money_transactions where user_id=? and (id=? or id=?) order by id",owner(),edit.otherId(),edit.refundOf()));
  dependencies.put("targetRaw",db.queryForList("select r.id,r.processing_version,r.state,p.id as parse_id,p.candidate::text from money_raw_notifications r left join lateral(select id,candidate from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by p.created_at desc,p.id desc limit 1) p on true where r.user_id=? and r.id=?",owner(),edit.otherId()));
  return commands.fingerprint(Arrays.asList(id,input.fingerprint(),edit,dependencies));
 }
 private void valid(UUID id,String fingerprint,Long expected){
  var t=money.transaction(id);MoneyMeaningService.version(t.version(),expected);require(!t.excluded()&&t.mergedInto()==null,"활성 정규 거래를 선택하세요.");
  if(fingerprint==null||!fingerprint.equals(commands.fingerprint(evidence(id))))throw new OptimisticLockConflictException("금융 사실·원본·분류가 변경되었습니다. 초안을 유지하고 최신 근거를 비교하세요.");
 }
 public Map<String,Object> preview(UUID id,EditRequest input){
  require(input!=null&&input.edit()!=null&&input.edit().requestId()!=null,"변경 요청이 필요합니다.");
  String token=previewToken(id,input);
  return previewTransaction.execute(status->{status.setRollbackOnly();var result=execute(id,new EditRequest(input.fingerprint(),input.edit(),token));var out=new LinkedHashMap<>(result);out.put("fingerprint",input.fingerprint());out.put("previewToken",token);out.put("previewOnly",true);return out;});
 }
 public Map<String,Object> execute(UUID id,EditRequest input){
  require(input!=null&&input.edit()!=null&&input.edit().action()!=null,"변경 요청이 필요합니다.");var edit=input.edit();
  return commands.execute(owner(),edit.requestId(),"ACCOUNT_LEDGER_"+edit.action(),Arrays.asList(id,input),()->{
   require(input.previewToken()!=null&&input.previewToken().equals(previewToken(id,input)),"초안 또는 연결 계좌·대출·원문 근거가 바뀌었습니다. 다시 미리보기한 뒤 확정하세요.");
   valid(id,input.fingerprint(),edit.expectedVersion());
   if("TYPE".equals(edit.action())&&"UNRESOLVED".equals(edit.type()))return unresolved(id,edit);
   if("TYPE".equals(edit.action())&&"LOAN_RECEIPT".equals(edit.type()))return loanReceipt(id,edit);
   if("TYPE".equals(edit.action())){
    MoneyService.text(edit.reason(),500,true,"금융 의미 확인 사유");var old=money.transaction(id);
    if("REFUND".equals(edit.type()))require(edit.refundOf()!=null&&edit.otherVersion()!=null,"환불 원거래와 최신 버전을 확인하세요.");
    if("LOAN_PAYMENT".equals(edit.type()))require(edit.principal()!=null&&edit.interest()!=null&&edit.fee()!=null,"원금·이자·수수료를 각각 확인하세요.");
    if(old.type()==TransactionType.TRANSFER&&old.fromAccountId()!=null&&old.toAccountId()!=null&&Set.of("TRANSFER","SAVINGS","SAVINGS_WITHDRAWAL").contains(Objects.toString(edit.type(),""))){
     String display=db.queryForObject("select "+MoneySavingsReadService.displayTypeSql("t")+" from money_transactions t where t.user_id=? and t.id=?",String.class,owner(),id);
     require(display.equals(edit.type()),"저축 표시는 거래 당시 계좌 자금그룹으로 결정됩니다. 실제 반대편 근거와 계좌 이력을 확인하세요.");return Map.of("row",row(id));
    }
    require(!Set.of("SAVINGS","SAVINGS_WITHDRAWAL").contains(Objects.toString(edit.type(),"")),"저축은 실제 반대편 거래를 연결한 이체와 거래 당시 자금그룹 근거가 필요합니다.");
    var result=unified.applyValidatedEdit(id,edit);
    if(!old.type().name().equals(edit.type())||!"CONFIRMED".equals(old.meaningState()))clearCategoryOverride(id);
    result.put("row",row(id));return result;
   }
   var result=unified.applyValidatedEdit(id,edit);result.put("row",row(id));return result;
  });
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
 private void audit(UUID id,String action,Object before,Object after){db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,?,cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),id,action,json.writeValueAsString(before),json.writeValueAsString(after));}
 private void clearCategoryOverride(UUID id){
  db.update("insert into money_bookkeeping_overrides(id,user_id,transaction_id,overrides,version) values(?,?,?,'{\"categoryId\":null}'::jsonb,1) on conflict(user_id,transaction_id,slot) do update set overrides=money_bookkeeping_overrides.overrides||'{\"categoryId\":null}'::jsonb,version=money_bookkeeping_overrides.version+1,updated_at=now()",UUID.randomUUID(),owner(),id);
 }
 private Map<String,Object> unresolved(UUID id,MoneyUnifiedBookkeepingService.Edit edit){
  MoneyService.text(edit.reason(),500,true,"금융 의미 보류 사유");var t=money.transaction(id);require(Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(t.type())&&(t.fromAccountId()==null||t.toAccountId()==null),"대출·환불·연결 이체의 의미 보류는 전용 정정이 필요합니다.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of=? and not excluded and merged_into is null)",Boolean.class,owner(),id)),"연결된 환불을 먼저 확인하세요.");
  db.update("update money_transactions set meaning_state='UNRESOLVED',category_id=null,refund_of=null,version=version+1 where user_id=? and id=?",owner(),id);audit(id,"ACCOUNT_LEDGER_UNRESOLVED",t,edit);return Map.of("row",row(id));
 }
 private Map<String,Object> loanReceipt(UUID id,MoneyUnifiedBookkeepingService.Edit edit){
  MoneyService.text(edit.reason(),500,true,"대출 수령 확인 사유");var t=money.transaction(id);require("KRW".equals(t.currency())&&t.fromAccountId()==null&&t.toAccountId()!=null&&Set.of(TransactionType.INCOME,TransactionType.LOAN_RECEIPT).contains(t.type()),"실제 입금 거래와 KRW 대출 관계가 필요합니다.");require(edit.loanId()!=null,"기존 대출을 선택하세요.");
  var loan=web.loan(edit.loanId());MoneyMeaningService.version(loan.version(),edit.loanVersion());require("ACTIVE".equals(loan.status()),"진행 중인 대출을 선택하세요.");
  require(loan.startDate()==null||!t.occurredAt().atZone(ZoneId.of("Asia/Seoul")).toLocalDate().isBefore(loan.startDate()),"대출 시작일보다 앞선 입금입니다.");
  if(t.type()==TransactionType.LOAN_RECEIPT){require(edit.loanId().equals(db.queryForObject("select loan_id from money_transactions where user_id=? and id=?",UUID.class,owner(),id)),"기존 대출 관계를 변경할 수 없습니다.");return Map.of("row",row(id));}
  require(loan.originalPrincipal()==null||loan.remainingPrincipal().add(t.amount()).compareTo(loan.originalPrincipal())<=0,"대출 약정 원금을 초과합니다. 기존 대출 잔액을 확인하세요.");
  require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_bookkeeping_overrides where user_id=? and transaction_id=? and (jsonb_exists(overrides,'amount') or jsonb_exists(overrides,'accountId') or jsonb_exists(overrides,'occurredAt')))",Boolean.class,owner(),id)),"기존 가계부 금융 표시 정정을 먼저 확인하세요.");
  db.update("update money_transactions set type='LOAN_RECEIPT',meaning_state='CONFIRMED',loan_id=?,principal=amount,interest=0,fee=0,category_id=null,version=version+1 where user_id=? and id=?",loan.id(),owner(),id);
  db.update("update money_loans set remaining_principal=remaining_principal+?,version=version+1,updated_at=now() where user_id=? and id=?",t.amount(),owner(),loan.id());audit(id,"ACCOUNT_LEDGER_LOAN_RECEIPT",t,edit);return Map.of("row",row(id));
 }
}
