package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Controlled fixtures in an isolated synthetic owner; every mutation is rolled back. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyAiPostgresTest {
 private final MoneyTrustPassPostgresTest helper=new MoneyTrustPassPostgresTest();
 private MoneyAiService ai(MoneyTrustPassPostgresTest.Ctx c){var json=JsonMapper.builder().build();return new MoneyAiService(c.db(),()->c.owner(),json,c.review(),c.web(),c.product(),c.money(),new MoneyMeaningService(c.db(),()->c.owner(),json));}
 private MoneyAccount account(MoneyTrustPassPostgresTest.Ctx c,String name){return c.money().createAccount(new AccountInput("IBK",name,AccountRole.SPENDING,null,null));}
 private MoneyTransaction expense(MoneyTrustPassPostgresTest.Ctx c,UUID account,String merchant){return c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account,null,new BigDecimal("1000"),Instant.parse("2026-10-02T01:00:00Z"),merchant,null,"source memo",false,null,null,"source title"));}
 private MoneyAiService.Decision decision(UUID id,String action,long override,Map<String,Object> edits){return new MoneyAiService.Decision(id,"TRANSACTION",action,0L,override,0L,null,edits,"fixture explanation");}
 private List<Map<String,Object>> items(Map<String,Object> result){return (List<Map<String,Object>>)result.get("items");}
 @Test void confirmedHistorySuggestsButNeverChangesLedgerAndUndoRemovesLearning()throws Exception{helper.rollback(c->{
  var ai=ai(c);var account=account(c,"AI fixture account");var category=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Fixture cafe","#123456",false,null,"EXPENSE",null,0));
  var one=expense(c,account.id(),"Fixture Coffee Shop");var two=expense(c,account.id(),"Fixture Coffee Shop");
  var deferred=ai.decide(decision(two.id(),"DEFER",0,Map.of()));assertThat(c.money().transaction(two.id())).isEqualTo(two);
  assertThat(((Map<?,?>)ai.item(one.id(),"TRANSACTION",false).get("proposal")).get("basis")).isEqualTo("NONE");
  var confirmed=ai.decide(decision(one.id(),"CONFIRM",0,Map.of("categoryId",category.id().toString())));
  assertThat(c.money().transaction(one.id())).isEqualTo(one);assertThat(c.web().bookkeepingRow(one.id()).get("categoryId")).isEqualTo(category.id());
  var proposal=(Map<?,?>)ai.item(two.id(),"TRANSACTION",false).get("proposal");assertThat(proposal.get("basis")).isEqualTo("CONFIRMED_HISTORY");assertThat(proposal.get("categoryId")).isEqualTo(category.id().toString());
  ai.undo((UUID)confirmed.get("eventId"));assertThat(c.web().bookkeepingRow(one.id()).get("categoryId")).isNull();assertThat(c.money().transaction(one.id())).isEqualTo(one);
  assertThat(((Map<?,?>)ai.item(two.id(),"TRANSACTION",false).get("proposal")).get("basis")).isEqualTo("NONE");
  assertThat(c.db().queryForObject("select active from money_ai_events where id=?",Boolean.class,confirmed.get("eventId"))).isFalse();
  assertThat(items(ai.workbench("DEFERRED",null,null,null,50,0))).extracting(r->r.get("id")).contains(two.id());
 });}
 @Test void laterOverrideMakesUndoConflictAndCannotBeOverwritten()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI undo fixture");var tx=expense(c,a.id(),"Independent merchant");var decision=ai.decide(decision(tx.id(),"CONFIRM",0,Map.of("title","confirmed")));
  c.web().saveBookkeeping(tx.id(),new MoneyWebTypes.BookkeepingEdit(1L,0L,Map.of("title","later edit"),0L));
  assertThatThrownBy(()->ai.undo((UUID)decision.get("eventId"))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(c.web().bookkeepingRow(tx.id()).get("title")).isEqualTo("later edit");assertThat(ai.item(tx.id(),"TRANSACTION",false).get("canUndo")).isEqualTo(false);
 });}
 @Test void undoRestoresAnExistingUserDecisionAndCompletedHistory()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI prior decision");var tx=expense(c,a.id(),"Previous decision merchant");
  c.review().complete(new MoneyReviewService.Complete(List.of(new MoneyReviewService.Completion(tx.id(),0L,0L,0L,Map.of("title","previous user title")))));
  var result=ai.decide(decision(tx.id(),"CONFIRM",1,Map.of("title","new decision")));ai.undo((UUID)result.get("eventId"));
  assertThat(c.web().bookkeepingRow(tx.id()).get("title")).isEqualTo("previous user title");assertThat(c.db().queryForObject("select count(*) from money_review_decisions where user_id=? and transaction_id=?",Long.class,c.owner(),tx.id())).isEqualTo(1L);
  assertThat(items(ai.workbench("COMPLETED",null,null,null,50,0))).extracting(r->r.get("id")).contains(tx.id());assertThat(c.money().transaction(tx.id()).title()).isEqualTo("source title");
 });}
 @Test void bookedNontransactionIsAnAuditedCorrectionAndRecoveryPreservesOriginalFacts()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI correction fixture");var tx=c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("1000.25"),Instant.parse("2026-10-02T01:00:00Z"),"Wrongly booked info",null,"source memo",false,null,null,"source title"));
  var preview=new MoneyNonTransactionPreview(c.db(),()->c.owner(),c.money(),c.product(),c.web(),JsonMapper.builder().build()).preview(new MoneyNonTransactionPreview.Input("TRANSACTION",tx.id(),0L,0L,0L));
  var result=ai.decide(new MoneyAiService.Decision(tx.id(),"TRANSACTION","NON_TRANSACTION",0L,0L,0L,null,Map.of(),"fixture explanation",preview.get("fingerprint").toString()));assertThat(c.money().transaction(tx.id()).excluded()).isTrue();
  assertThat(items(ai.workbench("COMPLETED","NOISE",null,null,50,0))).extracting(r->r.get("id")).contains(tx.id());ai.undo((UUID)result.get("eventId"));
  var restored=c.money().transaction(tx.id());assertThat(restored.excluded()).isFalse();assertThat(restored.title()).isEqualTo(tx.title());assertThat(restored.amount()).isEqualByComparingTo("1000.25");assertThat(restored.fromAccountId()).isEqualTo(a.id());assertThat(restored.occurredAt()).isEqualTo(tx.occurredAt());assertThat(restored.memo()).isEqualTo(tx.memo());assertThat(c.product().corrections(tx.id())).hasSize(2);
 });}
 @Test void intermediaryIsNotPersonalizedAndMerchantIdentityDoesNotRecategorize()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI identity fixture");var tx=expense(c,a.id(),"네이버페이");
  assertThat(((Map<?,?>)ai.item(tx.id(),"TRANSACTION",false).get("proposal")).get("basis")).isEqualTo("NONE");
  assertThatThrownBy(()->ai.merchant(new MoneyAiService.MerchantInput(null,"네이버페이","One cafe",null,List.of(),null))).isInstanceOf(InvalidRequestException.class);
  var identity=ai.merchant(new MoneyAiService.MerchantInput(null,"Naverpay Fixture Cafe","Fixture Cafe","Seoul",List.of("Fixture cafe branch"),null));
  assertThat(identity.get("version")).isEqualTo(1L);assertThat(c.money().transaction(tx.id())).isEqualTo(tx);assertThat(c.review().queue(null,null,null,null,null,null,50,0).get("total")).isEqualTo(1L);
 });}
 @Test void nontransactionKeepsRawAndUndoRestoresWithoutCreatingLedger()throws Exception{helper.rollback(c->{
  var ai=ai(c);var raw=c.money().ingest(Map.of("title","Uncertain information","text","Please check","postedAt",Instant.now().toString(),"idempotencyKey",UUID.randomUUID().toString())).notification();
  c.money().finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"UNRECOGNIZED_SHAPE");var before=c.money().notification(raw.id());
  var response=ai.decide(new MoneyAiService.Decision(raw.id(),"RAW","NON_TRANSACTION",null,null,null,before.processingVersion(),null,null));
  assertThat(c.money().notification(raw.id()).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(c.db().queryForObject("select count(*) from money_transactions where user_id=?",Long.class,c.owner())).isZero();
  assertThat(items(ai.workbench("COMPLETED","NOISE",null,null,50,0))).extracting(r->r.get("id")).contains(raw.id());
  ai.undo((UUID)response.get("eventId"));assertThat(c.money().notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);assertThat(c.money().notification(raw.id()).rawPayload()).isEqualTo(raw.rawPayload());
 });}
 @Test void transferApprovalReusesTwoFactsIsIdempotentAndCannotReuseMatchedLeg()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI transfer source");var b=account(c,"AI transfer destination");var out=expense(c,a.id(),"Owned transfer");var in=c.product().save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,b.id(),out.amount(),out.occurredAt().plusSeconds(10),"Owned transfer",null,null,false,null,null));
  assertThat(items(ai.transfers())).hasSize(1);var request=new MoneyAiService.TransferInput(out.id(),in.id(),0L,0L,"fixture-key");var response=ai.confirmTransfer(request);ai.confirmTransfer(request);
  assertThat(c.db().queryForObject("select count(*) from money_transactions where user_id=?",Long.class,c.owner())).isEqualTo(2L);assertThat(c.money().transaction(out.id()).type()).isEqualTo(TransactionType.TRANSFER);assertThat(c.money().transaction(in.id()).mergedInto()).isEqualTo(out.id());
  assertThat(c.db().queryForObject("select count(*) from money_ai_events where user_id=? and kind='TRANSFER_CONFIRM'",Long.class,c.owner())).isEqualTo(1L);assertThat(items(ai.transfers())).isEmpty();
  assertThatThrownBy(()->ai.confirmTransfer(new MoneyAiService.TransferInput(out.id(),in.id(),1L,1L,"new-key"))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void deferringATransferRemovesItFromWaitingUntilReopened()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI transfer deferred source");var b=account(c,"AI transfer deferred destination");var out=expense(c,a.id(),"Owned transfer deferred");c.product().save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,b.id(),out.amount(),out.occurredAt(),"Owned transfer deferred",null,null,false,null,null));
  assertThat(items(ai.transfers())).hasSize(1);ai.decide(decision(out.id(),"DEFER",0,Map.of()));assertThat(items(ai.transfers())).isEmpty();assertThat(items(ai.workbench("DEFERRED","TRANSFER",null,null,50,0))).extracting(r->r.get("id")).contains(out.id());
  ai.decide(decision(out.id(),"REOPEN",0,Map.of()));assertThat(items(ai.transfers())).hasSize(1);assertThat(c.money().transaction(out.id())).isEqualTo(out);
 });}
 @Test void moneyAiIsOwnerScopedAndAutomaticPermissionDefaultsOff()throws Exception{helper.rollback(c->{
  var ai=ai(c);var a=account(c,"AI owner fixture");var tx=expense(c,a.id(),"Owner merchant");var json=JsonMapper.builder().build();var other=UUID.randomUUID();
  var outsiderMoney=MoneyPostgresIntegrationTest.service(c.db(),other);var outsiderProduct=new MoneyProductService(c.db(),()->other,outsiderMoney,json);var outsiderWeb=new MoneyWebService(c.db(),()->other,outsiderMoney,outsiderProduct,json);var outsiderMeaning=new MoneyMeaningService(c.db(),()->other,json);var outsiderReview=new MoneyReviewService(c.db(),()->other,outsiderWeb,outsiderProduct,outsiderMeaning,json);var outsider=new MoneyAiService(c.db(),()->other,json,outsiderReview,outsiderWeb,outsiderProduct,outsiderMoney,outsiderMeaning);
  assertThat(outsider.workbench("PENDING",null,null,null,50,0).get("total")).isEqualTo(0L);assertThatThrownBy(()->outsider.item(tx.id(),"TRANSACTION",true)).isInstanceOf(ResourceNotFoundException.class);
  assertThat(ai.settings().get("automaticRules")).isEqualTo(false);assertThat(ai.settings().get("externalLookup")).isEqualTo(false);
  ai.settings(new MoneyAiService.SettingsInput(0L,true,true));assertThat(ai.settings().get("automaticRules")).isEqualTo(true);assertThat(c.money().transaction(tx.id())).isEqualTo(tx);
 });}
}
