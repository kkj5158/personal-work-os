package com.kafka.backend.money;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Synthetic owner and fixtures, rolled back by the shared helper; no live-provider assertions. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyAiAutomationPostgresTest {
 private final MoneyTrustPassPostgresTest helper=new MoneyTrustPassPostgresTest();
 private MoneyAiService ai(MoneyTrustPassPostgresTest.Ctx c){var json=JsonMapper.builder().build();return new MoneyAiService(c.db(),()->c.owner(),json,c.review(),c.web(),c.product(),c.money(),new MoneyMeaningService(c.db(),()->c.owner(),json));}
 private MoneyMeaningService meaning(MoneyTrustPassPostgresTest.Ctx c){return new MoneyMeaningService(c.db(),()->c.owner(),JsonMapper.builder().build());}
 private MoneyAccount account(MoneyTrustPassPostgresTest.Ctx c,String name){return c.money().createAccount(new AccountInput("IBK",name,AccountRole.SPENDING,null,null));}
 private MoneyTransaction expense(MoneyTrustPassPostgresTest.Ctx c,UUID account,String merchant){return c.product().save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account,null,new BigDecimal("1234.25"),Instant.parse("2026-10-02T01:00:00Z"),merchant,null,"source memo",false,null,null,"source title"));}
 private MoneyMeaningService.RuleInput rule(UUID account,String descriptor,UUID category,List<MoneyRuleEngine.Condition> extra,Long version){
  var conditions=new ArrayList<>(List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE"),new MoneyRuleEngine.Condition("accountId","EXACT",account.toString()),new MoneyRuleEngine.Condition("merchant","EXACT",descriptor)));conditions.addAll(extra);
  return new MoneyMeaningService.RuleInput("Fixture approved merchant rule",conditions,category,"approved title","approved memo","ACTIVE",version);
 }
 private void assertFactsPreserved(MoneyTransaction actual,MoneyTransaction before){assertThat(actual.amount()).isEqualByComparingTo(before.amount());assertThat(actual.currency()).isEqualTo(before.currency());assertThat(actual.fromAccountId()).isEqualTo(before.fromAccountId());assertThat(actual.toAccountId()).isEqualTo(before.toAccountId());assertThat(actual.occurredAt()).isEqualTo(before.occurredAt());assertThat(actual.title()).isEqualTo(before.title());assertThat(actual.memo()).isEqualTo(before.memo());assertThat(actual.categoryId()).isEqualTo(before.categoryId());}

 @Test void explicitPermissionAppliesOnlyApprovedFutureMeaningAndEditsRequireFreshApprovalWhileLegacyRulesRemainAuthorized()throws Exception{helper.rollback(c->{
  var ai=ai(c);var meaning=meaning(c);var account=account(c,"AI automation fixture");var otherAccount=account(c,"AI automation other account");
  var category=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Fixture automation cafe","#123456",false,null,"EXPENSE",null,0));
  String descriptor="Fixture Verified Cafe";var merchant=ai.merchant(new MoneyAiService.MerchantInput(null,descriptor,"Fixture Verified Cafe","Seoul",List.of(),null));
  var input=rule(account.id(),descriptor,category.id(),List.of(),null);var approved=ai.merchantRule(new MoneyAiService.MerchantRule((UUID)merchant.get("id"),null,input));
  assertThat(approved.get("origin")).isEqualTo("AI_APPROVED");assertThat(ai.settings().get("automaticRules")).isEqualTo(false);
  var off=expense(c,account.id(),descriptor);assertThat(c.web().bookkeepingRow(off.id()).get("categoryId")).isNull();assertThat(c.web().bookkeepingRow(off.id()).get("title")).isEqualTo("source title");
  // The pre-existing exact-merchant deterministic rule remains authorized with AI permission off.
  c.product().saveRule(null,new MoneyProductService.RuleInput("Fixture Legacy Merchant",category.id(),null));var legacy=expense(c,account.id(),"Fixture Legacy Merchant");assertThat(legacy.categoryId()).isEqualTo(category.id());
  ai.settings(new MoneyAiService.SettingsInput(0L,true,false));var future=expense(c,account.id(),descriptor);var displayed=c.web().bookkeepingRow(future.id());
  assertThat(displayed.get("categoryId")).isEqualTo(category.id());assertThat(displayed.get("title")).isEqualTo("approved title");assertThat(displayed.get("memo")).isEqualTo("approved memo");assertFactsPreserved(c.money().transaction(future.id()),future);
  assertThat(future.categoryId()).isNull();assertThat(future.title()).isEqualTo("source title");assertThat(future.memo()).isEqualTo("source memo");assertThat(future.amount()).isEqualByComparingTo("1234.25");assertThat(future.fromAccountId()).isEqualTo(account.id());assertThat(future.occurredAt()).isEqualTo(Instant.parse("2026-10-02T01:00:00Z"));
  // Permission does not backfill the record created while permission was off.
  assertThat(c.web().bookkeepingRow(off.id()).get("categoryId")).isNull();assertThat(c.web().bookkeepingRow(off.id()).get("title")).isEqualTo("source title");
  var outsideScope=expense(c,otherAccount.id(),descriptor);assertThat(c.web().bookkeepingRow(outsideScope.id()).get("categoryId")).isNull();assertThat(c.web().bookkeepingRow(outsideScope.id()).get("title")).isEqualTo("source title");
  c.web().saveBookkeeping(future.id(),new MoneyWebTypes.BookkeepingEdit(0L,0L,Map.of("title","owner override"),1L));meaning.applyFuture(future.id());assertThat(c.web().bookkeepingRow(future.id()).get("title")).isEqualTo("owner override");assertFactsPreserved(c.money().transaction(future.id()),future);
  // An ordinary rule edit invalidates the previously approved rule version.
  meaning.saveRule((UUID)approved.get("id"),rule(account.id(),descriptor,category.id(),List.of(),((Number)approved.get("version")).longValue()));
  var afterEdit=expense(c,account.id(),descriptor);assertThat(c.web().bookkeepingRow(afterEdit.id()).get("categoryId")).isNull();assertThat(c.web().bookkeepingRow(afterEdit.id()).get("title")).isEqualTo("source title");assertThat(c.web().bookkeepingRow(afterEdit.id()).get("memo")).isEqualTo("source memo");
 });}

 @Test void marketplaceRequiresAnItemConditionAndArchivedAccountsCannotReceiveAiDefaults()throws Exception{helper.rollback(c->{
  var ai=ai(c);var account=account(c,"AI marketplace fixture");var category=c.product().saveCategory(null,new MoneyProductService.CategoryInput("Fixture books","#123456",false,null,"EXPENSE",null,0));
  String descriptor="쿠팡 Fixture 상품 주문";var merchant=ai.merchant(new MoneyAiService.MerchantInput(null,descriptor,"쿠팡 Fixture 거래처",null,List.of(),null));
  assertThatThrownBy(()->ai.merchantRule(new MoneyAiService.MerchantRule((UUID)merchant.get("id"),null,rule(account.id(),descriptor,category.id(),List.of(),null)))).isInstanceOf(InvalidRequestException.class);
  assertThat(meaning(c).rules()).isEmpty();assertThat(c.db().queryForObject("select count(*) from money_ai_events where user_id=? and kind='MERCHANT_RULE_APPROVED'",Long.class,c.owner())).isZero();
  ai.merchantRule(new MoneyAiService.MerchantRule((UUID)merchant.get("id"),null,rule(account.id(),descriptor,category.id(),List.of(new MoneyRuleEngine.Condition("title","CONTAINS","source")),null)));
  var pending=expense(c,account.id(),descriptor);assertThat(c.web().bookkeepingRow(pending.id()).get("categoryId")).isNull();
  c.money().archiveAccount(account.id(),new ArchiveAccount(account.version(),true));ai.settings(new MoneyAiService.SettingsInput(0L,true,false));
  // Evaluate the capture that already exists when the account was archived. New financial postings
  // into an archived account are already rejected by the existing domain before this gate.
  meaning(c).applyFuture(pending.id());assertThat(c.web().bookkeepingRow(pending.id()).get("categoryId")).isNull();assertThat(c.web().bookkeepingRow(pending.id()).get("title")).isEqualTo("source title");assertFactsPreserved(c.money().transaction(pending.id()),pending);
 });}
}
