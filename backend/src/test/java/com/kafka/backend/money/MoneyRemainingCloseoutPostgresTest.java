package com.kafka.backend.money;
import org.junit.jupiter.api.*;
import java.util.*;
import java.nio.file.*;
import java.time.*;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyRemainingCloseoutService.*;
import static com.kafka.backend.money.MoneyStatementReconciliationService.*;

/** Real PostgreSQL, synthetic run-owned schemas only; no shared credentials or source files. */
@org.junit.jupiter.api.condition.EnabledIf("com.kafka.backend.money.MoneyPostgresIntegrationTest#contractFixture")
class MoneyRemainingCloseoutPostgresTest {
 final MoneyStatementReconciliationPostgresTest b=new MoneyStatementReconciliationPostgresTest();
 final MoneyRecommendationPostgresTest f=b.f;
 @BeforeEach void setup()throws Exception{b.setup();f.db.execute(Files.readString(Path.of("src/main/resources/db/migration/V120__money_remaining_review_history_closeout.sql")).replace("REFERENCES auth.users","REFERENCES "+f.schema+".qa_fixture_users"));}
 @AfterEach void cleanup(){b.cleanup();}
 Operation op(String action,UUID row,UUID paired,UUID transaction,Long version,UUID other,Long otherVersion){return new Operation(action,row,paired,transaction,version,other,otherVersion,null,null,null,null,null,"Synthetic immutable bank evidence");}
 void anchor(UUID account){f.product.checkpoint(account,new MoneyProductService.Checkpoint(new BigDecimal("100000"),Instant.parse("2026-11-12T00:00:00Z"),"Independent later opening",f.money.account(account).version()));}
 Map<String,Object> preview(List<UUID> statements,Operation...ops){return (Map<String,Object>)b.service.closeoutPreview(new Plan(statements,List.of(ops)));}
 Map<String,Object> execute(Map<String,Object> p,UUID request){return (Map<String,Object>)b.service.closeoutExecute(new Execute((UUID)p.get("previewId"),p.get("fingerprint").toString(),request,true));}
 UUID statement(UUID account,String hash,String at,String precision,int out,int in,int balance){UUID s=b.nativeStatement(account,"IBK",MoneyNativeReplayParserTest.row(hash,at,precision,out,in,balance,12),Integer.toString(balance+out-in),Integer.toString(balance));f.db.update("update money_bank_statements set verification='OWNER_ATTESTED_NATIVE_REPLAY' where id=?",s);return s;}
 @Test void historicalAdmissionIsAtomicBalanceNeutralUnresolvedAndIdempotent(){
  UUID s=b.statement(),r=b.row(s);anchor(f.account);var before=f.product.reconciliation();var p=preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null));assertThat(b.facts()).isZero();
  UUID request=UUID.randomUUID();assertThat(execute(p,request)).containsEntry("status","APPLIED");assertThat(execute(p,request)).containsEntry("status","APPLIED");assertThat(b.facts()).isEqualTo(1);assertThat(f.product.reconciliation()).isEqualTo(before);assertThat(f.db.queryForObject("select meaning_state from money_transactions",String.class)).isEqualTo("UNRESOLVED");assertThat(f.db.queryForObject("select count(*)from money_classification_jobs where status='QUEUED'",Long.class)).isZero();
  assertThatThrownBy(()->preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null))).hasMessageContaining("ALREADY");
 }
 @Test void earliestOpeningOwnerAndSourceTrustAreRequired(){
  UUID s=b.statement(),r=b.row(s);assertThatThrownBy(()->preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null))).hasMessageContaining("EARLIEST");anchor(f.account);
  f.db.update("update money_bank_statements set verification='OWNER_ATTESTATION_REQUIRED' where id=?",s);assertThatThrownBy(()->preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null))).hasMessageContaining("ATTESTED");
  assertThatThrownBy(()->b.service(UUID.randomUUID()).closeoutPreview(new Plan(List.of(s),List.of(op("HISTORY_CASH",r,null,null,null,null,null))))).isInstanceOf(RuntimeException.class);
 }
 @Test void staleExpiredOrUnapprovedPlansNeverWrite(){
  UUID s=b.statement(),r=b.row(s);anchor(f.account);var p=preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null));
  var unapproved=new Execute((UUID)p.get("previewId"),p.get("fingerprint").toString(),UUID.randomUUID(),false);assertThatThrownBy(()->b.service.closeoutExecute(unapproved)).hasMessageContaining("APPROVAL");
  f.db.update("update money_remaining_closeout_plans set expires_at=now()-interval '1 second'");assertThat(execute(p,UUID.randomUUID())).containsEntry("status","NOT_APPLIED");
  p=preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null));f.db.update("update money_accounts set version=version+1 where id=?",f.account);assertThat(execute(p,UUID.randomUUID())).containsEntry("status","NOT_APPLIED");assertThat(b.facts()).isZero();
 }
 @Test void historicalTransferUsesOneFactAndBothBankEffectsAndRejectsAmbiguity(){
  UUID account=f.money.createAccount(new AccountInput("IBK","Other synthetic owner bank",AccountRole.SAVINGS,null,null)).id();
  UUID a=statement(f.account,"b","2026-11-10T17:03:35Z","SECOND",80,0,20),bb=statement(account,"c","2026-11-10T17:03:36Z","SECOND",0,80,100);anchor(f.account);anchor(account);
  var p=preview(List.of(a,bb),op("HISTORY_TRANSFER",b.row(a),b.row(bb),null,null,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(b.facts()).isEqualTo(1);assertThat(f.db.queryForObject("select type from money_transactions",String.class)).isEqualTo("TRANSFER");assertThat(f.db.queryForObject("select count(*)from money_statement_effects",Long.class)).isEqualTo(2);
 }
 @Test void dateOnlyCashHasNoInventedSecondAndPartialDayProjectionIsUnknown(){
  UUID s=statement(f.account,"d","2026-11-09T15:00:00Z","DAY",0,10,100);anchor(f.account);
  var p=preview(List.of(s),op("HISTORY_CASH",b.row(s),null,null,null,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");
  var t=f.money.transactions(10,0).getFirst();assertThat(t.occurrencePrecision()).isEqualTo("DAY");assertThat(t.occurredAt()).isEqualTo(Instant.parse("2026-11-10T14:59:59.999999Z"));
  assertThat(MoneyOccurrencePrecision.uncertain(f.db,f.owner,f.account,Instant.EPOCH,Instant.parse("2026-11-10T00:00:00Z"))).isTrue();assertThat(MoneyOccurrencePrecision.uncertain(f.db,f.owner,f.account,Instant.EPOCH,t.occurredAt())).isFalse();
 }
 @Test void historyUndoCancelsWithoutDeletingSourceOrChangingCurrentBalance(){
  UUID s=b.statement(),r=b.row(s);anchor(f.account);assertThat(execute(preview(List.of(s),op("HISTORY_CASH",r,null,null,null,null,null)),UUID.randomUUID())).containsEntry("status","APPLIED");
  var original=f.product.reconciliation();UUID receipt=f.db.queryForObject("select id from money_reconciliation_changes where action='CLOSEOUT_HISTORY_CASH'",UUID.class);
  var p=preview(List.of(s),op("UNDO",r,null,receipt,0L,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(b.facts()).isEqualTo(1);assertThat(f.product.reconciliation()).isEqualTo(original);assertThat(f.db.queryForObject("select excluded from money_transactions",Boolean.class)).isTrue();assertThat(f.db.queryForObject("select count(*)from money_statement_effects",Long.class)).isEqualTo(1);
 }
 @Test void duplicateRowsAndMoreThan400OperationsAreRejectedBeforeAnyWrite(){UUID s=b.statement(),r=b.row(s);anchor(f.account);var operation=op("HISTORY_CASH",r,null,null,null,null,null);assertThatThrownBy(()->preview(List.of(s),operation,operation)).hasMessageContaining("UNIQUE");assertThatThrownBy(()->b.service.closeoutPreview(new Plan(List.of(s),Collections.nCopies(401,operation)))).hasMessageContaining("400");assertThat(b.facts()).isZero();}
 @Test void delayedBankPairNeedsDistinctReviewedActionAndRetainsBothIndependentClocks(){
  UUID account=f.money.createAccount(new AccountInput("IBK","Other synthetic timed owner bank",AccountRole.SAVINGS,null,null)).id();
  UUID a=statement(f.account,"e","2026-11-10T17:03:35Z","SECOND",30,0,70),bb=statement(account,"f","2026-11-10T17:07:59Z","SECOND",0,30,100);anchor(f.account);anchor(account);
  assertThatThrownBy(()->preview(List.of(a,bb),op("HISTORY_TRANSFER",b.row(a),b.row(bb),null,null,null,null))).hasMessageContaining("PAIRED_BANK_CASH");
  var p=preview(List.of(a,bb),op("HISTORY_DELAYED_TRANSFER",b.row(a),b.row(bb),null,null,null,null));assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(b.facts()).isEqualTo(1);assertThat(f.db.queryForObject("select count(*) from money_statement_effects",Long.class)).isEqualTo(2);
  var id=f.money.transactions(10,0).getFirst().id();var otherClock=f.db.queryForObject("select "+MoneyProductService.effectiveAt("?::uuid")+" from money_transactions t where t.user_id=? and t.id=?",java.sql.Timestamp.class,account,f.owner,id);assertThat(otherClock.toInstant()).isEqualTo(Instant.parse("2026-11-10T17:07:59Z"));
 }

 @Test void delayedPairCannotStealTheReceivingRowOfAnIndependentlySynchronousTransfer(){
  UUID gateway=f.money.createAccount(new AccountInput("IBK","Synthetic gateway",AccountRole.SAVINGS_GATEWAY,null,null)).id(),living=f.money.createAccount(new AccountInput("IBK","Synthetic receiving account",AccountRole.SPENDING,null,null)).id();
  UUID a=statement(f.account,"7","2026-11-10T17:03:35Z","SECOND",30,0,70),c=statement(living,"8","2026-11-10T17:08:47Z","SECOND",0,30,130);
  String rows=MoneyNativeReplayParserTest.row("9","2026-11-10T17:08:47Z","SECOND",30,0,0,12)+","+MoneyNativeReplayParserTest.row("a","2026-11-10T17:07:59Z","SECOND",0,30,30,13);UUID gatewayStatement=b.nativeStatement(gateway,"IBK",rows,"0","0");f.db.update("update money_bank_statements set verification='OWNER_ATTESTED_NATIVE_REPLAY' where id=?",gatewayStatement);
  UUID debit=f.db.queryForObject("select id from money_statement_rows where statement_id=? and direction='OUT'",UUID.class,gatewayStatement),credit=f.db.queryForObject("select id from money_statement_rows where statement_id=? and direction='IN'",UUID.class,gatewayStatement);for(UUID account:List.of(f.account,gateway,living))anchor(account);
  var delayed=op("HISTORY_DELAYED_TRANSFER",b.row(a),credit,null,null,null,null);var sources=List.of(a,gatewayStatement,c);
  assertThatThrownBy(()->preview(sources,delayed)).hasMessageContaining("AMBIGUOUS");
  var p=preview(sources,op("HISTORY_TRANSFER",debit,b.row(c),null,null,null,null),delayed);assertThat(execute(p,UUID.randomUUID())).containsEntry("status","APPLIED");assertThat(b.facts()).isEqualTo(2);assertThat(f.db.queryForObject("select count(*)from money_statement_effects",Long.class)).isEqualTo(4);
 }

}
