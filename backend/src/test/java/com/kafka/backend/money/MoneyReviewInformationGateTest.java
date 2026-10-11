package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

class MoneyReviewInformationGateTest {
 MoneyRawNotification raw(String title,String text,String bigText){return new MoneyRawNotification(UUID.randomUUID(),"synthetic",null,null,title,text,bigText,Instant.now(),Instant.now(),Map.of(),"synthetic",ProcessingState.REVIEW_REQUIRED,1);}
 @Test void unsupportedCurrenciesAndAmountlessFinancialWordingStayForIndividualReview(){
  for(String text:List.of("입금 USD 100","Transfer $100","카드 해외 사용 EUR 15","출금 확인 필요","계좌 1234 확인","(광고) 입금 3,000원")){
   var value=raw("Synthetic",text,null);
   assertThat(MoneyReviewInformationGate.unambiguous(value)).as(text).isFalse();
  }
  // The ordinary parser/noise contract stays unchanged; only the bulk gate is stricter.
  assertThat(MoneyNoiseFilter.nonFinancial(raw("Synthetic","입금 USD 100",null))).isTrue();
 }
 @Test void bothTextSourcesAreCheckedEvenWhenBigTextIsInformationOnly(){
  assertThat(MoneyReviewInformationGate.unambiguous(raw("Synthetic","입금 USD 100","이벤트 안내"))).isFalse();
 }
 @Test void clearlyInformationOnlyNoticesRemainEligible(){
  assertThat(MoneyReviewInformationGate.unambiguous(raw("(광고) Synthetic event","혜택 안내",null))).isTrue();
  assertThat(MoneyReviewInformationGate.unambiguous(raw("보안 알림","인증번호 123456",null))).isTrue();
 }
}
