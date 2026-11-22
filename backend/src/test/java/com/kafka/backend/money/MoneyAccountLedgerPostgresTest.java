package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyAccountLedgerService.*;
import static org.assertj.core.api.Assertions.*;

/** Disposable loopback PostgreSQL only, each scenario rolls back its complete financial graph. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
class MoneyAccountLedgerPostgresTest {
 private final MoneyUnifiedBookkeepingPostgresTest base=new MoneyUnifiedBookkeepingPostgresTest();
 private MoneyAccountLedgerService ledger(MoneyUnifiedBookkeepingPostgresTest.Env e){
  var json=JsonMapper.builder().build();var manager=new DataSourceTransactionManager(Objects.requireNonNull(e.db().getDataSource()));manager.setNestedTransactionAllowed(true);var commands=new MoneyCommandService(e.db(),json,manager);
  return new MoneyAccountLedgerService(e.db(),()->MoneyPostgresIntegrationTest.OWNER,json,e.money(),e.unified(),e.web(),commands,manager);
 }
 @SuppressWarnings("unchecked") private List<Map<String,Object>> items(Map<String,Object> response){return (List<Map<String,Object>>)response.get("items");}
 private Map<String,Object> read(MoneyAccountLedgerService ledger,UUID account,int limit,int offset){return ledger.read("2026-09-01","2026-09-30",account,null,"ALL",null,limit,offset);}
 private EditRequest draft(MoneyAccountLedgerService ledger,MoneyTransaction tx,String type){return new EditRequest(ledger.row(tx.id()).get("fingerprint").toString(),new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),tx.version(),"TYPE",type,null,null,null,null,null,null,null,null,null,null,null,"합성 금융 의미 확인",null));}
 private EditRequest approved(MoneyAccountLedgerService ledger,UUID id,EditRequest draft){var preview=ledger.preview(id,draft);assertThat(preview.get("status")).isEqualTo("APPLIED");return new EditRequest(draft.fingerprint(),draft.edit(),preview.get("previewToken").toString());}
 private FinancialType command(long version,String type){return new FinancialType(UUID.randomUUID(),version,type);}
 private Map<String,Object> decision(MoneyAccountLedgerService ledger,MoneyTransaction transaction,String type){
  return ledger.financialType(transaction.id(),command(transaction.version(),type));
 }
 private Map<?,?> kpis(MoneyUnifiedBookkeepingPostgresTest.Env e){
  return (Map<?,?>)e.web().overview("2026-09-01","2026-09-30").get("kpis");
 }
 @Test void ownerTypesRestoreConfirmedBookkeepingAndKeepEachAdmittedCashLegExactlyOnce(){base.check(e->{
  var account=base.account(e,AccountRole.SPENDING);
  new MoneyMeaningService(e.db(),()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build())
      .saveTracking(new MoneyMeaningService.TrackingInput(List.of(account.id()),List.of(account.id()),0L));
  e.db().update("update money_tracking_selections set effective_at=? where user_id=? and version=1",java.sql.Timestamp.from(MoneyUnifiedBookkeepingPostgresTest.AT.minusSeconds(1)),MoneyPostgresIntegrationTest.OWNER);
  var ledger=ledger(e);
  for(boolean out:List.of(true,false)){
   var row=base.tx(e,account.id(),out,320,true);
   String kind=out?"EXPENSE":"INCOME";
   var request=command(row.version(),kind);
   var balance=e.product().balance(account.id());
   var saved=ledger.financialType(row.id(),request);
   assertThat(saved).containsEntry("status","APPLIED").containsEntry("intentSaved",true).containsEntry("meaningApplied",true);
   assertThat(e.money().transaction(row.id()).meaningState()).isEqualTo("CONFIRMED");
   assertThat(e.web().bookkeeping("2026-09-01","2026-09-30",kind,null,10,0,false).get("total")).isEqualTo(1L);
   assertThat(ledger.row(row.id()).get("categoryEligible")).isEqualTo(true);
   assertThatThrownBy(()->ledger.financialType(row.id(),command(row.version(),"UNRESOLVED"))).isInstanceOf(OptimisticLockConflictException.class);
   var changed=decision(ledger,e.money().transaction(row.id()),"UNRESOLVED");
   assertThat(changed).containsEntry("intentSaved",true).containsEntry("declaredFinancialType","UNRESOLVED");
   // A lost success response arrives after another legitimate edit. The original receipt remains replayable.
   var replay=ledger.financialType(row.id(),request);
   assertThat(replay.get("declaredFinancialType")).isEqualTo(kind);
   assertThat(((Number)replay.get("currentVersion")).longValue()).isEqualTo(((Number)saved.get("currentVersion")).longValue());
   assertThat(e.money().transaction(row.id()).meaningState()).isEqualTo("UNRESOLVED");
   assertThat(e.product().balance(account.id())).isEqualTo(balance);
   assertThat(e.web().bookkeeping("2026-09-01","2026-09-30",kind,null,10,0,false).get("total")).isEqualTo(0L);
  }
 });}
 @Test void loanDecisionRemovesConsumptionAndCountsGrossUntilTheSplitIsVerified(){base.check(e->{
  var account=base.account(e,AccountRole.SPENDING);
  var excluded=base.account(e,AccountRole.SAVINGS);
  e.db().update("update money_accounts set include_in_statistics=false where id=?",excluded.id());
  var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("검증용 대출","은행","PERSONAL",BigDecimal.valueOf(1000),
      BigDecimal.valueOf(1000),null,null,null,null,account.id(),null,null,"ACTIVE",null,0L));
  var a=base.tx(e,account.id(),true,100,false);
  var b=base.tx(e,excluded.id(),true,200,false);
  var ledger=ledger(e);
  var balance=e.product().balance(account.id());
  for(var t:List.of(a,b)){
   var saved=decision(ledger,t,"LOAN_PAYMENT");
   assertThat(saved).containsEntry("declaredFinancialType","LOAN_PAYMENT").containsEntry("relationStatus","LOAN_SPLIT_PENDING");
   assertThat(ledger.row(t.id())).containsEntry("declaredFinancialType","LOAN_PAYMENT");
  }
  String from="2026-09-01",to="2026-09-30";
  var pending=e.unified().pending();
  assertThat(pending).containsEntry("count",0L).containsEntry("loanSplitPending",2L);
  assertThat(e.unified().ledger(from,to,true,null,null,50,0).get("total")).isEqualTo(0L);
  assertThat(e.unified().ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null).get("total")).isEqualTo(2L);
  var total=e.unified().loanRepayments(from,to,null);
  assertThat(total.loanRepayment()).isEqualTo("100");
  assertThat(total.loanRepaymentBreakdown().byPart()).isEqualTo(new MoneyUnifiedBookkeepingService.RepaymentSplit("0","0","0","100"));
  assertThat(total.unallocatedCount()).isOne();
  assertThat(total.unallocatedAmount()).isEqualTo("100");
  var tracking=new MoneyMeaningService(e.db(),()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());
  tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(excluded.id()),List.of(account.id()),0L));
  e.db().update("update money_tracking_selections set effective_at=? where user_id=? and version=1",java.sql.Timestamp.from(MoneyUnifiedBookkeepingPostgresTest.AT.minusSeconds(1)),MoneyPostgresIntegrationTest.OWNER);
  var scoped=e.unified().loanRepayments(from,to,null,true);
  assertThat(scoped.loanRepayment()).isEqualTo("200");
  assertThat(scoped.unallocatedAmount()).isEqualTo("200");
  assertThat(scoped.loanRepaymentBreakdown().byLoan()).containsExactly(new MoneyUnifiedBookkeepingService.RepaymentGroup(null,"미연결 대출상환","200"));
  var group=e.unified().ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,"unlinked",null,true);
  var splitPending=e.unified().ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,null,MoneyUnifiedBookkeepingService.RepaymentPart.UNALLOCATED,true);
  for(var scopedPage:List.of(group,splitPending))assertThat(items(scopedPage)).singleElement().satisfies(row->assertThat(row).containsEntry("id",b.id()).containsEntry("declaredFinancialType","LOAN_PAYMENT"));
  var page=e.unified().ledger(from,to,false,null,null,50,0,null,"LOAN_PAYMENT",null,null,null,MoneyUnifiedBookkeepingService.RepaymentPart.UNALLOCATED);
  assertThat(items(page)).singleElement().satisfies(row->assertThat(row).containsEntry("id",a.id()).containsEntry("declaredFinancialType","LOAN_PAYMENT"));
  assertThat((BigDecimal)kpis(e).get("unresolvedLoanPayments")).isEqualByComparingTo("100");
  assertThat((BigDecimal)kpis(e).get("consumption")).isZero();
  assertThat(e.product().balance(account.id())).isEqualTo(balance);
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("1000");
  var split=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),e.money().transaction(a.id()).version(),"TYPE","LOAN_PAYMENT",null,null,
      loan.id(),loan.version(),BigDecimal.valueOf(80),BigDecimal.valueOf(18),BigDecimal.valueOf(2),null,null,null,null,"합성 배분",null);
  assertThat(e.unified().edit(a.id(),split)).containsEntry("status","APPLIED");
  var allocated=e.unified().loanRepayments(from,to,null);
  assertThat(allocated.loanRepayment()).isEqualTo("100");
  assertThat(allocated.unallocatedCount()).isZero();
  assertThat(allocated.loanRepaymentBreakdown().byPart()).isEqualTo(new MoneyUnifiedBookkeepingService.RepaymentSplit("80","18","2","0"));
  assertThat((BigDecimal)kpis(e).get("consumption")).isZero();
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("920");
  var correction=decision(ledger,e.money().transaction(a.id()),"EXPENSE");
  assertThat(correction).containsEntry("relationStatus","RELATION_CORRECTION_REQUIRED").containsEntry("meaningApplied",false);
  var pendingCash=e.product().balance(excluded.id());
  assertThat(decision(ledger,e.money().transaction(b.id()),"EXPENSE")).containsEntry("relationStatus","NONE").containsEntry("meaningApplied",true);
  assertThat(e.unified().loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("0");
  var monthly=e.web().bookkeeping(from,to,"EXPENSE",null,50,0,false,null,null,null,null,"ALL",null,null,true,true);
  assertThat(items(monthly)).singleElement().satisfies(row->assertThat(row).containsEntry("id",b.id()));
  assertThat((BigDecimal)((Map<?,?>)monthly.get("summary")).get("total")).isEqualByComparingTo("200");
  assertThat(e.product().balance(excluded.id())).isEqualTo(pendingCash);
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("920");
  assertThat(e.product().balance(account.id())).isEqualTo(balance);
 });}
 @Test void archivedCategoryAndAdmissionEvidenceSurviveDecisionsAndReplay(){base.check(e->{
  var a=e.money().createAccount(new AccountInput("IBK","합성 검증 계좌",AccountRole.SPENDING,"975-******-01-014",null));
  var raw=e.money().ingest(VerifiedMoneyFixtures.payload(VerifiedMoneyFixtures.side("IBK",Direction.OUT,5800,"16:54:36.875",null,"합성 거래처"))).notification();
  e.money().process(raw.id(),new IbkNotificationParserV1());
  var moved=e.unified().admit(raw.id(),new MoneyUnifiedBookkeepingService.Admit(UUID.randomUUID(),e.money().notification(raw.id()).processingVersion()));
  assertThat(moved).containsEntry("status","APPLIED");
  var id=UUID.fromString(((Map<?,?>)((Map<?,?>)moved.get("result")).get("row")).get("id").toString());
  var ledger=ledger(e);var before=e.money().transaction(id);
  var confirmed=decision(ledger,before,"EXPENSE");
  var current=ledger.row(id);var book=(Map<?,?>)current.get("book");
  var category=e.product().initializeCategories().stream().filter(c->"EXPENSE".equals(c.kind())).findFirst().orElseThrow();
  var assignment=new Category(UUID.randomUUID(),((Number)confirmed.get("currentVersion")).longValue(),current.get("fingerprint").toString(),
      category.id(),((Number)book.get("classificationVersion")).longValue(),true);
  assertThat(ledger.category(id,assignment)).containsEntry("status","APPLIED");
  var events=e.db().queryForList("select * from money_classification_events where transaction_id=?",id);
  assertThat(events).isNotEmpty();
  var balance=e.product().balance(a.id());
  var cmd=command(e.money().transaction(id).version(),"TRANSFER");
  var transfer=ledger.financialType(id,cmd);
  assertThat(transfer).containsEntry("relationStatus","TRANSFER_PAIR_PENDING");
  assertThat(ledger.row(id).get("categoryEligible")).isEqualTo(false);
  assertThat(ledger.financialType(id,cmd).get("requestId").toString()).isEqualTo(cmd.requestId().toString());
  assertThat(e.db().queryForList("select * from money_classification_events where transaction_id=?",id)).isEqualTo(events);
  decision(ledger,e.money().transaction(id),"EXPENSE");
  assertThat(ledger.row(id)).containsEntry("category_id",category.id());
  var after=e.money().transaction(id);
  assertThat(after.sources()).isEqualTo(before.sources());
  assertThat(after.amount()).isEqualByComparingTo(before.amount());
  assertThat(after.occurredAt()).isEqualTo(before.occurredAt());
  assertThat(after.fromAccountId()).isEqualTo(before.fromAccountId());
  assertThat(e.money().notification(raw.id()).rawPayload()).isEqualTo(raw.rawPayload());
  assertThat(e.product().balance(a.id())).isEqualTo(balance);
  assertThat(e.db().queryForObject("select count(*) from money_transaction_sources where raw_event_id=?",Integer.class,raw.id())).isOne();
 });}
 @Test void linkedTransferAndLinkedRefundGuardPendingChangesOnTheirCashAndOriginal(){base.check(e->{
  var account=base.account(e,AccountRole.SPENDING);
  var other=base.account(e,AccountRole.SAVINGS);
  var ledger=ledger(e);
  var transfer=e.product().save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,account.id(),other.id(),BigDecimal.valueOf(50),
      MoneyUnifiedBookkeepingPostgresTest.AT,null,null,null,false,null,null));
  assertThat(decision(ledger,transfer,"EXPENSE")).containsEntry("relationStatus","RELATION_CORRECTION_REQUIRED");
  assertThat(e.money().transaction(transfer.id()).toAccountId()).isEqualTo(other.id());
  var original=base.tx(e,account.id(),true,100,false);
  var credit=base.tx(e,account.id(),false,40,false);
  decision(ledger,credit,"REFUND");
  var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),e.money().transaction(credit.id()).version(),"TYPE","REFUND",
      null,null,null,null,null,null,null,original.id(),null,null,null,"합성 환불 확인",null);
  assertThat(e.unified().edit(credit.id(),edit)).containsEntry("status","APPLIED");
  assertThat((BigDecimal)kpis(e).get("consumption")).isEqualByComparingTo("60");
  assertThat(decision(ledger,e.money().transaction(credit.id()),"INCOME")).containsEntry("relationStatus","RELATION_CORRECTION_REQUIRED");
  assertThat(e.money().transaction(credit.id()).refundOf()).isEqualTo(original.id());
  assertThat((BigDecimal)kpis(e).get("consumption")).isEqualByComparingTo("60");
 });}
 @Test void unmatchedRelationshipsCannotInventAnAccountPrincipalOrRefund(){base.check(e->{
  var account=base.account(e,AccountRole.SPENDING);var ledger=ledger(e);
  var debit=base.tx(e,account.id(),true,240,false);
  var credit=base.tx(e,account.id(),false,140,false);
  var balance=e.product().balance(account.id());
  for(var item:Map.of("TRANSFER","TRANSFER_PAIR_PENDING","SAVINGS","SAVINGS_ROUTE_PENDING").entrySet()){
   assertThat(decision(ledger,e.money().transaction(debit.id()),item.getKey()))
       .containsEntry("relationStatus",item.getValue()).containsEntry("declaredFinancialType",item.getKey());
   assertThat(e.money().transaction(debit.id()).toAccountId()).isNull();
   assertThat((BigDecimal)kpis(e).get("consumption")).isZero();
   assertThat((BigDecimal)kpis(e).get("savings")).isZero();
  }
  for(var item:Map.of("REFUND","REFUND_ORIGINAL_PENDING","LOAN_RECEIPT","LOAN_LINK_PENDING").entrySet()){
   assertThat(decision(ledger,e.money().transaction(credit.id()),item.getKey())).containsEntry("relationStatus",item.getValue());
   assertThat((BigDecimal)kpis(e).get("income")).isZero();
   assertThat(e.db().queryForMap("select loan_id,refund_of from money_transactions where id=?",credit.id()).values()).containsOnlyNulls();
  }
  assertThat(decision(ledger,e.money().transaction(debit.id()),"INCOME")).containsEntry("relationStatus","DIRECTION_REVIEW").containsEntry("meaningApplied",false);
  assertThat(e.product().balance(account.id())).isEqualTo(balance);
  assertThat(e.db().queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(2);
 });}

 @Test void ledgerRepaymentConfirmationMovesConsumptionToRepaymentExactlyOnce(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);
  var t=base.tx(e,a.id(),true,100000,false);
  var owner=MoneyPostgresIntegrationTest.OWNER;
  var tracking=new MoneyMeaningService(e.db(),()->owner,JsonMapper.builder().build());
  var settings=tracking.saveTracking(new MoneyMeaningService.TrackingInput(List.of(a.id()),List.of(),0L));
  e.db().update("update money_tracking_selections set effective_at=? where user_id=? and version=1",java.sql.Timestamp.from(MoneyUnifiedBookkeepingPostgresTest.AT.minusSeconds(1)),MoneyPostgresIntegrationTest.OWNER);
  var l=ledger(e);var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",new BigDecimal("1000000"),new BigDecimal("1000000"),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  String from="2026-09-01",to="2026-09-30";
  assertThat(e.web().bookkeeping(from,to,"EXPENSE",null,50,0,false).get("total")).isEqualTo(1L);
  assertThat(e.unified().loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("0");
  var before=e.product().balance(a.id());
  var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),
      new BigDecimal("80000"),new BigDecimal("19000"),new BigDecimal("1000"),null,null,null,null,"합성 상환 확인",null);
  var command=approved(l,t.id(),new EditRequest(l.row(t.id()).get("fingerprint").toString(),edit));
  assertThat(l.execute(t.id(),command)).containsEntry("status","APPLIED");
  assertThat(l.execute(t.id(),command)).containsEntry("status","APPLIED");
  assertThat(e.web().bookkeeping(from,to,"EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
  assertThat(e.unified().loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("100000");
  // An allocated repayment cannot be reversed by the normal type editor.
  var guarded=e.unified().edit(t.id(),base.edit(e.money().transaction(t.id()),"TYPE","EXPENSE"));
  assertThat(guarded).containsEntry("status","NOT_APPLIED");
  assertThat(e.unified().loanRepayments(from,to,null,true).loanRepayment()).isEqualTo("100000");
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("920000");
  assertThat(e.product().balance(a.id())).isEqualTo(before);
  assertThat(tracking.tracking()).isEqualTo(settings);
  assertThat(items(read(l,null,50,0))).singleElement().satisfies(row->assertThat(row).containsEntry("id",t.id()).containsEntry("categoryEligible",true));
 });}

 @Test void allHasOneCanonicalTransferAndAccountLensesHaveOppositeExactSignedLegs(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var b=base.account(e,AccountRole.SAVINGS);var t=e.product().save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,a.id(),b.id(),new BigDecimal("123.45"),MoneyUnifiedBookkeepingPostgresTest.AT,"합성",null,null,false,null,null));var l=ledger(e);
  assertThat(read(l,null,50,0).get("total")).isEqualTo(1L);assertThat(items(read(l,null,50,0))).singleElement().satisfies(row->{assertThat(row.get("id")).isEqualTo(t.id());assertThat(row.get("signedAmount")).isNull();assertThat(row.get("display_type")).isEqualTo("SAVINGS");});
  assertThat((BigDecimal)items(read(l,a.id(),50,0)).getFirst().get("signedAmount")).isEqualByComparingTo("-123.45");assertThat((BigDecimal)items(read(l,b.id(),50,0)).getFirst().get("signedAmount")).isEqualByComparingTo("123.45");assertThat(e.money().transaction(t.id()).version()).isZero();
 });}
 @Test void accountCountersCoverWholeFilteredSetAndDoNotDependOnScopeOrPage(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var b=base.account(e,AccountRole.INCOME_HUB);for(int i=0;i<4;i++)base.tx(e,a.id(),true,10+i,false);base.tx(e,b.id(),false,20,false);var l=ledger(e);var all=read(l,null,1,0);
  assertThat(all.get("total")).isEqualTo(5L);assertThat(items(all)).hasSize(1);assertThat(read(l,a.id(),1,2).get("accountCounts")).isEqualTo(all.get("accountCounts"));
  var counts=(List<Map<String,Object>>)all.get("accountCounts");assertThat(counts).anySatisfy(c->{assertThat(c.get("accountId")).isEqualTo(a.id());assertThat(c.get("count")).isEqualTo(4L);});
  assertThat(((Map<?,?>)all.get("summary")).get("incoming")).isNull();assertThat(((Map<?,?>)all.get("summary")).get("outgoing")).isNull();
 });}
 @Test void categoryEligibilityIsOnlyConfirmedExpenseAndIncomeAndPendingRespectsPeriod(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);base.tx(e,a.id(),true,10,false);base.tx(e,a.id(),false,20,false);var pending=base.tx(e,a.id(),true,30,true);var l=ledger(e);
  assertThat(items(read(l,null,50,0))).filteredOn(row->row.get("id").equals(pending.id())).singleElement().satisfies(row->{assertThat(row.get("display_type")).isEqualTo("UNRESOLVED");assertThat(row.get("categoryEligible")).isEqualTo(false);assertThat(row.get("category_id")).isNull();});
  assertThat(items(read(l,null,50,0))).filteredOn(row->!row.get("id").equals(pending.id())).allSatisfy(row->assertThat(row.get("categoryEligible")).isEqualTo(true));
  assertThat(l.read("2026-10-01","2026-10-31",null,null,"UNRESOLVED",null,50,0).get("total")).isEqualTo(0L);
 });}
 @Test void previewRollsBackFactsAuditOutcomeAndLoanDebtAndExecuteIsIdempotent(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),false,100,true);var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",BigDecimal.valueOf(1000),BigDecimal.ZERO,null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));var l=ledger(e);
  var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_RECEIPT",null,null,loan.id(),loan.version(),null,null,null,null,null,null,null,"합성 대출 수령",null);var draft=new EditRequest(l.row(t.id()).get("fingerprint").toString(),edit);var execute=approved(l,t.id(),draft);
  assertThat(e.money().transaction(t.id()).type()).isEqualTo(TransactionType.INCOME);assertThat(e.money().transaction(t.id()).version()).isZero();assertThat(e.web().loan(loan.id()).remainingPrincipal()).isZero();
  assertThat(e.unified().outcome(edit.requestId()).get("status")).isEqualTo("UNKNOWN");assertThat(e.db().queryForObject("select count(*) from money_meaning_audit where subject_id=?",Integer.class,t.id())).isZero();
  assertThat(l.execute(t.id(),execute).get("status")).isEqualTo("APPLIED");assertThat(l.execute(t.id(),execute).get("status")).isEqualTo("APPLIED");assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("100");assertThat(e.db().queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(1);
  assertThat(items(read(l,null,50,0))).singleElement().satisfies(row->{assertThat(row.get("display_type")).isEqualTo("LOAN_RECEIPT");assertThat(row.get("categoryEligible")).isEqualTo(true);});
 });}
 @Test void exactDraftTokenAndStaleAccountFingerprintBlockMoneyMutation(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),true,100,true);var l=ledger(e);var draft=draft(l,t,"EXPENSE");var execute=approved(l,t.id(),draft);
  e.db().update("update money_accounts set version=version+1 where id=?",a.id());var result=l.execute(t.id(),execute);assertThat(result.get("status")).isEqualTo("NOT_APPLIED");assertThat(result.toString()).contains("VERSION_CONFLICT");assertThat(e.money().transaction(t.id()).meaningState()).isEqualTo("UNRESOLVED");
  var missing=draft(l,e.money().transaction(t.id()),"EXPENSE");assertThat(l.execute(t.id(),missing).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().transaction(t.id()).version()).isZero();
 });}
 @Test void metadataEditsUseSameFactAndBookkeepingAndRecoverOriginalRequest(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),true,100,false);var l=ledger(e);var metadata=new Metadata(UUID.randomUUID(),t.version(),l.row(t.id()).get("fingerprint").toString(),"수정 제목","수정 메모");assertThat(l.metadata(t.id(),metadata).get("status")).isEqualTo("APPLIED");assertThat(l.metadata(t.id(),metadata).get("status")).isEqualTo("APPLIED");
  assertThat(e.money().transaction(t.id()).title()).isEqualTo("수정 제목");assertThat(e.web().bookkeepingRow(t.id()).get("title")).isEqualTo("수정 제목");assertThat(e.money().transaction(t.id()).version()).isEqualTo(1);
 });}
 @Test void rawReviewRemainsSeparateWithNoMoneyTotalsAndUnknownAccountIsNotGuessed(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var raw=e.money().ingest(VerifiedMoneyFixtures.payload(VerifiedMoneyFixtures.side("IBK",Direction.OUT,5800,"16:54:36.875",null,"합성 거래처"))).notification();e.money().process(raw.id(),new IbkNotificationParserV1());e.money().finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"ACCOUNT_NOT_RESOLVED");var before=e.money().notification(raw.id()).rawPayload();var l=ledger(e);
  var pending=l.pending("2026-01-01","2026-12-31",null,null,"ALL",null,50,0);assertThat(pending.get("total")).isEqualTo(1L);assertThat(((Map<?,?>)pending.get("summary")).get("outgoing")).isNull();assertThat(l.pending("2026-01-01","2026-12-31",a.id(),null,"ALL",null,50,0).get("total")).isEqualTo(0L);assertThat(read(l,null,50,0).get("total")).isEqualTo(0L);assertThat(e.money().notification(raw.id()).rawPayload()).isEqualTo(before);
 });}
 @Test void crossOwnerReadAndInvalidFiltersRejectBeforeReturningFinancialFacts(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),true,10,false);var l=ledger(e);assertThatThrownBy(()->l.read("2026-09-01","2026-09-30",UUID.randomUUID(),null,"ALL",null,50,0)).isInstanceOf(ResourceNotFoundException.class);
  assertThatThrownBy(()->l.read("2026-09-30","2026-09-01",null,null,"ALL",null,50,0)).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->l.read("2026-09-01","2026-09-30",null,"FAKE","ALL",null,50,0)).isInstanceOf(InvalidRequestException.class);
  var mapper=JsonMapper.builder().build();UUID stranger=UUID.randomUUID();var otherMoney=new MoneyService(e.db(),()->stranger,mapper);var otherProduct=new MoneyProductService(e.db(),()->stranger,otherMoney,mapper);var otherWeb=new MoneyWebService(e.db(),()->stranger,otherMoney,otherProduct,mapper);var manager=new DataSourceTransactionManager(e.db().getDataSource());var commands=new MoneyCommandService(e.db(),mapper,manager);var otherUnified=new MoneyUnifiedBookkeepingService(e.db(),()->stranger,mapper,otherMoney,otherProduct,otherWeb,new MoneyFinancialService(e.db(),()->stranger,otherMoney,otherProduct,otherWeb,mapper),commands);var other=new MoneyAccountLedgerService(e.db(),()->stranger,mapper,otherMoney,otherUnified,otherWeb,commands,manager);
  assertThat(other.read("2026-09-01","2026-09-30",null,null,"ALL",null,50,0).get("total")).isEqualTo(0L);assertThatThrownBy(()->other.row(t.id())).isInstanceOf(ResourceNotFoundException.class);
 });}
 @Test void unresolvedChangesSemanticStateOnlyAndCannotHideLoanOrRefundObligations(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),true,100,false);var l=ledger(e);var request=approved(l,t.id(),draft(l,t,"UNRESOLVED"));assertThat(l.execute(t.id(),request).get("status")).isEqualTo("APPLIED");assertThat(e.money().transaction(t.id()).type()).isEqualTo(TransactionType.EXPENSE);assertThat(e.product().balance(a.id()).amount()).isEqualByComparingTo("-100");assertThat(e.web().bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
  var refund=e.product().save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,a.id(),BigDecimal.TEN,Instant.parse("2026-09-27T01:00:00Z"),null,null,null,false,null,null));var invalid=l.preview(refund.id(),draft(l,refund,"UNRESOLVED"));assertThat(invalid.get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().transaction(refund.id()).type()).isEqualTo(TransactionType.REFUND);
 });}
 @Test void pendingPreviewFailureLeavesNoOutcomeOrFinancialAudit(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),true,100,false);var l=ledger(e);var draft=draft(l,t,"LOAN_RECEIPT");assertThat(l.preview(t.id(),draft).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.unified().outcome(draft.edit().requestId()).get("status")).isEqualTo("UNKNOWN");assertThat(e.db().queryForObject("select count(*) from money_meaning_audit where subject_id=?",Integer.class,t.id())).isZero();assertThat(e.money().transaction(t.id()).version()).isZero();
 });}
 @Test void categoriesOutsideTrackingReuseClassificationHistoryWithoutIncludingAccountInStatistics(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);e.db().update("update money_accounts set include_in_statistics=false where id=?",a.id());var expense=base.tx(e,a.id(),true,100,false);var income=base.tx(e,a.id(),false,200,false);var categories=e.product().initializeCategories();var l=ledger(e);
  for(var t:List.of(expense,income)){
   var category=categories.stream().filter(c->c.kind().equals(t.type().name())).findFirst().orElseThrow();var row=l.row(t.id());var book=(Map<?,?>)row.get("book");assertThat(book).isNotNull();
   var input=new Category(UUID.randomUUID(),t.version(),row.get("fingerprint").toString(),category.id(),((Number)book.get("classificationVersion")).longValue(),true);var saved=l.category(t.id(),input);assertThat(saved.get("status")).isEqualTo("APPLIED");assertThat(l.category(t.id(),input).get("status")).isEqualTo("APPLIED");var event=(Map<?,?>)((Map<?,?>)saved.get("result")).get("classification");var returnedBook=(Map<?,?>)event.get("book");assertThat(((Number)returnedBook.get("classificationVersion")).longValue()).isEqualTo(((Number)((Map<?,?>)event.get("classification")).get("version")).longValue());assertThat(returnedBook.get("directProtected")).isEqualTo(true);
   assertThat(e.money().transaction(t.id()).amount()).isEqualByComparingTo(t.amount());assertThat(e.money().transaction(t.id()).version()).isEqualTo(t.version());assertThat(l.row(t.id()).get("category_id")).isEqualTo(category.id());assertThat(e.db().queryForObject("select count(*) from money_classification_events where transaction_id=?",Integer.class,t.id())).isEqualTo(1);
  }
  assertThat(e.web().bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);assertThat(e.web().bookkeeping("2026-09-01","2026-09-30","INCOME",null,50,0,false).get("total")).isEqualTo(0L);assertThat(e.db().queryForObject("select count(*) from money_tracking_accounts where account_id=?",Integer.class,a.id())).isZero();assertThat(e.money().account(a.id()).includeInStatistics()).isFalse();
 });}
 @Test void ledgerCategoryRejectsNoncategoricalRowsWrongKindAndStaleClassification(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var b=base.account(e,AccountRole.SAVINGS);var transfer=e.product().save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,a.id(),b.id(),BigDecimal.TEN,MoneyUnifiedBookkeepingPostgresTest.AT,null,null,null,false,null,null));var expense=base.tx(e,a.id(),true,100,false);var categories=e.product().initializeCategories();var incomeCat=categories.stream().filter(c->c.kind().equals("INCOME")).findFirst().orElseThrow();var l=ledger(e);
  assertThat(l.category(transfer.id(),new Category(UUID.randomUUID(),transfer.version(),l.row(transfer.id()).get("fingerprint").toString(),incomeCat.id(),0L,true)).get("status")).isEqualTo("NOT_APPLIED");assertThat(l.category(expense.id(),new Category(UUID.randomUUID(),expense.version(),l.row(expense.id()).get("fingerprint").toString(),incomeCat.id(),0L,true)).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.db().queryForObject("select count(*) from money_classification_events where transaction_id in (?,?)",Integer.class,transfer.id(),expense.id())).isZero();
 });}
 @Test void sourceFingerprintInvalidationPreservesBankPayloadCanonicalIdentityAndLinks(){base.check(e->{
  e.money().createAccount(new AccountInput("IBK","합성 검증 계좌",AccountRole.SPENDING,"975-******-01-014",null));var raw=e.money().ingest(VerifiedMoneyFixtures.payload(VerifiedMoneyFixtures.side("IBK",Direction.OUT,5800,"16:54:36.875",null,"합성 거래처"))).notification();e.money().process(raw.id(),new IbkNotificationParserV1());var payload=e.money().notification(raw.id()).rawPayload();
  var admitted=e.unified().admit(raw.id(),new MoneyUnifiedBookkeepingService.Admit(UUID.randomUUID(),e.money().notification(raw.id()).processingVersion()));assertThat(admitted.get("status")).isEqualTo("APPLIED");UUID id=UUID.fromString(((Map<?,?>)((Map<?,?>)admitted.get("result")).get("row")).get("id").toString());var t=e.money().transaction(id);var l=ledger(e);var request=approved(l,id,draft(l,t,"EXPENSE"));
  e.money().finishProcessing(raw.id(),ProcessingState.PROCESSED,"SYNTHETIC_VERSION_CHANGED");assertThat(l.execute(id,request).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().notification(raw.id()).rawPayload()).isEqualTo(payload);assertThat(e.money().transaction(id).meaningState()).isEqualTo("UNRESOLVED");assertThat(e.money().transaction(id).sources()).hasSize(1);assertThat(e.db().queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,MoneyPostgresIntegrationTest.OWNER)).isEqualTo(1);
 });}
 @Test void changedTargetLoanOrChangedDraftCannotReusePreviousPreview(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),false,100,true);var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",BigDecimal.valueOf(1000),BigDecimal.ZERO,null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));var l=ledger(e);var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_RECEIPT",null,null,loan.id(),loan.version(),null,null,null,null,null,null,null,"합성 대출 수령",null);var request=approved(l,t.id(),new EditRequest(l.row(t.id()).get("fingerprint").toString(),edit));
  e.db().update("update money_loans set version=version+1 where id=?",loan.id());assertThat(l.execute(t.id(),request).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.web().loan(loan.id()).remainingPrincipal()).isZero();assertThat(e.money().transaction(t.id()).type()).isEqualTo(TransactionType.INCOME);
  var expense=base.tx(e,a.id(),true,20,true);var original=draft(l,expense,"EXPENSE");var confirmed=approved(l,expense.id(),original);var changed=new MoneyUnifiedBookkeepingService.Edit(original.edit().requestId(),expense.version(),"TYPE","TRANSFER",null,null,null,null,null,null,null,null,null,null,null,"다른 변경",null);assertThat(l.execute(expense.id(),new EditRequest(original.fingerprint(),changed,confirmed.previewToken())).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().transaction(expense.id()).meaningState()).isEqualTo("UNRESOLVED");
 });}
 @Test void confirmingAnExistingTransferSupersedesPendingIntentAtANewVersion(){base.check(e->{
  var debit=base.account(e,AccountRole.SPENDING);var credit=base.account(e,AccountRole.INCOME_HUB);
  var transfer=e.product().save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,debit.id(),credit.id(),
      BigDecimal.TEN,MoneyUnifiedBookkeepingPostgresTest.AT,null,null,null,false,null,null));
  var l=ledger(e);
  var intent=l.financialType(transfer.id(),new FinancialType(UUID.randomUUID(),transfer.version(),"EXPENSE"));
  assertThat(intent.get("relationStatus")).isEqualTo("RELATION_CORRECTION_REQUIRED");
  var current=e.money().transaction(transfer.id());
  var request=approved(l,transfer.id(),draft(l,current,"TRANSFER"));
  assertThat(l.execute(transfer.id(),request).get("status")).isEqualTo("APPLIED");
  var row=l.row(transfer.id());assertThat(row.get("declaredFinancialType")).isEqualTo("TRANSFER");
  assertThat(row.get("version")).isEqualTo(current.version()+1);
  assertThat(row.get("from_account_id")).isEqualTo(debit.id());assertThat(row.get("to_account_id")).isEqualTo(credit.id());
  assertThatThrownBy(()->l.financialType(transfer.id(),new FinancialType(UUID.randomUUID(),current.version(),"UNRESOLVED")))
      .isInstanceOf(OptimisticLockConflictException.class);
 });}

 @Test void mappedCategoryPreservesCashAndRequestIdentityUntilAnOwnerVerifiesLoanSplit(){base.check(e->{
  UUID owner=MoneyPostgresIntegrationTest.OWNER;
  var a=base.account(e,AccountRole.SPENDING);
  e.db().queryForList("select money_seed_financial_categories(?)",owner);
  var category=e.product().categories().stream().filter(c->"LOAN_PAYMENT".equals(c.semanticCode())).findFirst().orElseThrow();
  var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",BigDecimal.valueOf(500),
      BigDecimal.valueOf(500),null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));
  var fact=base.tx(e,a.id(),true,100,false);
  var l=ledger(e);
  var request=new Category(UUID.randomUUID(),fact.version(),l.row(fact.id()).get("fingerprint").toString(),
      category.id(),0L,true,category.semanticPolicyVersion());
  var baseline=e.product().balance(a.id());
  assertThat(l.category(fact.id(),request)).containsEntry("status","APPLIED");
  assertThat(l.category(fact.id(),request)).containsEntry("status","APPLIED");
  var pending=l.row(fact.id());
  assertThat(pending).containsEntry("relationStatus","LOAN_SPLIT_PENDING").containsEntry("semanticCategoryId",category.id());
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("500");
  var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),((Number)pending.get("version")).longValue(),
      "TYPE","LOAN_PAYMENT",null,null,loan.id(),loan.version(),BigDecimal.valueOf(75),BigDecimal.valueOf(20),BigDecimal.valueOf(5),
      null,null,null,null,"합성 원금과 이자·수수료 확인",null);
  var draft=new EditRequest(pending.get("fingerprint").toString(),edit,null,category.id(),category.semanticPolicyVersion());
  var preview=l.preview(fact.id(),draft);
  assertThat(preview).containsEntry("status","APPLIED");
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("500");
  var execute=new EditRequest(draft.fingerprint(),edit,preview.get("previewToken").toString(),category.id(),category.semanticPolicyVersion());
  assertThat(l.execute(fact.id(),execute)).containsEntry("status","APPLIED");
  assertThat(l.execute(fact.id(),execute)).containsEntry("status","APPLIED");
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("425");
  assertThat(e.product().balance(a.id())).isEqualTo(baseline);
  assertThat(items(l.read("2026-09-01","2026-09-30",null,null,"ALL",null,10,0,"EXPENSE")))
      .extracting(r->r.get("id")).contains(fact.id());
  var json=JsonMapper.builder().build();var manager=new DataSourceTransactionManager(e.db().getDataSource());
  var reg=new MoneyRegistrationService(e.db(),()->owner,json,e.money(),new MoneyCommandService(e.db(),json,manager));
  assertThat(reg.impact(fact.id())).containsEntry("canDelete",false);
  var cancel=new MoneyRegistrationService.Change(UUID.randomUUID(),e.money().transaction(fact.id()).version(),null,loan.version(),true);
  assertThat(reg.change(fact.id(),cancel,false)).containsEntry("status","NOT_APPLIED");
  assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("425");
 });}
 @Test void semanticMappingRequiresAnOwnedActiveIdAndCurrentPolicyEvenAfterRename(){base.check(e->{
  UUID owner=MoneyPostgresIntegrationTest.OWNER;
  var a=base.account(e,AccountRole.INCOME_HUB);
  e.db().queryForList("select money_seed_financial_categories(?)",owner);
  var mapped=e.product().categories().stream().filter(c->"REFUND".equals(c.semanticCode())).findFirst().orElseThrow();
  e.db().update("update money_categories set name=? where id=?","원금 반환",mapped.id());
  var policy=new MoneyCategoryFinancialPolicy(e.db(),owner);
  assertThat(policy.resolve(mapped.id(),mapped.semanticPolicyVersion())).isEqualTo("REFUND");
  var custom=new MoneyCategories(e.db(),owner,JsonMapper.builder().build()).save(null,
      new MoneyProductService.CategoryInput("환불 금액","#64748b",false,null,"INCOME",null,99));
  assertThat(custom.semanticCode()).isNull();
  assertThatThrownBy(()->policy.resolve(custom.id(),1L)).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->policy.resolve(mapped.id(),0L)).isInstanceOf(OptimisticLockConflictException.class);
  var fact=base.tx(e,a.id(),false,50,false);
  policy.bind(fact.id(),UUID.randomUUID(),mapped.id(),1L,"INCOME");
  assertThat(e.money().transaction(fact.id()).type()).isEqualTo(TransactionType.REFUND);
  assertThat(ledger(e).row(fact.id())).containsEntry("relationStatus","REFUND_ORIGINAL_PENDING");
  assertThat(e.money().transaction(fact.id()).refundOf()).isNull();
  e.db().update("update money_categories set archived=true where id=?",mapped.id());
  assertThatThrownBy(()->policy.resolve(mapped.id(),1L)).isInstanceOf(InvalidRequestException.class);
 });}
}
