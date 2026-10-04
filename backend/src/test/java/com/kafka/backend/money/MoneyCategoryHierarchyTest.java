package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyProductService.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyCategoryHierarchyTest {
 interface Scenario {void run(JdbcTemplate db,MoneyCategories cats) throws Exception;}
 void isolated(Scenario scenario)throws Exception{
  try(var c=MoneyPostgresIntegrationTest.connection()){c.setAutoCommit(false);try{
   var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));db.execute("create schema qa_cat_"+c.hashCode());db.execute("set local search_path=qa_cat_"+c.hashCode()+",public");
   for(String name:List.of("V50__money_core_ledger.sql","V54__money_processing_schedule.sql","V55__money_v1_product.sql","V56__money_bridge_credentials.sql","V58__money_web_v1_1.sql","V59__money_financial_core.sql","V60__money_bookkeeping_review_rules.sql","V62__money_category_hierarchy.sql","V65__money_mobile_funds.sql","V71__money_web_revision.sql"))db.execute(Files.readString(Path.of("src/main/resources/db/migration",name)));
   scenario.run(db,new MoneyCategories(db,MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build()));
  }finally{c.rollback();}}
 }
 Category create(MoneyCategories cats,String name,String kind,UUID parent){return cats.save(null,new CategoryInput(name,"#5B8DEF",false,null,kind,null,0,parent,false));}
 Category archive(MoneyCategories cats,Category c,boolean value,boolean confirm){return cats.save(c.id(),new CategoryInput(c.name(),c.color(),value,c.version(),c.kind(),c.emoji(),c.sortOrder(),c.parentId(),confirm));}
 @Test void canonicalDefaultsAreExplicitAndIdempotent()throws Exception{isolated((db,cats)->{
  assertThat(cats.list()).isEmpty();var first=cats.defaults();assertThat(first).hasSize(65);assertThat(first.stream().filter(c->c.parentId()==null)).hasSize(18);
  assertThat(cats.defaults()).extracting(Category::id).containsExactlyElementsOf(first.stream().map(Category::id).toList());
  assertThat(first).noneMatch(c->c.name().equals("세부분류 없음")||c.name().contains("환급"));
  assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();assertThat(db.queryForObject("select count(*) from money_category_rules",Long.class)).isZero();
 });}
 @Test void depthKindOwnerAndNameRules()throws Exception{isolated((db,cats)->{
  var root=create(cats,"Root","EXPENSE",null);var child=create(cats,"Child","EXPENSE",root.id());var other=create(cats,"Other","EXPENSE",null);
  assertThatThrownBy(()->create(cats,"Third","EXPENSE",child.id())).hasMessageContaining("root");
  assertThatThrownBy(()->create(cats,"Wrong kind","INCOME",root.id())).hasMessageContaining("same-kind");
  assertThatThrownBy(()->create(cats,"Root","EXPENSE",null)).hasMessageContaining("같은 이름");
  assertThat(create(cats,"Child","EXPENSE",other.id()).parentId()).isEqualTo(other.id());
  assertThat(create(cats,"Root","INCOME",null).kind()).isEqualTo("INCOME");
  assertThatThrownBy(()->new MoneyCategories(db,UUID.randomUUID(),JsonMapper.builder().build()).get(root.id())).hasMessageContaining("not found");
 });}
 @Test void parentInactivityPreservesIndividualChildState()throws Exception{isolated((db,cats)->{
  var root=create(cats,"Root","EXPENSE",null);var active=create(cats,"Active","EXPENSE",root.id());var inactive=archive(cats,create(cats,"Inactive","EXPENSE",root.id()),true,false);
  assertThatThrownBy(()->archive(cats,root,true,false)).hasMessageContaining("확인");
  var archivedRoot=archive(cats,root,true,true);assertThat(cats.get(active.id()).effectiveArchived()).isTrue();assertThat(cats.get(active.id()).archived()).isFalse();
  archive(cats,archivedRoot,false,false);assertThat(cats.get(active.id()).effectiveArchived()).isFalse();assertThat(cats.get(inactive.id()).effectiveArchived()).isTrue();
 });}
 @Test void confirmedMoveKeepsIdentityAndReferences()throws Exception{isolated((db,cats)->{
  var root=create(cats,"Root","EXPENSE",null);var target=create(cats,"Target","EXPENSE",null);var child=create(cats,"Child","EXPENSE",root.id());
  var id=UUID.randomUUID();db.update("insert into money_category_rules(id,user_id,merchant,category_id) values(?,?,?,?)",id,MoneyPostgresIntegrationTest.OWNER,"synthetic",child.id());
  var preview=cats.impact(child.id());assertThat(preview.rules()).isEqualTo(1);
  assertThatThrownBy(()->cats.move(child.id(),new MoneyCategories.Move(target.id(),child.version(),target.version(),preview,false))).hasMessageContaining("confirmation");
  var moved=cats.move(child.id(),new MoneyCategories.Move(target.id(),child.version(),target.version(),preview,true));assertThat(moved.id()).isEqualTo(child.id());assertThat(moved.parentId()).isEqualTo(target.id());
  assertThat(db.queryForObject("select category_id from money_category_rules where id=?",UUID.class,id)).isEqualTo(child.id());
  assertThatThrownBy(()->cats.move(child.id(),new MoneyCategories.Move(root.id(),moved.version(),root.version(),preview,true))).hasMessageContaining("영향");
 });}
 @Test void existingFlatCategoriesAreNotGuessedOrDuplicated()throws Exception{isolated((db,cats)->{
  var old=create(cats,"배달","EXPENSE",null);assertThatThrownBy(cats::defaults).hasMessageContaining("위치");assertThat(cats.get(old.id()).parentId()).isNull();
 });}
 @Test void parentDirectChildFiltersMoveAndRulesPreserveFacts()throws Exception{isolated((db,cats)->{
  var owner=MoneyPostgresIntegrationTest.OWNER;var json=JsonMapper.builder().build();var m=new MoneyService(db,()->owner,json);var p=new MoneyProductService(db,()->owner,m,json);var w=new MoneyWebService(db,()->owner,m,p,json);var meaning=new MoneyMeaningService(db,()->owner,json);
  var h=new MoneyWebPostgresTest();var account=h.account(m,MoneyTypes.AccountRole.SPENDING);meaning.saveTracking(new MoneyMeaningService.TrackingInput(List.of(account.id()),List.of(),0L));
  var root=create(cats,"Root","EXPENSE",null);var child=create(cats,"Child","EXPENSE",root.id());var target=create(cats,"Target","EXPENSE",null);
  var direct=p.save(null,new Entry(MoneyTypes.TransactionType.EXPENSE,account.id(),null,new java.math.BigDecimal("100"),h.at,"Synthetic",root.id(),null,false,null,null));
  var nested=p.save(null,new Entry(MoneyTypes.TransactionType.EXPENSE,account.id(),null,new java.math.BigDecimal("200"),h.at,"Synthetic",child.id(),null,false,null,null));
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,root.id().toString(),null,null).get("total")).isEqualTo(2L);
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,"direct:"+root.id(),null,null).get("total")).isEqualTo(1L);
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,child.id().toString(),null,null).get("total")).isEqualTo(1L);
  var condition=List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE"));meaning.saveRule(null,new MoneyMeaningService.RuleInput("Child rule",condition,child.id(),null,null,"ACTIVE",null));
  var preview=cats.impact(child.id());assertThat(preview.records()).isEqualTo(1);assertThat(preview.rules()).isEqualTo(1);
  cats.move(child.id(),new MoneyCategories.Move(target.id(),child.version(),target.version(),preview,true));
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,root.id().toString(),null,null).get("total")).isEqualTo(1L);
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false,null,target.id().toString(),null,null).get("total")).isEqualTo(1L);
  assertThat(m.transaction(nested.id())).isEqualTo(nested);assertThat(m.transaction(direct.id())).isEqualTo(direct);
  archive(cats,target,true,true);assertThatThrownBy(()->meaning.saveRule(null,new MoneyMeaningService.RuleInput("Inactive target",condition,child.id(),null,null,"ACTIVE",null))).hasMessageContaining("active category");
  var fresh=p.save(null,h.entry(MoneyTypes.TransactionType.EXPENSE,account.id(),null,50,"After inactivity",null,null));assertThat(((Map<?,?>)w.bookkeepingRow(fresh.id()).get("ruleDefaults")).get("categoryId")).isNull();
 });}
 @Test void databaseRejectsDepthChangesAndCyclesEvenOutsideService()throws Exception{isolated((db,cats)->{
  var root=create(cats,"Root","EXPENSE",null);var child=create(cats,"Child","EXPENSE",root.id());var income=create(cats,"Income","INCOME",null);
  var c=db.getDataSource().getConnection();
  for(UUID parent:List.of(child.id(),income.id(),root.id())){var mark=c.setSavepoint();
   assertThatThrownBy(()->db.update("update money_categories set parent_id=? where id=?",parent,root.id())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);c.rollback(mark);
  }
 });}
 @Test void inactiveAssignmentsCanBeRetainedButNotNewlyAssigned()throws Exception{isolated((db,cats)->{
  var owner=MoneyPostgresIntegrationTest.OWNER;var json=JsonMapper.builder().build();var m=new MoneyService(db,()->owner,json);var p=new MoneyProductService(db,()->owner,m,json);var w=new MoneyWebService(db,()->owner,m,p,json);var meaning=new MoneyMeaningService(db,()->owner,json);var h=new MoneyWebPostgresTest();var account=h.account(m,MoneyTypes.AccountRole.SPENDING);
  var root=create(cats,"Root","EXPENSE",null);var child=create(cats,"Child","EXPENSE",root.id());var existing=p.save(null,new Entry(MoneyTypes.TransactionType.EXPENSE,account.id(),null,new java.math.BigDecimal("100"),h.at,"Existing",child.id(),null,false,null,null));var other=p.save(null,h.entry(MoneyTypes.TransactionType.EXPENSE,account.id(),null,100,"Other",null,null));
  var conditions=List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE"));var rule=meaning.saveRule(null,new MoneyMeaningService.RuleInput("Rule",conditions,child.id(),null,null,"ACTIVE",null));archive(cats,root,true,true);
  var row=w.bookkeepingRow(existing.id());var saved=w.saveBookkeeping(existing.id(),new MoneyWebTypes.BookkeepingEdit(((Number)row.get("version")).longValue(),existing.version(),Map.of("categoryId",child.id().toString(),"memo","Retained"),((Number)row.get("projectionVersion")).longValue()));assertThat(saved.get("categoryId").toString()).isEqualTo(child.id().toString());assertThat(m.transaction(existing.id())).isEqualTo(existing);
  var unassigned=w.bookkeepingRow(other.id());assertThatThrownBy(()->w.saveBookkeeping(other.id(),new MoneyWebTypes.BookkeepingEdit(((Number)unassigned.get("version")).longValue(),other.version(),Map.of("categoryId",child.id().toString()),((Number)unassigned.get("projectionVersion")).longValue()))).hasMessageContaining("active category");
  var paused=meaning.saveRule((UUID)rule.get("id"),new MoneyMeaningService.RuleInput("Rule",conditions,child.id(),null,null,"PAUSED",((Number)rule.get("version")).longValue()));assertThat(paused.get("categoryId")).isEqualTo(child.id());assertThat(paused.get("status")).isEqualTo("PAUSED");assertThatThrownBy(()->meaning.saveRule((UUID)rule.get("id"),new MoneyMeaningService.RuleInput("Rule",conditions,child.id(),null,null,"ACTIVE",((Number)paused.get("version")).longValue()))).hasMessageContaining("active category");
 });}
}
