package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.time.Duration;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:554(?:42|67)/postgres.*")
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
  var summary=f.web.bookkeeping("2026-10-14","2026-10-14","EXPENSE",null,50,0,false).get("summary");var overview=new HashMap<>(f.web.overview("2026-10-14","2026-10-14"));overview.remove("balanceAsOf");var ledger=f.product.ledgerDelta(bank,Instant.EPOCH,Instant.parse("2026-10-15T00:00:00Z"));
  raw("낯선 가게","출금");assertThat(items()).hasSize(1);
  assertThat(f.web.bookkeeping("2026-10-14","2026-10-14","EXPENSE",null,50,0,false).get("summary")).isEqualTo(summary);var after=new HashMap<>(f.web.overview("2026-10-14","2026-10-14"));after.remove("balanceAsOf");assertThat(after).isEqualTo(overview);assertThat(f.product.ledgerDelta(bank,Instant.EPOCH,Instant.parse("2026-10-15T00:00:00Z"))).isEqualTo(ledger);
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
 @Test void measureServerIngestionVisibilityAndRealObservationDecision()throws Exception{
  var samples=new ArrayList<Double>();var received=new ArrayList<Instant>();var ids=new ArrayList<UUID>();
  for(int i=0;i<12;i++){
   var payload=new HashMap<String,Object>();payload.put("sourcePackage","com.shinhan.sbanking");payload.put("notificationKey",UUID.randomUUID().toString());payload.put("deviceId","synthetic-measurement");payload.put("title","입금");payload.put("text",(1001+i)+"원 합성 정산 통장(1228) 10.14 12:00 잔액 "+(20001+i)+"원");payload.put("postedAt","2026-10-14T03:00:01Z");
   var ingested=f.money.ingest(payload).notification();received.add(ingested.receivedAt());ids.add(ingested.id());assertThat(items()).anyMatch(row->ingested.id().equals(row.get("rawEventId")));samples.add(Duration.between(ingested.receivedAt(),Instant.now()).toNanos()/1e6);
  }
  var processing=new MoneyProcessingService(f.db,f.json,f.manager);
  assertThat(processing.runOwner(f.owner)).isZero();assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
  // One real wait, no repeated graph scans. Runtime dispatcher/HTTP/browser overhead is outside this measurement.
  Thread.sleep(10100);assertThat(processing.runOwner(f.owner)).isEqualTo(12);Instant decided=Instant.now();assertThat(items()).isEmpty();assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(12);
  var finalMs=received.stream().map(at->Duration.between(at,decided).toNanos()/1e6).sorted().toList();var visibility=samples.stream().sorted().toList();
  System.out.println("ADMISSION_MEASUREMENT "+f.json.writeValueAsString(Map.of("environment","OWNED_LOOPBACK_POSTGRES_SERVICE","clock","server received_at to Instant.now; manually dispatched after real10s observation","samples",12,"visibilityAverageMs",visibility.stream().mapToDouble(Double::doubleValue).average().orElseThrow(),"visibilityP50Ms",visibility.get(5),"visibilityP95Ms",visibility.get(11),"decisionAverageMs",finalMs.stream().mapToDouble(Double::doubleValue).average().orElseThrow(),"decisionP50Ms",finalMs.get(5),"decisionP95Ms",finalMs.get(11),"canonicalCount",12)));
  assertThat(f.db.queryForObject("select count(*) from money_transaction_sources where user_id=? and raw_event_id=any(?)",Long.class,f.owner,ids.toArray(UUID[]::new))).isEqualTo(12L);
 }
 @org.springframework.context.annotation.Configuration
 @org.springframework.scheduling.annotation.EnableScheduling
 static class SchedulingProbeConfiguration {}
 @Test void measureActualDefaultSchedulerAndCommittedPersistenceWithoutAdvancingClock()throws Exception{
  record Pass(Instant started,Instant commitAcknowledged,int posted){}
  var passes=Collections.synchronizedList(new ArrayList<Pass>());
  var done=new java.util.concurrent.CountDownLatch(3);
  var worker=new MoneyProcessingService(f.db,f.json,f.manager){
   @Override int runOwner(UUID owner){
    Instant started=Instant.now();int count=super.runOwner(owner);Instant returned=Instant.now();
    if(count>0){passes.add(new Pass(started,returned,count));for(int i=0;i<count;i++)done.countDown();}
    return count;
   }
  };
  var notifications=new ArrayList<MoneyRawNotification>();var visible=new ArrayList<Instant>();
  try(var context=new org.springframework.context.annotation.AnnotationConfigApplicationContext()){
   context.register(SchedulingProbeConfiguration.class);
   context.registerBean(MoneyProcessingService.class,()->worker);
   context.registerBean(MoneyProcessingScheduler.class,()->new MoneyProcessingScheduler(worker));
   context.refresh(); // Actual @Scheduled default initial/fixed delay: 5000ms; no manual dispatch.
   for(int i=0;i<3;i++){
    if(i>0)Thread.sleep(i==1?250:2250);
    var payload=Map.<String,Object>of("sourcePackage","com.shinhan.sbanking","notificationKey",UUID.randomUUID().toString(),
      "deviceId","synthetic-scheduler-measurement","title","입금","text",(1501+i)+"원 합성 지급처 "+i+" 통장(1228) 10.14 12:00 잔액 "+(30001+i)+"원","postedAt","2026-10-14T03:00:01Z");
    var notification=f.money.ingest(payload).notification();notifications.add(notification);
    assertThat(items()).anyMatch(row->notification.id().equals(row.get("rawEventId")));visible.add(Instant.now());
   }
   assertThat(done.await(25,java.util.concurrent.TimeUnit.SECONDS)).as("real scheduled processing completes; no maturity timestamp edits").isTrue();
  }
  assertThat(f.db.queryForObject("select count(*) from money_transactions where user_id=? and type='INCOME' and to_account_id=?",Long.class,f.owner,bank)).isEqualTo(3L);
  assertThat(f.db.queryForObject("select count(*) from money_transaction_sources where user_id=?",Long.class,f.owner)).isEqualTo(3L);
  assertThat(items()).isEmpty();
  var samples=new ArrayList<Map<String,Object>>();
  for(int i=0;i<notifications.size();i++){
   var raw=notifications.get(i);Instant stored=f.db.queryForObject("select t.created_at from money_transactions t join money_transaction_sources s on s.transaction_id=t.id and s.user_id=t.user_id where s.user_id=? and s.raw_event_id=?",java.sql.Timestamp.class,f.owner,raw.id()).toInstant();
   var pass=passes.stream().filter(p->!p.commitAcknowledged().isBefore(stored)).findFirst().orElseThrow();
   double committedMs=Duration.between(raw.receivedAt(),pass.commitAcknowledged()).toNanos()/1e6;
   samples.add(Map.of("sample",i,"intakeAt",raw.receivedAt().toString(),"processingProjectionObservedAt",visible.get(i).toString(),
     "admissionPassStartedAt",pass.started().toString(),"storedTransactionCreatedAt",stored.toString(),"commitAcknowledgedAt",pass.commitAcknowledged().toString(),
     "commitAcknowledgedLatencyMs",committedMs,"exceedsTenSecondTarget",committedMs>10000,"uiVisibility","NOT_MEASURED"));
   assertThat(committedMs).as("preserve the approved 10-second observation safety window").isGreaterThanOrEqualTo(10000);
  }
  System.out.println("ADMISSION_SCHEDULER_ACCEPTANCE "+f.json.writeValueAsString(Map.of("environment","OWNED_LOOPBACK_POSTGRES_ACTUAL_SPRING_SCHEDULER",
    "clock","server received_at and JVM Instant.now, same machine; no HTTP/Android/browser boundary","observationWindowMs",10000,"schedulerDelayMs",5000,
    "decisionTimestampBoundary","Admission decision occurs within pass start and acknowledged committed return; exact decision instant is not instrumented",
    "persistenceTimestampBoundary","stored created_at is PostgreSQL transaction-start time; JDBC commit acknowledged by service return",
    "instrumentation","one projection read per intake, one fact timestamp read per sample after completion; no DB polling loop","samples",samples)));
 }
 UUID movement(String title,String cp,String suffix,int balance,String posted){return f.money.ingest(Map.of("sourcePackage","com.shinhan.sbanking","notificationKey",UUID.randomUUID().toString(),"deviceId","synthetic-interaction","title",title,"text","1,234원 "+cp+" 통장("+suffix+") 10.14 12:00 잔액 "+balance+"원","postedAt",posted)).notification().id();}
 MoneyProcessingService worker(int seconds){return new MoneyProcessingService(f.db,f.json,f.manager,Clock.fixed(Instant.now().plusSeconds(seconds),ZoneOffset.UTC));}
 @Test void pairWithDifferentCounterpartTextPostsImmediatelyAndRemovesBothRows(){
  UUID destination=f.money.createAccount(new AccountInput("SHINHAN","합성 목적통장",AccountRole.SPENDING,null,"4321")).id();
  UUID out=movement("출금","홍길동","1228",9876,"2026-10-14T03:00:01Z"),in=movement("입금","다른 표시명","4321",5432,"2026-10-14T03:00:31Z");assertThat(items()).hasSize(2);
  assertThat(worker(0).runOwner(f.owner)).isEqualTo(1);assertThat(items()).isEmpty();var facts=f.db.queryForList("select * from money_transactions where user_id=?",f.owner);assertThat(facts).singleElement().satisfies(row->assertThat(row).containsEntry("type","TRANSFER").containsEntry("from_account_id",bank).containsEntry("to_account_id",destination));
  assertThat(f.db.queryForList("select raw_event_id from money_transaction_sources where user_id=?",UUID.class,f.owner)).containsExactlyInAnyOrder(out,in);assertThat(worker(0).runDue()).isZero();
 }
 @Test void latePairDoesNotRewriteConfirmedExpenseOrCreateSecondFact(){
  f.money.createAccount(new AccountInput("SHINHAN","합성 목적통장",AccountRole.SPENDING,null,"4321"));
  UUID out=movement("출금","홍길동","1228",9876,"2026-10-14T03:00:01Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);var facts=f.db.queryForList("select to_jsonb(t)::text from money_transactions t where user_id=? order by id",f.owner);
  UUID in=movement("입금","다른 표시명","4321",5432,"2026-10-14T03:00:31Z");assertThat(worker(11).runOwner(f.owner)).isZero();assertThat(f.db.queryForList("select to_jsonb(t)::text from money_transactions t where user_id=? order by id",f.owner)).isEqualTo(facts);
  assertThat(f.money.notification(in)).satisfies(row->{assertThat(row.state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);assertThat(row.processingReason()).isEqualTo("LATE_POSTED_TRANSFER_LINK_REQUIRED");});assertThat(f.money.notification(out).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(worker(11).runOwner(f.owner)).isZero();
 }
 @Test void independentEqualAmountPaymentsWithinOneProviderMinuteUseDistinctBalanceFlow(){
  movement("입금","합성 정산","1228",9876,"2026-10-14T03:00:01Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);
  movement("입금","합성 정산","1228",11110,"2026-10-14T03:00:05Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);assertThat(f.db.queryForObject("select count(*) from money_transactions where user_id=? and type='INCOME'",Long.class,f.owner)).isEqualTo(2L);
 }
 @Test void recapturedSameMovementKeepsOneFactAndSpecificOverlapReview(){
  movement("입금","합성 정산","1228",9876,"2026-10-14T03:00:01Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);
  UUID again=movement("입금","합성 정산","1228",9876,"2026-10-14T03:00:05Z");assertThat(worker(11).runOwner(f.owner)).isZero();assertThat(f.money.notification(again).processingReason()).isEqualTo("POSSIBLE_ALREADY_POSTED_ROUTE");assertThat(f.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,f.owner)).isEqualTo(1L);
 }
 @Test void legacyOwnerProvenanceAndCancelledFactsCannotBeSilentlyRecreated(){
  f.money.createAccount(new AccountInput("SHINHAN","합성 목적통장",AccountRole.SPENDING,null,"4321"));
  UUID out=movement("출금","홍길동","1228",9876,"2026-10-14T03:00:01Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);
  // Simulate historical owner-confirmed source metadata in this disposable schema only.
  f.db.update("update money_transaction_sources set evidence='{\"rule\":\"OWNER_ASSERTED_REVIEW\"}' where user_id=? and raw_event_id=?",f.owner,out);
  f.db.update("update money_transactions set excluded=true where user_id=?",f.owner);var before=f.db.queryForList("select to_jsonb(t)::text from money_transactions t where user_id=?",f.owner);
  UUID in=movement("입금","다른 표시명","4321",5432,"2026-10-14T03:00:31Z");assertThat(worker(11).runOwner(f.owner)).isZero();assertThat(f.money.notification(in).processingReason()).isEqualTo("LATE_POSTED_TRANSFER_LINK_REQUIRED");assertThat(f.db.queryForList("select to_jsonb(t)::text from money_transactions t where user_id=?",f.owner)).isEqualTo(before);
 }
 @Test void recaptureWithDifferentCounterpartFormattingStillUsesSameBankBalanceIdentity(){
  movement("입금","표시명 하나","1228",9876,"2026-10-14T03:00:01Z");assertThat(worker(11).runOwner(f.owner)).isEqualTo(1);
  f.db.update("update money_transaction_sources set evidence=evidence-'providerOccurredAt'-'occurredAt'-'counterpartyText' where user_id=?",f.owner);
  UUID again=movement("입금","표시명 둘","1228",9876,"2026-10-14T03:00:05Z");assertThat(worker(11).runOwner(f.owner)).isZero();assertThat(f.money.notification(again).processingReason()).isEqualTo("POSSIBLE_ALREADY_POSTED_ROUTE");assertThat(f.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,f.owner)).isEqualTo(1L);
 }
 @Test void netGrossPairNeverInfersASeparateExpenseIncomeOrFee(){
  f.money.createAccount(new AccountInput("SHINHAN","합성 목적통장",AccountRole.SPENDING,null,"4321"));UUID out=movement("출금","동일 표시","1228",9876,"2026-10-14T03:00:01Z");
  var in=f.money.ingest(Map.of("sourcePackage","com.shinhan.sbanking","notificationKey",UUID.randomUUID().toString(),"deviceId","synthetic-interaction","title","입금","text","1,200원 동일 표시 통장(4321) 10.14 12:00 잔액 5,432원","postedAt","2026-10-14T03:00:02Z")).notification();
  assertThat(worker(11).runOwner(f.owner)).isZero();assertThat(f.money.notification(out).processingReason()).isEqualTo("NET_GROSS_TRANSFER_CONFLICT");assertThat(f.money.notification(in.id()).processingReason()).isEqualTo("NET_GROSS_TRANSFER_CONFLICT");assertThat(f.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,f.owner)).isZero();
 }
 @Test void processingProjectionHasTwoBatchedQueriesIndependentOfObservationCount()throws Exception{
  for(int i=0;i<50;i++)raw("합성 지급처 "+i,"입금");
  try(var connection=f.pool.getConnection()){
   var queries=new java.util.concurrent.atomic.AtomicInteger();
   var counted=(java.sql.Connection)java.lang.reflect.Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{java.sql.Connection.class},(p,m,args)->{
    if(m.getName().equals("prepareStatement"))queries.incrementAndGet();try{return m.invoke(connection,args);}catch(java.lang.reflect.InvocationTargetException e){throw e.getCause();}
   });
   var db=new org.springframework.jdbc.core.JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(counted,true));var money=new MoneyService(db,()->f.owner,f.json);var reader=new MoneyProcessingReadService(db,()->f.owner,f.json,money);
   for(int sample=0;sample<5;sample++){queries.set(0);long start=System.nanoTime();var result=reader.processing("2026-10-14","2026-10-14");double ms=(System.nanoTime()-start)/1e6;assertThat(result.get("items")).asList().hasSize(50);assertThat(queries).hasValue(2);System.out.println("ADMISSION_QUERY_COST "+f.json.writeValueAsString(Map.of("rows",50,"sample",sample,"queries",queries.get(),"serviceMs",ms,"boundary","read-only processing projection; single loopback connection")));}
  }
 }
}
