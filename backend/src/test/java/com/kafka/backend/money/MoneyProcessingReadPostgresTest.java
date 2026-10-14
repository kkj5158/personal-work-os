package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55442/postgres.*")
class MoneyProcessingReadPostgresTest {
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();MoneyProcessingReadService read;UUID bank;
 @BeforeEach void setup()throws Exception{f.create();bank=f.money.createAccount(new AccountInput("SHINHAN","합성 통장",AccountRole.INCOME_HUB,null,"1228")).id();read=new MoneyProcessingReadService(f.db,()->f.owner,f.json,f.money);}
 @AfterEach void cleanup(){f.cleanup();}
 UUID raw(String cp,String title){var payload=new HashMap<String,Object>();payload.put("sourcePackage","com.shinhan.sbanking");payload.put("notificationKey",UUID.randomUUID().toString());payload.put("deviceId","synthetic");payload.put("title",title);payload.put("text","1,234원 "+cp+" 통장(1228) 10.14 12:00 잔액 9,876원");payload.put("postedAt","2026-10-14T03:00:01Z");return f.money.ingest(payload).notification().id();}
 @SuppressWarnings("unchecked") List<Map<String,Object>> items(){return (List<Map<String,Object>>)read.processing("2026-10-14","2026-10-14").get("items");}
 @Test void receivedIsVisibleWithoutPersistenceAndParsedKeepsSameIdentity(){
  UUID id=raw("낯선 정산처","입금");var before=f.db.queryForList("select to_jsonb(r)::text from money_raw_notifications r order by id");
  assertThat(items()).singleElement().satisfies(row->{assertThat(row).containsEntry("rawEventId",id).containsEntry("accountId",bank).containsEntry("status","PROCESSING");assertThat(row.get("amount")).isEqualTo(new BigDecimal("1234"));});
  assertThat(f.db.queryForObject("select count(*) from money_parse_attempts",Long.class)).isZero();assertThat(f.db.queryForList("select to_jsonb(r)::text from money_raw_notifications r order by id")).isEqualTo(before);
  f.money.process(id,new ShinhanNotificationParserV1());assertThat(items()).singleElement().satisfies(row->assertThat(row).containsEntry("rawEventId",id).containsEntry("status","PROCESSING"));
  assertThat(read.processing("2026-10-15","2026-10-15").get("items")).asList().isEmpty();
 }
 @Test void canonicalCommitRemovesObservationEvenIfCancelledAndBookCarriesSourceIdentity(){
  UUID id=raw("외부 지급처","입금");var attempt=f.money.process(id,new ShinhanNotificationParserV1());
  var tx=f.money.recordTransaction(new TransactionInput(TransactionType.INCOME,null,bank,new BigDecimal("1234"),"KRW",attempt.candidate().occurredAt(),"외부 지급처",List.of(new TransactionSource(id,attempt.id(),SourceRelationship.PRIMARY,Map.of()))));
  assertThat(items()).isEmpty();assertThat(f.web.bookkeepingRow(tx.id()).get("sourceRawEventIds")).asList().containsExactly(id.toString());
  f.db.update("update money_transactions set excluded=true where user_id=? and id=?",f.owner,tx.id());f.db.update("update money_raw_notifications set state='REVIEW_REQUIRED' where user_id=? and id=?",f.owner,id);assertThat(items()).isEmpty();
 }
 @Test void projectionDoesNotEnterAnyFinancialOrLearningStore(){
  var summary=f.web.bookkeeping("2026-10-14","2026-10-14","EXPENSE",null,50,0,false).get("summary");var overview=f.web.overview("2026-10-14","2026-10-14");var ledger=f.product.ledgerDelta(bank,Instant.EPOCH,Instant.parse("2026-10-15T00:00:00Z"));
  raw("낯선 가게","출금");assertThat(items()).hasSize(1);
  assertThat(f.web.bookkeeping("2026-10-14","2026-10-14","EXPENSE",null,50,0,false).get("summary")).isEqualTo(summary);assertThat(f.web.overview("2026-10-14","2026-10-14")).isEqualTo(overview);assertThat(f.product.ledgerDelta(bank,Instant.EPOCH,Instant.parse("2026-10-15T00:00:00Z"))).isEqualTo(ledger);
  for(String table:List.of("money_transactions","money_classification_events","money_classification_jobs","money_rule_projections"))assertThat(f.db.queryForObject("select count(*) from "+table,Long.class)).as(table).isZero();
 }
 @Test void terminalReviewHasSpecificReasonAndAccountScopeIsMandatory(){
  UUID id=raw("낯선 지급처","입금");f.money.process(id,new ShinhanNotificationParserV1());f.money.finishProcessing(id,ProcessingState.REVIEW_REQUIRED,"AMBIGUOUS_TRANSFER_PAIR");
  assertThat(items()).singleElement().satisfies(row->assertThat(row).containsEntry("status","REVIEW_REQUIRED").containsEntry("reasonCode","AMBIGUOUS_TRANSFER_PAIR").containsEntry("reasonText",MoneyAdmissionReasons.text("AMBIGUOUS_TRANSFER_PAIR")));
  UUID outsider=UUID.randomUUID();assertThat(new MoneyProcessingReadService(f.db,()->outsider,f.json,new MoneyService(f.db,()->outsider,f.json)).processing("2026-10-14","2026-10-14").get("items")).asList().isEmpty();
  f.money.createAccount(new AccountInput("SHINHAN","동일 식별 충돌",AccountRole.SPENDING,null,"1228"));assertThat(items()).isEmpty();
 }
 @Test void unsupportedSourceCurrencyAndUnknownAccountNeverBecomeProcessingRows(){
  UUID id=raw("낯선 지급처","입금");f.db.update("update money_raw_notifications set raw_payload=raw_payload||'{\"currency\":\"USD\"}'::jsonb where user_id=? and id=?",f.owner,id);assertThat(items()).isEmpty();
  f.db.update("update money_raw_notifications set raw_payload=raw_payload-'currency',source_package='unsupported' where user_id=? and id=?",f.owner,id);assertThat(items()).isEmpty();
  f.db.update("update money_raw_notifications set source_package='com.shinhan.sbanking',body=replace(body,'1228','9999') where user_id=? and id=?",f.owner,id);assertThat(items()).isEmpty();
 }
 @Test void existingLegacyReasonDoesNotMisreportAnAccountFailure(){
  assertThat(MoneyAdmissionReasons.text("UNMATCHED_OR_EXTERNAL_UNPROVEN")).contains("일반 수입·지출").doesNotContain("계좌");
  assertThat(MoneyAdmissionReasons.text("POSSIBLE_ALREADY_POSTED_ROUTE")).contains("거래");
 }
}
