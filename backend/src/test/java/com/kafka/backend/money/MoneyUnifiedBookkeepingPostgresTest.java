package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyUnifiedBookkeepingService.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyUnifiedBookkeepingPostgresTest {
 static final Instant AT=Instant.parse("2026-09-26T01:00:00Z");
 record Env(JdbcTemplate db,MoneyService money,MoneyProductService product,MoneyWebService web,MoneyFinancialService financial,MoneyUnifiedBookkeepingService unified){}
 void check(java.util.function.Consumer<Env> test){var ds=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);new TransactionTemplate(manager).execute(status->{status.setRollbackOnly();var db=new JdbcTemplate(ds);var owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var mapper=JsonMapper.builder().build();var m=new MoneyService(db,()->owner,mapper);var p=new MoneyProductService(db,()->owner,m,mapper);var w=new MoneyWebService(db,()->owner,m,p,mapper);var f=new MoneyFinancialService(db,()->owner,m,p,w,mapper);var u=new MoneyUnifiedBookkeepingService(db,()->owner,mapper,m,p,w,f,new MoneyCommandService(db,mapper,manager));test.accept(new Env(db,m,p,w,f,u));return null;});}
 MoneyAccount account(Env e,AccountRole role){return e.money.createAccount(new AccountInput("IBK","합성 "+role,role,null,null));}
 MoneyTransaction tx(Env e,UUID account,boolean out,int amount,boolean pending){var t=e.product.save(null,new MoneyProductService.Entry(out?TransactionType.EXPENSE:TransactionType.INCOME,out?account:null,out?null:account,BigDecimal.valueOf(amount),AT,"합성거래",null,"합성 메모",false,null,null,"합성 제목"));if(pending)e.db.update("update money_transactions set meaning_state='UNRESOLVED' where id=?",t.id());return e.money.transaction(t.id());}
 Edit edit(MoneyTransaction t,String action,String type){return new Edit(UUID.randomUUID(),t.version(),action,type,null,null,null,null,null,null,null,null,null,null,null,"합성 확인",null);}
 Edit pair(MoneyTransaction a,MoneyTransaction b){return new Edit(UUID.randomUUID(),a.version(),"LINK_TRANSFER",null,b.id(),b.version(),null,null,null,null,null,null,null,null,null,"소유자가 실제 양쪽 이체 확인",null);}
 String status(Map<String,Object> o){return o.get("status").toString();}
 Map<?,?> result(Map<String,Object> o){return (Map<?,?>)o.get("result");}
 @Test void fourDashboardAxesPreserveLegacyReadersAndDrillDownToCanonicalCash(){
  check(e->{
   String from="2026-09-26",to=from;
   // The shared synthetic Web fixture predates the optional correction table.
   if(!Boolean.TRUE.equals(e.db.queryForObject("select to_regclass('money_account_subtype_corrections') is not null",Boolean.class))){
    try{
     e.db.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/V112__money_installment_subtype_correction.sql")));
    }catch(java.io.IOException ex){throw new java.io.UncheckedIOException(ex);}
   }
   var pay=account(e,AccountRole.SPENDING);
   var other=account(e,AccountRole.SPENDING);
   var installment=account(e,AccountRole.PURPOSE_INSTALLMENT);
   var liquid=account(e,AccountRole.SAVINGS);
   var owner=e.db.queryForObject("select user_id from money_accounts where id=?",UUID.class,pay.id());
   new MoneyMeaningService(e.db,()->owner,JsonMapper.builder().build()).saveTracking(new MoneyMeaningService.TrackingInput(List.of(pay.id()),List.of(pay.id()),0L));
   var legacy=e.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,pay.id(),null,new BigDecimal("100000"),AT,null,null,null,false,null,null,"신한 대출상환"));
   tx(e,pay.id(),false,220000,false);
   e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,pay.id(),installment.id(),new BigDecimal("50000"),AT,null,null,null,false,null,null));
   e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,pay.id(),liquid.id(),new BigDecimal("90000"),AT,null,null,null,false,null,null));
   var loans=e.unified.loanRepayments(from,to,null);
   assertThat(loans.loanRepayment()).isEqualTo("0");
   assertThat(loans.loanRepaymentBreakdown().byLoan()).isEmpty();

   var a=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 A","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,pay.id(),null,null,"ACTIVE",null,0L));
   var b=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 B","은행","PERSONAL",new BigDecimal("500000"),new BigDecimal("500000"),null,null,null,null,other.id(),null,null,"ACTIVE",null,0L));
   var split=addRepayment(e,pay.id(),a.id(),80000,19000,1000,AT);
   var interest=addRepayment(e,other.id(),b.id(),0,21827,0,AT);
   var principal=addRepayment(e,other.id(),b.id(),1000,0,0,Instant.parse("2026-09-25T15:00:00Z"));
   var excluded=addRepayment(e,other.id(),b.id(),0,90,0,AT);
   e.db.update("update money_transactions set excluded=true where id=?",excluded);
   addRepayment(e,other.id(),b.id(),0,500,0,Instant.parse("2026-09-26T15:00:00Z"));
   var pending=UUID.randomUUID();
   e.db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at,loan_id,title) values(?,?,'LOAN_PAYMENT',?,40000,?,?,'Pending split fixture')",
      pending,owner,pay.id(),java.sql.Timestamp.from(AT),a.id());
   for(int i=0;i<2;i++){
    var raw=UUID.randomUUID();
    e.db.update("insert into money_raw_notifications(id,user_id,posted_at,raw_payload,dedupe_key,content_hash) values(?,?,?,'{}',?,?)",
        raw,owner,java.sql.Timestamp.from(AT),raw.toString(),raw.toString());
    e.db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,relationship) values(?,?,?,?)",
        interest,owner,raw,i==0?"PRIMARY":"AUXILIARY");
   }
   var before=e.db.queryForList("select * from money_transactions order by id");
   var balance=e.product.balance(pay.id());
   var remaining=e.web.loan(a.id()).remainingPrincipal();
   assertThat(remaining).isEqualByComparingTo("920000");

   var scope=e.unified.loanRepayments(from,to,null);
   assertThat(scope.loanRepayment()).isEqualTo("162827");
   assertThat(scope.unallocatedCount()).isEqualTo(1);
   assertThat(scope.unallocatedAmount()).isEqualTo("40000");
   assertThat(scope.loanRepaymentBreakdown().byPart()).isEqualTo(new RepaymentSplit("81000","40827","1000","40000"));
   assertThat(scope.loanRepaymentBreakdown().byLoan()).containsExactly(new RepaymentGroup(a.id(),"합성 A","140000"),new RepaymentGroup(b.id(),"합성 B","22827"));
   assertThat(e.unified.loanRepayments(from,to,pay.id().toString()).loanRepayment()).isEqualTo("140000");
   assertThat(e.unified.loanRepayments(from,to,"").loanRepayment()).isEqualTo("0");

   assertThat(projectedTotal(e.web.bookkeeping(from,to,"EXPENSE",null,1,0,false))).isEqualByComparingTo("100000");
   var expense=e.web.bookkeeping(from,to,"EXPENSE",null,1,0,false,pay.id().toString(),"uncategorized",null,null,"ALL",null,null,true);
   assertThat(projectedTotal(expense)).isEqualByComparingTo("100000");
   assertThat(projectedTotal(e.web.bookkeeping(from,to,"INCOME",null,1,0,false))).isEqualByComparingTo("220000");
   assertThat(new MoneyInstallmentReadService(e.db,()->owner).read(from,to,null,null,1,0,null).totals().amount()).isEqualByComparingTo("50000");

   var tracked=e.unified.loanRepayments(from,to,null,true);
   assertThat(tracked.loanRepayment()).isEqualTo("140000");
   assertThat(tracked.unallocatedAmount()).isEqualTo("40000");
   assertThat(tracked.unallocatedCount()).isEqualTo(1);
   assertThat(tracked.loanRepaymentBreakdown().byPart()).isEqualTo(new RepaymentSplit("80000","19000","1000","40000"));
   assertThat(tracked.loanRepaymentBreakdown().byLoan()).containsExactly(new RepaymentGroup(a.id(),"합성 A","140000"));
   for(var part:List.of(RepaymentPart.PRINCIPAL,RepaymentPart.INTEREST,RepaymentPart.FEE)){
    var detail=e.unified.ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,null,part,true);
    assertThat(detail.get("total")).isEqualTo(1L);
    assertThat(firstRow(detail)).containsEntry("id",split);
   }
   var pendingDetail=e.unified.ledger(from,to,false,"Pending split",null,50,0,null,"LOAN_PAYMENT",null,null,null,RepaymentPart.UNALLOCATED,true);
   assertThat(pendingDetail.get("total")).isEqualTo(1L);
   assertThat(firstRow(pendingDetail)).containsEntry("id",pending).containsEntry("principal",null);
   var loanGroup=e.unified.ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,a.id().toString(),null,true);
   assertThat(items(loanGroup)).extracting(row->row.get("id")).containsExactlyInAnyOrder(split,pending);
   for(var denied:List.of("", "none",other.id().toString())){
    assertThat(e.unified.loanRepayments(from,to,denied,true).loanRepayment()).isEqualTo("0");
    assertThat(e.unified.ledger(from,to,false,null,denied,50,0,null,"LOAN_PAYMENT",null,null,a.id().toString(),null,true).get("total")).isEqualTo(0L);
   }
   var overview=e.web.overview(from,to);
   assertThat((BigDecimal)((Map<?,?>)overview.get("kpis")).get("consumption")).isEqualByComparingTo("100000");
   assertThat(items(overview,"composition")).extracting(row->row.get("type")).doesNotContain("LOAN_PAYMENT");
   for(String key:List.of("composition","trend")){
    var sum=items(overview,key).stream().map(row->(BigDecimal)row.get("consumption")).reduce(BigDecimal.ZERO,BigDecimal::add);
    assertThat(sum).as(key).isEqualByComparingTo("100000");
   }
   assertThat(items(overview,"relationships")).filteredOn(row->"CONSUMPTION".equals(row.get("relation"))).singleElement()
       .satisfies(row->{assertThat(row.get("count")).isEqualTo(1L);assertThat((BigDecimal)row.get("net")).isEqualByComparingTo("100000");});
   assertThat(items(e.web.flowDetail(from,to,"CONSUMPTION",50,0))).extracting(row->row.get("id")).containsExactly(legacy.id());

   var fee=e.unified.ledger(from,to,false,null,pay.id().toString(),50,0,null,"LOAN_PAYMENT",null,null,null,RepaymentPart.FEE);
   assertThat(fee.get("total")).isEqualTo(1L);
   var feeRow=firstRow(fee);
   assertThat(feeRow).containsEntry("id",split).containsEntry("type","LOAN_PAYMENT").doesNotContainKeys("sources","user_id");
   var group=e.unified.ledger(from,to,false,null,other.id().toString(),1,0,null,"LOAN_PAYMENT",null,null,b.id().toString(),null);
   assertThat(group.get("total")).isEqualTo(2L);
   assertThat(firstRow(group)).containsEntry("id",interest).containsEntry("sourceCount",2L);
   assertThat(firstRow(e.unified.ledger(from,to,false,null,other.id().toString(),1,1,null,"LOAN_PAYMENT",null,null,b.id().toString(),null))).containsEntry("id",principal);
   assertThat(e.unified.ledger(from,to,false,null,pay.id().toString(),1,0,null,"LOAN_PAYMENT",null,null,b.id().toString(),RepaymentPart.INTEREST).get("total")).isEqualTo(0L);
   assertThat(e.unified.ledger(from,to,false,null,null,1,0,null,"LOAN_PAYMENT",null,null,"unlinked",null).get("total")).isEqualTo(0L);
   var alternate=new MoneyUnifiedBookkeepingService(e.db,UUID::randomUUID,JsonMapper.builder().build(),e.money,e.product,e.web,e.financial,null);
   assertThat(alternate.loanRepayments(from,to,other.id().toString()).loanRepayment()).isEqualTo("0");
   assertThat(e.money.transaction(legacy.id()).type()).isEqualTo(TransactionType.EXPENSE);
   assertThat(e.web.loan(a.id()).remainingPrincipal()).isEqualTo(remaining);
   assertThat(e.product.balance(pay.id())).isEqualTo(balance);
   assertThat(e.db.queryForList("select * from money_transactions order by id")).isEqualTo(before);
  });
 }

 private List<Map<String,Object>> items(Map<String,Object> response){return items(response,"items");}
 @SuppressWarnings("unchecked")
 private List<Map<String,Object>> items(Map<String,Object> response,String key){return (List<Map<String,Object>>)response.get(key);}

 private Map<String,Object> monthly(Env e,String kind,String accounts){
  return e.web.bookkeeping("2026-09-01","2026-09-30",kind,null,50,0,false,accounts,null,null,null,"ALL",null,null,true,true);
 }

 @Test void selectedAccountsOverrideGlobalReportingFlagOnlyInMonthlyBookkeeping(){check(e->{
  var owner=MoneyPostgresIntegrationTest.OWNER;
  var tracking=new MoneyMeaningService(e.db,()->owner,JsonMapper.builder().build());
  var a=account(e,AccountRole.SPENDING);var b=account(e,AccountRole.SPENDING);
  var expense=tx(e,a.id(),true,35000,false);
  e.product.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,a.id(),new BigDecimal("5000"),AT.plusSeconds(10),null,null,null,false,expense.id(),null));
  tx(e,b.id(),true,7000,false);tx(e,a.id(),false,11000,false);tx(e,b.id(),false,23000,false);
  var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  addRepayment(e,a.id(),loan.id(),80000,19000,1000,AT);
  addRepayment(e,b.id(),loan.id(),1000,0,0,AT);
  e.db.update("update money_accounts set include_in_statistics=false where id=?",a.id());
  var selected=tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(b.id()),0L));
  var spending=monthly(e,"EXPENSE",null);
  assertThat(spending.get("total")).isEqualTo(2L);
  assertThat(projectedTotal(spending)).isEqualByComparingTo("30000");
  assertThat(items(spending,"composition").stream().map(row->(BigDecimal)row.get("amount")).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo("30000");
  assertThat(projectedTotal(monthly(e,"INCOME",null))).isEqualByComparingTo("23000");
  assertThat(projectedTotal(monthly(e,"EXPENSE",b.id().toString()))).isZero();
  assertThat(projectedTotal(monthly(e,"INCOME",a.id().toString()))).isZero();
  String from="2026-09-01",to="2026-09-30";
  assertThat(e.unified.loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("100000");
  assertThat((BigDecimal)((Map<?,?>)e.web.overview(from,to).get("kpis")).get("consumption")).isEqualByComparingTo("7000");
  var changed=tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(b.id()),List.of(a.id()),((Number)selected.get("version")).longValue()));
  assertThat(projectedTotal(monthly(e,"EXPENSE",null))).isEqualByComparingTo("7000");
  assertThat(projectedTotal(monthly(e,"INCOME",null))).isEqualByComparingTo("11000");
  assertThat(e.unified.loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("1000");
  assertThat(firstRow(e.unified.ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,null,RepaymentPart.PRINCIPAL,true))).containsEntry("from_account_id",b.id());
  tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(),List.of(),((Number)changed.get("version")).longValue()));
  assertThat(monthly(e,"EXPENSE",null).get("total")).isEqualTo(0L);
  assertThat(monthly(e,"INCOME",null).get("total")).isEqualTo(0L);
  assertThat(e.unified.loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("0");
  assertThat(e.unified.ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,null,RepaymentPart.PRINCIPAL,true).get("total")).isEqualTo(0L);
 });}

 @Test
 @EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
 void legacyUnlinkedGroupKeepsAllocatedAndUnallocatedRowsAndExcludesOtherCurrencies(){check(e->{
  var a=account(e,AccountRole.SPENDING);
  new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build()).saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));
  // Model historical rows that cannot be inserted through the current loan-link constraint.
  e.db.execute("create temporary table money_transactions on commit drop as select * from money_transactions with no data");
  var pending=UUID.randomUUID();var allocated=UUID.randomUUID();var foreign=UUID.randomUUID();
  for(var id:List.of(pending,allocated,foreign)){
   boolean split=id.equals(allocated);
   e.db.update("""
     insert into pg_temp.money_transactions(id,user_id,type,from_account_id,amount,occurred_at,currency,meaning_state,excluded,principal,interest,fee)
     values(?,?,'LOAN_PAYMENT',?,?,?,?,'CONFIRMED',false,?,?,?)
     """,id,MoneyPostgresIntegrationTest.OWNER,a.id(),split?100000:40000,java.sql.Timestamp.from(AT),id.equals(foreign)?"USD":"KRW",
       split?80000:null,split?19000:null,split?1000:null);
  }
  String from="2026-09-26",to=from;
  var summary=e.unified.loanRepayments(from,to,null,true);
  assertThat(summary.loanRepayment()).isEqualTo("140000");
  assertThat(summary.unallocatedAmount()).isEqualTo("40000");
  assertThat(summary.loanRepaymentBreakdown().byLoan()).containsExactly(new RepaymentGroup(null,"미연결 대출상환","140000"));
  var detail=e.unified.ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,"unlinked",null,true);
  assertThat(items(detail)).extracting(row->row.get("id")).containsExactlyInAnyOrder(pending,allocated);
 });}

 private UUID addRepayment(Env e,UUID account,UUID loanId,int principal,int interest,int fee,Instant at){
  var amount=BigDecimal.valueOf(principal+interest+fee);
  var transaction=e.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account,null,amount,at,null,null,null,false,null,null));
  var edit=new Edit(UUID.randomUUID(),transaction.version(),"TYPE","LOAN_PAYMENT",null,null,loanId,e.web.loan(loanId).version(),
      BigDecimal.valueOf(principal),BigDecimal.valueOf(interest),BigDecimal.valueOf(fee),null,null,null,null,null,null);
  assertThat(status(e.unified.edit(transaction.id(),edit))).isEqualTo("APPLIED");
  return transaction.id();
 }

 private BigDecimal projectedTotal(Map<String,Object> page){return (BigDecimal)((Map<?,?>)page.get("summary")).get("total");}
 @SuppressWarnings("unchecked")
 private Map<String,Object> firstRow(Map<String,Object> page){return ((List<Map<String,Object>>)page.get("items")).getFirst();}
 @Test void Q02_Q03_Q11_Q12_pendingCashIsSingleBalanceAndExcludedUntilConfirmed(){check(e->{var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,500,true);new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build()).saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));assertThat(e.money.transaction(t.id()).meaningState()).isEqualTo("UNRESOLVED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-500");assertThat(e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);assertThat(e.unified.ledger("2026-09-01","2026-09-30",true,null,null,50,0).get("total")).isEqualTo(1L);assertThat(status(e.unified.edit(t.id(),edit(t,"TYPE","EXPENSE")))).isEqualTo("APPLIED");assertThat(e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(1L);assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-500");});}
 @Test void Q05_Q07_Q18_Q26_partialTransferLinkUnlinkUndoPreservesBothCashEffects(){check(e->{var a=account(e,AccountRole.SPENDING);var b=account(e,AccountRole.SAVINGS);var out=tx(e,a.id(),true,100,true);assertThat(status(e.unified.edit(out.id(),edit(out,"TYPE","TRANSFER")))).isEqualTo("APPLIED");assertThat(e.product.balance(b.id()).amount()).isZero();assertThat(e.product.accountDetail(a.id(),"2026-09").outflow()).isEqualByComparingTo("100");var in=tx(e,b.id(),false,100,true);assertThat(status(e.unified.edit(out.id(),pair(e.money.transaction(out.id()),in)))).isEqualTo("APPLIED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(e.product.balance(b.id()).amount()).isEqualByComparingTo("100");var unlink=e.unified.edit(out.id(),edit(e.money.transaction(out.id()),"UNLINK_TRANSFER",null));assertThat(status(unlink)).isEqualTo("APPLIED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(e.product.balance(b.id()).amount()).isEqualByComparingTo("100");var key=UUID.fromString(result(unlink).get("undoId").toString());var v=e.money.transaction(out.id());assertThat(status(e.unified.edit(out.id(),new Edit(UUID.randomUUID(),v.version(),"UNDO_UNLINK",null,null,null,null,null,null,null,null,null,null,null,null,null,key)))).isEqualTo("APPLIED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(e.product.balance(b.id()).amount()).isEqualByComparingTo("100");});}
 @Test void Q07_Q31_undoRejectsAnInterveningEdit(){check(e->{var a=account(e,AccountRole.SPENDING);var b=account(e,AccountRole.SAVINGS);var t=e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,a.id(),b.id(),BigDecimal.TEN,AT,null,null,null,false,null,null));var unlink=e.unified.edit(t.id(),edit(t,"UNLINK_TRANSFER",null));var first=e.money.transaction(t.id());e.unified.edit(first.id(),edit(first,"TYPE","EXPENSE"));var now=e.money.transaction(t.id());var result=e.unified.edit(now.id(),new Edit(UUID.randomUUID(),now.version(),"UNDO_UNLINK",null,null,null,null,null,null,null,null,null,null,null,null,null,UUID.fromString(result(unlink).get("undoId").toString())));assertThat(status(result)).isEqualTo("NOT_APPLIED");});}
 @Test void Q13_Q14_Q17_loanUnknownThenExactSplitHasOneWithdrawal(){check(e->{var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,500000,true);var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","합성 은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));var pending=new Edit(UUID.randomUUID(),0L,"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),null,null,null,null,null,null,null,null,null);assertThat(status(e.unified.edit(t.id(),pending))).isEqualTo("APPLIED");assertThat(e.financial.detail(t.id()).get("principal")).isNull();var split=new Edit(UUID.randomUUID(),1L,"TYPE","LOAN_PAYMENT",null,null,loan.id(),e.web.loan(loan.id()).version(),new BigDecimal("420000"),new BigDecimal("70000"),new BigDecimal("10000"),null,null,null,null,null,null);assertThat(status(e.unified.edit(t.id(),split))).isEqualTo("APPLIED");assertThat(e.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("580000");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-500000");var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("consumption")).isZero();});}
 @Test void Q14_invalidSplitRollsBackMeaningAndLoan(){check(e->{var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,100,true);var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성","은행","PERSONAL",BigDecimal.valueOf(500),BigDecimal.valueOf(500),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));var bad=new Edit(UUID.randomUUID(),0L,"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),BigDecimal.TEN,BigDecimal.ONE,BigDecimal.ZERO,null,null,null,null,null,null);assertThat(status(e.unified.edit(t.id(),bad))).isEqualTo("NOT_APPLIED");assertThat(e.money.transaction(t.id()).meaningState()).isEqualTo("UNRESOLVED");assertThat(e.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("500");});}
 @Test void partialAllocationIsRejectedWithoutChangingCashLoanOrMeaning(){check(e->{
  var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,500000,true);
  var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 부분 배분","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  var result=e.unified.edit(t.id(),new Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),new BigDecimal("420000"),null,null,null,null,null,null,null,null));
  assertThat(status(result)).isEqualTo("NOT_APPLIED");assertThat(e.money.transaction(t.id()).version()).isEqualTo(t.version());assertThat(e.money.transaction(t.id()).meaningState()).isEqualTo("UNRESOLVED");assertThat(e.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("1000000");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-500000");
  assertThat(e.db.queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(1);
 });}
 @Test void repaymentCorrectionAppliesOnlyNetPrincipalAndNeverRepeatsWithdrawal(){check(e->{
  var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,500000,true);
  var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 배분 정정","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  assertThat(status(e.unified.edit(t.id(),new Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),new BigDecimal("420000"),new BigDecimal("70000"),new BigDecimal("10000"),null,null,null,null,null,null)))).isEqualTo("APPLIED");
  var current=e.money.transaction(t.id());var correction=new Edit(UUID.randomUUID(),current.version(),"TYPE","LOAN_PAYMENT",null,null,loan.id(),e.web.loan(loan.id()).version(),new BigDecimal("430000"),new BigDecimal("60000"),new BigDecimal("10000"),null,null,null,null,null,null);
  assertThat(status(e.unified.edit(t.id(),correction))).isEqualTo("APPLIED");assertThat(status(e.unified.edit(t.id(),correction))).isEqualTo("APPLIED");
  assertThat(e.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("570000");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-500000");assertThat(e.db.queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(1);
  assertThat((BigDecimal)((Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis")).get("consumption")).isZero();
 });}
 @Test void repaymentRetainsCanonicalTypeAndCannotBeAssignedALifeCategory(){check(e->{
  var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,500000,true);var loan=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  assertThat(status(e.unified.edit(t.id(),new Edit(UUID.randomUUID(),0L,"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),new BigDecimal("420000"),new BigDecimal("70000"),new BigDecimal("10000"),null,null,null,null,null,null)))).isEqualTo("APPLIED");
  assertThatThrownBy(()->e.web.bookkeepingRow(t.id())).isInstanceOf(ResourceNotFoundException.class);
  assertThat(e.unified.row(t.id())).containsEntry("type","LOAN_PAYMENT").doesNotContainKey("book");
 });}
 @Test void unregisteredReviewIsNotALedgerRowAndRegisteredWarningCannotHideTheFact(){check(e->{
  var a=e.money.createAccount(new AccountInput("IBK","합성 검증 계좌",AccountRole.SPENDING,"975-******-01-014",null));
  var meaning=new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());meaning.saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));
  var raw=e.money.ingest(VerifiedMoneyFixtures.payload(VerifiedMoneyFixtures.side("IBK",Direction.OUT,5800,"16:54:36.875",null,"합성 거래처"))).notification();e.money.process(raw.id(),new IbkNotificationParserV1());e.money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"AMBIGUOUS_TRANSFER_PAIR");
  var original=e.money.notification(raw.id()).rawPayload();assertThat(e.unified.ledger("2026-09-01","2026-09-30",false,null,null,50,0).get("total")).isEqualTo(0L);assertThat(e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);assertThat(e.money.notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
  var admit=new Admit(UUID.randomUUID(),e.money.notification(raw.id()).processingVersion());var admitted=e.unified.admit(raw.id(),admit);assertThat(status(admitted)).isEqualTo("APPLIED");e.unified.admit(raw.id(),admit);UUID id=UUID.fromString(((Map<?,?>)result(admitted).get("row")).get("id").toString());
  assertThat(e.money.notification(raw.id()).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(e.unified.ledger("2026-09-01","2026-09-30",true,null,null,50,0).get("total")).isEqualTo(1L);assertThat(e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
  assertThat(status(e.unified.edit(id,edit(e.money.transaction(id),"TYPE","EXPENSE")))).isEqualTo("APPLIED");e.money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"ACTIONABLE_WARNING");
  assertThat(e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(1L);assertThat(e.web.bookkeepingRow(id).get("categoryId")).isNull();assertThat(e.money.notification(raw.id()).rawPayload()).isEqualTo(original);assertThat(e.db.queryForObject("select count(*) from money_transaction_sources where raw_event_id=?",Integer.class,raw.id())).isEqualTo(1);
 });}
 @Test void Q20_Q23_Q25_Q27_orphanRefundKeepsCashAndOverRefundNeverLinks(){check(e->{var a=account(e,AccountRole.SPENDING);var original=tx(e,a.id(),true,100,false);var incoming=tx(e,a.id(),false,120,true);var orphan=edit(incoming,"TYPE","REFUND");assertThat(status(e.unified.edit(incoming.id(),orphan))).isEqualTo("APPLIED");var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("income")).isZero();assertThat((BigDecimal)k.get("consumption")).isEqualByComparingTo("100");var link=new Edit(UUID.randomUUID(),1L,"TYPE","REFUND",null,null,null,null,null,null,null,original.id(),null,null,null,null,null);assertThat(status(e.unified.edit(incoming.id(),link))).isEqualTo("NOT_APPLIED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("20");assertThat(e.money.transaction(incoming.id()).refundOf()).isNull();});}
 @Test void Q31_Q34_replayAndStaleVersionCannotRepeatTheChange(){check(e->{var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,100,true);var command=edit(t,"TYPE","EXPENSE");assertThat(status(e.unified.edit(t.id(),command))).isEqualTo("APPLIED");assertThat(status(e.unified.edit(t.id(),command))).isEqualTo("APPLIED");assertThat(e.money.transaction(t.id()).version()).isEqualTo(1);assertThat(status(e.unified.edit(t.id(),edit(t,"TYPE","TRANSFER")))).isEqualTo("NOT_APPLIED");assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(e.unified.outcome(command.requestId()).get("status")).isEqualTo("APPLIED");});}
 @Test void Q33_mixedTwelvePreviewAndSevenSuccessesSurviveOneConflict(){check(e->{var a=account(e,AccountRole.SPENDING);var rows=new ArrayList<MoneyTransaction>();for(int i=0;i<8;i++)rows.add(tx(e,a.id(),true,100+i,true));for(int i=0;i<4;i++)rows.add(tx(e,a.id(),false,200+i,true));var bulk=new Bulk("EXPENSE",rows.stream().map(t->new BulkItem(t.id(),t.version(),UUID.randomUUID())).toList());var preview=(List<Map<String,Object>>)e.unified.bulk(bulk,false).get("items");assertThat(preview.stream().filter(i->Boolean.TRUE.equals(i.get("eligible"))).count()).isEqualTo(8);e.db.update("update money_transactions set version=version+1 where id=?",rows.getFirst().id());var done=(List<Map<String,Object>>)e.unified.bulk(bulk,true).get("items");assertThat(done.stream().filter(i->i.get("outcome") instanceof Map<?,?> o&&o.get("status").equals("APPLIED")).count()).isEqualTo(7);assertThat(e.db.queryForObject("select count(*) from money_transactions where type='EXPENSE' and meaning_state='CONFIRMED' and user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(7);var latest=e.money.transaction(rows.getFirst().id());var retried=(List<Map<String,Object>>)e.unified.bulk(new Bulk("EXPENSE",List.of(new BulkItem(latest.id(),latest.version(),UUID.randomUUID()))),true).get("items");assertThat(((Map<?,?>)retried.getFirst().get("outcome")).get("status")).isEqualTo("APPLIED");assertThat(e.db.queryForObject("select count(*) from money_transactions where type='EXPENSE' and meaning_state='CONFIRMED' and user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(8);});}
 @Test void Q22_Q28_Q32_manualAccountCorrectionPreservesObservedCheckpoint(){check(e->{var a=account(e,AccountRole.SPENDING);var b=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,100,false);e.product.checkpoint(a.id(),new MoneyProductService.Checkpoint(BigDecimal.valueOf(900),AT.plusSeconds(5),"합성 은행 관측",0L));var checkpoint=e.db.queryForMap("select * from money_balance_checkpoints where account_id=?",a.id());var correction=new Edit(UUID.randomUUID(),0L,"CORRECT",null,null,null,null,null,null,null,null,null,b.id(),null,AT.minusSeconds(86400),"잘못 지정된 수동 계좌 정정",null);assertThat(status(e.unified.edit(t.id(),correction))).isEqualTo("APPLIED");assertThat(e.db.queryForMap("select * from money_balance_checkpoints where account_id=?",a.id())).isEqualTo(checkpoint);assertThat(e.product.balance(b.id()).amount()).isEqualByComparingTo("-100");});}
 @Test void ownerIsolationNeverDisclosesRowOrOutcome(){check(e->{var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,100,true);var owner=UUID.randomUUID();var mapper=JsonMapper.builder().build();var u=new MoneyUnifiedBookkeepingService(e.db,()->owner,mapper,e.money,e.product,e.web,e.financial,new MoneyCommandService(e.db,mapper,new DataSourceTransactionManager(e.db.getDataSource())));assertThatThrownBy(()->u.row(t.id())).isInstanceOf(ResourceNotFoundException.class);assertThat(u.pending().get("count")).isEqualTo(0L);});}
 @Test void incomeConfirmationReevaluatesRulesCreatedAfterCashAdmission(){check(e->{
  var a=account(e,AccountRole.SAVINGS);var t=tx(e,a.id(),false,12000,true);
  var meaning=new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());
  var category=e.product.initializeCategories().stream().filter(c->c.kind().equals("INCOME")).findFirst().orElseThrow();
  meaning.saveRule(null,new MoneyMeaningService.RuleInput("합성 이자 규칙",List.of(new MoneyRuleEngine.Condition("type","EXACT","INCOME")),category.id(),null,null,"ACTIVE",null));
  assertThat(status(e.unified.edit(t.id(),edit(t,"TYPE","INCOME")))).isEqualTo("APPLIED");
  assertThat(e.web.bookkeepingRow(t.id()).get("categoryId")).isEqualTo(category.id());
  assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("12000");
  var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("income")).isEqualByComparingTo("12000");assertThat((BigDecimal)k.get("savings")).isZero();
 });}
 @Test void consumptionConfirmationAppliesEligibleRuleAndPreservesDirectCategory(){check(e->{
  var a=account(e,AccountRole.SPENDING);var t=tx(e,a.id(),true,3000,true);var plain=tx(e,a.id(),true,4000,true);
  assertThat(status(e.unified.edit(plain.id(),edit(plain,"TYPE","EXPENSE")))).isEqualTo("APPLIED");assertThat(e.web.bookkeepingRow(plain.id()).get("categoryId")).isNull();
  var categories=e.product.initializeCategories().stream().filter(c->c.kind().equals("EXPENSE")).toList();var meaning=new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());
  meaning.saveRule(null,new MoneyMeaningService.RuleInput("합성 소비 규칙",List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE")),categories.get(0).id(),null,null,"ACTIVE",null));
  assertThat(status(e.unified.edit(t.id(),edit(t,"TYPE","EXPENSE")))).isEqualTo("APPLIED");assertThat(e.web.bookkeepingRow(t.id()).get("categoryId")).isEqualTo(categories.get(0).id());
  var book=e.web.bookkeepingRow(t.id());e.web.saveBookkeeping(t.id(),new MoneyWebTypes.BookkeepingEdit(((Number)book.get("version")).longValue(),e.money.transaction(t.id()).version(),Map.of("categoryId",categories.get(1).id())));
  assertThat(status(e.unified.edit(t.id(),edit(e.money.transaction(t.id()),"TYPE","EXPENSE")))).isEqualTo("APPLIED");assertThat(e.web.bookkeepingRow(t.id()).get("categoryId")).isEqualTo(categories.get(1).id());assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("-7000");
 });}
 @Test void savingsBoundaryAndInterestAreIndependentOfInternalSavingsHops(){check(e->{
  var living=account(e,AccountRole.SPENDING);var saving=account(e,AccountRole.SAVINGS);var other=account(e,AccountRole.SAVINGS);
  e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,living.id(),saving.id(),new BigDecimal("300000"),AT,null,null,null,false,null,null));
  e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,saving.id(),other.id(),new BigDecimal("100000"),AT.plusSeconds(1),null,null,null,false,null,null));tx(e,saving.id(),false,12000,false);
  var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("savings")).isEqualByComparingTo("300000");assertThat((BigDecimal)k.get("income")).isEqualByComparingTo("12000");assertThat((BigDecimal)k.get("consumption")).isZero();assertThat(e.product.balance(living.id()).amount()).isEqualByComparingTo("-300000");assertThat(e.product.balance(saving.id()).amount()).isEqualByComparingTo("212000");assertThat(e.product.balance(other.id()).amount()).isEqualByComparingTo("100000");
 });}
 @Test void bulkReplayCannotBorrowAnOutcomeFromAnotherItemOrType(){check(e->{
  var a=account(e,AccountRole.SPENDING);var first=tx(e,a.id(),true,100,true);var second=tx(e,a.id(),true,200,true);var request=UUID.randomUUID();
  var valid=new Bulk("EXPENSE",List.of(new BulkItem(first.id(),first.version(),request)));e.unified.bulk(valid,true);e.unified.bulk(valid,true);
  assertThatThrownBy(()->e.unified.bulk(new Bulk("EXPENSE",List.of(new BulkItem(second.id(),second.version(),request))),true)).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->e.unified.bulk(new Bulk("INCOME",List.of(new BulkItem(first.id(),first.version(),request))),true)).isInstanceOf(InvalidRequestException.class);
  assertThat(e.money.transaction(first.id()).version()).isEqualTo(1);assertThat(e.money.transaction(second.id()).meaningState()).isEqualTo("UNRESOLVED");
 });}
 @Test void Q20_Q25_refundMonthFollowsOriginalCategoryAndRetainsLegacyOverrideEvidence(){check(e->{
  var a=account(e,AccountRole.SPENDING);new MoneyMeaningService(e.db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build()).saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));var cats=e.product.initializeCategories().stream().filter(c->c.kind().equals("EXPENSE")).toList();var purchase=tx(e,a.id(),true,100,false);
  var refund=e.product.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,a.id(),BigDecimal.valueOf(40),Instant.parse("2026-10-02T01:00:00Z"),"합성 환불",null,null,false,null,null));
  assertThat(status(e.unified.edit(refund.id(),new Edit(UUID.randomUUID(),0L,"TYPE","REFUND",null,null,null,null,null,null,null,purchase.id(),null,null,null,null,null)))).isEqualTo("APPLIED");
  e.web.saveBookkeeping(purchase.id(),new MoneyWebTypes.BookkeepingEdit(0L,0L,Map.of("categoryId",cats.get(0).id())));assertThat(e.web.bookkeepingRow(refund.id()).get("categoryId")).isEqualTo(cats.get(0).id());
  e.web.saveBookkeeping(refund.id(),new MoneyWebTypes.BookkeepingEdit(0L,1L,Map.of("categoryId",cats.get(0).id())));e.web.saveBookkeeping(purchase.id(),new MoneyWebTypes.BookkeepingEdit(1L,0L,Map.of("categoryId",cats.get(1).id())));assertThat(e.web.bookkeepingRow(refund.id()).get("categoryId")).isEqualTo(cats.get(1).id());
  assertThat(e.db.queryForObject("select overrides->>'categoryId' from money_bookkeeping_overrides where transaction_id=?",String.class,refund.id())).isEqualTo(cats.get(0).id().toString());
  assertThat((BigDecimal)((Map<?,?>)e.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("100");assertThat((BigDecimal)((Map<?,?>)e.web.bookkeeping("2026-10-01","2026-10-31","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("-40");
 });}
 @Test void Q18_interestInSavingsIsIncomeAndStockButNeverAnInventedTransfer(){check(e->{var savings=account(e,AccountRole.SAVINGS);tx(e,savings.id(),false,100,false);var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("income")).isEqualByComparingTo("100");assertThat((BigDecimal)k.get("savings")).isZero();assertThat(e.product.balance(savings.id()).amount()).isEqualByComparingTo("100");});}
 @Test void Q02_Q16_verifiedBankSourceAdmissionPreservesRawAndStableIdentity(){check(e->{
  var a=e.money.createAccount(new AccountInput("IBK","합성 검증 계좌",AccountRole.SPENDING,"975-******-01-014",null));
  var sample=VerifiedMoneyFixtures.side("IBK",Direction.OUT,5800,"16:54:36.875",null,"합성 거래처");var raw=e.money.ingest(VerifiedMoneyFixtures.payload(sample)).notification();e.money.process(raw.id(),new IbkNotificationParserV1());var original=e.money.notification(raw.id()).rawPayload();var v=new Admit(UUID.randomUUID(),e.money.notification(raw.id()).processingVersion());
  var admitted=e.unified.admit(raw.id(),v);assertThat(status(admitted)).isEqualTo("APPLIED");assertThat(status(e.unified.admit(raw.id(),v))).isEqualTo("APPLIED");assertThat(e.money.notification(raw.id()).rawPayload()).isEqualTo(original);assertThat(e.db.queryForObject("select count(*) from money_transaction_sources where raw_event_id=?",Integer.class,raw.id())).isEqualTo(1);assertThat(e.db.queryForObject("select count(*) from money_transactions where meaning_state='UNRESOLVED'",Integer.class)).isEqualTo(1);assertThat(e.product.balance(a.id()).amount()).isEqualByComparingTo("50000");
  UUID id=UUID.fromString(((Map<?,?>)result(admitted).get("row")).get("id").toString());var b=account(e,AccountRole.SPENDING);var conflict=new Edit(UUID.randomUUID(),0L,"CORRECT",null,null,null,null,null,null,null,null,null,b.id(),null,null,"잘못된 새 계좌 근거 시험",null);assertThat(status(e.unified.edit(id,conflict))).isEqualTo("NOT_APPLIED");
  e.db.update("update money_transactions set amount=6000 where id=?",id);var repair=new Edit(UUID.randomUUID(),0L,"CORRECT",null,null,null,null,null,null,null,null,null,null,BigDecimal.valueOf(5800),null,"원본 은행 금액 근거로 역사적 오류 복구",null);assertThat(status(e.unified.edit(id,repair))).isEqualTo("APPLIED");assertThat(e.money.transaction(id).amount()).isEqualByComparingTo("5800");assertThat(e.money.notification(raw.id()).rawPayload()).isEqualTo(original);
 });}

 @Test void savingsDisplayFiltersCountBeforePaginationAndKeepCanonicalFacts(){check(e->{
  var living=account(e,AccountRole.SPENDING);var saving=account(e,AccountRole.SAVINGS);var saving2=account(e,AccountRole.SAVINGS);var living2=account(e,AccountRole.SPENDING);
  var in=e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,living.id(),saving.id(),BigDecimal.valueOf(300000),AT,"합성 저축",null,null,false,null,null));
  var out=e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,saving.id(),living.id(),BigDecimal.valueOf(50000),AT,"합성 회수",null,null,false,null,null));
  e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,saving.id(),saving2.id(),BigDecimal.valueOf(200000),AT,null,null,null,false,null,null));
  e.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,living.id(),living2.id(),BigDecimal.valueOf(100000),AT,null,null,null,false,null,null));
  assertThat(e.unified.row(in.id()).get("type")).isEqualTo("TRANSFER");assertThat(e.unified.row(in.id()).get("display_type")).isEqualTo("SAVINGS");assertThat(e.unified.row(out.id()).get("display_type")).isEqualTo("SAVINGS_WITHDRAWAL");
  for(var type:List.of("SAVINGS","SAVINGS_WITHDRAWAL","TRANSFER")){
   var page=e.unified.ledger("2026-09-01","2026-09-30",false,null,null,1,0,null,type,null,null);
   assertThat(page.get("total")).isEqualTo(type.equals("TRANSFER")?2L:1L);
   assertThat((List<Map<String,Object>>)page.get("items")).hasSize(1).allSatisfy(r->assertThat(r.get("display_type")).isEqualTo(type));
  }
  assertThat((List<?>)e.unified.ledger("2026-09-01","2026-09-30",false,"합성 저축",living.id().toString(),1,1,null,"SAVINGS",null,null).get("items")).isEmpty();
  e.db.update("insert into money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version) values(?,?,'OTHER',null,'2026-10-01',0)",MoneyPostgresIntegrationTest.OWNER,saving.id());
  assertThat(e.unified.row(in.id()).get("display_type")).isEqualTo("SAVINGS");
  var k=(Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)k.get("savings")).isEqualByComparingTo("250000");
  e.db.update("delete from money_account_fund_group_history where account_id=?",saving.id());
  assertThat(e.unified.row(in.id()).get("display_type")).isEqualTo("TRANSFER");
  assertThat(e.web.overview("2026-09-01","2026-09-30").get("analyticsUnavailable")).isEqualTo(true);
  assertThat(e.unified.ledger("2026-09-01","2026-09-30",false,null,null,50,0,null,"SAVINGS",null,null).get("total")).isEqualTo(0L);
 });}
 @Test void positivePausedAndInactiveDebtIsIncludedAndLinkedFactsLockOpeningPrincipal(){check(e->{
  var a=account(e,AccountRole.SPENDING);BigDecimal total=BigDecimal.ZERO;
  for(var state:List.of("ACTIVE","PAUSED","INACTIVE")){
   var l=e.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 "+state,"은행","PERSONAL",null,BigDecimal.valueOf(5000000),null,null,null,null,a.id(),null,null,state,null,0L));total=total.add(l.remainingPrincipal());
  }
  assertThat((BigDecimal)((Map<?,?>)e.web.overview("2026-09-01","2026-09-30").get("kpis")).get("loans")).isEqualByComparingTo(total);
  assertThat(new MoneyMobileService(e.db,()->MoneyPostgresIntegrationTest.OWNER,e.money,e.product).overview().loans().amount()).isEqualByComparingTo(total);
  var l=e.web.loans().stream().filter(v->v.status().equals("ACTIVE")).findFirst().orElseThrow();
  var t=tx(e,a.id(),true,300000,true);
  assertThat(status(e.unified.edit(t.id(),new Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_PAYMENT",null,null,l.id(),l.version(),null,null,null,null,null,null,null,null,null)))).isEqualTo("APPLIED");
  var current=e.web.loan(l.id());assertThat(current.linkedFactCount()).isEqualTo(1);assertThat(current.unresolvedAllocationCount()).isEqualTo(1);
  assertThatThrownBy(()->e.web.saveLoan(l.id(),new MoneyWebTypes.LoanInput(l.name(),l.lender(),l.type(),null,BigDecimal.ONE,null,null,null,null,a.id(),null,null,"ACTIVE",null,current.version()))).hasMessageContaining("Correct a repayment");
 });}
}
