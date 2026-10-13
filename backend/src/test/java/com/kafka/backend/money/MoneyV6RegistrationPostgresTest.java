package com.kafka.backend.money;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.math.BigDecimal;
import java.time.Instant;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55467/postgres.*")
class MoneyV6RegistrationPostgresTest {
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();MoneyRegistrationService service;
 @BeforeEach void setup()throws Exception{f.create();service=new MoneyRegistrationService(f.db,()->f.owner,f.json,f.money,f.commands);}
 @AfterEach void cleanup(){f.cleanup();}
 Map<String,Object> cancel(UUID id){return service.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(id).version(),null,null),false);}
 Map<String,Object> restore(UUID id,UUID event){return service.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(id).version(),event,null),true);}
 UUID cancellation(Map<String,Object> outcome){return UUID.fromString(((Map<?,?>)outcome.get("result")).get("cancellationId").toString());}
 @Test void cancelRestoreKeepsIdentityClassificationAndOriginalMemo(){
  UUID id=f.expense("원본 제목");var original=f.money.transaction(id);var item=new MoneyRecommendationService.SaveItem(id,null,null,f.category,f.service.current(id).get("stamp").toString(),false,null,false);
  f.service.save(new MoneyRecommendationService.Save(UUID.randomUUID(),List.of(item)));var state=f.classification.state(id);var book=f.web.bookkeepingRow(id);
  var outcome=cancel(id);assertThat(outcome).containsEntry("status","APPLIED");assertThat(f.money.transaction(id).excluded()).isTrue();assertThat(service.cancelled(null,null,null,null,f.category,0).get("total")).isEqualTo(1L);
  assertThat(f.web.bookkeeping("2026-09-01","2026-09-30","EXPENSE","",50,0,false,null,null,null,null,"ALL",null).get("total")).isEqualTo(0L);
  assertThat(f.service.drafts().get("total")).isEqualTo(0);assertThat(f.classification.state(id)).isEqualTo(state);
  assertThat(restore(id,cancellation(outcome))).containsEntry("status","APPLIED");assertThat(f.money.transaction(id).id()).isEqualTo(id);assertThat(f.money.transaction(id).amount()).isEqualByComparingTo(original.amount());assertThat(f.money.transaction(id).memo()).isEqualTo(original.memo());assertThat(f.web.bookkeepingRow(id).get("categoryId")).isEqualTo(book.get("categoryId"));assertThat(service.cancelled(null,null,null,null,null,0).get("total")).isEqualTo(0L);
  assertThat(f.classification.state(id)).isEqualTo(state);assertThat(f.service.preview(new MoneyRecommendationService.Preview("ONE",List.of(id),f.filters(),null)).get("total")).isEqualTo(0L);
 }
 @Test void idempotentOriginalRequestAndHashMismatch(){UUID id=f.expense("중복 클릭");var request=new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(id).version(),null,null);var result=service.change(id,request,false);assertThat(service.change(id,request,false)).isEqualTo(result);assertThat(service.history(id).get("items")).asList().hasSize(1);assertThatThrownBy(()->service.change(id,new MoneyRegistrationService.Change(request.requestId(),99L,null,null),false)).hasMessageContaining("식별자");}
 @Test void staleVersionCannotCancel(){UUID id=f.expense("버전");assertThat(service.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),99L,null,null),false)).containsEntry("status","NOT_APPLIED");assertThat(f.money.transaction(id).excluded()).isFalse();}
 @Test void foreignOwnerCannotCancel(){UUID id=f.expense("owner");UUID owner=UUID.randomUUID();f.db.update("insert into qa_fixture_users values(?)",owner);var foreign=new MoneyRegistrationService(f.db,()->owner,f.json,new MoneyService(f.db,()->owner,f.json),f.commands);assertThat(foreign.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),0L,null,null),false)).containsEntry("status","NOT_APPLIED");assertThat(f.money.transaction(id).excluded()).isFalse();}
 @Test void restoreCannotBeRepeatedOrUseOtherCancellation(){UUID id=f.expense("복원"),other=f.expense("다른 취소");UUID c=cancellation(cancel(id)),o=cancellation(cancel(other));assertThat(restore(id,o)).containsEntry("status","NOT_APPLIED");assertThat(restore(id,c)).containsEntry("status","APPLIED");assertThat(restore(id,c)).containsEntry("status","NOT_APPLIED");}
 @Test void unclassifiedRestorationIsExplicitAiEligibleAndRetainsDraft(){
  UUID id=f.expense("미분류");f.process(f.start(f.preview("ONE",List.of(id),null)));var draft=f.draft(id);UUID c=cancellation(cancel(id));assertThat(f.service.drafts().get("items")).asList().hasSize(1);assertThat(restore(id,c)).containsEntry("status","APPLIED");assertThat(f.draft(id).get("conflict")).isEqualTo(true);assertThat(f.draft(id).get("active")).isEqualTo(draft.get("active"));assertThat(f.money.transaction(id).categoryId()).isNull();assertThat(f.calls.get()).isEqualTo(1);
 }
 @Test void canonicalTransferBothDirectionsStayTogether(){
  UUID other=f.money.createAccount(new AccountInput("IBK","도착",AccountRole.SAVINGS,null,null)).id();
  UUID id=f.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,f.account,other,new BigDecimal("500"),Instant.parse("2026-09-16T01:00:00Z"),"양쪽 이체",null,null,false,null,null,"이체")).id();
  var original=f.money.transaction(id);UUID c=cancellation(cancel(id));assertThat(f.money.transaction(id).excluded()).isTrue();assertThat(restore(id,c)).containsEntry("status","APPLIED");var restored=f.money.transaction(id);assertThat(restored.fromAccountId()).isEqualTo(original.fromAccountId());assertThat(restored.toAccountId()).isEqualTo(other);assertThat(restored.id()).isEqualTo(id);
 }
 @Test void activeRefundProtectsOriginalAndRestoreChecksRemaining(){
  UUID id=f.expense("원 지출");UUID refund=f.product.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,f.account,new BigDecimal("100"),Instant.parse("2026-09-16T01:00:00Z"),"환불",null,null,false,id,null,"연결 환불")).id();
  assertThat(cancel(id)).containsEntry("status","NOT_APPLIED");UUID rc=cancellation(cancel(refund)),c=cancellation(cancel(id));assertThat(restore(refund,rc)).containsEntry("status","NOT_APPLIED");assertThat(restore(id,c)).containsEntry("status","APPLIED");assertThat(restore(refund,rc)).containsEntry("status","APPLIED");
 }
 @Test void externalMutationAfterCancelCannotBeRestored(){UUID id=f.expense("외부 수정");UUID c=cancellation(cancel(id));f.db.update("update money_transactions set version=version+1 where id=?",id);assertThat(service.cancelled(null,null,null,null,null,0).get("total")).isEqualTo(1L);assertThat(restore(id,c)).containsEntry("status","NOT_APPLIED");}
 @Test void sourceAndReviewCompletionNeverReopened(){
  UUID id=f.expense("검토 완료");var book=f.web.bookkeepingRow(id);f.db.update("insert into money_review_decisions(user_id,transaction_id,transaction_version,override_version,projection_version,displayed) values(?,?,?,?,?,'{}')",f.owner,id,book.get("transactionVersion"),book.get("version"),book.get("projectionVersion"));
  var at=f.db.queryForObject("select completed_at from money_review_decisions where transaction_id=?",java.sql.Timestamp.class,id);UUID c=cancellation(cancel(id));restore(id,c);assertThat(f.db.queryForObject("select completed_at from money_review_decisions where transaction_id=?",java.sql.Timestamp.class,id)).isEqualTo(at);assertThat(f.db.queryForObject("select transaction_version from money_review_decisions where transaction_id=?",Long.class,id)).isEqualTo(f.money.transaction(id).version());
 }
 @Test void archiveSearchDatesAccountAndCategoryAreScoped(){UUID id=f.expense("검색 제목");cancel(id);assertThat(service.cancelled("검색","2026-09-15","2026-09-15",f.account,null,0).get("total")).isEqualTo(1L);assertThat(service.cancelled("다른",null,null,null,null,0).get("total")).isEqualTo(0L);assertThat(service.cancelled(null,"2026-09-16",null,null,null,0).get("total")).isEqualTo(0L);}

 @Test void loanPrincipalCancellationAndRestorationAreAtomic(){
  var loan=f.web.saveLoan(null,new MoneyWebTypes.LoanInput("합성 대출","합성 기관","CREDIT",new BigDecimal("1000"),new BigDecimal("700"),null,null,null,null,f.account,null,null,"ACTIVE",null,0L));
  var financial=new MoneyFinancialService(f.db,()->f.owner,f.money,f.product,f.web,f.json);
  var payment=new org.springframework.transaction.support.TransactionTemplate(f.manager).execute(status->financial.payment(null,new MoneyFinancialService.PaymentInput(loan.id(),f.account,new BigDecimal("110"),new BigDecimal("100"),new BigDecimal("10"),BigDecimal.ZERO,Instant.parse("2026-09-16T01:00:00Z"),"보존 상환",null,loan.version())));
  assertThat(f.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("600");
  var cancelled=service.change(payment.id(),new MoneyRegistrationService.Change(UUID.randomUUID(),payment.version(),null,f.web.loan(loan.id()).version()),false);
  assertThat(cancelled).containsEntry("status","APPLIED");assertThat(f.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("700");
  assertThat(service.change(payment.id(),new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(payment.id()).version(),cancellation(cancelled),f.web.loan(loan.id()).version()),true)).containsEntry("status","APPLIED");
  assertThat(f.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("600");
 }
 @Test void staleLoanVersionRollsBackFactAndLoan(){var loan=f.web.saveLoan(null,new MoneyWebTypes.LoanInput("대출","기관","CREDIT",null,new BigDecimal("700"),null,null,null,null,f.account,null,null,"ACTIVE",null,0L));UUID id=f.expense("상환");f.db.update("update money_transactions set type='LOAN_PAYMENT',loan_id=?,principal=100,interest=900,fee=0 where id=?",loan.id(),id);assertThat(service.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(id).version(),null,999L),false)).containsEntry("status","NOT_APPLIED");assertThat(f.money.transaction(id).excluded()).isFalse();assertThat(f.web.loan(loan.id()).remainingPrincipal()).isEqualByComparingTo("700");}

 @Test void matchedTransferCancellationNeverReactivatesMergedSourceLegs(){
  UUID out=f.expense("출금 leg"),other=f.money.createAccount(new AccountInput("IBK","입금 계좌",AccountRole.SAVINGS,null,null)).id();
  UUID in=f.product.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,other,new BigDecimal("1000"),Instant.parse("2026-09-15T01:00:00Z"),"입금 leg",null,null,false,null,null,"입금")).id();
  var canonical=new org.springframework.transaction.support.TransactionTemplate(f.manager).execute(status->f.product.link(out,new MoneyProductService.Pair(in,f.money.transaction(out).version(),f.money.transaction(in).version())));
  UUID c=cancellation(cancel(canonical.id()));assertThat(restore(canonical.id(),c)).containsEntry("status","APPLIED");assertThat(f.money.transaction(out).excluded()).isFalse();assertThat(f.money.transaction(out).type()).isEqualTo(TransactionType.TRANSFER);assertThat(f.money.transaction(in).excluded()).isTrue();assertThat(f.money.transaction(out).mergedInto()).isNull();assertThat(f.money.transaction(in).mergedInto()).isEqualTo(canonical.id());
 }
 @Test void newLoanCancellationConstraintKeepsSplitAndBalanceAnchorGuards(){
  UUID id=f.expense("형태 보호");assertThatThrownBy(()->f.db.update("update money_transactions set type='LOAN_PAYMENT',excluded=true where id=?",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThatThrownBy(()->f.db.update("update money_transactions set type='INITIAL_BALANCE',from_account_id=null,to_account_id=?,excluded=true where id=?",f.account,id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
 }

 @Test void cancellationDuringProviderReturnKeepsCostOutcomeAndDoesNotClassify(){
  UUID id=f.expense("새로운 취소 중 구매");var provider=new MoneyClassificationProvider(){
   public Quote quote(Map<String,Object> input){return f.quoteReady();}
   public Result classify(Map<String,Object> input){assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();assertThat(cancel(id)).containsEntry("status","APPLIED");return new Result(f.category,"보존된 미확정 결과","MOCK","mock",null,100L,30L,"synthetic-cancel-return");}
  };
  var recommendation=f.service(provider,BigDecimal.ONE,BigDecimal.TEN,false);var preview=recommendation.preview(new MoneyRecommendationService.Preview("ONE",List.of(id),f.filters(),null));UUID run=(UUID)preview.get("id");
  recommendation.start(new MoneyRecommendationService.Start(UUID.randomUUID(),run,preview.get("fingerprint").toString(),MoneyRecommendationService.POLICY,true));UUID item=(UUID)((List<Map<String,Object>>)recommendation.items(run,0).get("items")).getFirst().get("id");recommendation.process(f.owner,item);
  assertThat(f.db.queryForObject("select status from money_recommendation_items where id=?",String.class,item)).isEqualTo("PROTECTED");assertThat(f.db.queryForObject("select status from money_recommendation_usage where item_id=?",String.class,item)).isEqualTo("ACTUAL");assertThat(f.classification.state(id).get("version")).isEqualTo(0L);assertThat(f.money.transaction(id).excluded()).isTrue();assertThat(f.db.queryForObject("select count(*) from money_classification_events",Long.class)).isZero();
 }

 @Test void cancelledChoiceCannotAbortAnotherEligibleSaveAndKeepsItsSelection(){
  UUID inactive=f.expense("취소 선택"),active=f.expense("활성 선택");var i=new MoneyRecommendationService.SaveItem(inactive,null,null,f.category,f.service.current(inactive).get("stamp").toString(),false,null,false);var a=new MoneyRecommendationService.SaveItem(active,null,null,f.category,f.service.current(active).get("stamp").toString(),false,null,false);
  f.service.choose(new MoneyRecommendationService.Choice(UUID.randomUUID(),i));cancel(inactive);var result=f.service.save(new MoneyRecommendationService.Save(UUID.randomUUID(),List.of(i,a)));var outcomes=(List<Map<String,Object>>)result.get("items");
  assertThat(outcomes).filteredOn(r->inactive.equals(r.get("transactionId"))).extracting(r->r.get("status")).containsExactly("FAILED_KNOWN");assertThat(outcomes).filteredOn(r->active.equals(r.get("transactionId"))).extracting(r->r.get("status")).containsExactly("SAVED");assertThat(f.service.choices().get("items")).asList().hasSize(1);
 }
 @Test void archiveUsesEffectiveSavedCategoryAndExplicitNullMemo(){
  UUID id=f.expense("분류 원본");f.db.update("update money_transactions set category_id=? where id=?",f.category,id);f.classification.edit(new MoneyClassificationService.Edit(UUID.randomUUID(),id,0L,0L,0L,new java.util.HashMap<>(Map.of("memo","이후 버릴 메모")),List.of()));
  var book=f.web.bookkeepingRow(id);var patch=new java.util.HashMap<String,Object>();patch.put("memo",null);patch.put("categoryId",f.otherCategory);
  f.classification.edit(new MoneyClassificationService.Edit(UUID.randomUUID(),id,((Number)book.get("transactionVersion")).longValue(),((Number)book.get("version")).longValue(),((Number)book.get("projectionVersion")).longValue(),patch,List.of()));cancel(id);
  var items=(List<Map<String,Object>>)service.cancelled(null,null,null,null,f.otherCategory,0).get("items");assertThat(items).hasSize(1);assertThat(items.getFirst().get("memo")).isNull();assertThat(items.getFirst().get("categoryId")).isEqualTo(f.otherCategory);
 }
}
