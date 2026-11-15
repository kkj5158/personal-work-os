package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyBalanceObservationPostgresTest {
 final MoneyMobilePostgresTest fixture=new MoneyMobilePostgresTest();
 MoneyBalanceObservationService observations(org.springframework.jdbc.core.JdbcTemplate db,MoneyService m){return new MoneyBalanceObservationService(db,()->MoneyPostgresIntegrationTest.OWNER,m,JsonMapper.builder().build());}
 MoneyReconciliationSummaryService summary(org.springframework.jdbc.core.JdbcTemplate db,MoneyService m,MoneyProductService p){return new MoneyReconciliationSummaryService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,JsonMapper.builder().build());}
 MoneyBalanceObservationService.Input input(String amount,Instant at,Long version){return new MoneyBalanceObservationService.Input(new BigDecimal(amount),at,"Synthetic only",version,"Synthetic revision");}
 @Test void lifecyclePreservesEveryLedgerFactBalanceAndStatistics()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=fixture.account(m,AccountRole.SPENDING);var at=fixture.at;p.checkpoint(a.id(),new MoneyProductService.Checkpoint(new BigDecimal("1000"),at,"Synthetic anchor",0L));
  p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),at.plusSeconds(30),"Synthetic expense",null,null,false,null,null));
  var txs=m.transactions(100,0);var balance=p.balance(a.id());var stats=w.overview("2026-09-01","2026-09-30");long checkpoints=db.queryForObject("select count(*) from money_balance_checkpoints",Long.class);
  var s=observations(db,m);var created=s.create(a.id(),input("900",at.plusSeconds(60),null));assertThat(created.observedAt()).isEqualTo(at.plusSeconds(60));assertThat(created.createdAt()).isAfter(created.observedAt());
  var match=summary(db,m,p).summary().accounts().getFirst();assertThat(match.bucket()).isEqualTo("MATCH");assertThat(match.source()).isEqualTo("USER_MANUAL");assertThat(match.independentVerification()).isFalse();
  var edit=s.edit(a.id(),created.id(),input("0",at.plusSeconds(61),0L));assertThat(edit.version()).isEqualTo(1);assertThat(summary(db,m,p).summary().accounts().getFirst().difference()).isEqualByComparingTo("-900");
  assertThatThrownBy(()->s.edit(a.id(),created.id(),input("-1",at,0L))).isInstanceOf(OptimisticLockConflictException.class);
  var cancel=s.state(a.id(),created.id(),new MoneyBalanceObservationService.StateInput(1L,"Synthetic cancel"),true);assertThat(cancel.status()).isEqualTo("CANCELLED");assertThat(summary(db,m,p).summary().accounts().getFirst().status()).isEqualTo("MANUAL_ANCHOR");
  var restored=s.state(a.id(),created.id(),new MoneyBalanceObservationService.StateInput(2L,"Synthetic restore"),false);assertThat(restored.version()).isEqualTo(3);assertThat(s.revisions(a.id(),created.id())).hasSize(4);
  assertThat(m.transactions(100,0)).isEqualTo(txs);assertThat(p.balance(a.id())).isEqualTo(balance);assertThat(w.overview("2026-09-01","2026-09-30")).isEqualTo(stats);assertThat(db.queryForObject("select count(*) from money_balance_checkpoints",Long.class)).isEqualTo(checkpoints);
  assertThat(new MoneyAccountManagementService(db,()->MoneyPostgresIntegrationTest.OWNER,m).eligibility(a.id()).reasons()).contains("잔액 확인·감사 이력");
 });}
 @Test void exactDecimalSurvivesJsonHistoryAndNoteOnlyResave()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=fixture.account(m,AccountRole.CASH);var s=observations(db,m);var exact="9999999999999999.99";
  var created=s.create(a.id(),input(exact,fixture.at,null));var mapper=JsonMapper.builder().build();
  var wire=mapper.readTree(mapper.writeValueAsString(s.history(a.id()))).get(0);
  assertThat(wire.get("amountText").asString()).isEqualTo(exact);
  var saved=s.edit(a.id(),created.id(),new MoneyBalanceObservationService.Input(new BigDecimal(wire.get("amountText").asString()),created.observedAt(),"Changed note",0L,"Note only"));
  assertThat(saved.amount()).isEqualByComparingTo(exact);assertThat(s.revisions(a.id(),created.id())).hasSize(2);
  assertThat(m.transactions(100,0)).isEmpty();assertThat(db.queryForObject("select count(*) from money_balance_checkpoints",Long.class)).isZero();
 });}
 @Test void historicalBankComparisonUsesExactEffectiveTimeDespiteLaterFacts()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=m.createAccount(new AccountInput("KAKAO","입출금통장",AccountRole.SPENDING,null,"8557"));var start=fixture.at;var observed=start.plusSeconds(120);
  p.checkpoint(a.id(),new MoneyProductService.Checkpoint(new BigDecimal("1000"),start,"Synthetic",0L));
  var tx=p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),start.plusSeconds(90),"Synthetic",null,null,false,null,null));
  var raw=m.ingest(Map.of("sourcePackage","com.kakaobank.channel","deviceId",UUID.randomUUID().toString(),"notificationKey",UUID.randomUUID().toString(),"title","출금 100원","text","입출금통장(8557) → 합성 상회 잔액 900원","postedAt",observed.toString())).notification();var attempt=m.process(raw.id(),new KakaoNotificationParserV1());
  db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY','{}')",tx.id(),MoneyPostgresIntegrationTest.OWNER,raw.id(),attempt.id());m.finishProcessing(raw.id(),ProcessingState.PROCESSED,"POSTED");
  p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("200"),observed.plusSeconds(90),"Later synthetic",null,null,false,null,null));
  var r=summary(db,m,p).summary().accounts().getFirst();assertThat(r.ledgerAtObservedAt()).isEqualByComparingTo("900");assertThat(r.currentLedgerBalance()).isEqualByComparingTo("700");assertThat(r.difference()).isEqualByComparingTo("0");assertThat(r.bucket()).isEqualTo("MATCH");assertThat(r.independentVerification()).isTrue();
  // Manual-vs-bank contradictions at an identical instant cannot win by source or arrival.
  observations(db,m).create(a.id(),input("901",observed,null));r=summary(db,m,p).summary().accounts().getFirst();assertThat(r.status()).isEqualTo("CONFLICT");assertThat(r.difference()).isNull();assertThat(r.observedBalance()).isNull();
 });}
 @Test void missingNegativeZeroConflictAndForeignCurrencyAreExplicit()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=fixture.account(m,AccountRole.CASH);var s=observations(db,m);var summary=summary(db,m,p);
  assertThat(summary.summary().accounts().getFirst().currentLedgerBalance()).isNull();assertThat(summary.summary().accounts().getFirst().status()).isEqualTo("NO_OBSERVATION");
  s.create(a.id(),input("-10",fixture.at,null));assertThat(summary.summary().accounts().getFirst().bucket()).isEqualTo("CHECK");
  s.create(a.id(),input("0",fixture.at,null));assertThat(summary.summary().accounts().getFirst().conflictingEvidence()).isTrue();
  var b=fixture.account(m,AccountRole.SPENDING);p.checkpoint(b.id(),new MoneyProductService.Checkpoint(BigDecimal.ZERO,fixture.at,"Synthetic",0L));s.create(b.id(),input("0",fixture.at.plusSeconds(1),null));
  var zero=summary.summary().accounts().stream().filter(r->r.account().id().equals(b.id())).findFirst().orElseThrow();assertThat(zero.bucket()).isEqualTo("MATCH");assertThat(zero.independentVerification()).isFalse();
  db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,currency,occurred_at,manual) values(?,?,'EXPENSE',?,1,'USD',?,true)",UUID.randomUUID(),MoneyPostgresIntegrationTest.OWNER,b.id(),java.sql.Timestamp.from(fixture.at));
  assertThat(summary.summary().accounts().stream().filter(r->r.account().id().equals(b.id())).findFirst().orElseThrow().status()).isEqualTo("UNSUPPORTED_CURRENCY");
 });}
 @Test void futureValidationOwnershipArchiveAndPreferenceVersions()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=fixture.account(m,AccountRole.SPENDING);var s=observations(db,m);
  assertThatThrownBy(()->s.create(a.id(),input("1",Instant.now().plusSeconds(100),null))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.create(a.id(),input("1.001",fixture.at,null))).isInstanceOf(InvalidRequestException.class);
  var manual=s.create(a.id(),input("-5",fixture.at,null));UUID other=UUID.randomUUID();var stranger=new MoneyBalanceObservationService(db,()->other,MoneyPostgresIntegrationTest.service(db,other),JsonMapper.builder().build());
  assertThatThrownBy(()->stranger.history(a.id())).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->stranger.edit(a.id(),manual.id(),input("1",fixture.at,0L))).isInstanceOf(ResourceNotFoundException.class);
  assertThat(s.preferences(new MoneyBalanceObservationService.PreferenceInput(List.of("role"),0L)).version()).isEqualTo(1);assertThatThrownBy(()->s.preferences(new MoneyBalanceObservationService.PreferenceInput(List.of(),0L))).isInstanceOf(OptimisticLockConflictException.class);assertThat(stranger.preferences().hiddenColumns()).isEmpty();
  m.archiveAccount(a.id(),new ArchiveAccount(0L,true));assertThat(s.history(a.id())).hasSize(1);assertThatThrownBy(()->s.create(a.id(),input("1",fixture.at,null))).isInstanceOf(InvalidRequestException.class);assertThat(summary(db,m,p).summary().counts().values().stream().mapToLong(Long::longValue).sum()).isZero();
 });}
}
