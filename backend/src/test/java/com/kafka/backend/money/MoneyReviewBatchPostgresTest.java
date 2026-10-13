package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.math.BigDecimal;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyReviewBatchPostgresTest {
 final MoneyRecommendationPostgresTest fixture=new MoneyRecommendationPostgresTest();
 MoneyReviewBatchService service;MoneyAiService ai;
 @BeforeEach void setup()throws Exception{fixture.create();var meaning=new MoneyMeaningService(fixture.db,()->fixture.owner,fixture.json);var review=new MoneyReviewService(fixture.db,()->fixture.owner,fixture.web,fixture.product,meaning,fixture.json);ai=new MoneyAiService(fixture.db,()->fixture.owner,fixture.json,review,fixture.web,fixture.product,fixture.money,meaning);service=new MoneyReviewBatchService(fixture.db,()->fixture.owner,ai,fixture.money,fixture.json,fixture.manager);}
 @AfterEach void cleanup(){fixture.cleanup();}
 UUID raw(String title,String reason){return new TransactionTemplate(fixture.manager).execute(status->{var r=fixture.money.ingest(Map.of("title",title,"text","Synthetic notification evidence","postedAt",Instant.now().toString(),"idempotencyKey",UUID.randomUUID().toString())).notification();fixture.money.finishProcessing(r.id(),ProcessingState.REVIEW_REQUIRED,reason);return r.id();});}
 MoneyReviewBatchService.Preview selected(String action,UUID...ids){return new MoneyReviewBatchService.Preview("SELECTED",Arrays.stream(ids).map(id->new MoneyReviewBatchService.Target(id,"RAW")).toList(),"PENDING",null,null,null,null,action);}
 List<Map<String,Object>> items(Map<String,Object> value){return (List<Map<String,Object>>)value.get("items");}
 UUID merchantRaw(String merchant,String mask){return new TransactionTemplate(fixture.manager).execute(status->{
  fixture.db.update("update money_accounts set masked_reference='975-******-01-014' where user_id=? and id=?",fixture.owner,fixture.account);
  Instant at=Instant.now().minusSeconds(600);String minute=at.atZone(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("MM/dd HH:mm"));
  var raw=fixture.money.ingest(Map.of("sourcePackage","com.ibk.android.ionebank","title","Synthetic "+UUID.randomUUID(),"text","[출금] 5,800원 "+merchant+" "+mask+" "+minute+" / 잔액 50,000원","postedAt",at.toString(),"idempotencyKey",UUID.randomUUID().toString())).notification();
  fixture.money.process(raw.id(),new IbkNotificationParserV1());fixture.db.update("update money_parse_attempts set created_at=now()-interval '5 minutes' where user_id=? and raw_event_id=?",fixture.owner,raw.id());fixture.money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"UNMATCHED_OR_EXTERNAL_UNPROVEN");return raw.id();
 });}
 @Test void explicitMoveRegistersExactlyOnceUncategorizedAndPreservesEvidenceAndOutcome(){
  UUID raw=merchantRaw("합성 카페","975-******-01-014");var original=fixture.money.notification(raw).rawPayload();long before=fixture.money.notification(raw).processingVersion();
  assertThat(ai.item(raw,"RAW",false)).containsEntry("moveToBookkeepingEligible",true).containsEntry("effectiveCurrency","KRW").containsEntry("accountId",fixture.account).containsEntry("type","EXPENSE");
  assertThat(fixture.money.notification(raw).processingVersion()).isEqualTo(before); // Read-only reassessment never posts a backlog.
  var preview=service.preview(selected("MOVE_TO_BOOKKEEPING",raw));assertThat(preview).containsEntry("eligibleCount",1L);var command=new MoneyReviewBatchService.Execute((UUID)preview.get("previewId"),UUID.randomUUID());
  var result=service.execute(command);assertThat(items(result)).singleElement().satisfies(r->assertThat(r).containsEntry("status","SAVED").containsEntry("canUndo",false));
  UUID transaction=UUID.fromString(items(result).getFirst().get("transactionId").toString());var fact=fixture.money.transaction(transaction);assertThat(fact.amount()).isEqualByComparingTo(new BigDecimal("5800"));assertThat(fact.type()).isEqualTo(TransactionType.EXPENSE);assertThat(fact.categoryId()).isNull();assertThat(fact.sources()).hasSize(1);assertThat(fixture.money.notification(raw).rawPayload()).isEqualTo(original);
  assertThat(service.execute(command)).isEqualTo(service.outcome(command.requestId()));assertThat(fixture.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,fixture.owner)).isEqualTo(1L);assertThat(ai.workbench("PENDING",null,null,null,50,0)).containsEntry("total",0L);
  var completed=ai.workbench("COMPLETED",null,null,null,50,0);assertThat(completed).containsEntry("total",1L);assertThat(items(completed)).singleElement().satisfies(r->{assertThat(r).containsEntry("id",raw).containsEntry("merchant","합성 카페").containsEntry("currency","KRW").containsEntry("accountId",fixture.account).containsEntry("canUndo",false).containsEntry("reason","MOVE_TO_BOOKKEEPING");assertThat((BigDecimal)r.get("amount")).isEqualByComparingTo("5800");});
  assertThat(service.preview(selected("NON_TRANSACTION",raw))).containsEntry("eligibleCount",0L);assertThat(fixture.calls.get()).isZero();
 }
 @Test void unknownOwnedAccountRemainsBlockedAndSourceVersionConflictRetainsPending(){
  UUID unknown=merchantRaw("합성 카페","975-******-01-999");assertThat(service.preview(selected("MOVE_TO_BOOKKEEPING",unknown))).containsEntry("eligibleCount",0L);
  UUID eligible=merchantRaw("합성 약국","975-******-01-014");var p=service.preview(selected("MOVE_TO_BOOKKEEPING",eligible));assertThat(p).containsEntry("eligibleCount",1L);
  fixture.db.update("update money_raw_notifications set processing_version=processing_version+1 where user_id=? and id=?",fixture.owner,eligible);var result=service.execute(new MoneyReviewBatchService.Execute((UUID)p.get("previewId"),UUID.randomUUID()));assertThat(items(result)).singleElement().satisfies(r->assertThat(r).containsEntry("status","CONFLICT"));assertThat(fixture.money.notification(eligible).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);assertThat(fixture.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,fixture.owner)).isZero();
 }
 @Test void schedulerAdmitsNewStructuredMerchantExpenseWithoutExternalAi(){
  UUID raw=merchantRaw("합성 카페","975-******-01-014");fixture.db.update("update money_raw_notifications set state='PARSED',processing_due_at=now() where user_id=? and id=?",fixture.owner,raw);
  assertThat(new MoneyProcessingService(fixture.db,fixture.json,fixture.manager).runOwner(fixture.owner)).isEqualTo(1);assertThat(fixture.money.notification(raw).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(fixture.db.queryForObject("select count(*) from money_transactions where user_id=? and category_id is null",Long.class,fixture.owner)).isEqualTo(1L);assertThat(fixture.calls.get()).isZero();
 }
 @Test void oppositeUnresolvedEvidenceAt120SecondsBlocksMoveAndNewAutomaticExpense(){
  UUID out=merchantRaw("합성 카페","975-******-01-014");Instant at=fixture.money.notification(out).postedAt().plusSeconds(120);String minute=at.atZone(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("MM/dd HH:mm"));
  new TransactionTemplate(fixture.manager).execute(status->{var raw=fixture.money.ingest(Map.of("sourcePackage","com.ibk.android.ionebank","title","Synthetic opposite","text","[입금] 5,800원 확인 필요 975-******-01-999 "+minute+" / 잔액 50,000원","postedAt",at.toString(),"idempotencyKey",UUID.randomUUID().toString())).notification();fixture.money.process(raw.id(),new IbkNotificationParserV1());fixture.money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"ACCOUNT_RESOLUTION_REQUIRED");return null;});
  assertThat(ai.item(out,"RAW",false)).containsEntry("moveToBookkeepingEligible",false);assertThat(service.preview(selected("MOVE_TO_BOOKKEEPING",out))).containsEntry("eligibleCount",0L);
  fixture.db.update("update money_raw_notifications set state='PARSED',processing_due_at=now() where user_id=? and id=?",fixture.owner,out);assertThat(new MoneyProcessingService(fixture.db,fixture.json,fixture.manager).runOwner(fixture.owner)).isZero();assertThat(fixture.money.notification(out).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);assertThat(fixture.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,fixture.owner)).isZero();
 }
 @Test void explicitCandidateCurrencyIsPreservedAndForeignOrConflictingFactsStayBlocked(){
  UUID raw=merchantRaw("합성 카페","975-******-01-014");fixture.db.update("update money_parse_attempts set candidate=jsonb_set(candidate,'{currency}',cast(? as jsonb)) where user_id=? and raw_event_id=?",fixture.json.writeValueAsString("USD"),fixture.owner,raw);
  var row=ai.item(raw,"RAW",false);assertThat(row).containsEntry("effectiveCurrency","USD").containsEntry("moveToBookkeepingEligible",false);assertThat(service.preview(selected("MOVE_TO_BOOKKEEPING",raw))).containsEntry("eligibleCount",0L);
  fixture.db.update("update money_raw_notifications set raw_payload=jsonb_set(raw_payload,'{currency}',cast(? as jsonb)) where user_id=? and id=?",fixture.json.writeValueAsString("KRW"),fixture.owner,raw);assertThat(ai.item(raw,"RAW",false)).containsEntry("effectiveCurrency","KRW").containsEntry("moveToBookkeepingEligible",false);
 }
 @Test void clearsOnlyEligibleInformationPreservesRawAndRejectsFinancialException(){
  UUID notice=raw("(광고) Synthetic event","UNRECOGNIZED_SHAPE"),financial=raw("Synthetic unresolved account","ACCOUNT_RESOLUTION_REQUIRED");var original=fixture.money.notification(notice).rawPayload();var p=service.preview(selected("NON_TRANSACTION",notice,financial));
  assertThat(p).containsEntry("selectedCount",2).containsEntry("eligibleCount",1L).containsEntry("excludedCount",1L);
  assertThat(items(p).stream().filter(r->!Boolean.TRUE.equals(r.get("eligible"))).findFirst().orElseThrow()).containsEntry("id",financial).containsKey("exclusionReason").containsKey("nextAction");
  UUID request=UUID.randomUUID();var result=service.execute(new MoneyReviewBatchService.Execute((UUID)p.get("previewId"),request));assertThat(items(result)).extracting(r->r.get("status")).containsExactly("SAVED");
  assertThat(fixture.money.notification(notice).rawPayload()).isEqualTo(original);assertThat(fixture.money.notification(notice).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(fixture.money.notification(financial).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
  assertThat(fixture.db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,fixture.owner)).isZero();
  UUID event=UUID.fromString(items(result).getFirst().get("eventId").toString());new TransactionTemplate(fixture.manager).execute(status->ai.undo(event));assertThat(fixture.money.notification(notice).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
 }
 @Test void partialConflictHasStableReplayAndOutcomeReadWithoutDuplicatedWrites(){
  UUID a=raw("(광고) First","UNRECOGNIZED_SHAPE"),b=raw("(광고) Second","UNRECOGNIZED_SHAPE");var p=service.preview(selected("NON_TRANSACTION",a,b));
  new TransactionTemplate(fixture.manager).execute(status->{fixture.db.update("update money_raw_notifications set processing_version=processing_version+1 where id=?",b);return null;});
  var input=new MoneyReviewBatchService.Execute((UUID)p.get("previewId"),UUID.randomUUID());var first=service.execute(input);assertThat(items(first)).extracting(r->r.get("status")).containsExactly("SAVED","CONFLICT");
  long events=fixture.db.queryForObject("select count(*) from money_ai_events where user_id=? and kind='NON_TRANSACTION'",Long.class,fixture.owner);assertThat(events).isEqualTo(1);
  assertThat(service.execute(input)).isEqualTo(service.outcome(input.requestId()));assertThat(fixture.db.queryForObject("select count(*) from money_ai_events where user_id=? and kind='NON_TRANSACTION'",Long.class,fixture.owner)).isEqualTo(events);assertThat(fixture.money.notification(b).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
  var changed=service.preview(selected("NON_TRANSACTION",b));assertThatThrownBy(()->service.execute(new MoneyReviewBatchService.Execute((UUID)changed.get("previewId"),input.requestId()))).isInstanceOf(InvalidRequestException.class);
 }
 @Test void filterSnapshotIncludesAllPagesAndDoesNotExpandForNewArrival(){
  for(int i=0;i<51;i++)raw("(광고) Page "+i,"UNRECOGNIZED_SHAPE");var p=service.preview(new MoneyReviewBatchService.Preview("FILTER",null,"PENDING",null,null,null,null,"NON_TRANSACTION"));assertThat(p).containsEntry("selectedCount",51);UUID late=raw("(광고) Late","UNRECOGNIZED_SHAPE");assertThat(items(p)).extracting(r->r.get("id")).doesNotContain(late);assertThat(items(p)).allMatch(r->r.get("amount")==null);
 }
 @Test void outcomesAndPreviewAreOwnerScoped(){
  UUID a=raw("(광고) Owner","UNRECOGNIZED_SHAPE");var p=service.preview(selected("DEFER",a));var cmd=new MoneyReviewBatchService.Execute((UUID)p.get("previewId"),UUID.randomUUID());service.execute(cmd);
  var foreign=new MoneyReviewBatchService(fixture.db,UUID::randomUUID,ai,fixture.money,fixture.json,fixture.manager);assertThatThrownBy(()->foreign.outcome(cmd.requestId())).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->foreign.execute(cmd)).isInstanceOf(ResourceNotFoundException.class);
 }
 @Test void unsupportedForeignCurrencyAndAccountHintsAreNotBulkInformation(){
  UUID financial=raw("Synthetic 입금 USD 100","UNRECOGNIZED_SHAPE"),hint=raw("Synthetic 계좌 1234 확인","UNRECOGNIZED_SHAPE");
  var preview=service.preview(selected("NON_TRANSACTION",financial,hint));
  assertThat(preview).containsEntry("eligibleCount",0L).containsEntry("excludedCount",2L);
 }
 @Test void reopenOutcomeDoesNotOfferUnsupportedUndo(){
  UUID notice=raw("(광고) Synthetic event","UNRECOGNIZED_SHAPE");
  var defer=service.preview(selected("DEFER",notice));
  var deferred=service.execute(new MoneyReviewBatchService.Execute((UUID)defer.get("previewId"),UUID.randomUUID()));
  assertThat(items(deferred).getFirst()).containsEntry("canUndo",true);
  var reopen=service.preview(selected("REOPEN",notice));
  var reopened=service.execute(new MoneyReviewBatchService.Execute((UUID)reopen.get("previewId"),UUID.randomUUID()));
  assertThat(items(reopened).getFirst()).containsEntry("canUndo",false);
 }
}
