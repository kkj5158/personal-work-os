package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.lang.reflect.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;

/** Synthetic loopback-only DTO equivalence and bounded-read regression. Never connects to shared DEV. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55467/postgres.*")
class MoneyRecommendationDraftReadPostgresTest {
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();
 MoneyRecommendationService service;JdbcTemplate db;TransactionTemplate read;AtomicInteger queries=new AtomicInteger();
 List<UUID> transactions=new ArrayList<>(),drafts=new ArrayList<>();UUID run;
 @BeforeEach void setup()throws Exception{
  f.create();DataSource counted=new AbstractDataSource(){public Connection getConnection()throws SQLException{return connection(f.pool.getConnection());}public Connection getConnection(String user,String password)throws SQLException{return getConnection();}};
  db=new JdbcTemplate(counted);var manager=new org.springframework.jdbc.datasource.DataSourceTransactionManager(counted);read=new TransactionTemplate(manager);read.setReadOnly(true);
  var commands=new MoneyCommandService(db,f.json,manager);service=new MoneyRecommendationService(db,()->f.owner,f.json,commands,new MoneyClassificationEngine(db,f.json,commands),f.provider,manager,java.math.BigDecimal.ONE,java.math.BigDecimal.TEN,false);
 }
 @AfterEach void cleanup(){f.cleanup();}
 Object invoke(Object target,Method method,Object[] args)throws Throwable{try{return method.invoke(target,args);}catch(InvocationTargetException e){throw e.getCause();}}
 Connection connection(Connection raw){return (Connection)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{Connection.class},(proxy,m,args)->{Object result=invoke(raw,m,args);if(result instanceof PreparedStatement statement)return Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{PreparedStatement.class},(p,method,a)->{if(method.getName().startsWith("execute"))queries.incrementAndGet();return invoke(statement,method,a);});return result;});}
 void seed(int count){
  run=UUID.randomUUID();db.update("insert into money_recommendation_runs(id,user_id,scope,status,fingerprint,policy_version) values(?,?,'SELECTED','COMPLETE','synthetic',?)",run,f.owner,MoneyRecommendationService.POLICY);
  for(int i=0;i<count;i++){
   UUID transaction=f.expense("Synthetic draft "+i);transactions.add(transaction);var current=f.service.current(transaction);UUID item=UUID.randomUUID(),draft=UUID.randomUUID();drafts.add(draft);
   db.update("insert into money_recommendation_items(id,user_id,run_id,transaction_id,snapshot,stamp,status) values(?,?,?,?,cast(? as jsonb),?,'DRAFT_READY')",item,f.owner,run,transaction,f.json.writeValueAsString(current.get("book")),current.get("stamp"));
   db.update("insert into money_classification_drafts(id,user_id,transaction_id,revision,status,selected,created_at) values(?,?,?,1,'ACTIVE',false,?)",draft,f.owner,transaction,java.sql.Timestamp.from(Instant.parse("2026-09-16T00:00:00Z").plusSeconds(i)));
   revision(draft,item,1,f.category,current.get("stamp").toString(),current.get("book"),"Original AI "+i);
  }
 }
 void revision(UUID draft,UUID item,long version,UUID category,String stamp,Object book,String reason){db.update("insert into money_classification_draft_revisions(user_id,draft_id,revision,item_id,category_id,origin,result,snapshot,stamp,context_version) values(?,?,?,?,?,'AI',cast(? as jsonb),cast(? as jsonb),?,0)",f.owner,draft,version,item,category,f.json.writeValueAsString(Map.of("provider","MOCK","reason",reason)),f.json.writeValueAsString(book),stamp);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> result){return (List<Map<String,Object>>)result.get("items");}
 Map<String,Object> optimized(){return read.execute(status->service.drafts());}
 @SuppressWarnings("unchecked") Map<String,Object> scalar()throws Exception{
  var method=MoneyRecommendationService.class.getDeclaredMethod("draftView",UUID.class,Map.class);method.setAccessible(true);
  var expected=new ArrayList<Map<String,Object>>();for(var draft:db.queryForList("select * from money_classification_drafts where user_id=? and status not in ('SAVED','EXCLUDED') order by created_at,id",f.owner))expected.add((Map<String,Object>)method.invoke(service,f.owner,draft));return Map.of("items",expected,"total",expected.size());
 }
 Map<String,Object> assertEquivalent()throws Exception{var expected=scalar();queries.set(0);var actual=optimized();assertThat(actual).isEqualTo(expected);assertThat(f.calls).hasValue(0);return actual;}
 @ParameterizedTest @ValueSource(ints={0,1,50,100,200}) void fixedCountsAreEquivalentAndBounded(int count)throws Exception{
  seed(count);var actual=assertEquivalent();assertThat(actual).containsEntry("total",count);assertThat(queries.get()).isEqualTo(count==0?1:2+6*((count+49)/50));
  assertThat(items(actual)).extracting(r->r.get("transactionId")).containsExactlyElementsOf(transactions);
 }
 @Test void candidatePreservesOriginalAiAndLatestCandidateWithoutConfirming()throws Exception{
  seed(1);UUID transaction=transactions.getFirst(),draft=drafts.getFirst();var book=f.service.current(transaction);UUID item=db.queryForObject("select id from money_recommendation_items where transaction_id=?",UUID.class,transaction);revision(draft,item,2,f.otherCategory,book.get("stamp").toString(),book.get("book"),"Latest candidate");db.update("update money_classification_drafts set candidate_revision=2,status='COMPARISON_PENDING' where id=?",draft);
  var result=items(assertEquivalent()).getFirst();assertThat(((Map<?,?>)result.get("active")).get("categoryId")).isEqualTo(f.category);assertThat(((Map<?,?>)result.get("candidate")).get("categoryId")).isEqualTo(f.otherCategory);assertThat(result).containsEntry("saveEligible",false);assertThat(queries.get()).isEqualTo(8);
 }
 @Test void savedClassificationAndJsonStateKeepCanonicalStampAndOriginalAi()throws Exception{
  seed(1);UUID id=transactions.getFirst();
  db.update("insert into money_classification_state(user_id,transaction_id,version,decision_version,origin,category_id,direct_protected,future_reference_excluded,context_key,context_summary,last_input_key,undone_input_key) values(?,?,3,2,'DIRECT',?,true,true,'synthetic-context','{\"merchant\":\"Synthetic\",\"amount\":1000.25}','last-input','undone-input')",f.owner,id,f.otherCategory);
  db.update("insert into money_bookkeeping_overrides(id,user_id,transaction_id,slot,version,overrides) values(?,?,?,0,1,cast(? as jsonb))",UUID.randomUUID(),f.owner,id,f.json.writeValueAsString(Map.of("categoryId",f.otherCategory)));
  var result=items(assertEquivalent()).getFirst();assertThat(((Map<?,?>)result.get("book")).get("categoryId")).isEqualTo(f.otherCategory);assertThat(((Map<?,?>)result.get("active")).get("categoryId")).isEqualTo(f.category);assertThat(result).containsEntry("saveEligible",false).containsEntry("conflict",true);
 }
 @ParameterizedTest @ValueSource(strings={"context","transactionVersion","archivedCategory","archivedParent","archivedAccount","inactiveAccount","missingEffectiveAccount","excluded","merged","financialReview","unclassifiable","failed","unknown"}) void changedContextsRetainScalarContractAndRecovery(String scenario)throws Exception{
  UUID parent=null;if(scenario.equals("archivedParent")){parent=f.product.saveCategory(null,new MoneyProductService.CategoryInput("Synthetic parent","#123456",false,null,"EXPENSE",null,0)).id();f.category=f.product.saveCategory(null,new MoneyProductService.CategoryInput("Synthetic child","#123456",false,null,"EXPENSE",null,0,parent,false)).id();}
  seed(1);UUID id=transactions.getFirst(),draft=drafts.getFirst();
  switch(scenario){
   case "context"->db.update("update money_classification_drafts set explanation='Changed explanation',context_version=1 where id=?",draft);
   case "transactionVersion"->db.update("update money_transactions set version=version+1 where id=?",id);
   case "archivedCategory"->db.update("update money_categories set archived=true,version=version+1 where id=?",f.category);
   case "archivedParent"->db.update("update money_categories set archived=true,version=version+1 where id=?",parent);
   case "archivedAccount"->db.update("update money_accounts set archived=true,version=version+1 where id=?",f.account);
   case "inactiveAccount"->db.update("update money_accounts set include_in_statistics=false,version=version+1 where id=?",f.account);
   case "missingEffectiveAccount"->db.update("insert into money_bookkeeping_overrides(id,user_id,transaction_id,slot,version,overrides) values(?,?,?,0,1,cast(? as jsonb))",UUID.randomUUID(),f.owner,id,f.json.writeValueAsString(Map.of("accountId",UUID.randomUUID())));
   case "excluded"->db.update("update money_transactions set excluded=true where id=?",id);
   case "merged"->{UUID into=f.expense("Merge target");db.update("update money_transactions set merged_into=? where id=?",into,id);}
   case "financialReview"->{UUID other=f.money.createAccount(new MoneyTypes.AccountInput("IBK","Synthetic other",MoneyTypes.AccountRole.SPENDING,null,null)).id();f.product.save(null,new MoneyProductService.Entry(MoneyTypes.TransactionType.INCOME,null,other,new java.math.BigDecimal("1000"),Instant.parse("2026-09-15T01:00:00Z"),"합성 카페",null,null,false,null,null,"Opposing evidence"));}
   case "unclassifiable"->{db.update("update money_classification_drafts set status='UNCLASSIFIABLE' where id=?",draft);db.update("update money_classification_draft_revisions set category_id=null where draft_id=?",draft);}
   case "failed"->db.update("update money_classification_drafts set status='FAILED_KNOWN' where id=?",draft);
   case "unknown"->db.update("update money_classification_drafts set status='OUTCOME_UNKNOWN' where id=?",draft);
  }
  var result=items(assertEquivalent()).getFirst();assertThat(result).containsEntry("id",draft).containsEntry("saveEligible",false);assertThat(result.get("active")).isNotNull();
 }
 @Test void selectionOutsidePagePersistsAcrossReadersAndNavigationRecovery()throws Exception{
  seed(100);db.update("update money_classification_drafts set selected=true where id=?",drafts.get(99));var first=assertEquivalent();var afterReload=optimized();assertThat(afterReload).isEqualTo(first);assertThat(items(afterReload).get(99)).containsEntry("selected",true);assertThat(db.queryForObject("select selected from money_classification_drafts where id=?",Boolean.class,drafts.get(99))).isTrue();
 }
 @Test void equalCreationTimesKeepUuidTieOrdering()throws Exception{
  seed(3);db.update("update money_classification_drafts set created_at='2026-09-16T00:00:00Z'");var actual=assertEquivalent();assertThat(items(actual)).extracting(r->r.get("id").toString()).containsExactlyElementsOf(drafts.stream().map(UUID::toString).sorted().toList());assertThat(optimized()).isEqualTo(actual);
 }
 @Test void ownerScopedQueriesNeverReturnAnotherOwnersDraftOrRevision()throws Exception{
  seed(1);UUID other=UUID.randomUUID(),account=UUID.randomUUID(),transaction=UUID.randomUUID(),draft=UUID.randomUUID(),otherRun=UUID.randomUUID(),item=UUID.randomUUID();db.update("insert into qa_fixture_users values(?)",other);db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'IBK','Other owner','SPENDING')",account,other);db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at,manual) values(?,?,'EXPENSE',?,1000,now(),true)",transaction,other,account);
  db.update("insert into money_recommendation_runs(id,user_id,scope,fingerprint,policy_version) values(?,?,'ONE','synthetic',?)",otherRun,other,MoneyRecommendationService.POLICY);db.update("insert into money_recommendation_items(id,user_id,run_id,transaction_id,snapshot,stamp) values(?,?,?,?,'{}','synthetic')",item,other,otherRun,transaction);db.update("insert into money_classification_drafts(id,user_id,transaction_id,revision) values(?,?,?,1)",draft,other,transaction);db.update("insert into money_classification_draft_revisions(user_id,draft_id,revision,item_id,origin,result,snapshot,stamp,context_version) values(?,?,1,?,'AI','{}','{}','synthetic',0)",other,draft,item);
  var actual=assertEquivalent();assertThat(actual).containsEntry("total",1);assertThat(f.json.writeValueAsString(actual)).doesNotContain(draft.toString(),transaction.toString(),account.toString());
 }
 @Test void missingRevisionAndTerminalDraftsKeepExistingDtoRules()throws Exception{
  seed(3);db.update("update money_classification_drafts set revision=99 where id=?",drafts.getFirst());db.update("update money_classification_drafts set status='SAVED' where id=?",drafts.get(1));db.update("update money_classification_drafts set status='EXCLUDED' where id=?",drafts.get(2));var result=items(assertEquivalent());assertThat(result).hasSize(1);assertThat((Map<?,?>)result.getFirst().get("active")).isEmpty();
 }
 @Test void draftReadsWriteNoFactsStateEvidenceEventsOrSelection()throws Exception{
  seed(2);var tables=List.of("money_transactions","money_transaction_sources","money_classification_state","money_classification_events","money_classification_drafts","money_classification_draft_revisions","money_recommendation_items","money_recommendation_usage");var before=new LinkedHashMap<String,List<Map<String,Object>>>();for(String table:tables)before.put(table,db.queryForList("select to_jsonb(t)::text as value from "+table+" t order by to_jsonb(t)::text"));assertEquivalent();optimized();for(String table:tables)assertThat(db.queryForList("select to_jsonb(t)::text as value from "+table+" t order by to_jsonb(t)::text")).isEqualTo(before.get(table));
 }
}
