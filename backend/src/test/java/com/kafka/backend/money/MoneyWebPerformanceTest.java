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
    }
    var counter=new AtomicInteger();
    Connection counted=(Connection)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{Connection.class},(p,m,a)->{
     if(m.getName().equals("prepareStatement"))counter.incrementAndGet();
     try{return m.invoke(c,a);}catch(InvocationTargetException e){throw e.getCause();}
    });
    var db=new JdbcTemplate(new SingleConnectionDataSource(counted,true));
    var owner=MoneyPostgresIntegrationTest.OWNER;
    List<UUID> accounts=new ArrayList<>();
    for(int i=0;i<8;i++){var id=UUID.randomUUID();accounts.add(id);db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'IBK','Performance fixture','SPENDING')",id,owner);}
    for(int i=0;i<200;i++)db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at) values(?,?,'EXPENSE',?,1000,'2026-09-01T01:00:00Z')",UUID.randomUUID(),owner,accounts.get(i%8));
    var money=new MoneyService(db,()->owner,JsonMapper.builder().build());
    var product=new MoneyProductService(db,()->owner,money,JsonMapper.builder().build());
    for(int pass=0;pass<3;pass++) {
     counter.set(0);long start=System.nanoTime();var page=product.transactions(null,null,null,null,null,null,false,50,0);
     System.out.printf("MONEY_PERF list pass=%d rows=%d queries=%d ms=%.2f%n",pass,page.items().size(),counter.get(),(System.nanoTime()-start)/1e6);
     assertThat(page.items()).hasSize(50);assertThat(counter.get()).isLessThanOrEqualTo(2);
     counter.set(0);start=System.nanoTime();var balances=product.accountBalances();
     System.out.printf("MONEY_PERF accounts pass=%d rows=%d queries=%d ms=%.2f%n",pass,balances.size(),counter.get(),(System.nanoTime()-start)/1e6);
     assertThat(balances).hasSize(8);assertThat(counter.get()).isLessThanOrEqualTo(4);
    }
   } finally {c.rollback();}
  }
 }
}
