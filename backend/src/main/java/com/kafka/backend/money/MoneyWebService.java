package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyWebTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** Web meaning and analysis stay separate from immutable capture and canonical ledger facts. */
@Service
@Transactional
public class MoneyWebService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyService money;private final MoneyProductService product;private final ObjectMapper json;
 public MoneyWebService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyProductService product,ObjectMapper json){this.db=db;this.users=users;this.money=money;this.product=product;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 private static void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("기록이 변경되었습니다. 다시 불러온 뒤 저장하세요.");}
 private static Object[] range(String from,String to){LocalDate a=LocalDate.parse(from),b=LocalDate.parse(to);require(!a.isAfter(b),"Start must precede end");return new Object[]{Timestamp.from(a.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()),Timestamp.from(b.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant())};}
 private List<Map<String,Object>> rows(String sql,Object... args){var rows=db.queryForList(sql,args);for(var row:rows)row.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);return rows;}
 private static String saving(String alias){return alias+".role in ('SAVINGS_GATEWAY','SAVINGS','PURPOSE_SAVINGS','PURPOSE_INSTALLMENT')";}

 public MoneyAccount inclusion(UUID id,AccountInclusion input){lock();var a=money.account(id);require(input!=null&&input.includeInAssets()!=null&&input.includeInStatistics()!=null,"Inclusion flags required");version(a.version(),input.expectedVersion());db.update("update money_accounts set include_in_assets=?,include_in_statistics=?,version=version+1,updated_at=now() where user_id=? and id=?",input.includeInAssets(),input.includeInStatistics(),owner(),id);return money.account(id);}

 private static final String BOOK_BASE="""
  with effective as (
   select t.id,t.type,t.version as "transactionVersion",coalesce(b.version,0) as version,
    coalesce(b.overrides,'{}'::jsonb)::text as overrides,
    jsonb_build_object('title',coalesce(t.title,coalesce(f.display_name,t.counterparty_text,'외부')||' → '||coalesce(d.display_name,t.counterparty_text,'외부')),
      'memo',t.memo,'categoryId',t.category_id,'amount',t.amount,'accountId',coalesce(t.from_account_id,t.to_account_id),
      'counterpartyText',t.counterparty_text,'occurredAt',t.occurred_at,'excluded',false)::text as source,
    case when jsonb_exists(b.overrides,'title') then b.overrides->>'title' else coalesce(t.title,coalesce(f.display_name,t.counterparty_text,'외부')||' → '||coalesce(d.display_name,t.counterparty_text,'외부')) end as title,
    case when jsonb_exists(b.overrides,'memo') then b.overrides->>'memo' else t.memo end as memo,
    case when jsonb_exists(b.overrides,'categoryId') then (b.overrides->>'categoryId')::uuid else t.category_id end as "categoryId",
    case when jsonb_exists(b.overrides,'amount') then (b.overrides->>'amount')::numeric else t.amount end as amount,
    case when jsonb_exists(b.overrides,'accountId') then (b.overrides->>'accountId')::uuid else coalesce(t.from_account_id,t.to_account_id) end as "accountId",
    case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end as "counterpartyText",
    case when jsonb_exists(b.overrides,'occurredAt') then (b.overrides->>'occurredAt')::timestamptz else t.occurred_at end as "occurredAt",
    coalesce((b.overrides->>'excluded')::boolean,false) as excluded,t.refund_of as "refundOf"
   from money_transactions t
   left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id and b.slot=0
   left join money_accounts f on f.user_id=t.user_id and f.id=t.from_account_id
   left join money_accounts d on d.user_id=t.user_id and d.id=t.to_account_id
   where t.user_id=? and t.excluded=false and t.merged_into is null and t.type<>'TRANSFER'
    and coalesce(f.include_in_statistics,true) and coalesce(d.include_in_statistics,true)
  )
  """;
 @SuppressWarnings("unchecked") private Map<String,Object> decodeBook(Map<String,Object> row){row.put("overrides",json.readValue((String)row.get("overrides"),Map.class));row.put("source",json.readValue((String)row.get("source"),Map.class));return row;}
 @Transactional(readOnly=true) public Map<String,Object> bookkeeping(String from,String to,String kind,String search,int limit,int offset,boolean includeExcluded){
  page(limit,offset);require(Set.of("EXPENSE","INCOME").contains(kind),"Bookkeeping view must be EXPENSE or INCOME");var dates=range(from,to);text(search,200,false,"Search");
  String filter=" from effective where \"occurredAt\">=? and \"occurredAt\"<? and "+(kind.equals("INCOME")?"type='INCOME'":"type in ('EXPENSE','REFUND')")+(includeExcluded?"":" and not excluded")+" and position(lower(?) in lower(coalesce(title,'')||' '||coalesce(memo,'')||' '||coalesce(\"counterpartyText\",'')))>0";
  Object[] args={owner(),dates[0],dates[1],search==null?"":search};
  var summary=rows(BOOK_BASE+"select count(*) count,coalesce(sum(case when type='REFUND' then -amount else amount end),0) total"+filter,args).getFirst();
  var listArgs=new ArrayList<>(Arrays.asList(args));listArgs.add(limit);listArgs.add(offset);
  var items=rows(BOOK_BASE+"select *"+filter+" order by \"occurredAt\" desc,id limit ? offset ?",listArgs.toArray()).stream().map(this::decodeBook).toList();
  var composition=rows(BOOK_BASE+"select \"categoryId\",\"counterpartyText\",coalesce(sum(case when type='REFUND' then -amount else amount end),0) amount,count(*) count"+filter+" group by \"categoryId\",\"counterpartyText\" order by amount desc",args);
  var trend=rows(BOOK_BASE+"select to_char(\"occurredAt\" at time zone 'Asia/Seoul','YYYY-MM-DD') as \"day\",sum(case when type='REFUND' then -amount else amount end) amount"+filter+" group by \"day\" order by \"day\"",args);
  return Map.of("items",items,"total",summary.get("count"),"summary",summary,"composition",composition,"trend",trend);
 }
 @Transactional(readOnly=true) public Map<String,Object> bookkeepingRow(UUID id){var result=rows(BOOK_BASE+"select * from effective where id=?",owner(),id);if(result.isEmpty())throw new ResourceNotFoundException("Bookkeeping row not found");return decodeBook(result.getFirst());}
 public Map<String,Object> saveBookkeeping(UUID id,BookkeepingEdit input){lock();require(input!=null&&input.overrides()!=null,"Overrides required");var source=money.transaction(id);var old=bookkeepingRow(id);version(source.version(),input.expectedTransactionVersion());version(((Number)old.get("version")).longValue(),input.expectedVersion());
  var o=input.overrides();require(o.keySet().stream().allMatch(Set.of("title","memo","categoryId","amount","accountId","counterpartyText","occurredAt","excluded")::contains),"Unknown bookkeeping field");
  for(String key:List.of("title","memo","counterpartyText"))if(o.containsKey(key)){require(o.get(key)==null||o.get(key) instanceof String,"Text field required");text((String)o.get(key),key.equals("title")?240:key.equals("memo")?2000:500,key.equals("title"),key);}
  if(o.containsKey("amount")){require(o.get("amount") instanceof Number,"Amount required");amount(new BigDecimal(o.get("amount").toString()));}
  if(o.containsKey("accountId")){var a=money.account(uuid(o.get("accountId")));require(!a.archived(),"Account archived");}
  if(o.containsKey("categoryId")&&o.get("categoryId")!=null){var category=uuid(o.get("categoryId"));require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_categories where user_id=? and id=? and not archived)",Boolean.class,owner(),category)),"Owned active category required");}
  if(o.containsKey("occurredAt")){require(o.get("occurredAt") instanceof String,"Time required");Instant.parse((String)o.get("occurredAt"));}
  if(o.containsKey("excluded"))require(o.get("excluded") instanceof Boolean,"Excluded must be boolean");
  db.update("insert into money_bookkeeping_overrides(id,user_id,transaction_id,overrides,version) values(?,?,?,cast(? as jsonb),1) on conflict(user_id,transaction_id,slot) do update set overrides=excluded.overrides,version=money_bookkeeping_overrides.version+1,updated_at=now()",UUID.randomUUID(),owner(),id,json.writeValueAsString(o));return bookkeepingRow(id);
 }
 private static UUID uuid(Object value){try{return UUID.fromString(Objects.toString(value,""));}catch(IllegalArgumentException e){throw new InvalidRequestException("Valid identifier required");}}

 private Loan loanRow(ResultSet r,int n)throws SQLException{return new Loan(r.getObject("id",UUID.class),r.getString("name"),r.getString("lender"),r.getString("type"),r.getBigDecimal("original_principal"),r.getBigDecimal("remaining_principal"),r.getBigDecimal("interest_rate"),r.getBigDecimal("monthly_payment"),(Integer)r.getObject("payment_day"),r.getObject("next_due_date",LocalDate.class),r.getObject("payment_account_id",UUID.class),r.getObject("start_date",LocalDate.class),r.getObject("maturity_date",LocalDate.class),r.getString("status"),r.getString("memo"),r.getLong("version"),r.getTimestamp("updated_at").toInstant());}
 @Transactional(readOnly=true) public List<Loan> loans(){return db.query("select * from money_loans where user_id=? and not deleted order by status,name,id",this::loanRow,owner());}
 @Transactional(readOnly=true) public Loan loan(UUID id){var result=db.query("select * from money_loans where user_id=? and id=? and not deleted",this::loanRow,owner(),id);if(result.isEmpty())throw new ResourceNotFoundException("Loan not found");return result.getFirst();}
 private static void nonnegative(BigDecimal value,boolean required){require(!required||value!=null,"Principal required");if(value!=null)require(value.signum()>=0&&value.stripTrailingZeros().scale()<=2&&value.compareTo(new BigDecimal("100000000000000000"))<0,"Invalid principal/payment");}
 public Loan saveLoan(UUID id,LoanInput v){lock();require(v!=null,"Loan required");if(id!=null)version(loan(id).version(),v.expectedVersion());text(v.name(),120,true,"Name");text(v.lender(),120,true,"Lender");text(v.type(),80,true,"Type");text(v.memo(),2000,false,"Memo");nonnegative(v.remainingPrincipal(),true);nonnegative(v.originalPrincipal(),false);nonnegative(v.monthlyPayment(),false);
  require(v.status()!=null&&Set.of("ACTIVE","COMPLETED").contains(v.status()),"Loan status required");require(!"COMPLETED".equals(v.status())||v.remainingPrincipal().signum()==0,"Completed loan requires zero remaining principal");
  require(v.interestRate()==null||(v.interestRate().signum()>=0&&v.interestRate().compareTo(BigDecimal.valueOf(100))<=0&&v.interestRate().stripTrailingZeros().scale()<=4),"Invalid interest rate");
  require(v.paymentDay()==null||(v.paymentDay()>=1&&v.paymentDay()<=31),"Payment day must be 1..31");require(v.startDate()==null||v.maturityDate()==null||!v.maturityDate().isBefore(v.startDate()),"Maturity precedes start");if(v.paymentAccountId()!=null)require(!money.account(v.paymentAccountId()).archived(),"Payment account archived");
  if(id==null){id=UUID.randomUUID();db.update("insert into money_loans(id,user_id,name,lender,type,remaining_principal) values(?,?,?,?,?,?)",id,owner(),v.name(),v.lender(),v.type(),v.remainingPrincipal());}
  db.update("update money_loans set name=?,lender=?,type=?,original_principal=?,remaining_principal=?,interest_rate=?,monthly_payment=?,payment_day=?,next_due_date=?,payment_account_id=?,start_date=?,maturity_date=?,status=?,memo=?,version=version+1,updated_at=now() where user_id=? and id=?",v.name(),v.lender(),v.type(),v.originalPrincipal(),v.remainingPrincipal(),v.interestRate(),v.monthlyPayment(),v.paymentDay(),v.nextDueDate(),v.paymentAccountId(),v.startDate(),v.maturityDate(),v.status(),v.memo(),owner(),id);return loan(id);
 }
 public void deleteLoan(UUID id,Long expected){lock();version(loan(id).version(),expected);db.update("update money_loans set deleted=true,version=version+1,updated_at=now() where user_id=? and id=?",owner(),id);}

 @Transactional(readOnly=true) public Map<String,Object> overview(String from,String to){
  var dates=range(from,to);String savingFrom="coalesce("+saving("f")+",false)",savingTo="coalesce("+saving("d")+",false)";
  String base="""
    with facts as (select t.*,f.display_name from_name,d.display_name to_name,f.role from_role,d.role to_role,
     case when t.type='INCOME' then t.amount else 0 end income,
     case when t.type='EXPENSE' then t.amount when t.type='REFUND' then -t.amount else 0 end consumption,
    """+"case when t.type='TRANSFER' and "+savingFrom+"<>"+savingTo+" then case when "+savingTo+" then t.amount else -t.amount end else 0 end savings "+"""
     from money_transactions t left join money_accounts f on f.id=t.from_account_id and f.user_id=t.user_id
     left join money_accounts d on d.id=t.to_account_id and d.user_id=t.user_id
     where t.user_id=? and t.excluded=false and t.merged_into is null and t.occurred_at>=? and t.occurred_at<?
      and coalesce(f.include_in_statistics,true) and coalesce(d.include_in_statistics,true))
    """;
  Object[] args={owner(),dates[0],dates[1]};var kpis=rows(base+"select coalesce(sum(income),0) income,coalesce(sum(consumption),0) consumption,coalesce(sum(savings),0) savings from facts",args).getFirst();
  Instant now=Instant.now(),end=((Timestamp)dates[1]).toInstant().minusNanos(1);boolean historical=end.isBefore(now);
  var assets=product.accountBalances(historical?end:now);
  boolean known=assets.stream().filter(a->((MoneyAccount)a.get("account")).includeInAssets()).allMatch(a->((MoneyProductService.Balance)a.get("balance")).asOf()!=null);
  String balanceBasis=historical&&known?"PERIOD_END_CALCULATED":"LATEST_AVAILABLE";
  if(historical&&!known)assets=product.accountBalances(now);
  BigDecimal assetTotal=BigDecimal.ZERO;for(var a:assets)if(((MoneyAccount)a.get("account")).includeInAssets())assetTotal=assetTotal.add(((MoneyProductService.Balance)a.get("balance")).amount());
  var loanSummary=rows("select coalesce(sum(remaining_principal),0) amount,max(updated_at) as \"asOf\" from money_loans where user_id=? and status='ACTIVE' and not deleted",owner()).getFirst();
  BigDecimal debt=(BigDecimal)loanSummary.get("amount");
  kpis.put("assets",assetTotal);kpis.put("loans",debt);kpis.put("netWorth",assetTotal.subtract(debt));
  String unit=ChronoUnit.DAYS.between(LocalDate.parse(from),LocalDate.parse(to))>90?"month":"day";
  var trend=rows(base+"select to_char(date_trunc('"+unit+"',occurred_at at time zone 'Asia/Seoul'),'YYYY-MM-DD') as \"day\",sum(income) income,sum(consumption) consumption,sum(savings) savings from facts group by \"day\" order by \"day\"",args);
  var composition=rows(base+"select type,category_id as \"categoryId\",counterparty_text as \"counterpartyText\",to_account_id as \"toAccountId\",sum(income) income,sum(consumption) consumption,sum(savings) savings from facts group by type,category_id,counterparty_text,to_account_id",args);
  // One row per unordered owned-account pair, preserving reverse gross volume as reference.
  var flow=rows(base+"""
    select type,
     case when type='TRANSFER' then least(from_account_id,to_account_id) else from_account_id end as "fromAccountId",
     case when type='TRANSFER' then greatest(from_account_id,to_account_id) else to_account_id end as "toAccountId",
     case when type='TRANSFER' then null else counterparty_text end as "counterpartyText",
     sum(case when type='TRANSFER' and from_account_id>to_account_id then -amount else amount end) net,
     sum(amount) gross,count(*) count from facts group by 1,2,3,4 order by gross desc
    """,args);
  Map<UUID,MoneyAccount> accounts=new HashMap<>();assets.forEach(a->{var acct=(MoneyAccount)a.get("account");accounts.put(acct.id(),acct);});
  for(var f:flow){if(((BigDecimal)f.get("net")).signum()<0){Object id=f.get("fromAccountId");f.put("fromAccountId",f.get("toAccountId"));f.put("toAccountId",id);f.put("net",((BigDecimal)f.get("net")).abs());}f.put("meaning",meaning((String)f.get("type"),accounts.get(f.get("fromAccountId")),accounts.get(f.get("toAccountId"))));}
  var result=new LinkedHashMap<String,Object>();result.put("from",from);result.put("to",to);result.put("kpis",kpis);result.put("balances",assets);result.put("balanceBasis",balanceBasis);result.put("balanceAsOf",balanceBasis.equals("PERIOD_END_CALCULATED")?end:now);result.put("loanBasis","CURRENT_MANUAL_PRINCIPAL");result.put("loanAsOf",loanSummary.get("asOf"));result.put("unverifiedBalances",assets.stream().filter(a->((MoneyAccount)a.get("account")).includeInAssets()&&((MoneyProductService.Balance)a.get("balance")).asOf()==null).count());result.put("flow",flow);result.put("composition",composition);result.put("trend",trend);return result;
 }
 static boolean savingRole(AccountRole r){return r==AccountRole.SAVINGS_GATEWAY||MoneyProductService.savings(r);}
 static String meaning(String type,MoneyAccount from,MoneyAccount to){return switch(type){case "INCOME"->"수입";case "EXPENSE"->"소비";case "REFUND"->"환불";default->{
  if(from==null||to==null)yield "계좌 재배분";
  if(!savingRole(from.role())&&savingRole(to.role()))yield "저축";
  if(savingRole(from.role())&&!savingRole(to.role()))yield "저축 회수";
  if(to.role()==AccountRole.PURPOSE_SAVINGS||to.role()==AccountRole.PURPOSE_INSTALLMENT)yield "목적별 저축 적립";
  if(to.role()==AccountRole.FIXED_SPENDING)yield "고정지출 자금 배분";
  if(to.role()==AccountRole.SPENDING)yield "생활비 자금 배분";
  yield "계좌 재배분";}};}
 public void deferReview(UUID id,Long expected){lock();var raw=money.notification(id);version(raw.processingVersion(),expected);require(raw.state()!=ProcessingState.PROCESSED,"Source resolved");db.update("update money_raw_notifications set review_deferred=true,processing_version=processing_version+1 where user_id=? and id=?",owner(),id);}
}
