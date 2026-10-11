package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
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
}
