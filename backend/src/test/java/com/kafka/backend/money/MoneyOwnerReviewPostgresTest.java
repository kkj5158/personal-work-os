package com.kafka.backend.money;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import java.time.Instant;
import java.math.BigDecimal;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:55467/postgres.*")
class MoneyOwnerReviewPostgresTest{
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();MoneyOwnerReviewService service;
 @BeforeEach void setup()throws Exception{f.create();service=new MoneyOwnerReviewService(f.db,()->f.owner,f.json,f.money,f.commands);}
 @AfterEach void cleanup(){f.cleanup();}
 UUID raw(String currency){return new org.springframework.transaction.support.TransactionTemplate(f.manager).execute(status->{
  var r=f.money.ingest(Map.of("sourcePackage","com.ibk.android.ionebank","title","입출금내역 알림","text","[출금] 5,800원 합성카페 975-******-01-014 09/16 10:00 / 잔액 50,000원","postedAt","2026-09-16T01:00:00Z","idempotencyKey",UUID.randomUUID().toString(),"currency",currency)).notification();
  f.money.process(r.id(),new IbkNotificationParserV1());f.money.finishProcessing(r.id(),ProcessingState.REVIEW_REQUIRED,"ACCOUNT_RESOLUTION_REQUIRED");return r.id();});}
 MoneyOwnerReviewService.Decision choice(UUID id,String action,UUID account,UUID other,UUID existing){return new MoneyOwnerReviewService.Decision(UUID.randomUUID(),service.context(id).get("fingerprint").toString(),action,account,other,existing,account.equals(f.account)?f.money.account(account).version():0L,other==null?null:f.money.account(other).version(),existing==null?null:f.money.transaction(existing).version());}
 UUID transaction(Map<String,Object> outcome){return UUID.fromString(((Map<?,?>)outcome.get("result")).get("transactionId").toString());}
 @Test void ownerAccountSelectionPreservesAmountSourceAndUnclassified(){UUID raw=raw("KRW");var payload=f.money.notification(raw).rawPayload();var request=choice(raw,"REGISTER",f.account,null,null);var result=service.decide(raw,request);assertThat(result).containsEntry("status","APPLIED");var fact=f.money.transaction(transaction(result));assertThat(fact.amount()).isEqualByComparingTo("5800");assertThat(fact.currency()).isEqualTo("KRW");assertThat(fact.categoryId()).isNull();assertThat(fact.sources()).hasSize(1);assertThat(fact.sources().getFirst().evidence()).containsEntry("rule","OWNER_ASSERTED_REVIEW");assertThat(f.money.notification(raw).rawPayload()).isEqualTo(payload);assertThat(service.decide(raw,request)).isEqualTo(result);assertThat(f.calls.get()).isZero();}
 @Test void foreignCurrencyIsNotConverted(){UUID raw=raw("USD");var result=service.decide(raw,choice(raw,"REGISTER",f.account,null,null));assertThat(result).containsEntry("status","APPLIED");assertThat(f.money.transaction(transaction(result)).currency()).isEqualTo("USD");assertThat(f.money.transaction(transaction(result)).amount()).isEqualByComparingTo("5800");}
 @Test void explicitTransferIsOneCanonicalIdentity(){UUID raw=raw("KRW"),other=f.money.createAccount(new AccountInput("IBK","도착",AccountRole.SAVINGS,null,null)).id();var result=service.decide(raw,choice(raw,"TRANSFER",f.account,other,null));assertThat(result).containsEntry("status","APPLIED");var t=f.money.transaction(transaction(result));assertThat(t.type()).isEqualTo(TransactionType.TRANSFER);assertThat(t.fromAccountId()).isEqualTo(f.account);assertThat(t.toAccountId()).isEqualTo(other);}
 @Test void duplicateLinkAddsEvidenceWithoutNewFact(){UUID raw=raw("KRW");UUID existing=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("5800"),Instant.parse("2026-09-16T01:00:00Z"),"기존 거래",f.category,"보존 메모",false,null,null,"기존 제목")).id();var before=f.money.transaction(existing);var result=service.decide(raw,choice(raw,"LINK_DUPLICATE",f.account,null,existing));assertThat(result).containsEntry("status","APPLIED");assertThat(transaction(result)).isEqualTo(existing);assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(1L);assertThat(f.money.transaction(existing).categoryId()).isEqualTo(before.categoryId());assertThat(f.money.transaction(existing).memo()).isEqualTo(before.memo());assertThat(f.money.transaction(existing).sources()).hasSize(1);}
 @Test void duplicateMismatchRollsBackSource(){UUID raw=raw("KRW"),existing=f.expense("다른 금액");assertThat(service.decide(raw,choice(raw,"LINK_DUPLICATE",f.account,null,existing))).containsEntry("status","NOT_APPLIED");assertThat(f.money.transaction(existing).sources()).isEmpty();assertThat(f.money.notification(raw).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);}
 @Test void sourceVersionConflictDoesNotRegister(){UUID raw=raw("KRW");var c=choice(raw,"REGISTER",f.account,null,null);f.db.update("update money_raw_notifications set processing_version=processing_version+1 where id=?",raw);assertThat(service.decide(raw,c)).containsEntry("status","NOT_APPLIED");assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();}
 @Test void foreignOrArchivedAccountCannotRegister(){UUID raw=raw("KRW");assertThat(service.decide(raw,choice(raw,"REGISTER",UUID.randomUUID(),null,null))).containsEntry("status","NOT_APPLIED");f.db.update("update money_accounts set archived=true where id=?",f.account);assertThat(service.decide(raw,choice(raw,"REGISTER",f.account,null,null))).containsEntry("status","NOT_APPLIED");}
 @Test void staleDifferentRequestCannotRepostLinkedSource(){UUID raw=raw("KRW");var c=choice(raw,"REGISTER",f.account,null,null);assertThat(service.decide(raw,c)).containsEntry("status","APPLIED");assertThat(service.decide(raw,new MoneyOwnerReviewService.Decision(UUID.randomUUID(),c.fingerprint(),c.action(),c.accountId(),null,null,c.accountVersion(),null,null))).containsEntry("status","NOT_APPLIED");assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isEqualTo(1L);}

 @Test void sourceBackedCancelRestoreKeepsRawSourceAndProcessing(){
  UUID raw=raw("KRW");UUID id=transaction(service.decide(raw,choice(raw,"REGISTER",f.account,null,null)));var before=f.money.notification(raw);var fact=f.money.transaction(id);
  var registrations=new MoneyRegistrationService(f.db,()->f.owner,f.json,f.money,f.commands);
  var cancelled=registrations.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),fact.version(),null,null),false);
  assertThat(cancelled).containsEntry("status","APPLIED");UUID cancellation=UUID.fromString(((Map<?,?>)cancelled.get("result")).get("cancellationId").toString());
  assertThat(f.money.notification(raw)).isEqualTo(before);assertThat(registrations.change(id,new MoneyRegistrationService.Change(UUID.randomUUID(),f.money.transaction(id).version(),cancellation,null),true)).containsEntry("status","APPLIED");
  assertThat(f.money.notification(raw)).isEqualTo(before);assertThat(f.money.transaction(id).sources()).isEqualTo(fact.sources());assertThat(f.money.transaction(id).categoryId()).isNull();
 }
 @Test void staleSelectedAccountAndDuplicateVersionsRejectWithoutPosting(){
  UUID raw=raw("KRW");var selected=choice(raw,"REGISTER",f.account,null,null);f.db.update("update money_accounts set version=version+1 where id=?",f.account);
  assertThat(service.decide(raw,selected)).containsEntry("status","NOT_APPLIED");
  UUID existing=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("5800"),Instant.parse("2026-09-16T01:00:00Z"),"중복",null,null,false,null,null,"원본")).id();
  var linked=choice(raw,"LINK_DUPLICATE",f.account,null,existing);f.db.update("update money_transactions set version=version+1 where id=?",existing);
  assertThat(service.decide(raw,linked)).containsEntry("status","NOT_APPLIED");assertThat(f.money.transaction(existing).sources()).isEmpty();
 }

 @Test void durableSelectionSurvivesReaderReplacementAndDoesNotChangeBooks(){
  UUID a=f.expense("선택 A"),b=f.expense("다른 기간 B");var original=f.money.transaction(a);var selection=new MoneySelectionService(f.db,()->f.owner,f.commands);
  var command=new MoneySelectionService.Selection(UUID.randomUUID(),"book-workbench-EXPENSE",List.of(a,b));assertThat(selection.save(command)).containsEntry("status","APPLIED");assertThat(selection.save(command)).containsEntry("status","APPLIED");
  assertThat(new MoneySelectionService(f.db,()->f.owner,f.commands).read("book-workbench-EXPENSE").get("ids")).asList().containsExactlyInAnyOrder(a,b);
  assertThat(f.money.transaction(a)).isEqualTo(original);assertThat(selection.save(new MoneySelectionService.Selection(UUID.randomUUID(),"book-workbench-EXPENSE",List.of(UUID.randomUUID())))).containsEntry("status","NOT_APPLIED");
  assertThat(selection.read("book-workbench-EXPENSE").get("ids")).asList().hasSize(2);selection.save(new MoneySelectionService.Selection(UUID.randomUUID(),"book-workbench-EXPENSE",List.of()));assertThat(selection.read("book-workbench-EXPENSE").get("ids")).asList().isEmpty();
 }

 @Test void changedNeighborGraphInvalidatesTheDisplayedOwnerChoice(){
  UUID raw=raw("KRW");var decision=choice(raw,"REGISTER",f.account,null,null);
  f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("5800"),Instant.parse("2026-09-16T01:00:00Z"),"새 중복 근거",null,null,false,null,null,"새 금융 근거"));
  assertThat(service.decide(raw,decision)).containsEntry("status","NOT_APPLIED");assertThat(f.money.notification(raw).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
 }
}
