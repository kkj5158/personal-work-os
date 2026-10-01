package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import static com.kafka.backend.money.MoneyNoiseFilter.Verdict.*;
import static org.assertj.core.api.Assertions.*;

/** Synthetic texts only. Every verified bank shape must stay a financial candidate. */
class MoneyNoiseFilterTest {
    @Test void advertisingSecurityAndPromotionTextIsNotAFinancialCandidate() {
        assertThat(MoneyNoiseFilter.classify("(광고) 신규 적금 출시","최대 5,000원 혜택을 받아보세요",null)).isEqualTo(NON_FINANCIAL);
        assertThat(MoneyNoiseFilter.classify("[광고]","가을 이벤트 참여하고 커피 받기",null)).isEqualTo(NON_FINANCIAL);
        assertThat(MoneyNoiseFilter.classify("인증번호","[은행] 인증번호 482913 타인에게 알려주지 마세요",null)).isEqualTo(NON_FINANCIAL);
        assertThat(MoneyNoiseFilter.classify("보안 알림","새로운 기기에서 로그인했어요",null)).isEqualTo(NON_FINANCIAL);
        assertThat(MoneyNoiseFilter.classify("추천 이벤트","친구 초대하면 10,000원 캐시백",null)).isEqualTo(NON_FINANCIAL);
    }
    @Test void amountWithTransactionWordingStaysReviewableEvenWhenFormatIsUnknown() {
        assertThat(MoneyNoiseFilter.classify("승인","12,000원 일시불 승인 <MERCHANT>",null)).isEqualTo(FINANCIAL_CANDIDATE);
        assertThat(MoneyNoiseFilter.classify("캐시백 입금","3,000원 캐시백이 입금되었어요",null)).isEqualTo(FINANCIAL_CANDIDATE);
        assertThat(MoneyNoiseFilter.classify("자동이체","통신요금 45,000원 출금 예정",null)).isEqualTo(FINANCIAL_CANDIDATE);
    }
    @Test void everyVerifiedBankShapeRemainsAFinancialCandidate() {
        for(var raw:VerifiedMoneyFixtures.audit())
            assertThat(MoneyNoiseFilter.nonFinancial(raw)).as(raw.title()).isFalse();
        assertThat(MoneyNoiseFilter.classify("적금 입금 성공","최애적금(7530)에 10,000원이 입금되었어요.",null)).isEqualTo(FINANCIAL_CANDIDATE);
    }
}
