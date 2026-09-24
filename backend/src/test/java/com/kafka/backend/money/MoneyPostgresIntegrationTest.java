package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** DEV tests roll back all domain work except the isolated concurrency fixture, removed by exact UUID in finally. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyPostgresIntegrationTest {
    static final UUID OWNER=UUID.fromString(System.getenv("APP_DEV_USER_ID"));
    static Connection connection() throws Exception {
        return DriverManager.getConnection(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
    }
    static MoneyService service(JdbcTemplate db,UUID owner) {return new MoneyService(db,()->owner,JsonMapper.builder().build());}
    static TransactionSource source(UUID raw,UUID attempt,SourceRelationship role) {return new TransactionSource(raw,attempt,role,Map.of("method","fixture-test"));}
    static TransactionInput tx(TransactionType type,UUID from,UUID to,List<TransactionSource> sources) {
        return new TransactionInput(type,from,to,new BigDecimal("2000.00"),"KRW",Instant.parse("2026-09-24T05:14:00Z"),"<COUNTERPARTY>",sources);
    }
    @Test void accountsIngestLifecycleLedgerAndOwnershipRoundTrip() throws Exception {
        try(var c=connection()) {
            c.setAutoCommit(false);
            var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
            db.execute("set local statement_timeout='15s'");
            db.execute("set local lock_timeout='5s'");
            try {
                var service=service(db,OWNER); var outsider=service(db,UUID.randomUUID());
                var from=service.createAccount(new AccountInput("IBK","Fixture Spending",AccountRole.SPENDING,"975-******-01-014",null));
                var to=service.createAccount(new AccountInput("SHINHAN","Fixture Income",AccountRole.INCOME_HUB,null,"1228"));
                var savings=service.createAccount(new AccountInput("SHINHAN","Fixture Savings",AccountRole.SAVINGS,null,"6017"));
                assertThat(service.account(savings.id()).role()).isEqualTo(AccountRole.SAVINGS);
                var updated=service.updateAccount(from.id(),new AccountUpdate(0L,new AccountInput("IBK","Renamed",AccountRole.SPENDING,"975-******-01-014",null)));
                assertThat(updated.displayName()).isEqualTo("Renamed");
                assertThat(service.archiveAccount(from.id(),new ArchiveAccount(1L,true)).archived()).isTrue();
                assertThat(service.archiveAccount(from.id(),new ArchiveAccount(2L,false)).archived()).isFalse();
                assertThatThrownBy(()->service.archiveAccount(from.id(),new ArchiveAccount(0L,true))).isInstanceOf(OptimisticLockConflictException.class);
                assertThat(outsider.accounts()).isEmpty();
                assertThatThrownBy(()->outsider.account(from.id())).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->outsider.updateAccount(from.id(),new AccountUpdate(3L,null))).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->outsider.archiveAccount(from.id(),new ArchiveAccount(3L,true))).isInstanceOf(ResourceNotFoundException.class);

                List<MoneyRawNotification> raws=new ArrayList<>(); List<ParseAttempt> attempts=new ArrayList<>();
                String run=UUID.randomUUID().toString();
                for(var fixture:MoneyFixtures.all()) {
                    var payload=MoneyFixtures.payload(fixture); payload.put("deviceId",run); payload.put("unknownFutureField",Map.of("nested",List.of(1,2,3)));
                    var ingest=service.ingest(payload); assertThat(ingest.created()).isTrue();
                    var raw=ingest.notification(); raws.add(raw);
                    assertThat(raw.rawPayload()).isEqualTo(payload);
                    var reversed=new TreeMap<>(payload);
                    assertThat(service.ingest(reversed).created()).isFalse();
                    assertThat(service.ingest(reversed).notification().id()).isEqualTo(raw.id());
                    var attempt=service.process(raw.id(),MoneyFixtures.parser(fixture.provider())); attempts.add(attempt);
                    assertThat(attempt.candidate().amount()).isEqualByComparingTo(fixture.amount());
                    assertThat(service.notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
                    assertThat(service.notification(raw.id()).rawPayload()).isEqualTo(payload);
                }
                UUID rawId=raws.getFirst().id();
                assertThatThrownBy(()->outsider.notification(rawId)).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->outsider.attempts(rawId)).isInstanceOf(ResourceNotFoundException.class);
                assertThat(outsider.notifications(null,50,0)).isEmpty();
                assertThat(service.notifications(ProcessingState.REVIEW_REQUIRED,200,0)).extracting(MoneyRawNotification::id).contains(rawId);

                var ledger=service.recordTransaction(tx(TransactionType.TRANSFER,from.id(),to.id(),List.of(
                        source(raws.get(1).id(),attempts.get(1).id(),SourceRelationship.PRIMARY),source(rawId,attempts.getFirst().id(),SourceRelationship.PRIMARY))));
                assertThat(service.transaction(ledger.id())).isEqualTo(ledger);
                assertThat(ledger.sources()).hasSize(2);
                assertThat(service.notification(rawId).state()).isEqualTo(ProcessingState.PROCESSED);
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.INCOME,null,to.id(),List.of(source(rawId,null,SourceRelationship.PRIMARY)))))
                        .isInstanceOf(OptimisticLockConflictException.class);
                assertThatThrownBy(()->outsider.transaction(ledger.id())).isInstanceOf(ResourceNotFoundException.class);
                assertThat(outsider.transactions(50,0)).isEmpty();
                assertThatThrownBy(()->outsider.recordTransaction(tx(TransactionType.TRANSFER,from.id(),to.id(),ledger.sources())))
                        .isInstanceOf(ResourceNotFoundException.class);

                // Generic synthetic capture for ledger persistence only, not an invented bank notification format.
                var external=service.ingest(Map.of("postedAt","2026-09-24T05:14:00Z","text","Synthetic external-income provenance","deviceId",run)).notification();
                var incoming=service.recordTransaction(tx(TransactionType.INCOME,null,to.id(),List.of(source(external.id(),null,SourceRelationship.PRIMARY))));
                var externalExpense=service.ingest(Map.of("postedAt","2026-09-24T05:27:00Z","text","Synthetic external-expense provenance","deviceId",run)).notification();
                var expense=service.recordTransaction(new TransactionInput(TransactionType.EXPENSE,from.id(),null,new BigDecimal("3000"),"KRW",
                        Instant.parse("2026-09-24T05:27:00Z"),"<COUNTERPARTY>",List.of(source(externalExpense.id(),null,SourceRelationship.PRIMARY))));
                assertThat(service.transactions(200,0)).extracting(MoneyTransaction::id).contains(incoming.id(),expense.id(),ledger.id());
                var kakao=service.createAccount(new AccountInput("KAKAO","Fixture Gateway",AccountRole.SAVINGS_GATEWAY,null,"8557"));
                var favorite=service.createAccount(new AccountInput("KAKAO","Fixture Favorite",AccountRole.SAVINGS,null,"7530"));
                var free=service.createAccount(new AccountInput("KAKAO","Fixture Free Savings",AccountRole.SAVINGS,null,"4851"));
                var sameBank=service.recordTransaction(new TransactionInput(TransactionType.TRANSFER,kakao.id(),free.id(),new BigDecimal("1000"),"KRW",
                        Instant.parse("2026-09-24T05:31:00Z"),null,List.of(source(raws.get(7).id(),attempts.get(7).id(),SourceRelationship.PRIMARY),
                        source(raws.get(6).id(),attempts.get(6).id(),SourceRelationship.AUXILIARY))));
                assertThat(sameBank.sources()).hasSize(2);
                var single=service.recordTransaction(new TransactionInput(TransactionType.TRANSFER,kakao.id(),favorite.id(),new BigDecimal("20000"),"KRW",
                        Instant.parse("2026-09-24T05:31:00Z"),null,List.of(source(raws.get(4).id(),attempts.get(4).id(),SourceRelationship.PRIMARY))));
                assertThat(single.sources()).hasSize(1);
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.TRANSFER,from.id(),from.id(),List.of(source(raws.get(5).id(),null,SourceRelationship.PRIMARY)))))
                        .isInstanceOf(InvalidRequestException.class);
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.EXPENSE,UUID.randomUUID(),null,List.of(source(raws.get(5).id(),null,SourceRelationship.PRIMARY)))))
                        .isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.EXPENSE,from.id(),null,List.of(source(raws.get(5).id(),attempts.getFirst().id(),SourceRelationship.PRIMARY)))))
                        .isInstanceOf(ResourceNotFoundException.class);

                MoneyNotificationParser failing=new MoneyNotificationParser() {
                    public String key(){return "failure-test";} public String version(){return "1";}
                    public boolean supports(MoneyRawNotification raw){return true;}
                    public ParsedCandidate parse(MoneyRawNotification raw){throw new IllegalStateException("private raw text must not be retained as an error");}
                };
                UUID unposted=raws.get(5).id();
                assertThat(service.process(unposted,failing).failureCode()).isEqualTo("PARSER_ERROR");
                assertThat(service.notification(unposted).state()).isEqualTo(ProcessingState.FAILED);
                assertThat(service.notification(unposted).rawPayload()).isEqualTo(raws.get(5).rawPayload());
                service.process(unposted,MoneyFixtures.parser("KAKAO"));
                assertThat(service.attempts(unposted)).hasSize(3);
                MoneyNotificationParser parsed=new MoneyNotificationParser() {
                    public String key(){return "normalized-contract-test";} public String version(){return "1";}
                    public boolean supports(MoneyRawNotification raw){return true;}
                    public ParsedCandidate parse(MoneyRawNotification raw){
                        return new ParsedCandidate(raw.id(),"KAKAO",Direction.IN,new BigDecimal("20000"),null,null,
                                "최애적금(7530)","입출금통장(8557)",List.of("7530","8557"),null,null,"ACCOUNT_ACTIVITY",ParseStatus.PARSED);
                    }
                };
                service.process(unposted,parsed);
                assertThat(service.notification(unposted).state()).isEqualTo(ProcessingState.PARSED);
                var unsupported=service.process(unposted,MoneyFixtures.parser("IBK"));
                assertThat(unsupported.candidate().notificationSubtype()).isEqualTo("UNSUPPORTED");
                assertThat(service.notification(unposted).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
                service.process(rawId,failing);
                assertThat(service.notification(rawId).state()).isEqualTo(ProcessingState.PROCESSED);
                assertThat(service.transaction(ledger.id())).isEqualTo(ledger);

                var explicit=MoneyFixtures.payload(MoneyFixtures.all().getFirst()); explicit.put("deviceId",run+"-explicit"); explicit.put("idempotencyKey",run);
                var first=service.ingest(explicit);
                assertThat(service.ingest(explicit).notification().id()).isEqualTo(first.notification().id());
                explicit.put("text","Different notification");
                assertThatThrownBy(()->service.ingest(explicit)).isInstanceOf(OptimisticLockConflictException.class);
                assertThat(service.notification(first.notification().id()).text()).isNotEqualTo("Different notification");

                // Two valid owners can ingest identical captures; their accounts and raw sources never mix.
                UUID otherOwner=UUID.randomUUID();
                db.update("insert into auth.users(id) values(?)",otherOwner);
                var other=service(db,otherOwner);
                var otherAccount=other.createAccount(new AccountInput("IBK","Other Owner Fixture",AccountRole.SPENDING,null,null));
                var ownPayload=MoneyFixtures.payload(MoneyFixtures.all().getFirst()); ownPayload.put("deviceId",run+"-owners");
                var ownerRaw=service.ingest(ownPayload).notification();
                var otherRaw=other.ingest(ownPayload).notification();
                assertThat(ownerRaw.id()).isNotEqualTo(otherRaw.id());
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.TRANSFER,from.id(),otherAccount.id(),List.of(source(ownerRaw.id(),null,SourceRelationship.PRIMARY)))))
                        .isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(()->service.recordTransaction(tx(TransactionType.EXPENSE,from.id(),null,List.of(source(otherRaw.id(),null,SourceRelationship.PRIMARY)))))
                        .isInstanceOf(ResourceNotFoundException.class);
                // Database composite FK rejects another valid owner's account even if future service code misses a check.
                Savepoint savepoint=c.setSavepoint();
                assertThatThrownBy(()->db.update("update money_transactions set from_account_id=? where id=?",otherAccount.id(),ledger.id()))
                        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
                c.rollback(savepoint);
            } finally {c.rollback();}
        }
    }
    @Test void simultaneousDuplicateDeliveryCreatesExactlyOneRow() throws Exception {
        UUID marker=UUID.randomUUID();
        var payload=MoneyFixtures.payload(MoneyFixtures.all().getFirst()); payload.put("deviceId",marker.toString());
        payload.put("idempotencyKey",marker.toString());
        var gate=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<IngestResult> delivery=()->{
                try(var c=connection()) {
                    c.setAutoCommit(false);
                    var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
                    db.execute("set statement_timeout='15s'");
                    gate.await(10,TimeUnit.SECONDS);
                    var result=service(db,OWNER).ingest(payload);
                    c.commit();
                    return result;
                }
            };
            var a=pool.submit(delivery); var b=pool.submit(delivery);
            var one=a.get(30,TimeUnit.SECONDS); var two=b.get(30,TimeUnit.SECONDS);
            assertThat(one.notification().id()).isEqualTo(two.notification().id());
            assertThat(List.of(one.created(),two.created())).containsExactlyInAnyOrder(true,false);
            try(var c=connection()) {
                var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
                assertThat(db.queryForObject("select count(*) from money_raw_notifications where user_id=? and device_id=?",Integer.class,OWNER,marker.toString())).isEqualTo(1);
            }
        } finally {
            try(var c=connection()) {
                var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));
                db.update("delete from money_raw_notifications where user_id=? and device_id=? and dedupe_key=?",OWNER,marker.toString(),"client:"+marker);
            }
        }
    }
}
