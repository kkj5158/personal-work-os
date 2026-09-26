package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyProductService.*;
import static com.kafka.backend.money.MoneyWebTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyWebPostgresTest {
 interface Check{void run(MoneyService m,MoneyProductService p,MoneyWebService w,JdbcTemplate db);}
 void rollback(Check check)throws Exception{try(var c=MoneyPostgresIntegrationTest.connection()){c.setAutoCommit(false);try{var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));var owner=MoneyPostgresIntegrationTest.OWNER;var m=MoneyPostgresIntegrationTest.service(db,owner);var p=new MoneyProductService(db,()->owner,m,JsonMapper.builder().build());var w=new MoneyWebService(db,()->owner,m,p,JsonMapper.builder().build());check.run(m,p,w,db);}finally{c.rollback();}}}
 final Instant at=Instant.parse("2026-09-26T01:00:00Z");
 MoneyAccount account(MoneyService m,AccountRole role){return m.createAccount(new AccountInput("IBK","Synthetic "+role,role,null,null));}
 Entry entry(TransactionType type,UUID from,UUID to,int amount,String title,String memo,Long version){return new Entry(type,from,to,BigDecimal.valueOf(amount),at,"Synthetic merchant",null,memo,false,null,version,title);}
 @Test void sparseOverridesFollowSourceUntilIndividuallyOverriddenAndReset()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);var t=p.save(null,entry(TransactionType.EXPENSE,a.id(),null,100,"Source title","Source memo",null));
  var original=w.bookkeepingRow(t.id());assertThat(original.get("title")).isEqualTo("Source title");assertThat(original.get("overrides")).isEqualTo(Map.of());
  w.saveBookkeeping(t.id(),new BookkeepingEdit(0L,0L,Map.of("title","Daily meaning")));
  p.save(t.id(),entry(TransactionType.EXPENSE,a.id(),null,120,"Corrected title","Corrected memo",0L));
  var effective=w.bookkeepingRow(t.id());assertThat(effective.get("title")).isEqualTo("Daily meaning");assertThat(effective.get("memo")).isEqualTo("Corrected memo");assertThat((BigDecimal)effective.get("amount")).isEqualByComparingTo("120");
  assertThat(m.transaction(t.id()).title()).isEqualTo("Corrected title");
  w.saveBookkeeping(t.id(),new BookkeepingEdit(1L,1L,Map.of()));assertThat(w.bookkeepingRow(t.id()).get("title")).isEqualTo("Corrected title");
  assertThatThrownBy(()->w.saveBookkeeping(t.id(),new BookkeepingEdit(1L,1L,Map.of()))).isInstanceOf(OptimisticLockConflictException.class);
 });}
 @Test void nullableOverrideAndRelationshipStayBookkeepingOnly()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);var b=account(m,AccountRole.INCOME_HUB);var t=p.save(null,entry(TransactionType.EXPENSE,a.id(),null,100,"Title","Memo",null));
  Map<String,Object> overrides=new HashMap<>();overrides.put("memo",null);overrides.put("accountId",b.id().toString());overrides.put("amount",50);
  w.saveBookkeeping(t.id(),new BookkeepingEdit(0L,0L,overrides));var effective=w.bookkeepingRow(t.id());assertThat(effective.get("memo")).isNull();assertThat(effective.get("accountId")).isEqualTo(b.id());assertThat((BigDecimal)effective.get("amount")).isEqualByComparingTo("50");assertThat(m.transaction(t.id()).memo()).isEqualTo("Memo");assertThat(m.transaction(t.id()).fromAccountId()).isEqualTo(a.id());
 });}
 @Test void overviewCountsSavingsBoundaryOnceAndRefundOffsetsConsumption()throws Exception{rollback((m,p,w,db)->{
  var hub=account(m,AccountRole.INCOME_HUB);var gate=account(m,AccountRole.SAVINGS_GATEWAY);var purpose=account(m,AccountRole.PURPOSE_SAVINGS);
  p.save(null,entry(TransactionType.INCOME,null,hub.id(),1000,null,null,null));p.save(null,entry(TransactionType.TRANSFER,hub.id(),gate.id(),500,null,null,null));p.save(null,entry(TransactionType.TRANSFER,gate.id(),purpose.id(),500,null,null,null));p.save(null,entry(TransactionType.TRANSFER,gate.id(),hub.id(),100,null,null,null));
  var expense=p.save(null,entry(TransactionType.EXPENSE,hub.id(),null,100,null,null,null));p.save(null,new Entry(TransactionType.REFUND,null,hub.id(),BigDecimal.valueOf(40),at,null,null,null,false,expense.id(),null));
  var kpis=(Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)kpis.get("income")).isEqualByComparingTo("1000");assertThat((BigDecimal)kpis.get("consumption")).isEqualByComparingTo("60");assertThat((BigDecimal)kpis.get("savings")).isEqualByComparingTo("400");
  var flow=(List<Map<String,Object>>)w.overview("2026-09-01","2026-09-30").get("flow");assertThat(flow).anySatisfy(row->{assertThat(row.get("count")).isEqualTo(2L);assertThat((BigDecimal)row.get("net")).isEqualByComparingTo("400");assertThat((BigDecimal)row.get("gross")).isEqualByComparingTo("600");});
  assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(2L);
 });}
 @Test void checkpointAndExcludedTransactionsDoNotInflateStatistics()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);p.checkpoint(a.id(),new Checkpoint(BigDecimal.valueOf(900),at.minusSeconds(2),"Synthetic opening",0L));
  p.save(null,new Entry(TransactionType.INCOME,null,a.id(),BigDecimal.valueOf(800),at,null,null,null,true,null,null));
  var data=w.overview("2026-09-01","2026-09-30");var kpis=(Map<?,?>)data.get("kpis");assertThat((BigDecimal)kpis.get("income")).isZero();assertThat((BigDecimal)kpis.get("assets")).isEqualByComparingTo("900");assertThat(data.get("balanceBasis")).isEqualTo("LATEST_AVAILABLE");
  w.inclusion(a.id(),new AccountInclusion(false,false,1L));assertThat((BigDecimal)((Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis")).get("assets")).isZero();
 });}
 LoanInput loanInput(UUID account,long version,String status,int principal){return new LoanInput("Synthetic loan","Synthetic lender","PERSONAL",BigDecimal.valueOf(1000),BigDecimal.valueOf(principal),BigDecimal.valueOf(4.5),BigDecimal.valueOf(30),25,LocalDate.of(2026,10,25),account,LocalDate.of(2026,1,1),LocalDate.of(2028,1,1),status,"Synthetic memo",version);}
 @Test void loanPrincipalIsSeparateFromAssetsVersionedAndSoftDeleted()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);var loan=w.saveLoan(null,loanInput(a.id(),0,"ACTIVE",700));var data=(Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis");assertThat((BigDecimal)data.get("loans")).isEqualByComparingTo("700");assertThat((BigDecimal)data.get("assets")).isZero();
  assertThatThrownBy(()->w.saveLoan(loan.id(),loanInput(a.id(),0,"ACTIVE",600))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->w.saveLoan(loan.id(),loanInput(a.id(),1,"COMPLETED",600))).isInstanceOf(InvalidRequestException.class);
  var complete=w.saveLoan(loan.id(),loanInput(a.id(),1,"COMPLETED",0));assertThat((BigDecimal)((Map<?,?>)w.overview("2026-09-01","2026-09-30").get("kpis")).get("loans")).isZero();w.deleteLoan(loan.id(),complete.version());assertThat(w.loans()).isEmpty();assertThat(db.queryForObject("select count(*) from money_loans where id=?",Integer.class,loan.id())).isEqualTo(1);
 });}
 @Test void webOwnerIsolationAndInvalidOverrides()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);var tx=p.save(null,entry(TransactionType.EXPENSE,a.id(),null,100,"Private",null,null));var l=w.saveLoan(null,loanInput(a.id(),0,"ACTIVE",100));var id=UUID.randomUUID();var otherM=MoneyPostgresIntegrationTest.service(db,id);var otherP=new MoneyProductService(db,()->id,otherM,JsonMapper.builder().build());var other=new MoneyWebService(db,()->id,otherM,otherP,JsonMapper.builder().build());
  assertThat(other.loans()).isEmpty();assertThatThrownBy(()->other.loan(l.id())).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->other.bookkeepingRow(tx.id())).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->w.saveBookkeeping(tx.id(),new BookkeepingEdit(0L,0L,Map.of("type","TRANSFER")))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->w.saveBookkeeping(tx.id(),new BookkeepingEdit(0L,0L,Map.of("accountId",UUID.randomUUID().toString())))).isInstanceOf(ResourceNotFoundException.class);
 });}
 @Test void normalizedTitleEditPreservesRawAndOneTransferRow()throws Exception{rollback((m,p,w,db)->{
  var a=account(m,AccountRole.SPENDING);var b=account(m,AccountRole.INCOME_HUB);var raw=m.ingest(Map.of("postedAt",at.toString(),"text","Synthetic evidence")).notification();m.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"TEST_REVIEW");raw=m.notification(raw.id());var tx=p.reviewPost(new ReviewPost(entry(TransactionType.TRANSFER,a.id(),b.id(),100,null,null,null),List.of(raw.id()),List.of(raw.processingVersion())));p.save(tx.id(),entry(TransactionType.TRANSFER,a.id(),b.id(),100,"Meaningful title","Optional memo",0L));assertThat(m.notification(raw.id()).text()).isEqualTo("Synthetic evidence");assertThat(p.transactions(null,null,null,null,null,"Meaningful",false,50,0).items()).hasSize(1).allSatisfy(t->assertThat(t.sources()).isEmpty());assertThat(m.transaction(tx.id()).sources()).hasSize(1);assertThat(w.bookkeeping("2026-09-01","2026-09-30","EXPENSE",null,50,0,false).get("total")).isEqualTo(0L);
 });}
 @Test void deferDoesNotModifyRawBodyAndDefaultRulesOnlyAffectNewNormalizedValues()throws Exception{rollback((m,p,w,db)->{
  var raw=m.ingest(Map.of("postedAt",at.toString(),"text","Synthetic unknown")).notification();m.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"UNKNOWN");w.deferReview(raw.id(),m.notification(raw.id()).processingVersion());assertThat(m.notification(raw.id()).text()).isEqualTo("Synthetic unknown");assertThat(db.queryForObject("select review_deferred from money_raw_notifications where id=?",Boolean.class,raw.id())).isTrue();
  var cat=p.initializeCategories().getFirst();p.saveRule(null,new RuleInput("Synthetic merchant",cat.id(),null,"Default title","Default memo",true));var a=account(m,AccountRole.SPENDING);var t=p.save(null,entry(TransactionType.EXPENSE,a.id(),null,100,null,null,null));assertThat(t.memo()).isEqualTo("Default memo");assertThat(t.title()).isEqualTo("Default title");
 });}
}
