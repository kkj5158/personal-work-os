package com.kafka.backend.money;

import com.kafka.backend.common.OptimisticLockConflictException;
import java.sql.Connection;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** Separate real connections are required here. Only a fresh synthetic identity on loopback is committed. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
class MoneyFinancialTypeConcurrencyPostgresTest {
    @Test void differentRowsProgressWhileSameRowUsesVersionCompareAndSet() throws Exception {
        UUID owner=UUID.randomUUID(), account=UUID.randomUUID(), first=UUID.randomUUID(), second=UUID.randomUUID();
        String app="ledger_concurrency_"+owner;
        String url=System.getenv("DEV_DB_URL");
        var source=new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"ApplicationName="+app,
            System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
        var db=new JdbcTemplate(source);
        var manager=new DataSourceTransactionManager(source);
        var json=JsonMapper.builder().build();
        var money=new MoneyService(db,()->owner,json);
        var product=new MoneyProductService(db,()->owner,money,json);
        var web=new MoneyWebService(db,()->owner,money,product,json);
        var commands=new MoneyCommandService(db,json,manager);
        var unified=new MoneyUnifiedBookkeepingService(db,()->owner,json,money,product,web,
            new MoneyFinancialService(db,()->owner,money,product,web,json),commands);
        var ledger=new MoneyAccountLedgerService(db,()->owner,json,money,unified,web,commands,manager);
        db.update("insert into auth.users(id) values(?)",owner);
        try (var workers=Executors.newFixedThreadPool(2)) {
            db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'TEST','합성 동시성 검증','SPENDING')",account,owner);
            for(UUID id:List.of(first,second))
                db.update("""
                    insert into money_transactions(id,user_id,type,meaning_state,from_account_id,amount,currency,occurred_at)
                    values(?,?,'EXPENSE','UNRESOLVED',?,10,'KRW',now())
                    """,id,owner,account);
            // Stall a real PATCH transaction after its shared owner lock has been acquired.
            try (Connection lock=source.getConnection()) {
                lock.setAutoCommit(false);
                try (var query=lock.prepareStatement("select id from money_transactions where id=? for update")) {
                    query.setObject(1,first);
                    try (var result=query.executeQuery()) { assertThat(result.next()).isTrue(); }
                }
                var delayed=workers.submit(()->save(ledger,first,0,"EXPENSE"));
                try {
                    long until=System.nanoTime()+Duration.ofSeconds(15).toNanos();
                    boolean waiting=false;
                    while (!waiting && System.nanoTime()<until) {
                        waiting=db.queryForObject("""
                            select exists(select 1 from pg_stat_activity where application_name=?
                              and wait_event_type='Lock' and query like '%for update of t%')
                            """,Boolean.class,app);
                        if (!waiting) Thread.sleep(25);
                    }
                    assertThat(waiting).as("first row write blocked on its transaction row").isTrue();
                    assertThat(workers.submit(()->save(ledger,second,0,"EXPENSE")).get(15,TimeUnit.SECONDS)).isEqualTo("APPLIED");
                } finally {
                    lock.rollback();
                }
                assertThat(delayed.get(15,TimeUnit.SECONDS)).isEqualTo("APPLIED");
            }
            var start=new CountDownLatch(1);
            var a=workers.submit(()->{start.await();return save(ledger,first,1,"UNRESOLVED");});
            var b=workers.submit(()->{start.await();return save(ledger,first,1,"TRANSFER");});
            start.countDown();
            assertThat(List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).contains("CONFLICT")
                .anySatisfy(status->assertThat(status).isIn("APPLIED","INTENT_SAVED_PENDING"));
            assertThat(db.queryForObject("select count(*) from money_owner_financial_decisions where user_id=?",Integer.class,owner)).isEqualTo(2);
            assertThat(db.queryForObject("select count(*) from money_meaning_audit where user_id=? and action='ACCOUNT_LEDGER_FINANCIAL_TYPE'",Integer.class,owner)).isEqualTo(3);
        } finally {
            db.update("delete from money_owner_financial_decisions where user_id=?",owner);
            db.update("delete from money_transactions where user_id=?",owner);
            db.update("delete from auth.users where id=?",owner);
        }
    }

    private String save(MoneyAccountLedgerService ledger,UUID id,long expected,String type) {
        try {
            Map<String,Object> receipt=ledger.financialType(id,
                new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),expected,type));
            return receipt.get("status").toString();
        } catch (OptimisticLockConflictException stale) {
            return "CONFLICT";
        }
    }
}
