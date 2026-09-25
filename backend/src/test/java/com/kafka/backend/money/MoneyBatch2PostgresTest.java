package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyBatch2PostgresTest {
    static class MutableClock extends Clock {
        Instant now=Instant.now();public Instant instant(){return now;}public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}
    }
    interface Check {void run(JdbcTemplate db,MoneyService service,MoneyProcessingService pipeline,MutableClock clock);}
    void rollback(Check check) throws Exception {
        try(var c=MoneyPostgresIntegrationTest.connection()){
            var ds=new SingleConnectionDataSource(c,true);var manager=new DataSourceTransactionManager(ds);var db=new JdbcTemplate(ds);
            var clock=new MutableClock();var pipeline=new MoneyProcessingService(db,JsonMapper.builder().build(),manager,clock);
            new TransactionTemplate(manager).execute(status->{try{
                db.execute("set local statement_timeout='20s'");db.execute("set local lock_timeout='5s'");
                check.run(db,MoneyPostgresIntegrationTest.service(db,MoneyPostgresIntegrationTest.OWNER),pipeline,clock);return null;
            }finally{status.setRollbackOnly();}});
        }
    }
    void seed(MoneyService service){for(var a:accounts())service.createAccount(new AccountInput(a.provider(),a.displayName(),a.role(),a.maskedReference(),a.suffix()));}
    @Test void automaticLifecycleTenTransfersRetryReprocessingAndProvenance() throws Exception {rollback((db,money,pipeline,clock)->{
        seed(money);var ids=new ArrayList<UUID>();var payloads=audit().stream().map(VerifiedMoneyFixtures::payload).toList();
        for(var p:payloads){var first=money.ingest(p);assertThat(first.created()).isTrue();ids.add(first.notification().id());
            assertThat(money.ingest(p).notification().id()).isEqualTo(first.notification().id());}
        assertThat(pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER)).isZero();
        for(var id:ids){assertThat(money.notification(id).state()).isEqualTo(ProcessingState.PARSED);assertThat(money.attempts(id).size()).isEqualTo(1);}
        clock.now=clock.now.plusSeconds(180);
        assertThat(pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER)).isEqualTo(10);
        assertThat(pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER)).isZero();
        for(var id:ids){assertThat(money.notification(id).state()).isEqualTo(ProcessingState.PROCESSED);
            assertThat(db.queryForObject("select count(*) from money_transaction_sources where raw_event_id=?",Integer.class,id)).isEqualTo(1);
            assertThatThrownBy(()->money.requestReprocessing(id)).isInstanceOf(com.kafka.backend.common.InvalidRequestException.class);}
        // Explicit reparsing appends an attempt but cannot unpost/rewrite the ledger.
        money.process(ids.getFirst(),new IbkNotificationParserV1());assertThat(money.attempts(ids.getFirst()).size()).isEqualTo(2);
        assertThat(money.notification(ids.getFirst()).state()).isEqualTo(ProcessingState.PROCESSED);
        assertThat(money.ingest(payloads.getFirst()).notification().id()).isEqualTo(ids.getFirst());
    });}
    @Test void reviewFailureOwnerIsolationAndDeliberateRetry() throws Exception {rollback((db,money,pipeline,clock)->{
        var raw=money.ingest(payload(audit().getFirst())).notification();
        var outsider=MoneyPostgresIntegrationTest.service(db,UUID.randomUUID());
        assertThatThrownBy(()->outsider.requestReprocessing(raw.id())).isInstanceOf(com.kafka.backend.common.ResourceNotFoundException.class);
        pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER);assertThat(money.notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
        assertThat(money.notification(raw.id()).processingReason()).isEqualTo("ACCOUNT_RESOLUTION_REQUIRED");
        seed(money);money.requestReprocessing(raw.id());pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER);
        assertThat(money.notification(raw.id()).state()).isEqualTo(ProcessingState.PARSED);
        assertThat(money.attempts(raw.id()).size()).isEqualTo(2);
        clock.now=clock.now.plusSeconds(180);pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER);
        assertThat(money.notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
        var failing=new MoneyNotificationParser(){public String key(){return "test-failure";}public String version(){return "1";}public boolean supports(MoneyRawNotification r){return true;}
            public ParsedCandidate parse(MoneyRawNotification r){throw new IllegalArgumentException("test-only private text");}};
        money.process(raw.id(),failing);assertThat(money.notification(raw.id()).state()).isEqualTo(ProcessingState.FAILED);
        assertThat(money.notification(raw.id()).rawPayload().size()).isGreaterThan(0);assertThat(money.attempts(raw.id()).getLast().failureCode()).isEqualTo("PARSER_ERROR");
    });}
    @Test void auxiliaryBeforeOrAfterPrimaryNeverCreatesAnExtraTransaction() throws Exception {rollback((db,money,pipeline,clock)->{
        seed(money);var primary=raw("KAKAO","출금 1,000원","입출금통장(8557) → 자유적금(4851) 잔액 9,000원",NOW.minusSeconds(300));
        var aux=raw("KAKAO","적금 입금 성공","자유적금(4851)에 1,000원이 입금되었어요!",NOW.minusSeconds(299));
        UUID auxId=money.ingest(payload(aux)).notification().id(),primaryId=money.ingest(payload(primary)).notification().id();
        pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER);clock.now=clock.now.plusSeconds(180);
        assertThat(pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER)).isEqualTo(1);
        assertThat(pipeline.runOwner(MoneyPostgresIntegrationTest.OWNER)).isZero();
        assertThat(money.notification(auxId).state()).isEqualTo(ProcessingState.PROCESSED);
        var tx=db.queryForList("select distinct transaction_id from money_transaction_sources where raw_event_id in (?,?)",UUID.class,auxId,primaryId);
        assertThat(tx).hasSize(1);assertThat(money.transaction(tx.getFirst()).sources()).hasSize(2);
        var source=money.transaction(tx.getFirst()).sources().stream().filter(s->s.rawEventId().equals(auxId)).findFirst().orElseThrow();
        assertThat(source.relationship()).isEqualTo(SourceRelationship.AUXILIARY);money.attachAuxiliary(tx.getFirst(),source);
        assertThat(money.transaction(tx.getFirst()).sources()).hasSize(2);
    });}
}
