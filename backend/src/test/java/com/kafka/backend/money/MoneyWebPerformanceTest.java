package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.lang.reflect.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;

/** Repeatable synthetic workload; schema, fixtures and DDL are rolled back together. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyWebPerformanceTest {
 @Test void boundedListAndAccountQueries() throws Exception {
  try(var c=MoneyPostgresIntegrationTest.connection()) {
   c.setAutoCommit(false);
   try {
    var schema="qa_money_perf_"+UUID.randomUUID().toString().replace("-", "");
    try(var s=c.createStatement()) {
     s.execute("create schema "+schema);
     s.execute("set local search_path="+schema+",public");
     for(String file:List.of("V50__money_core_ledger.sql","V54__money_processing_schedule.sql","V55__money_v1_product.sql","V56__money_bridge_credentials.sql")) s.execute(Files.readString(Path.of("src/main/resources/db/migration",file)));
     var extra=Path.of("src/main/resources/db/migration/V58__money_web_v1_1.sql");if(Files.exists(extra))s.execute(Files.readString(extra));
     var financial=Path.of("src/main/resources/db/migration/V59__money_financial_core.sql");if(Files.exists(financial))s.execute(Files.readString(financial));
    }
    try(var statement=c.createStatement()){statement.execute(Files.readString(Path.of("src/main/resources/db/migration/V60__money_bookkeeping_review_rules.sql")));}
    try(var statement=c.createStatement()){statement.execute(Files.readString(Path.of("src/main/resources/db/migration/V62__money_category_hierarchy.sql")));}
    try(var statement=c.createStatement()){statement.execute(Files.readString(Path.of("src/main/resources/db/migration/V65__money_mobile_funds.sql")));}
    try(var statement=c.createStatement()){statement.execute(Files.readString(Path.of("src/main/resources/db/migration/V71__money_web_revision.sql")));}
    for(String file:List.of("V69__money_ai_personalization.sql","V73__money_integrated_revision.sql"))if(Files.exists(Path.of("src/main/resources/db/migration",file)))try(var statement=c.createStatement()){statement.execute(Files.readString(Path.of("src/main/resources/db/migration",file)));}
    var counter=new AtomicInteger();
    var returnedRows=new AtomicInteger();
    Connection counted=(Connection)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{Connection.class},(p,m,a)->{
     if(m.getName().equals("prepareStatement"))counter.incrementAndGet();
     try{
      var value=m.invoke(c,a);
      if(value instanceof PreparedStatement statement)return Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{PreparedStatement.class},(pp,method,params)->{
       try{var result=method.invoke(statement,params);if(result instanceof ResultSet rows)return Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{ResultSet.class},(rp,rm,ra)->{
        try{var cell=rm.invoke(rows,ra);if(rm.getName().equals("next")&&Boolean.TRUE.equals(cell))returnedRows.incrementAndGet();return cell;}catch(InvocationTargetException e){throw e.getCause();}
       });return result;}catch(InvocationTargetException e){throw e.getCause();}
      });return value;
     }catch(InvocationTargetException e){throw e.getCause();}
    });
    var db=new JdbcTemplate(new SingleConnectionDataSource(counted,true));
    var owner=MoneyPostgresIntegrationTest.OWNER;
    List<UUID> accounts=new ArrayList<>();
    for(int i=0;i<8;i++){var id=UUID.randomUUID();accounts.add(id);db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'IBK','Performance fixture','SPENDING')",id,owner);}
    for(int i=0;i<200;i++)db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at,manual) values(?,?,'EXPENSE',?,1000,'2026-09-01T01:00:00Z',true)",UUID.randomUUID(),owner,accounts.get(i%8));
    var money=new MoneyService(db,()->owner,JsonMapper.builder().build());
    var product=new MoneyProductService(db,()->owner,money,JsonMapper.builder().build());
    var web=new MoneyWebService(db,()->owner,money,product,JsonMapper.builder().build());
    var sourced=db.queryForObject("select id from money_transactions where user_id=? order by occurred_at desc,id limit 1",UUID.class,owner);
    for(int i=0;i<2;i++){var raw=money.ingest(Map.of("postedAt","2026-09-01T01:00:00Z","text","Synthetic provenance evidence "+i,"idempotencyKey",UUID.randomUUID().toString())).notification();db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,relationship,evidence) values(?,?,?,'PRIMARY','{}')",sourced,owner,raw.id());}
    db.update("update money_transactions set manual=false where user_id=? and id=?",owner,sourced);
    assertThat(money.transaction(sourced)).satisfies(t->{assertThat(t.sourceCount()).isEqualTo(2);assertThat(t.sources()).hasSize(2);});
    for(int pass=0;pass<3;pass++) {
     counter.set(0);returnedRows.set(0);long start=System.nanoTime();var page=product.transactions(null,null,null,null,null,null,false,50,0);
     System.out.printf("MONEY_PERF list pass=%d rows=%d queries=%d ms=%.2f%n",pass,page.items().size(),counter.get(),(System.nanoTime()-start)/1e6);
     assertThat(page.items()).hasSize(50).allSatisfy(t->assertThat(t.sources()).isEmpty());assertThat(counter.get()).isLessThanOrEqualTo(2);assertThat(returnedRows.get()).isEqualTo(51);
     assertThat(page.items().getFirst()).satisfies(t->{assertThat(t.id()).isEqualTo(sourced);assertThat(t.manual()).isFalse();assertThat(t.sourceCount()).isEqualTo(2);});assertThat(page.items().subList(1,50)).allSatisfy(t->{assertThat(t.manual()).isTrue();assertThat(t.sourceCount()).isZero();});
     counter.set(0);start=System.nanoTime();var balances=product.accountBalances();
     System.out.printf("MONEY_PERF accounts pass=%d rows=%d queries=%d ms=%.2f%n",pass,balances.size(),counter.get(),(System.nanoTime()-start)/1e6);
     assertThat(balances).hasSize(8);assertThat(counter.get()).isLessThanOrEqualTo(4);
     counter.set(0);returnedRows.set(0);start=System.nanoTime();var detail=product.accountDetail(accounts.getFirst(),"2026-09");
     System.out.printf("MONEY_PERF detail pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     assertThat(detail.outflow()).isEqualByComparingTo("25000");
     counter.set(0);returnedRows.set(0);start=System.nanoTime();var oldReview=product.review(50,0);
     System.out.printf("MONEY_PERF review-legacy pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     var meaning=new MoneyMeaningService(db,()->owner,JsonMapper.builder().build());var review=new MoneyReviewService(db,()->owner,web,product,meaning,JsonMapper.builder().build());
     counter.set(0);returnedRows.set(0);start=System.nanoTime();var queue=review.queue(null,null,null,null,null,null,50,0);
     System.out.printf("MONEY_PERF review-queue pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     assertThat(queue.get("total")).isEqualTo(oldReview.get("total"));assertThat(counter.get()).isEqualTo(3);
     counter.set(0);returnedRows.set(0);start=System.nanoTime();var overview=web.overview("2026-09-01","2026-09-30");
     System.out.printf("MONEY_PERF overview pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     assertThat((java.math.BigDecimal)((Map<?,?>)overview.get("kpis")).get("consumption")).isEqualByComparingTo("200000");
    }

    var meaning=new MoneyMeaningService(db,()->owner,JsonMapper.builder().build());meaning.saveTracking(new MoneyMeaningService.TrackingInput(accounts.subList(0,4),List.of(),0L));
    var review=new MoneyReviewService(db,()->owner,web,product,meaning,JsonMapper.builder().build());var ai=new MoneyAiService(db,()->owner,JsonMapper.builder().build(),review,web,product,money,meaning);
    var revision=new MoneyWebRevisionService(db,()->owner,money,product,new MoneyMobileService(db,()->owner,money,product),JsonMapper.builder().build());
    for(int pass=0;pass<3;pass++){
     counter.set(0);returnedRows.set(0);long start=System.nanoTime();var queue=ai.workbench("PENDING",null,null,null,50,0);
     System.out.printf("MONEY_PERF ai-workbench pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     assertThat((List<?>)queue.get("items")).hasSize(50);assertThat(counter.get()).isLessThanOrEqualTo(22);
     counter.set(0);returnedRows.set(0);start=System.nanoTime();var stock=revision.currentStock();
     System.out.printf("MONEY_PERF current-stock pass=%d queries=%d returnedRows=%d ms=%.2f%n",pass,counter.get(),returnedRows.get(),(System.nanoTime()-start)/1e6);
     assertThat(stock).isNotEmpty();assertThat(counter.get()).isLessThanOrEqualTo(14);
    }
   } finally {c.rollback();}
  }
 }
}
