package com.kafka.backend.calendar;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real isolated SQL transactions exercise durable replay, rollback, and owner-row serialization. */
class CalendarCreationOperationsTest {
    final UUID owner=UUID.randomUUID();
    final CurrentUserProvider users=mock(CurrentUserProvider.class);
    JdbcTemplate db;
    DataSourceTransactionManager transactions;
    CalendarCreationOperations operations;
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000","sa","");
        db=new JdbcTemplate(ds);transactions=new DataSourceTransactionManager(ds);
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");
        db.update("insert into auth.users values (?)",owner);
        db.execute("create table calendar_creation_operations(user_id uuid,operation_id uuid,operation_kind varchar(80),response_json text,primary key(user_id,operation_id))");
        db.execute("create table sources(id uuid primary key,user_id uuid,title varchar)");
        when(users.getCurrentUserId()).thenReturn(owner);
        operations=service();
    }
    CalendarCreationOperations service() {
        var proxy=new ProxyFactory(new CalendarCreationOperations(db,users));
        proxy.addAdvice(new TransactionInterceptor(transactions,new AnnotationTransactionAttributeSource()));
        return (CalendarCreationOperations)proxy.getProxy();
    }
    CalendarActualEditorDto create(String title) {
        var id=UUID.randomUUID();db.update("insert into sources values (?,?,?)",id,users.getCurrentUserId(),title);
        return new CalendarActualEditorDto(ActualSourceType.LIFE_TIME_ENTRY,id,LocalDate.of(2026,7,13),null,title,30,null,null,"fixture",null);
    }
    CalendarActualEditorDto save(UUID key,String title) {
        return operations.execute(key,"ACTUAL:LIFE_TIME_ENTRY",CalendarActualEditorDto.class,()->create(title),r->true);
    }
    int sources(){return db.queryForObject("select count(*) from sources",Integer.class);}
    int receipts(){return db.queryForObject("select count(*) from calendar_creation_operations",Integer.class);}
    @Test void committedResponseLostThenRetryAfterServiceRestartReturnsOneSourceEvenIfPayloadChanged() {
        var key=UUID.randomUUID();var first=save(key,"First");
        operations=service();
        assertThat(save(key,"Edited after lost response")).isEqualTo(first);
        assertThat(sources()).isEqualTo(1);assertThat(receipts()).isEqualTo(1);
    }
    @Test void identicalContentFromDifferentOperationsCreatesIndependentSources() {
        var first=save(UUID.randomUUID(),"Same");var second=save(UUID.randomUUID(),"Same");
        assertThat(first.id()).isNotEqualTo(second.id());assertThat(sources()).isEqualTo(2);
        db.update("delete from sources where id=?",first.id());assertThat(sources()).isEqualTo(1);
    }
    @Test void sameKeyConcurrentProcessingCreatesOnce() throws Exception {
        var key=UUID.randomUUID();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var executions=new AtomicInteger();
        try(var threads=Executors.newFixedThreadPool(2)) {
            var first=threads.submit(()->operations.execute(key,"ACTUAL:LIFE_TIME_ENTRY",CalendarActualEditorDto.class,()->{
                executions.incrementAndGet();var value=create("Same");entered.countDown();
                try {if(!release.await(5,TimeUnit.SECONDS))throw new IllegalStateException("Timed out");}
                catch(InterruptedException e){throw new IllegalStateException(e);}return value;
            },r->true));
            assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            var second=threads.submit(()->save(key,"Same"));release.countDown();
            assertThat(second.get(5,TimeUnit.SECONDS)).isEqualTo(first.get(5,TimeUnit.SECONDS));
        } finally {release.countDown();}
        assertThat(executions.get()).isEqualTo(1);assertThat(sources()).isEqualTo(1);
    }
    @Test void failureRollsBackSourceAndReceiptAndRetryRemainsAvailable() {
        var key=UUID.randomUUID();
        assertThatThrownBy(()->operations.execute(key,"ACTUAL:LIFE_TIME_ENTRY",CalendarActualEditorDto.class,()->{
            create("Before failure");throw new InvalidRequestException("failed after insert");
        },r->true)).isInstanceOf(InvalidRequestException.class);
        assertThat(sources()).isZero();assertThat(receipts()).isZero();
        save(key,"Retry");assertThat(sources()).isEqualTo(1);
    }
    @Test void deletedSourceReplayNeverResurrectsIt() {
        var key=UUID.randomUUID();var first=save(key,"Same");db.update("delete from sources where id=?",first.id());
        assertThat(save(key,"Same")).isEqualTo(first);assertThat(sources()).isZero();
    }
    @Test void keyIsOwnerScopedAndCannotBeReusedForAnotherKind() {
        var key=UUID.randomUUID();var first=save(key,"Same");
        assertThatThrownBy(()->operations.execute(key,"BATCH_ACTUAL",BatchActualResponse.class,
            ()->new BatchActualResponse(true,List.of()),BatchActualResponse::committed)).isInstanceOf(InvalidRequestException.class);
        var secondOwner=UUID.randomUUID();db.update("insert into auth.users values (?)",secondOwner);
        when(users.getCurrentUserId()).thenReturn(secondOwner);
        assertThat(save(key,"Same").id()).isNotEqualTo(first.id());assertThat(sources()).isEqualTo(2);
    }
    @Test void failedBatchDoesNotClaimKeyAndCommittedBatchReplaysEverySourceReference() {
        var key=UUID.randomUUID();
        operations.execute(key,"BATCH_ACTUAL",BatchActualResponse.class,()->new BatchActualResponse(false,List.of()),BatchActualResponse::committed);
        assertThat(receipts()).isZero();
        var result=operations.execute(key,"BATCH_ACTUAL",BatchActualResponse.class,()->{
            var one=create("Same");var two=create("Same");return new BatchActualResponse(true,List.of(
                new BatchActualItemResult(0,true,null,one.sourceType(),one.id()),new BatchActualItemResult(1,true,null,two.sourceType(),two.id())));
        },BatchActualResponse::committed);
        var replay=service().execute(key,"BATCH_ACTUAL",BatchActualResponse.class,()->{throw new AssertionError("Replayed creation");},BatchActualResponse::committed);
        assertThat(replay).isEqualTo(result);assertThat(sources()).isEqualTo(2);
    }
}
