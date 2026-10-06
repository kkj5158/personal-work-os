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
}
