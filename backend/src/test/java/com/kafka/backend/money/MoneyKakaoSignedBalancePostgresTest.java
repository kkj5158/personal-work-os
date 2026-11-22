package com.kafka.backend.money;

import org.junit.jupiter.api.*;
import java.time.*;import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Never runs on owner DEV/PROD: committed synthetic schemas in the owned loopback cluster only. */
@org.junit.jupiter.api.condition.EnabledIf("com.kafka.backend.money.MoneyPostgresIntegrationTest#contractFixture")
class MoneyKakaoSignedBalancePostgresTest {
 final MoneyRecommendationPostgresTest f=new MoneyRecommendationPostgresTest();UUID kakao;final Instant at=Instant.parse("2026-11-02T13:19:33.491Z");
 @BeforeEach void setup()throws Exception{
  f.create();kakao=f.money.createAccount(new AccountInput("KAKAO","합성 한도계좌",AccountRole.SPENDING,null,"9821")).id();
  f.db.update("update money_accounts set masked_reference='975-******-01-014' where id=?",f.account);
 }
 @AfterEach void cleanup(){f.cleanup();}
 UUID raw(String bank,String title,String text,Instant posted){return f.money.ingest(Map.of("sourcePackage",bank.equals("KAKAO")?"com.kakaobank.channel":"com.ibk.android.ionebank","title",title,"text",text,"postedAt",posted.toString(),"idempotencyKey",UUID.randomUUID().toString())).notification().id();}
 UUID kakao(String cp){return raw("KAKAO","출금 50,000원","입출금통장(9821) → "+cp+" 잔액 -3,000,000원",at);}
 UUID incoming(){return raw("IBK","입출금내역 알림","[입금] 50,000원 합성소유자 975-******-01-014 11/02 22:19 / 잔액 60,000원",at.minusMillis(627));}
 MoneyProcessingService worker(){return new MoneyProcessingService(f.db,f.json,f.manager,Clock.fixed(Instant.now().plusSeconds(30),ZoneOffset.UTC));}
 String rawEvidence(UUID id){return f.db.queryForObject("select raw_payload::text from money_raw_notifications where id=?",String.class,id);}
 String parseEvidence(UUID id){return f.db.queryForObject("select json_agg(p order by created_at,id)::text from money_parse_attempts p where raw_event_id=?",String.class,id);}
 @Test void processingCommitsOneTransferWithTwoSourcesAndReplayAddsNothing(){
  UUID out=kakao("신한오픈합성소유자"),in=incoming();String before=rawEvidence(out);
  assertThat(worker().runOwner(f.owner)).isEqualTo(1);
  var facts=f.db.queryForList("select type,amount,from_account_id,to_account_id from money_transactions");
  assertThat(facts).singleElement().satisfies(t->assertThat(t).containsEntry("type","TRANSFER").containsEntry("from_account_id",kakao).containsEntry("to_account_id",f.account));
  assertThat(f.db.queryForObject("select count(*) from money_transaction_sources",Long.class)).isEqualTo(2);
  assertThat(f.money.attempts(out).getFirst().candidate().postBalance()).isEqualByComparingTo("-3000000");
  assertThat(f.money.attempts(out).getFirst().parserVersion()).isEqualTo("1.0.1");assertThat(rawEvidence(out)).isEqualTo(before);
  String parsed=parseEvidence(out);assertThat(worker().runOwner(f.owner)).isZero();assertThat(parseEvidence(out)).isEqualTo(parsed);
  assertThat(f.money.notification(in).state()).isEqualTo(ProcessingState.PROCESSED);
 }
 @Test void readAdmissionAndOwnerContextAcceptNewVersionWithoutWritingOrGuessingLoan(){
  UUID id=kakao("대출상환");f.money.process(id,new KakaoNotificationParserV1());f.money.finishProcessing(id,ProcessingState.REVIEW_REQUIRED,"DEDICATED_FINANCIAL_OPERATION_REQUIRED");
  String before=parseEvidence(id),raw=rawEvidence(id);var assessment=new MoneyReviewAdmission(f.db,()->f.owner,f.json,f.money).assess(List.of(id)).get(id);
  assertThat(assessment.eligible()).isTrue();assertThat(assessment.meaningUnresolved()).isTrue();
  var context=new MoneyOwnerReviewService(f.db,()->f.owner,f.json,f.money,f.commands).context(id);assertThat(context).containsKey("fingerprint").doesNotContainKey("manualRequired");
  var read=new MoneyProcessingReadService(f.db,()->f.owner,f.json,f.money).processing("2026-11-02","2026-11-02");assertThat((List<?>)read.get("items")).hasSize(1);
  assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();assertThat(parseEvidence(id)).isEqualTo(before);assertThat(rawEvidence(id)).isEqualTo(raw);
 }
 @Test void oneSignedLoanMovementIsUnresolvedCashWithoutLoanAllocation(){
  UUID id=kakao("대출이자");assertThat(worker().runOwner(f.owner)).isEqualTo(1);
  assertThat(f.db.queryForList("select type,meaning_state,principal,interest,fee from money_transactions")).singleElement().satisfies(t->assertThat(t).containsEntry("type","EXPENSE").containsEntry("meaning_state","UNRESOLVED").containsEntry("principal",null).containsEntry("interest",null).containsEntry("fee",null));
  assertThat(f.db.queryForObject("select count(*) from money_transaction_sources where raw_event_id=?",Long.class,id)).isEqualTo(1);
 }
 @Test void legacyTerminalAndHeldEvidenceAreNeverReparsedOrRestoredAlongsideNewRaw(){
  UUID old=kakao("신한오픈합성소유자");var current=new KakaoNotificationParserV1();
  MoneyNotificationParser legacy=new MoneyNotificationParser(){public String key(){return current.key();}public String version(){return "1.0.0";}public boolean supports(MoneyRawNotification raw){return current.supports(raw);}public ParsedCandidate parse(MoneyRawNotification raw){var c=current.parse(raw);return new ParsedCandidate(c.rawEventId(),c.provider(),c.direction(),c.amount(),c.occurredAt(),c.providerTimeText(),c.sourceAccountHint(),c.destinationAccountHint(),c.accountSuffixHints(),c.counterpartyText(),c.postBalance(),c.notificationSubtype(),c.parseStatus(),c.postedAt(),c.providerOccurredAt(),c.timeSource(),"1.0.0",c.evidence());}};
  f.money.process(old,legacy);f.money.finishProcessing(old,ProcessingState.REVIEW_REQUIRED,"UNRESOLVED_TRANSFER_CANDIDATE");f.db.update("update money_raw_notifications set review_deferred=true where id=?",old);
  String parsed=parseEvidence(old),raw=rawEvidence(old);long version=f.money.notification(old).processingVersion();UUID fresh=incoming();
  assertThat(worker().runOwner(f.owner)).isZero();assertThat(parseEvidence(old)).isEqualTo(parsed);assertThat(rawEvidence(old)).isEqualTo(raw);assertThat(f.money.notification(old).processingVersion()).isEqualTo(version);
  assertThat(f.db.queryForObject("select review_deferred from money_raw_notifications where id=?",Boolean.class,old)).isTrue();assertThat(f.money.notification(fresh).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);assertThat(f.db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 }
}
