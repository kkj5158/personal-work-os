package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
import static org.assertj.core.api.Assertions.*;

class KakaoSignedBalanceParserTest {
 ParsedCandidate parse(String title,String body){return new KakaoNotificationParserV1().parse(raw("KAKAO",title,body,NOW));}
 @Test void signedBalanceIsSeparatedWithoutChangingAmountDirectionOrAndroidPrecision(){
  for(String value:List.of("-3,000,000","-1","0","3,000,000")){
   var c=parse("출금 50,000원","입출금통장(8557) → 신한오픈합성소유자 잔액 "+value+"원");
   assertThat(c.parseStatus()).isEqualTo(ParseStatus.PARSED);assertThat(c.amount()).isEqualByComparingTo("50000");
   assertThat(c.direction()).isEqualTo(Direction.OUT);assertThat(c.counterpartyText()).isEqualTo("신한오픈합성소유자");
   assertThat(c.postBalance()).isEqualByComparingTo(value.replace(",",""));assertThat(c.sourceAccountHint()).isEqualTo("입출금통장(8557)");
   assertThat(c.timeSource()).isEqualTo(TimeSource.ANDROID_POSTED_AT);assertThat(c.providerOccurredAt()).isNull();assertThat(c.parserVersion()).isEqualTo("1.0.1");
  }
 }
 @Test void incomingAndInternalProductRoutesRetainBothAccountHints(){
  var incoming=parse("입금 50,000원","합성소유자 → 입출금통장(8557) 잔액 -2,950,000원");
  assertThat(incoming.direction()).isEqualTo(Direction.IN);assertThat(incoming.destinationAccountHint()).isEqualTo("입출금통장(8557)");assertThat(incoming.counterpartyText()).isEqualTo("합성소유자");
  var route=parse("출금 50,000원","입출금통장(8557) → 적금(7530) 잔액 -3,000,000원");
  assertThat(route.notificationSubtype()).isEqualTo("INTERNAL_ROUTE");assertThat(route.destinationAccountHint()).isEqualTo("적금(7530)");assertThat(route.counterpartyText()).isNull();
 }
 @Test void malformedSignedBalanceAndNegativeMovementAmountNeverBecomeVerifiedCash(){
  for(String balance:List.of("--3,000","-3,00","+3,000","-","-3,000원 추가","-3,000.5"))assertThat(parse("출금 50,000원","입출금통장(8557) → 합성소유자 잔액 "+balance+"원").parseStatus()).as(balance).isEqualTo(ParseStatus.REVIEW_REQUIRED);
  assertThat(parse("출금 -50,000원","입출금통장(8557) → 합성소유자 잔액 -3,000원").parseStatus()).isEqualTo(ParseStatus.REVIEW_REQUIRED);
  assertThat(parse("출금 50,000원","입출금통장(8557) → 합성소유자").counterpartyText()).isEqualTo("합성소유자");
 }
 @Test void correctedCounterpartyPairsUsingExistingWindowsAndOwnedAccounts(){
  Instant at=Instant.parse("2026-09-24T07:54:33Z");
  var out=attempt(raw("KAKAO","출금 50,000원","입출금통장(8557) → 신한오픈합성소유자 잔액 -3,000,000원",at));
  var in=attempt(raw("IBK","입출금내역 알림","[입금] 50,000원 합성소유자 975-******-01-014 09/24 16:54 / 잔액 60,000원",at.minusMillis(627)));
  var proposals=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC)).propose(new MoneyTransferMatcher.Context(accounts(),List.of(out,in),List.of()));
  assertThat(proposals).singleElement().satisfies(p->{assertThat(p.transaction().type()).isEqualTo(TransactionType.TRANSFER);assertThat(p.sources()).hasSize(2);});
 }
 @Test void signedBalanceDoesNotInferLoanOrRefundMeaning(){
  for(String cp:List.of("대출이자","대출사용금액","대출상환","결제환불")){
   var a=attempt(raw("KAKAO","출금 21,827원","입출금통장(8557) → "+cp+" 잔액 -3,000,000원",NOW.minusSeconds(120)));
   var p=new VerifiedMoneyTransferMatcher(Clock.fixed(NOW,ZoneOffset.UTC)).propose(new MoneyTransferMatcher.Context(accounts(),List.of(a),List.of()));
   assertThat(p).singleElement().satisfies(x->{assertThat(x.transaction().type()).isEqualTo(TransactionType.EXPENSE);assertThat(x.evidence()).containsEntry("meaningUnresolved",true);});
  }
 }
 @Test void versionAllowlistIsBankScopedAndKeepsHistoricalEvidence(){
  for(String bank:List.of("KAKAO","IBK","SHINHAN","WOORI"))assertThat(MoneyOrdinaryAdmission.supportedParserVersion(bank,"1.0.0")).isTrue();
  assertThat(MoneyOrdinaryAdmission.supportedParserVersion("KAKAO","1.0.1")).isTrue();
  for(String bank:List.of("IBK","SHINHAN","WOORI","OTHER"))assertThat(MoneyOrdinaryAdmission.supportedParserVersion(bank,"1.0.1")).isFalse();
  assertThat(MoneyOrdinaryAdmission.supportedParserVersion("KAKAO","1.0.2")).isFalse();assertThat(MoneyOrdinaryAdmission.supportedParserVersion("KAKAO",null)).isFalse();
 }
}
