package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;
import com.kafka.backend.common.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyReconciliationReadPostgresTest {
 private final MoneyMobilePostgresTest fixture=new MoneyMobilePostgresTest();
 @Test void fullRangeReadCountsManualFactsOnceAndCandidateWithoutPosting()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=m.createAccount(new AccountInput("KAKAO","입출금통장",AccountRole.SPENDING,null,"8557"));var b=m.createAccount(new AccountInput("KAKAO","자유적금",AccountRole.SAVINGS,null,"4851"));
  Instant anchor=Instant.parse("2026-09-15T01:00:00Z"),at=anchor.plusSeconds(120),cutoff=at.plusSeconds(300);
  p.checkpoint(a.id(),new MoneyProductService.Checkpoint(new BigDecimal("100000"),anchor,"Synthetic",a.version()));
  for(int i=0;i<12;i++)p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),anchor.plusSeconds(i+1),"Synthetic "+i,null,null,false,null,null));
  var raw=m.ingest(Map.of("sourcePackage","com.kakaobank.channel","deviceId",UUID.randomUUID().toString(),"notificationKey","synthetic-route","title","출금 10,000원","text","입출금통장(8557) → 자유적금(4851) 잔액 88,800원","postedAt",at.toString())).notification();
  assertThat(m.process(raw.id(),new KakaoNotificationParserV1()).status()).isEqualTo("PARSED");
  var reader=new MoneyReconciliationReadService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,JsonMapper.builder().build());
  var before=m.transactions(100,0);var snapshot=reader.snapshot(a.id(),cutoff,null,null,0);
  assertThat(snapshot.get("registeredBalance")).isEqualTo(new BigDecimal("98800.00"));assertThat(snapshot.get("referenceBalance")).isEqualTo(new BigDecimal("88800.00"));assertThat(snapshot.get("status")).isEqualTo("EXPLAINED_UNREGISTERED");assertThat(snapshot.get("registeredCount")).isEqualTo(12);assertThat((List<?>)snapshot.get("items")).hasSize(10);assertThat(snapshot.get("totalEvidence")).isEqualTo(13);
  var next=reader.snapshot(a.id(),cutoff,snapshot.get("token").toString(),null,10);assertThat((List<?>)next.get("items")).hasSize(3);assertThat(next.get("registeredBalance")).isEqualTo(snapshot.get("registeredBalance"));assertThat(m.transactions(100,0)).isEqualTo(before);
  assertThatThrownBy(()->new MoneyReconciliationReadService(db,UUID::randomUUID,MoneyPostgresIntegrationTest.service(db,UUID.randomUUID()),p,JsonMapper.builder().build()).snapshot(a.id(),cutoff,null,null,0)).isInstanceOf(ResourceNotFoundException.class);
  p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,a.id(),null,new BigDecimal("100"),anchor.plusSeconds(60),"Later direct fact",null,null,false,null,null));assertThatThrownBy(()->reader.snapshot(a.id(),cutoff,snapshot.get("token").toString(),null,10)).isInstanceOf(OptimisticLockConflictException.class);
 });}
 @Test void conflictingSameTimeObservationsNeverChooseArrivalOrder()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var a=fixture.account(m,AccountRole.SPENDING);var at=fixture.at;
  p.checkpoint(a.id(),new MoneyProductService.Checkpoint(new BigDecimal("1000"),at,"A",0L));p.checkpoint(a.id(),new MoneyProductService.Checkpoint(new BigDecimal("2000"),at,"B",1L));
  var snapshot=new MoneyReconciliationReadService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,JsonMapper.builder().build()).snapshot(a.id(),at.plusSeconds(1),null,null,0);assertThat(snapshot.get("conflictingEvidence")).isEqualTo(true);assertThat(snapshot.get("registeredBalance")).isNull();assertThat(snapshot.get("status")).isEqualTo("INSUFFICIENT");
 });}

 private record Baseline(MoneyAccount account,MoneyReconciliationReadService reader,Instant cutoff,MoneyFinancialService financial){}
 private Baseline baseline(org.springframework.jdbc.core.JdbcTemplate db,MoneyService m,MoneyProductService p,MoneyWebService w){
  var account=m.createAccount(new AccountInput("KAKAO","입출금통장",AccountRole.SPENDING,null,"8557"));Instant start=fixture.at,posted=start.plusSeconds(120),cutoff=posted.plusSeconds(60);
  p.checkpoint(account.id(),new MoneyProductService.Checkpoint(new BigDecimal("100000"),start,"Synthetic anchor",account.version()));
  var fact=p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account.id(),null,new BigDecimal("100"),start.plusSeconds(90),"합성 상회",null,null,false,null,null));
  var raw=m.ingest(Map.of("sourcePackage","com.kakaobank.channel","deviceId",UUID.randomUUID().toString(),"notificationKey",UUID.randomUUID().toString(),"title","출금 100원","text","입출금통장(8557) → 합성 상회 잔액 99,800원","postedAt",posted.toString())).notification();
  var attempt=m.process(raw.id(),new KakaoNotificationParserV1());assertThat(attempt.status()).isEqualTo("PARSED");
  db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY','{}')",fact.id(),MoneyPostgresIntegrationTest.OWNER,raw.id(),attempt.id());db.update("update money_transactions set manual=false where id=?",fact.id());m.finishProcessing(raw.id(),ProcessingState.PROCESSED,"POSTED");
  var manual=p.save(null,new MoneyProductService.Entry(TransactionType.INCOME,null,account.id(),BigDecimal.ONE,cutoff.plusSeconds(1),"Manual synthetic record",null,null,false,null,null));var page=p.transactions(null,null,account.id(),null,null,null,false,50,0).items();assertThat(page.stream().filter(t->t.id().equals(fact.id())).findFirst().orElseThrow()).satisfies(t->{assertThat(t.manual()).isFalse();assertThat(t.sources()).hasSize(1);});assertThat(page.stream().filter(t->t.id().equals(manual.id())).findFirst().orElseThrow()).satisfies(t->{assertThat(t.manual()).isTrue();assertThat(t.sources()).isEmpty();});
  var json=JsonMapper.builder().build();return new Baseline(account,new MoneyReconciliationReadService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,json),cutoff,new MoneyFinancialService(db,()->MoneyPostgresIntegrationTest.OWNER,m,p,w,json));
 }
 private void unresolved(MoneyService m,String source,String text,Instant at){m.ingest(Map.of("sourcePackage",source,"deviceId",UUID.randomUUID().toString(),"notificationKey",UUID.randomUUID().toString(),"title","출금 확인 필요","text",text,"postedAt",at.toString()));}
 @Test void unrelatedRawNeverMakesSelectedAccountPartialOrChangesItsTokenButRelevantRawDoes()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var base=baseline(db,m,p,w);m.createAccount(new AccountInput("KAKAO","자유적금",AccountRole.SAVINGS,null,"4851"));var before=base.reader().snapshot(base.account().id(),base.cutoff(),null,null,0);assertThat(before).containsEntry("partial",false).containsEntry("status","UNEXPLAINED");
  unresolved(m,"com.ibk.android.ionebank","출금 600원 확인",fixture.at.plusSeconds(20));unresolved(m,"com.kakaobank.channel","자유적금(4851) 출금 600원 확인",fixture.at.plusSeconds(30));
  var same=base.reader().snapshot(base.account().id(),base.cutoff(),before.get("token").toString(),null,0);assertThat(same).containsEntry("partial",false).containsEntry("token",before.get("token"));
  unresolved(m,"com.kakaobank.channel","입출금통장(8557) 출금 600원 확인",base.cutoff().plusSeconds(1));assertThat(base.reader().snapshot(base.account().id(),base.cutoff(),before.get("token").toString(),null,0)).containsEntry("partial",false);
  unresolved(m,"com.kakaobank.channel","입출금통장(8557) 출금 600원 확인",fixture.at.plusSeconds(40));
  var changed=base.reader().snapshot(base.account().id(),base.cutoff(),null,null,0);assertThat(changed).containsEntry("partial",true).containsEntry("status","INSUFFICIENT");assertThat(changed.get("token")).isNotEqualTo(before.get("token"));assertThatThrownBy(()->base.reader().snapshot(base.account().id(),base.cutoff(),before.get("token").toString(),null,0)).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(db.queryForObject("select count(*) from money_transactions where type='BALANCE_ADJUSTMENT'",Long.class)).isZero();
 });}
 @Test void investigationContextRejectsChangedLedgerBeforeAdjustmentAndAcceptsFreshExplicitConfirmation()throws Exception{fixture.isolated((db,m,p,w,mobile)->{
  var base=baseline(db,m,p,w);var snapshot=base.reader().snapshot(base.account().id(),base.cutoff(),null,null,0);var context=(MoneyFinancialService.InvestigationContext)snapshot.get("adjustmentContext");var row=p.reconciliation().stream().filter(r->r.accountId().equals(base.account().id())).findFirst().orElseThrow();assertThat(row.status()).isEqualTo("MISMATCH");
  p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,base.account().id(),null,new BigDecimal("50"),fixture.at.plusSeconds(60),"Changed synthetic ledger",null,null,false,null,null));
  var stale=new MoneyFinancialService.ReconcileInput(row.observedAt(),row.observedBalance(),row.ledgerBalance(),"Explicit synthetic confirmation",m.account(base.account().id()).version(),context);
  assertThatThrownBy(()->base.financial().acceptObserved(base.account().id(),stale)).isInstanceOf(OptimisticLockConflictException.class);assertThat(db.queryForObject("select count(*) from money_transactions where type='BALANCE_ADJUSTMENT'",Long.class)).isZero();
  var fresh=base.reader().snapshot(base.account().id(),base.cutoff(),null,null,0);var freshContext=(MoneyFinancialService.InvestigationContext)fresh.get("adjustmentContext");var current=p.reconciliation().stream().filter(r->r.accountId().equals(base.account().id())).findFirst().orElseThrow();
  var adjusted=base.financial().acceptObserved(base.account().id(),new MoneyFinancialService.ReconcileInput(current.observedAt(),current.observedBalance(),current.ledgerBalance(),"Fresh explicit synthetic confirmation",m.account(base.account().id()).version(),freshContext));
  assertThat(adjusted.type()).isEqualTo(TransactionType.BALANCE_ADJUSTMENT);assertThat(adjusted.amount()).isEqualByComparingTo("-50");assertThat(db.queryForObject("select count(*) from money_transactions where type='BALANCE_ADJUSTMENT'",Long.class)).isEqualTo(1L);
 });}
}
