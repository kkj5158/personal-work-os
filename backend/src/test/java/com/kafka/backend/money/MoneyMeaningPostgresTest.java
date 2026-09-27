package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import com.kafka.backend.common.*;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyMeaningService.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyMeaningPostgresTest {
 final MoneyWebPostgresTest helper=new MoneyWebPostgresTest();
 MoneyMeaningService meaning(org.springframework.jdbc.core.JdbcTemplate db){return new MoneyMeaningService(db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build());}
 RuleInput rule(String title,UUID category,String merchant){return new RuleInput(title,List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE"),new MoneyRuleEngine.Condition("merchant","CONTAINS",merchant)),category,title,null,"ACTIVE",null);}
 @Test void trackingIsIndependentBoundedAndNeverSelectsNewAccounts()throws Exception{helper.rollback((m,p,w,db)->{
  var service=meaning(db);var a=helper.account(m,AccountRole.SPENDING);var b=helper.account(m,AccountRole.INCOME_HUB);
  var tx=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"A",null,null));
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
  service.saveTracking(new TrackingInput(List.of(a.id()),List.of(b.id()),0L));helper.account(m,AccountRole.SPENDING);
  assertThat(service.tracking().get("expense")).isEqualTo(List.of(a.id()));assertThat(service.tracking().get("income")).isEqualTo(List.of(b.id()));
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(1L);
  assertThatThrownBy(()->service.saveTracking(new TrackingInput(Collections.nCopies(6,a.id()),List.of(),1L))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->service.saveTracking(new TrackingInput(List.of(UUID.randomUUID()),List.of(),1L))).isInstanceOf(InvalidRequestException.class);
  service.saveTracking(new TrackingInput(List.of(),List.of(),1L));assertThat(m.transaction(tx.id()).amount()).isEqualByComparingTo("100");
  assertThatThrownBy(()->service.saveTracking(new TrackingInput(List.of(),List.of(),1L))).isInstanceOf(OptimisticLockConflictException.class);
 });}
 @Test void refundUsesOriginalExpenseTrackingAndCategory()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);var b=helper.account(m,AccountRole.INCOME_HUB);var service=meaning(db);service.saveTracking(new TrackingInput(List.of(a.id()),List.of(b.id()),0L));
  var expense=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Expense",null,null));
  p.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,b.id(),new BigDecimal("40"),helper.at,null,null,null,false,expense.id(),null));
  assertThat((BigDecimal)((Map<?,?>)w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("summary")).get("total")).isEqualByComparingTo("60");
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","INCOME",null,50,0,false).get("total")).isEqualTo(0L);
 });}
 @Test void refundRespectsExplicitlyClearedOriginalCategory()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);var category=p.initializeCategories().stream().filter(c->c.kind().equals("EXPENSE")).findFirst().orElseThrow();
  var expense=p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),helper.at,null,category.id(),null,false,null,null));
  var refund=p.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,a.id(),new BigDecimal("40"),helper.at,null,null,null,false,expense.id(),null));
  assertThat(w.bookkeepingRow(refund.id()).get("categoryId")).isEqualTo(category.id());
  var overrides=new HashMap<String,Object>();overrides.put("categoryId",null);w.saveBookkeeping(expense.id(),new MoneyWebTypes.BookkeepingEdit(0L,0L,overrides));
  assertThat(w.bookkeepingRow(refund.id()).get("categoryId")).isNull();assertThat(m.transaction(expense.id()).categoryId()).isEqualTo(category.id());
 });}
 @Test void legacyCategoryMetadataAndInactiveCreationArePreserved()throws Exception{helper.rollback((m,p,w,db)->{
  var category=p.saveCategory(null,new MoneyProductService.CategoryInput("Archived","#4FAF83",true,null,"INCOME","*",12));assertThat(category.archived()).isTrue();
  var updated=p.saveCategory(category.id(),new MoneyProductService.CategoryInput("Renamed",category.color(),false,category.version(),null,null,null));
  assertThat(updated.kind()).isEqualTo("INCOME");assertThat(updated.emoji()).isEqualTo("*");assertThat(updated.sortOrder()).isEqualTo(12);
 });}
 @Test void filtersAndTotalsUseSameTrackedSubset()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);meaning(db).saveTracking(new TrackingInput(List.of(a.id()),List.of(),0L));
  p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"A",null,null));p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,500,"B",null,null));
  var filtered=w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,a.id().toString(),"uncategorized",new BigDecimal("200"),new BigDecimal("600"));
  assertThat(filtered.get("total")).isEqualTo(1L);assertThat((BigDecimal)((Map<?,?>)filtered.get("summary")).get("total")).isEqualByComparingTo("500");
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,"none",null,null,null).get("total")).isEqualTo(0L);
 });}
 @Test void defaultsAreTypedIdempotentAndHistorySafe()throws Exception{helper.rollback((m,p,w,db)->{
  var cats=p.initializeCategories();assertThat(cats.stream().filter(c->c.kind().equals("EXPENSE"))).hasSize(15);assertThat(cats.stream().filter(c->c.kind().equals("INCOME"))).hasSize(6);assertThat(p.initializeCategories()).hasSize(21);
  var c=cats.getFirst();var updated=p.saveCategory(c.id(),new MoneyProductService.CategoryInput(c.name(),c.color(),true,c.version(),c.kind(),"•",20));assertThat(updated.archived()).isTrue();assertThat(updated.seeded()).isTrue();
 });}
 @Test void rulesAreFutureOnlyAndFieldPriorityDoesNotOverwriteSourceOrUserOverride()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);var service=meaning(db);var before=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Source",null,null));
  var r1=service.saveRule(null,rule("Priority",null,"synthetic"));service.saveRule(null,new RuleInput("Memo",List.of(new MoneyRuleEngine.Condition("merchant","STARTS_WITH","Synthetic")),null,"Lower title","Combined memo","ACTIVE",null));
  assertThat(w.bookkeepingRow(before.id()).get("title")).isEqualTo("Source");
  var after=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Source",null,null));assertThat(m.transaction(after.id()).title()).isEqualTo("Source");assertThat(w.bookkeepingRow(after.id()).get("title")).isEqualTo("Priority");assertThat(w.bookkeepingRow(after.id()).get("memo")).isEqualTo("Combined memo");
  w.saveBookkeeping(after.id(),new MoneyWebTypes.BookkeepingEdit(0L,0L,Map.of("title","Owner title"),1L));
  var preview=service.preview(new HistoryRequest("2026-09-01","2026-09-30",null));assertThat(preview.get("count")).isEqualTo(1);
  service.applyHistory(new HistoryRequest("2026-09-01","2026-09-30",preview.get("fingerprint").toString()));assertThat(w.bookkeepingRow(after.id()).get("title")).isEqualTo("Owner title");assertThat(m.transaction(before.id()).title()).isEqualTo("Source");
  w.saveBookkeeping(after.id(),new MoneyWebTypes.BookkeepingEdit(1L,0L,Map.of(),1L));assertThat(w.bookkeepingRow(after.id()).get("title")).isEqualTo("Priority");
 });}
 @Test void historyRejectsStalePreviewAndReorderingIsVersioned()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);var service=meaning(db);p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Source",null,null));
  var one=service.saveRule(null,rule("One",null,"synthetic"));var two=service.saveRule(null,rule("Two",null,"synthetic"));var preview=service.preview(new HistoryRequest("2026-09-01","2026-09-30",null));
  service.reorder(new RuleOrder(List.of((UUID)two.get("id"),(UUID)one.get("id")),Map.of((UUID)one.get("id"),1L,(UUID)two.get("id"),1L)));
  assertThatThrownBy(()->service.applyHistory(new HistoryRequest("2026-09-01","2026-09-30",preview.get("fingerprint").toString()))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void invalidRuleActionsAndForeignOwnerReferencesAreRejected()throws Exception{helper.rollback((m,p,w,db)->{
  var service=meaning(db);assertThatThrownBy(()->service.saveRule(null,new RuleInput("Invalid",List.of(new MoneyRuleEngine.Condition("amount","EXACT","1")),null,"X",null,"ACTIVE",null))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->service.saveRule(null,rule("Other",UUID.randomUUID(),"x"))).isInstanceOf(InvalidRequestException.class);
  var other=new MoneyMeaningService(db,UUID::randomUUID,JsonMapper.builder().build());assertThat(other.rules()).isEmpty();assertThat(other.tracking().get("expense")).isEqualTo(List.of());
 });}
 @Test void pausedRulesAndWrongCategoryKindDoNotApply()throws Exception{helper.rollback((m,p,w,db)->{
  var service=meaning(db);var income=p.initializeCategories().stream().filter(c->c.kind().equals("INCOME")).findFirst().orElseThrow();assertThatThrownBy(()->service.saveRule(null,rule("Wrong",income.id(),"x"))).isInstanceOf(InvalidRequestException.class);
  var r=service.saveRule(null,new RuleInput("Paused",List.of(new MoneyRuleEngine.Condition("merchant","CONTAINS","Synthetic")),null,"Never",null,"PAUSED",null));var a=helper.account(m,AccountRole.SPENDING);var tx=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Source",null,null));assertThat(w.bookkeepingRow(tx.id()).get("title")).isEqualTo("Source");
 });}
 @Test void reviewCompletionPersistsDisplayedMeaningWithoutInventingRulesOrChangingLedger()throws Exception{helper.rollback((m,p,w,db)->{
  var a=helper.account(m,AccountRole.SPENDING);var tx=p.save(null,helper.entry(TransactionType.EXPENSE,a.id(),null,100,"Source",null,null));var service=meaning(db);var review=new MoneyReviewService(db,()->MoneyPostgresIntegrationTest.OWNER,w,p,service,JsonMapper.builder().build());
  assertThat(review.queue(null,null,null,null,null,null,50,0).get("total")).isEqualTo(1L);
  review.complete(new MoneyReviewService.Complete(List.of(new MoneyReviewService.Completion(tx.id(),0L,0L,0L,Map.of("title","Confirmed")))));
  assertThat(review.queue(null,null,null,null,null,null,50,0).get("total")).isEqualTo(0L);assertThat(review.queue(null,null,null,"COMPLETED",null,null,50,0).get("total")).isEqualTo(1L);
  assertThat(m.transaction(tx.id()).title()).isEqualTo("Source");assertThat(service.rules()).isEmpty();assertThat(service.history(tx.id())).hasSize(2);
 });}
}
