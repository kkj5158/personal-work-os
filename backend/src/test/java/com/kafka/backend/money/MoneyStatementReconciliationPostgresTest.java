package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import java.util.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyStatementReconciliationService.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Synthetic loopback database only. Private golden source is read, never committed to Git. */
@org.junit.jupiter.api.condition.EnabledIf("com.kafka.backend.money.MoneyPostgresIntegrationTest#contractFixture")
class MoneyStatementReconciliationPostgresTest {
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();MoneyStatementReconciliationService service;
 String csv="no,time,out,inc,balance,desc,page\n1,2026-11-11 02:03:35,80000,0,78125,synthetic transfer,1\n";
 @BeforeEach void setup()throws Exception{f.create();f.db.execute(Files.readString(Path.of("src/main/resources/db/migration/V113__money_statement_reconciliation.sql")).replace("REFERENCES auth.users","REFERENCES "+f.schema+".qa_fixture_users"));f.db.execute(Files.readString(Path.of("src/main/resources/db/migration/V119__money_bank_replay_closeout.sql")).replace("REFERENCES auth.users","REFERENCES "+f.schema+".qa_fixture_users"));service=service(f.owner);}
 @AfterEach void cleanup(){f.cleanup();}
 MoneyStatementReconciliationService service(UUID owner){var money=new MoneyService(f.db,()->owner,f.json);var product=new MoneyProductService(f.db,()->owner,money,f.json);var web=new MoneyWebService(f.db,()->owner,money,product,f.json);var financial=new MoneyFinancialService(f.db,()->owner,money,product,web,f.json);var unified=new MoneyUnifiedBookkeepingService(f.db,()->owner,f.json,money,product,web,financial,f.commands);return new MoneyStatementReconciliationService(()->owner,f.db,f.json,money,f.commands,new MoneyStatementVault(Base64.getEncoder().encodeToString(new byte[32])),product,unified,new MoneyOwnerReviewService(f.db,()->owner,f.json,money,f.commands),f.manager);}
 UUID intake(byte[] bytes,String format){var u=(Map<?,?>)service.intake(new Intake(f.account,"IBK",format,MoneyStatementParser.hash(bytes),bytes.length));UUID id=(UUID)u.get("uploadId");for(int off=0,index=0;off<bytes.length;off+=30000,index++)service.chunk(new Chunk(id,index,Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes,off,Math.min(bytes.length,off+30000)))));return id;}
 UUID imported(byte[] bytes,String format){var completed=(Map<?,?>)service.complete(new Complete(intake(bytes,format)));return (UUID)((Map<?,?>)completed.get("statement")).get("id");}
 UUID statement(){UUID id=imported(csv.getBytes(StandardCharsets.UTF_8),"CSV");f.db.update("update money_bank_statements set verification='BANK_PDF_TABLE' where id=?",id);return id;}
 UUID row(UUID statement){return f.db.queryForObject("select id from money_statement_rows where statement_id=?",UUID.class,statement);}
 UUID run(UUID statement){return (UUID)((Map<?,?>)service.analyze(new Analyze(statement))).get("runId");}
 Item item(UUID row,String action,UUID transaction,Long version){return new Item(row,action,transaction,null,version,"Synthetic exact owner approved evidence",null,null,null,null,null,null,null);}
 Map<String,Object> preview(UUID statement,Item... items){return (Map<String,Object>)service.preview(new Preview(run(statement),List.of(items)));}
 Map<String,Object> execute(Map<String,Object> preview,UUID request){return (Map<String,Object>)service.execute(new Execute((UUID)preview.get("previewId"),preview.get("fingerprint").toString(),request,true));}
 long facts(){return f.db.queryForObject("select count(*) from money_transactions",Long.class);}
 @Test void nativeHtmlFormatMigrationAllowsOnlyAdditiveIntakeAndPreservesPostingGate()throws Exception{
  f.db.execute(Files.readString(Path.of("src/main/resources/db/migration/V118__money_native_html_statement.sql")));
  byte[] html=new MoneyStatementParserTest().html().getBytes(StandardCharsets.UTF_8);
  UUID s=imported(html,"HTML_XLS");assertThat(service.statement(s)).containsEntry("row_count",2).containsEntry("verification","TABULAR_CONTINUITY_ONLY_HTML_XLS");
  UUID selected=f.db.queryForObject("select id from money_statement_rows where statement_id=? and row_number=1",UUID.class,s);
  assertThatThrownBy(()->preview(s,item(selected,"REGISTER_CASH",null,null))).hasMessageContaining("CORROBORATING_BANK_PDF");assertThat(facts()).isZero();
 }
 @Test void identicalFileAndDuplicateChunkAreIdempotent(){byte[] bytes=csv.getBytes(StandardCharsets.UTF_8);UUID upload=intake(bytes,"CSV");assertThat((Map<String,Object>)service.chunk(new Chunk(upload,0,Base64.getEncoder().encodeToString(bytes)))).containsEntry("status","ALREADY_UPLOADED");assertThatThrownBy(()->service.chunk(new Chunk(upload,0,"YWJj"))).hasMessageContaining("CONFLICT");var a=(Map<?,?>)service.complete(new Complete(upload));var b=(Map<?,?>)service.complete(new Complete(upload));assertThat(b.get("status")).isEqualTo("ALREADY_IMPORTED");assertThat(f.db.queryForObject("select count(*) from money_bank_statements",Long.class)).isEqualTo(1);assertThat(facts()).isZero();assertThat((Map<String,Object>)service.observation((UUID)((Map<?,?>)a.get("statement")).get("id"))).containsEntry("doesNotSetCurrentAccountBalance",true);}
 @Test void uncorroboratedCsvCannotPost(){UUID s=imported(csv.getBytes(StandardCharsets.UTF_8),"CSV");assertThatThrownBy(()->preview(s,item(row(s),"REGISTER_CASH",null,null))).hasMessageContaining("CORROBORATING_BANK_PDF");assertThat(facts()).isZero();}
 @Test void explicitApprovalAndDurableOriginalRequestPreventDuplicateCash(){UUID s=statement(),r=row(s);var p=preview(s,item(r,"REGISTER_CASH",null,null));assertThat(facts()).isZero();assertThatThrownBy(()->service.execute(new Execute((UUID)p.get("previewId"),p.get("fingerprint").toString(),UUID.randomUUID(),false))).hasMessageContaining("APPROVAL");UUID req=UUID.randomUUID();var first=execute(p,req);assertThat(first).containsEntry("status","APPLIED");assertThat(execute(p,req)).isEqualTo(first);assertThat(facts()).isEqualTo(1);assertThat(f.db.queryForMap("select meaning_state,type,amount from money_transactions")).containsEntry("meaning_state","UNRESOLVED");assertThat(f.db.queryForObject("select count(*) from money_statement_effects",Long.class)).isEqualTo(1);assertThatThrownBy(()->preview(s,item(r,"REGISTER_CASH",null,null))).hasMessageContaining("EXISTING_OR_AMBIGUOUS");assertThat(f.commands.outcome(f.owner,UUID.randomUUID())).containsEntry("status","UNKNOWN");assertThat(f.db.queryForObject("select count(*) from money_classification_jobs where status=\'QUEUED\'",Long.class)).isZero();}
 @Test void sourceLinkPreservesOwnerMetadataAndHasNoCashImpact(){UUID s=statement(),r=row(s);var original=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),"synthetic transfer",f.category,"owner memo",false,null,null,"owner title"));long before=facts();var p=preview(s,item(r,"LINK_SOURCE",original.id(),original.version()));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(facts()).isEqualTo(before);var after=f.money.transaction(original.id());assertThat(after.title()).isEqualTo("owner title");assertThat(after.memo()).isEqualTo("owner memo");assertThat(after.categoryId()).isEqualTo(f.category);}
 @Test void amountTimeAloneIsAmbiguous(){UUID s=statement();f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),"unrelated",null,null,false,null,null,null));var d=(Map<?,?>)service.details(row(s));assertThat(d.get("status")).isEqualTo("AMBIGUOUS");assertThatThrownBy(()->preview(s,item(row(s),"REGISTER_CASH",null,null))).hasMessageContaining("AMBIGUOUS");}
 @Test void changedSourceGraphAndExpiredPreviewFailClosed(){UUID s=statement();var p=preview(s,item(row(s),"REGISTER_CASH",null,null));f.money.createAccount(new AccountInput("SHINHAN","New owned account",AccountRole.SAVINGS,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","NOT_APPLIED");assertThat(facts()).isZero();p=preview(s,item(row(s),"REGISTER_CASH",null,null));f.db.update("update money_reconciliation_plans set expires_at=now()-interval '1 second'");assertThat(execute(p,UUID.randomUUID())).containsEntry("status","NOT_APPLIED");assertThat(facts()).isZero();}
 @Test void missingTransferEndpointCompletesOriginalInboundOnce(){UUID s=statement();var other=f.money.createAccount(new AccountInput("KAKAO","Synthetic receiving account",AccountRole.SAVINGS_GATEWAY,null,null));var inbound=f.product.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,other.id(),new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),"synthetic transfer",null,"protected memo",false,null,null,"protected title"));var p=preview(s,item(row(s),"COMPLETE_TRANSFER",inbound.id(),inbound.version()));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(facts()).isEqualTo(1);var after=f.money.transaction(inbound.id());assertThat(after.type()).isEqualTo(TransactionType.TRANSFER);assertThat(after.fromAccountId()).isEqualTo(f.account);assertThat(after.toAccountId()).isEqualTo(other.id());assertThat(after.title()).isEqualTo("protected title");assertThat(after.amount()).isEqualByComparingTo("80000");}
 @Test void crossOwnerCannotReadUploadStatementRowRunOrPreview(){UUID s=statement(),run=run(s);var outsider=service(UUID.randomUUID());assertThatThrownBy(()->outsider.statement(s)).isInstanceOf(com.kafka.backend.common.ResourceNotFoundException.class);assertThatThrownBy(()->outsider.details(row(s))).isInstanceOf(com.kafka.backend.common.ResourceNotFoundException.class);assertThatThrownBy(()->outsider.status(run,25,0)).isInstanceOf(com.kafka.backend.common.ResourceNotFoundException.class);assertThatThrownBy(()->outsider.complete(new Complete(f.db.queryForObject("select upload_id from money_bank_statements",UUID.class)))).isInstanceOf(com.kafka.backend.common.ResourceNotFoundException.class);}
 @Test void originalPrivateIbkImports359RowsWithoutLedgerOrBalanceWrites()throws Exception{String path=System.getenv("MONEY_RECON_IBK_PDF");Assumptions.assumeTrue(path!=null,"Owner fixture outside Git");UUID s=imported(Files.readAllBytes(Path.of(path)),"PDF");assertThat(service.statement(s)).containsEntry("row_count",359);assertThat(f.db.queryForObject("select count(*) from money_statement_rows",Long.class)).isEqualTo(359);assertThat(facts()).isZero();var analysis=(Map<?,?>)service.analyze(new Analyze(s));assertThat(analysis.get("rowCount")).isEqualTo(359);assertThat(f.db.queryForObject("select count(*) from money_balance_checkpoints",Long.class)).isZero();}

 UUID raw(String bank,String title,String text){var notification=VerifiedMoneyFixtures.raw(bank,title,text,Instant.parse("2026-11-10T17:03:37Z"));var raw=f.money.ingest(VerifiedMoneyFixtures.payload(notification)).notification();f.money.process(raw.id(),VerifiedMoneyFixtures.parser(notification));f.money.finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"OWNER_DECISION");return raw.id();}
 @Test void providerChangePreservesBookedSourceAndHistoricalBalanceButUsesNewRoutingForNewAlerts(){
  String mask="975-******-01-014";
  f.db.update("update money_accounts set masked_reference=?,suffix='0140' where id=?",mask,f.account);
  UUID oldRaw=raw("IBK","입출금","[출금] 80,000원 synthetic "+mask+" 11/11 02:03 / 잔액 78,125원");
  var attempt=f.money.attempts(oldRaw).getLast();
  UUID booked=f.money.recordReviewTransactionId(new TransactionInput(TransactionType.EXPENSE,f.account,null,
      new BigDecimal("80000"),"KRW",attempt.candidate().occurredAt(),"synthetic",
      List.of(new TransactionSource(oldRaw,attempt.id(),SourceRelationship.PRIMARY,Map.of("rule","SYNTHETIC")))));
  f.money.finishProcessing(oldRaw,ProcessingState.PROCESSED,"POSTED");
  UUID previouslyUnassigned=raw("KAKAO","출금 4,000원","입출금통장(0140) → 최애적금(1820) 잔액 74,125원");
  var transactionBefore=f.money.transaction(booked);
  var rawBefore=f.money.notification(oldRaw);
  var observationsBefore=f.product.notificationObservations();
  var balanceBefore=f.product.balance(f.account);
  var summary=new MoneyReconciliationSummaryService(f.db,()->f.owner,f.money,f.product,f.json);
  var summaryBefore=summary.summary().accounts().stream().filter(a->a.account().id().equals(f.account)).findFirst().orElseThrow();
  assertThat(observationsBefore).hasSize(1);
  var impact=f.money.providerImpact(f.account,"KAKAO");
  assertThat(impact.transactions()).isEqualTo(1);
  assertThat(impact.linkedAlerts()).isEqualTo(1);
  assertThat(impact.preservedObservations()).isEqualTo(2);
  assertThat(impact.reviewAlerts()).isEqualTo(1);
  assertThat(f.db.queryForObject("select count(*) from money_provider_observation_routes",Long.class)).isZero();
  assertThatThrownBy(()->f.money.changeProvider(f.account,new MoneyAccountProviderChange.Request("KAKAO",impact.version(),"stale")))
      .hasMessageContaining("다시 확인");
  f.db.update("update money_raw_notifications set processing_due_at=now() where id=?",previouslyUnassigned);
  var blocked=f.money.providerImpact(f.account,"KAKAO");
  assertThat(blocked.scheduledAlerts()).isEqualTo(1);
  assertThatThrownBy(()->f.money.changeProvider(f.account,new MoneyAccountProviderChange.Request("KAKAO",blocked.version(),blocked.fingerprint())))
      .hasMessageContaining("처리 중");
  f.db.update("update money_raw_notifications set processing_due_at=null where id=?",previouslyUnassigned);
  var changed=f.money.changeProvider(f.account,new MoneyAccountProviderChange.Request("KAKAO",impact.version(),impact.fingerprint()));
  assertThat(changed.provider()).isEqualTo("KAKAO");
  assertThat(changed.id()).isEqualTo(f.account);
  assertThat(changed.version()).isEqualTo(impact.version()+1);
  assertThat(f.money.transaction(booked)).isEqualTo(transactionBefore);
  assertThat(f.money.notification(oldRaw)).isEqualTo(rawBefore);
  assertThat(f.money.attempts(oldRaw)).containsExactly(attempt);
  assertThat(new MoneyAccountManagementService(f.db,()->f.owner,f.money).eligibility(f.account).reasons())
      .contains("은행 알림 잔액 연결 이력");
  assertThat(f.product.notificationObservations()).isEqualTo(observationsBefore);
  assertThat(f.product.balance(f.account)).isEqualTo(balanceBefore);
  var summaryAfter=summary.summary().accounts().stream().filter(a->a.account().id().equals(f.account)).findFirst().orElseThrow();
  assertThat(summaryAfter.observedBalance()).isEqualTo(summaryBefore.observedBalance());
  assertThat(summaryAfter.observedAt()).isEqualTo(summaryBefore.observedAt());
  UUID newRaw=raw("KAKAO","출금 5,000원","입출금통장(0140) → 최애적금(1820) 잔액 69,125원");
  var nextAttempt=f.money.attempts(newRaw).getLast();
  f.money.recordReviewTransactionId(new TransactionInput(TransactionType.EXPENSE,f.account,null,
      new BigDecimal("5000"),"KRW",nextAttempt.candidate().occurredAt(),"synthetic",
      List.of(new TransactionSource(newRaw,nextAttempt.id(),SourceRelationship.PRIMARY,Map.of("rule","SYNTHETIC")))));
  assertThat(f.product.notificationObservations()).anySatisfy(o->assertThat(o)
      .containsEntry("accountId",f.account).containsEntry("amount",new BigDecimal("69125")));
  assertThat(f.db.queryForObject("select count(*) from money_provider_observation_routes where raw_event_id=? and account_id is null",
      Long.class,previouslyUnassigned)).isEqualTo(1);
 }

 @Test void providerChangeBlocksDestinationIdentityCollision(){
  f.db.update("update money_accounts set suffix='0140' where id=?",f.account);
  f.money.createAccount(new AccountInput("KAKAO","Synthetic savings",AccountRole.SAVINGS,null,"0140"));
  var impact=f.money.providerImpact(f.account,"KAKAO");
  assertThat(impact.collision()).isTrue();
  assertThatThrownBy(()->f.money.changeProvider(f.account,new MoneyAccountProviderChange.Request("KAKAO",impact.version(),impact.fingerprint())))
      .hasMessageContaining("이미 등록");
  assertThat(f.money.account(f.account).provider()).isEqualTo("IBK");
 }
 @Test void deferredAdditionalPushDoesNotPostSecondCashOrReopenSource(){UUID s=statement();f.db.update("update money_accounts set masked_reference='975-******-01-014' where id=?",f.account);UUID raw=raw("IBK","\uc785\ucd9c\uae08","[\ucd9c\uae08] 80,000\uc6d0 synthetic transfer 975-******-01-014 11/11 02:03 / \uc794\uc561 78,125\uc6d0");f.db.update("update money_raw_notifications set review_deferred=true where id=?",raw);var existing=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),"synthetic transfer",f.category,"owner memo",false,null,null,"owner title"));assertThat((Map<String,Object>)service.details(row(s))).containsEntry("status","DEFERRED_ALREADY_BOOKED");f.db.update("insert into money_review_decisions(user_id,transaction_id,transaction_version,displayed) values(?,?,?,\'{}\'::jsonb)",f.owner,existing.id(),existing.version());var p=preview(s,item(row(s),"LINK_SOURCE",existing.id(),existing.version()));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(facts()).isEqualTo(1);assertThat(f.db.queryForObject("select review_deferred from money_raw_notifications where id=?",Boolean.class,raw)).isTrue();assertThat(f.money.transaction(existing.id()).sources()).hasSize(1);assertThat(f.db.queryForObject("select transaction_version from money_review_decisions where transaction_id=?",Long.class,existing.id())).isEqualTo(f.money.transaction(existing.id()).version());}
 @Test void pairedRawSavingsCreatesOneCanonicalTransferWithTwoOriginalSources(){UUID s=statement();f.db.update("update money_accounts set masked_reference='975-******-01-014' where id=?",f.account);var other=f.money.createAccount(new AccountInput("SHINHAN","Synthetic savings",AccountRole.SAVINGS,null,"6017"));UUID out=raw("IBK","\uc785\ucd9c\uae08","[\ucd9c\uae08] 80,000\uc6d0 \uc2e0\ud55c\uc624\ud508OWNER 975-******-01-014 11/11 02:03 / \uc794\uc561 78,125\uc6d0"),in=raw("SHINHAN","\uc785\uae08","80,000\uc6d0 OWNER \uc815\uae30\uc801\uae08(6017) 11.11 02:03 \uc794\uc561 80,000\uc6d0");var i=new Item(row(s),"REGISTER_TRANSFER_RAW",null,null,null,"Both owned bank source endpoints verified",null,null,null,null,null,null,null,out,in,other.id());var p=preview(s,i);assertThat(facts()).isZero();assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(facts()).isEqualTo(1);assertThat(f.db.queryForObject("select count(*) from money_transaction_sources",Long.class)).isEqualTo(2);assertThat(f.db.queryForObject("select type from money_transactions",String.class)).isEqualTo("TRANSFER");assertThat(f.money.notification(out).state()).isEqualTo(ProcessingState.PROCESSED);assertThat(f.money.notification(in).state()).isEqualTo(ProcessingState.PROCESSED);}

 @Test void completesBookedGatewayCashWithItsBankCorroboratedSavingsRoute(){
  f.db.update("update money_accounts set provider='KAKAO',role='SAVINGS_GATEWAY',suffix='9910' where id=?",f.account);
  UUID savings=f.money.createAccount(new AccountInput("KAKAO","Synthetic savings",AccountRole.PURPOSE_SAVINGS,null,"1820",null,null,f.account)).id();
  var bankRow=Map.of("rowHash","b".repeat(64),"occurredAt","2026-11-10T17:03:35Z","precision","SECOND","outflow",80000,"inflow",0,"balanceAfter",78125,"sourceSheet",0,"sourceRow",1,"description","최애적금(1820)");
  byte[] source=f.json.writeValueAsBytes(Map.of("formatVersion","BANK_NATIVE_REPLAY_V1","provider","KAKAO","sourceFileSha256","a".repeat(64),"accountSuffix","9910","openingBalance",158125,"closingBalance",78125,"rows",List.of(bankRow)));
  var uploaded=(Map<?,?>)service.intake(new Intake(f.account,"KAKAO","NATIVE_JSON",MoneyStatementParser.hash(source),source.length));
  UUID upload=(UUID)uploaded.get("uploadId");
  service.chunk(new Chunk(upload,0,Base64.getEncoder().encodeToString(source)));
  UUID statement=(UUID)((Map<?,?>)((Map<?,?>)service.complete(new Complete(upload))).get("statement")).get("id");
  UUID row=row(statement);
  UUID raw=raw("KAKAO","출금 80,000원","입출금통장(9910) → 최애적금(1820) 잔액 78,125원");
  var parsed=f.money.attempts(raw).getLast();
  assertThat(parsed.status()).isEqualTo("PARSED");
  f.money.finishProcessing(raw,ProcessingState.PROCESSED,"POSTED");
  var fact=f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:37Z"),"synthetic route",null,"preserved memo",false,null,null,"preserved title"));
  f.db.update("update money_transactions set meaning_state='UNRESOLVED' where id=?",fact.id());
  f.db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship) values(?,?,?,?,'PRIMARY')",fact.id(),f.owner,raw,parsed.id());
  f.db.update("insert into money_statement_effects(user_id,account_id,cash_key,transaction_id,row_id) select user_id,account_id,cash_key,?,id from money_statement_rows where id=?",fact.id(),row);
  var op=new Item(row,"COMPLETE_BOOKED_TRANSFER",fact.id(),null,fact.version(),"Synthetic bank-backed route",null,null,null,null,null,null,null,raw,null,savings,f.money.notification(raw).processingVersion());
  assertThatThrownBy(()->service.preview(new Preview(run(statement),List.of(op),false))).hasMessageContaining("EXACT_NATIVE_SOURCE_ATTESTATION_REQUIRED");
  var p=(Map<String,Object>)service.preview(new Preview(run(statement),List.of(op),true));
  assertThat(f.money.transaction(fact.id()).type()).isEqualTo(TransactionType.EXPENSE);
  var request=UUID.randomUUID();
  var result=execute(p,request);
  assertThat(result.get("status")).isEqualTo("APPLIED");
  assertThat(execute(p,request)).isEqualTo(result);
  var completed=f.money.transaction(fact.id());
  assertThat(facts()).isEqualTo(1);
  assertThat(completed.type()).isEqualTo(TransactionType.TRANSFER);
  assertThat(completed.fromAccountId()).isEqualTo(f.account);
  assertThat(completed.toAccountId()).isEqualTo(savings);
  assertThat(completed.title()).isEqualTo(fact.title());
  assertThat(completed.memo()).isEqualTo(fact.memo());
  assertThat(completed.sources()).hasSize(1);
  assertThat(f.db.queryForObject("select count(*) from money_statement_effects",Long.class)).isEqualTo(1);
 }

 @Test void statementCashCannotBeRewrittenThroughExistingManualEdit(){UUID s=statement();var p=preview(s,item(row(s),"REGISTER_CASH",null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");UUID id=f.db.queryForObject("select id from money_transactions",UUID.class);var old=f.money.transaction(id);assertThatThrownBy(()->f.product.save(id,new MoneyProductService.Entry(old.type(),old.fromAccountId(),old.toAccountId(),old.amount().add(BigDecimal.ONE),old.occurredAt(),old.counterpartyText(),null,null,false,null,old.version(),null))).hasMessageContaining("STATEMENT_CASH_IDENTITY_IMMUTABLE");assertThat(f.money.transaction(id).amount()).isEqualByComparingTo("80000");assertThat(MoneyStatementProtection.sources(f.db,f.owner,id)).hasSize(1);}

 @Test void canonicalTransferMergeKeepsStatementClaimOnSurvivingFact(){UUID s=statement();assertThat(execute(preview(s,item(row(s),"REGISTER_CASH",null,null)),UUID.randomUUID())).containsEntry("status","APPLIED");UUID original=f.db.queryForObject("select id from money_transactions",UUID.class);var other=f.money.createAccount(new AccountInput("KAKAO","Synthetic transfer receiving",AccountRole.SAVINGS_GATEWAY,null,null));var inbound=f.product.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,other.id(),new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),"synthetic transfer",null,null,false,null,null,null));var financial=new MoneyFinancialService(f.db,()->f.owner,f.money,f.product,f.web,f.json);var unified=new MoneyUnifiedBookkeepingService(f.db,()->f.owner,f.json,f.money,f.product,f.web,financial,f.commands);var merged=unified.edit(inbound.id(),new MoneyUnifiedBookkeepingService.Edit(UUID.randomUUID(),inbound.version(),"LINK_TRANSFER",null,original,0L,null,null,null,null,null,null,null,null,null,"Exact synthetic transfer pair",null));assertThat(merged).containsEntry("status","APPLIED");assertThat(f.db.queryForObject("select transaction_id from money_statement_effects",UUID.class)).isEqualTo(inbound.id());assertThat((Map<String,Object>)service.details(row(s))).containsEntry("status","BOOKED_CONFIRMED");assertThat(f.db.queryForObject("select count(*) from money_transactions where not excluded",Long.class)).isEqualTo(1);}

 @Test void postPeriodCashChangeInvalidatesCurrentBalancePreview(){UUID s=statement();var other=f.money.createAccount(new AccountInput("KAKAO","Synthetic post-period receiving",AccountRole.SAVINGS_GATEWAY,null,null));var p=preview(s,item(row(s),"REGISTER_CASH",null,null));f.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,f.account,other.id(),BigDecimal.TEN,Instant.now().minusSeconds(60),"outside statement period",null,null,false,null,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","NOT_APPLIED");assertThat(f.db.queryForObject("select count(*) from money_statement_effects",Long.class)).isZero();}

 @Test void previewUsesCalculatedLedgerNotLatestObservedDisplayBalance(){UUID s=statement();f.db.update("update money_accounts set masked_reference='975-******-01-014' where id=?",f.account);f.product.checkpoint(f.account,new MoneyProductService.Checkpoint(new BigDecimal("100000"),Instant.parse("2026-11-10T17:00:00Z"),"Synthetic independent anchor",0L));UUID raw=raw("IBK","\uC785\uCD9C\uAE08","[\uCD9C\uAE08] 1\uC6D0 other merchant 975-******-01-014 11/11 02:04 / \uC794\uC561 90,000\uC6D0");var attempt=f.money.attempts(raw).getLast();f.money.recordReviewTransactionId(new TransactionInput(TransactionType.EXPENSE,f.account,null,BigDecimal.ONE,"KRW",attempt.candidate().occurredAt(),"other merchant",List.of(new TransactionSource(raw,attempt.id(),SourceRelationship.PRIMARY,Map.of("rule","SYNTHETIC")))));assertThat(f.product.balance(f.account).amount()).isEqualByComparingTo("90000");var p=preview(s,item(row(s),"REGISTER_CASH",null,null));var balance=(Map<?,?>)((List<?>)p.get("balances")).getFirst();assertThat(((MoneyProductService.Reconciliation)balance.get("before")).ledgerBalance()).isEqualByComparingTo("99999");assertThat((BigDecimal)balance.get("predictedAfter")).isEqualByComparingTo("19999");assertThat((BigDecimal)balance.get("delta")).isEqualByComparingTo("-80000");assertThat(f.product.balance(f.account).amount()).isEqualByComparingTo("90000");}
 @Test void sourceBalanceEvidenceWinsOverNearbySameMerchantAmount(){UUID s=statement();f.db.update("update money_accounts set masked_reference='975-******-01-014' where id=?",f.account);UUID raw=raw("IBK","\uC785\uCD9C\uAE08","[\uCD9C\uAE08] 80,000\uC6D0 synthetic transfer 975-******-01-014 11/11 02:03 / \uC794\uC561 78,125\uC6D0");var a=f.money.attempts(raw).getLast();UUID exact=f.money.recordReviewTransactionId(new TransactionInput(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),"KRW",a.candidate().occurredAt(),"synthetic transfer",List.of(new TransactionSource(raw,a.id(),SourceRelationship.PRIMARY,Map.of("rule","SYNTHETIC")))));f.product.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,f.account,null,new BigDecimal("80000"),Instant.parse("2026-11-10T17:02:45Z"),"synthetic transfer",null,null,false,null,null,null));var details=(Map<String,Object>)service.details(row(s));assertThat(details).containsEntry("status","BOOKED_CONFIRMED").containsEntry("selectedTransactionId",exact);assertThat((List<?>)details.get("matches")).hasSize(2);}
 @Test void confirmedOwnedTransferPathIsEvidenceEvenWithoutMerchant(){UUID s=statement();var other=f.money.createAccount(new AccountInput("KAKAO","Synthetic paired owner",AccountRole.SAVINGS_GATEWAY,null,null));var existing=f.product.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,f.account,other.id(),new BigDecimal("80000"),Instant.parse("2026-11-10T17:03:35Z"),null,null,null,false,null,null,null));assertThat((Map<String,Object>)service.details(row(s))).containsEntry("status","BOOKED_CONFIRMED").containsEntry("selectedTransactionId",existing.id());}

 @Test void historicalCashBeforeAnchorDoesNotPretendToChangeCurrentLedger(){UUID s=statement();f.product.checkpoint(f.account,new MoneyProductService.Checkpoint(new BigDecimal("100000"),Instant.parse("2026-11-10T18:00:00Z"),"Synthetic later trusted anchor",0L));var p=preview(s,item(row(s),"REGISTER_CASH",null,null));var b=(Map<?,?>)((List<?>)p.get("balances")).getFirst();assertThat((BigDecimal)b.get("delta")).isEqualByComparingTo("0");assertThat((BigDecimal)b.get("cashMovementDelta")).isEqualByComparingTo("-80000");assertThat((BigDecimal)b.get("predictedAfter")).isEqualByComparingTo("100000");assertThat((Map<String,Object>)service.details(row(s))).containsEntry("ledgerCoverage","BEFORE_OR_AT_LEDGER_ANCHOR");}
 UUID nativeStatement(UUID account,String provider,String rows,String opening,String closing){
  f.db.update("update money_accounts set masked_reference='***123' where id=?",account);
  byte[] bytes=MoneyNativeReplayParserTest.nativeJson(provider,rows,opening,closing).getBytes(StandardCharsets.UTF_8);
  UUID upload=(UUID)((Map<?,?>)service.intake(new Intake(account,provider,"NATIVE_JSON",MoneyStatementParser.hash(bytes),bytes.length))).get("uploadId");
  service.chunk(new Chunk(upload,0,Base64.getEncoder().encodeToString(bytes)));
  return (UUID)((Map<?,?>)((Map<?,?>)service.complete(new Complete(upload))).get("statement")).get("id");
 }
 Map<String,Object> nativePreview(UUID statement,Item...items){return (Map<String,Object>)service.preview(new Preview(run(statement),List.of(items),true));}
 String nativeRow(){return MoneyNativeReplayParserTest.row("b","2026-11-10T17:03:35Z","SECOND",80000,0,78125,12);}
 @Test void nativeImportRetainsLineageAndCannotSilentlyUpgradePostingTrust(){
  UUID s=nativeStatement(f.account,"IBK",nativeRow(),"158125","78125");assertThat(facts()).isZero();
  assertThat(service.statement(s)).containsEntry("original_source_hash","a".repeat(64)).containsEntry("verification","OWNER_ATTESTATION_REQUIRED");
  assertThat((Map<String,Object>)service.rows(s,10,0)).containsEntry("total",1);
  assertThatThrownBy(()->preview(s,item(row(s),"REGISTER_CASH",null,null))).hasMessageContaining("ATTESTATION");
  var p=nativePreview(s,item(row(s),"REGISTER_CASH",null,null));assertThat(p).containsEntry("attestNativeSource",true).containsEntry("originalSourceHash","a".repeat(64));assertThat(facts()).isZero();
  assertThatThrownBy(()->service.execute(new Execute((UUID)p.get("previewId"),p.get("fingerprint").toString(),UUID.randomUUID(),false))).hasMessageContaining("APPROVAL");
  var receipt=execute(p,UUID.randomUUID());assertThat(receipt).containsEntry("status","APPLIED");assertThat(facts()).isEqualTo(1);assertThat(service.statement(s)).containsEntry("verification","OWNER_ATTESTED_NATIVE_REPLAY");
  assertThat(f.db.queryForObject("select bank_row_hash from money_statement_rows where statement_id=?",String.class,s)).isEqualTo("b".repeat(64));
 }
 @Test void bankProvedCheckpointFixAndUndoNeverCreateIncomeOrSpending(){
  UUID s=nativeStatement(f.account,"IBK",nativeRow(),"158125","78125");
  f.product.checkpoint(f.account,new MoneyProductService.Checkpoint(new BigDecimal("77125"),Instant.parse("2026-11-10T17:04:00Z"),"original opening error",0L));
  UUID cp=f.db.queryForObject("select id from money_balance_checkpoints where account_id=?",UUID.class,f.account);
  Item correction=item(row(s),"CORRECT_CHECKPOINT",cp,f.money.account(f.account).version());
  var p=nativePreview(s,correction);assertThat(f.db.queryForObject("select amount from money_balance_checkpoints where id=?",BigDecimal.class,cp)).isEqualByComparingTo("77125");
  var receipt=execute(p,UUID.randomUUID());assertThat(receipt).containsEntry("status","APPLIED");assertThat(facts()).isZero();
  assertThat(f.db.queryForObject("select amount from money_balance_checkpoints where id=?",BigDecimal.class,cp)).isEqualByComparingTo("78125");
  UUID change=f.db.queryForObject("select id from money_reconciliation_changes where action='CORRECT_CHECKPOINT'",UUID.class);
  var undo=preview(s,item(row(s),"UNDO_CHANGE",change,f.money.account(f.account).version()));assertThat(execute(undo,UUID.randomUUID())).containsEntry("status","APPLIED");
  assertThat(f.db.queryForObject("select amount from money_balance_checkpoints where id=?",BigDecimal.class,cp)).isEqualByComparingTo("77125");assertThat(facts()).isZero();
 }
 @Test void bankBackedReparseAppendsAttemptWithoutReopeningProtectedHoldOrPostingCash(){
  var account=f.money.createAccount(new AccountInput("KAKAO","synthetic bank",AccountRole.SPENDING,null,"123"));
  UUID s=nativeStatement(account.id(),"KAKAO",MoneyNativeReplayParserTest.row("b","2026-11-10T17:03:35Z","SECOND",0,7,-5,12),"-12","-5");
  var raw=f.money.ingest(Map.of("sourcePackage","com.kakaobank.channel","deviceId",UUID.randomUUID().toString(),"notificationKey",UUID.randomUUID().toString(),"title","입금 7원","text","합성 상대 → 입출금통장(123) 잔액 -5원","postedAt","2026-11-10T17:03:37Z")).notification();
  f.money.process(raw.id(),new MoneyNotificationParser(){public String key(){return "kakao-push";}public String version(){return "1.0.0";}public boolean supports(MoneyRawNotification r){return true;}public ParsedCandidate parse(MoneyRawNotification r){return new ParsedCandidate(r.id(),"KAKAO",null,null,null,null,null,null,List.of(),null,null,"UNRECOGNIZED",ParseStatus.REVIEW_REQUIRED,r.postedAt(),null,null,version(),Map.of("reason","UNRECOGNIZED_SHAPE"));}});
  f.db.update("update money_raw_notifications set review_deferred=true,processing_reason='ORIGINAL_HOLD' where id=?",raw.id());
  var input=new Item(row(s),"REPARSE_SOURCE",null,null,f.money.notification(raw.id()).processingVersion(),"exact original bank row",null,null,null,null,null,null,null,raw.id(),null,null);
  var p=nativePreview(s,input);assertThat(f.money.attempts(raw.id())).hasSize(1);assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");
  assertThat(f.money.attempts(raw.id())).hasSize(2);assertThat(f.money.attempts(raw.id()).getLast().parserVersion()).isEqualTo("1.0.1");assertThat(facts()).isZero();
  assertThat(f.db.queryForObject("select review_deferred from money_raw_notifications where id=?",Boolean.class,raw.id())).isTrue();assertThat(f.money.notification(raw.id()).processingReason()).isEqualTo("ORIGINAL_HOLD");
 }
 @Test void nativeCashAdmissionHasCanonicalCompensatingUndoAndConflictGuard(){
  UUID s=nativeStatement(f.account,"IBK",nativeRow(),"158125","78125");assertThat(execute(nativePreview(s,item(row(s),"REGISTER_CASH",null,null)),UUID.randomUUID())).containsEntry("status","APPLIED");
  UUID change=f.db.queryForObject("select id from money_reconciliation_changes where action='REGISTER_CASH'",UUID.class);UUID transaction=f.db.queryForObject("select id from money_transactions",UUID.class);
  var undo=preview(s,item(row(s),"UNDO_CHANGE",change,f.money.transaction(transaction).version()));assertThat(execute(undo,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(f.money.transaction(transaction).excluded()).isTrue();assertThat(facts()).isEqualTo(1);assertThat(f.db.queryForObject("select count(*) from money_statement_effects",Long.class)).isEqualTo(1);
 }
 @Test void nativeDayOnlyRowsAndOtherAccountCandidatesCannotCreateGuessedCash(){
  UUID s=nativeStatement(f.account,"IBK",MoneyNativeReplayParserTest.row("b","2026-11-09T15:00:00Z","DAY",80000,0,78125,12),"158125","78125");assertThatThrownBy(()->nativePreview(s,item(row(s),"REGISTER_CASH",null,null))).hasMessageContaining("DAY_ONLY");
 }
 @Test void overdraftLimitIsSeparateFromUtilizationAndNetWorthCountsDebtOnce(){
  var account=f.money.createAccount(new AccountInput("KAKAO","synthetic overdraft",AccountRole.SPENDING,null,"123"));
  String zero=MoneyNativeReplayParserTest.row("b","2026-11-10T17:03:35Z","SECOND",0,0,-2900000,12).replace("synthetic private source","한도대출 합성");
  UUID s=nativeStatement(account.id(),"KAKAO",zero,"-2900000","-2900000");
  f.product.checkpoint(account.id(),new MoneyProductService.Checkpoint(new BigDecimal("-2900000"),Instant.parse("2026-11-10T17:03:35Z"),"synthetic verified bank balance",account.version()));
  UUID loan=UUID.randomUUID();f.db.update("insert into money_loans(id,user_id,name,lender,type,original_principal,remaining_principal) values(?,?,?,?,'overdraft',3000000,3000000)",loan,f.owner,"synthetic facility","synthetic bank");
  var mapping=new Item(row(s),"MAP_OVERDRAFT",null,null,f.money.account(account.id()).version(),"owner-attested bank facility mapping",loan,0L,new BigDecimal("3000000"),null,null,null,null);
  assertThat(execute(nativePreview(s,mapping),UUID.randomUUID())).containsEntry("status","APPLIED");
  var facility=MoneyOverdraftSemantics.read(f.db,f.owner,f.product).getFirst();assertThat((BigDecimal)facility.get("facility_limit")).isEqualByComparingTo("3000000");assertThat((BigDecimal)facility.get("usedPrincipal")).isEqualByComparingTo("2900000");
  var kpis=(Map<String,Object>)f.web.overview("2026-11-01","2026-11-30").get("kpis");assertThat((BigDecimal)kpis.get("loans")).isEqualByComparingTo("2900000");assertThat((BigDecimal)kpis.get("netWorth")).isEqualByComparingTo("-2900000");assertThat(facts()).isZero();
 }
}
