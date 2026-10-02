package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.math.BigDecimal;
import java.time.Instant;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyAiCategoryPostgresTest {
 @Test void fullMergeUpdatesEveryLiveReferenceAndPreservesFinancialFacts()throws Exception{new MoneyTrustPassPostgresTest().rollback(c->{
  var json=JsonMapper.builder().build();var meaning=new MoneyMeaningService(c.db(),()->c.owner(),json);var service=new MoneyAiCategoryService(c.db(),()->c.owner(),json,meaning);
  var from=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Fixture Coffee","#123456",false,null,"EXPENSE",null,0));var to=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Fixture Cafe","#654321",false,null,"EXPENSE",null,1));
  var account=c.money().createAccount(new AccountInput("IBK","Merge fixture",AccountRole.SPENDING,null,null));
  var rule=meaning.saveRule(null,new MoneyMeaningService.RuleInput("Merge rule",List.of(new MoneyRuleEngine.Condition("merchant","EXACT","Merge fixture merchant"),new MoneyRuleEngine.Condition("type","EXACT","EXPENSE")),from.id(),null,null,"ACTIVE",null));
  var t=c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account.id(),null,new BigDecimal("1234"),Instant.parse("2026-10-02T01:00:00Z"),"Merge fixture merchant",from.id(),"original",false,null,null,"original"));
  c.review().complete(new MoneyReviewService.Complete(List.of(new MoneyReviewService.Completion(t.id(),t.version(),0L,1L,Map.of("categoryId",from.id().toString())))));
  var unrelated=c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account.id(),null,new BigDecimal("3456"),Instant.parse("2026-10-02T02:00:00Z"),"Unrelated merchant",to.id(),"keep",false,null,null,"keep"));
  c.review().complete(new MoneyReviewService.Complete(List.of(new MoneyReviewService.Completion(unrelated.id(),unrelated.version(),0L,0L,Map.of("title","Unrelated display")))));
  String unrelatedDecision=c.db().queryForObject("select row_to_json(d)::text from money_review_decisions d where transaction_id=?",String.class,unrelated.id());
  var preview=service.preview(from.id(),to.id());assertThat(preview.get("count")).isEqualTo(1);assertThat((Map<String,Object>)preview.get("references")).containsEntry("facts",1).containsEntry("overrides",1).containsEntry("projections",1).containsEntry("decisions",1).containsEntry("rules",1);
  service.merge(from.id(),new MoneyAiCategoryService.Merge(to.id(),preview.get("fingerprint").toString(),true));var fact=c.money().transaction(t.id());assertThat(fact.amount()).isEqualTo(t.amount());assertThat(fact.fromAccountId()).isEqualTo(t.fromAccountId());assertThat(fact.occurredAt()).isEqualTo(t.occurredAt());assertThat(fact.title()).isEqualTo(t.title());assertThat(fact.categoryId()).isEqualTo(to.id());assertThat(c.web().bookkeepingRow(t.id()).get("categoryId")).isEqualTo(to.id());
  assertThat(c.db().queryForObject("select displayed->>'categoryId' from money_review_decisions where user_id=? and transaction_id=?",String.class,c.owner(),t.id())).isEqualTo(to.id().toString());assertThat(c.db().queryForObject("select category_id from money_category_rules where user_id=? and id=?",UUID.class,c.owner(),rule.get("id"))).isEqualTo(to.id());assertThat(c.product().categories().stream().filter(x->x.id().equals(from.id())).findFirst().orElseThrow().archived()).isTrue();
  assertThat(c.db().queryForObject("select row_to_json(d)::text from money_review_decisions d where transaction_id=?",String.class,unrelated.id())).isEqualTo(unrelatedDecision);
 });}
 @Test void concurrentReferenceOrStructureEditRejectsPreviewAndCrossKindIsRejected()throws Exception{new MoneyTrustPassPostgresTest().rollback(c->{var json=JsonMapper.builder().build();var service=new MoneyAiCategoryService(c.db(),()->c.owner(),json,new MoneyMeaningService(c.db(),()->c.owner(),json));var a=c.product().saveCategory(null,new MoneyProductService.CategoryInput("A","#123456",false,null,"EXPENSE",null,0));var b=c.product().saveCategory(null,new MoneyProductService.CategoryInput("B","#123456",false,null,"EXPENSE",null,1));var income=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Income","#123456",false,null,"INCOME",null,0));assertThatThrownBy(()->service.preview(a.id(),income.id())).isInstanceOf(InvalidRequestException.class);var preview=service.preview(a.id(),b.id());c.product().saveCategory(a.id(),new MoneyProductService.CategoryInput("Changed A","#123456",false,a.version(),"EXPENSE",null,0));assertThatThrownBy(()->service.merge(a.id(),new MoneyAiCategoryService.Merge(b.id(),preview.get("fingerprint").toString(),true))).isInstanceOf(InvalidRequestException.class);assertThat(c.product().categories().stream().filter(x->x.id().equals(a.id())).findFirst().orElseThrow().archived()).isFalse();});}
}
