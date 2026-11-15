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
  assertThat(l.execute(t.id(),execute).get("status")).isEqualTo("APPLIED");assertThat(l.execute(t.id(),execute).get("status")).isEqualTo("APPLIED");assertThat(e.web().loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("100");assertThat(e.db().queryForObject("select count(*) from money_transactions",Integer.class)).isEqualTo(1);
  assertThat(items(read(l,null,50,0))).singleElement().satisfies(row->{assertThat(row.get("display_type")).isEqualTo("LOAN_RECEIPT");assertThat(row.get("categoryEligible")).isEqualTo(false);});
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
   var input=new Category(UUID.randomUUID(),t.version(),row.get("fingerprint").toString(),category.id(),((Number)book.get("classificationVersion")).longValue(),true);assertThat(l.category(t.id(),input).get("status")).isEqualTo("APPLIED");assertThat(l.category(t.id(),input).get("status")).isEqualTo("APPLIED");
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
  e.money().finishProcessing(raw.id(),ProcessingState.PROCESSED,"SYNTHETIC_VERSION_CHANGED");assertThat(l.execute(id,request).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().notification(raw.id()).rawPayload()).isEqualTo(payload);assertThat(e.money().transaction(id).meaningState()).isEqualTo("UNRESOLVED");assertThat(e.money().transaction(id).sources()).hasSize(1);assertThat(e.db().queryForObject("select count(*) from money_transactions",Integer.class)).isEqualTo(1);
 });}
 @Test void changedTargetLoanOrChangedDraftCannotReusePreviousPreview(){base.check(e->{
  var a=base.account(e,AccountRole.SPENDING);var t=base.tx(e,a.id(),false,100,true);var loan=e.web().saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","은행","PERSONAL",BigDecimal.valueOf(1000),BigDecimal.ZERO,null,null,null,null,a.id(),null,null,"ACTIVE",null,0L));var l=ledger(e);var edit=new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),t.version(),"TYPE","LOAN_RECEIPT",null,null,loan.id(),loan.version(),null,null,null,null,null,null,null,"합성 대출 수령",null);var request=approved(l,t.id(),new EditRequest(l.row(t.id()).get("fingerprint").toString(),edit));
  e.db().update("update money_loans set version=version+1 where id=?",loan.id());assertThat(l.execute(t.id(),request).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.web().loan(loan.id()).remainingPrincipal()).isZero();assertThat(e.money().transaction(t.id()).type()).isEqualTo(TransactionType.INCOME);
  var expense=base.tx(e,a.id(),true,20,true);var original=draft(l,expense,"EXPENSE");var confirmed=approved(l,expense.id(),original);var changed=new MoneyUnifiedBookkeepingService.Edit(original.edit().requestId(),expense.version(),"TYPE","TRANSFER",null,null,null,null,null,null,null,null,null,null,null,"다른 변경",null);assertThat(l.execute(expense.id(),new EditRequest(original.fingerprint(),changed,confirmed.previewToken())).get("status")).isEqualTo("NOT_APPLIED");assertThat(e.money().transaction(expense.id()).meaningState()).isEqualTo("UNRESOLVED");
 });}
}
