package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.VerifiedMoneyFixtures.*;
class VerifiedMoneyParserTest {
    @Test void allEighteenAuditedShapesAndTimeProvenance(){
        var raws=audit();assertThat(raws).hasSize(18);
        for(var raw:raws){var c=attempt(raw).candidate();assertThat(c.parseStatus()).isEqualTo(ParseStatus.PARSED);
            assertThat(c.parserVersion()).isEqualTo("1.0.0");assertThat(c.rawEventId()).isEqualTo(raw.id());assertThat(c.postedAt()).isEqualTo(raw.postedAt());
            if(c.provider().equals("KAKAO")){assertThat(c.providerOccurredAt()).isNull();assertThat(c.timeSource()).isEqualTo(TimeSource.ANDROID_POSTED_AT);}
            else {assertThat(c.providerOccurredAt()).isNotNull();assertThat(c.occurredAt()).isEqualTo(c.providerOccurredAt());
                assertThat(c.timeSource()).isEqualTo(c.provider().equals("WOORI")?TimeSource.PROVIDER_SECOND:TimeSource.PROVIDER_MINUTE);}
        }
        assertThat(attempt(raws.get(12)).candidate().direction()).isEqualTo(Direction.IN);
        assertThat(attempt(raws.get(12)).candidate().accountSuffixHints()).containsExactly("7530","8557");
    }
    @Test void auxiliaryAndCatalogFormats() throws Exception {for(var f:MoneyFixtures.all()){
        var raw=raw(f.provider(),f.title(),f.text(),Instant.parse("2026-09-24T05:31:00Z"));
        var c=attempt(raw).candidate();assertThat(c.parseStatus()).as(f.key()).isEqualTo(ParseStatus.PARSED);
        assertThat(c.amount()).isEqualByComparingTo(f.amount());
    }}
    @Test void malformedWrongPackageInvalidTimeAndZeroNeverParse(){
        for(var p:PARSERS){var r=raw("KAKAO","출금","Malformed",NOW);assertThat(p.parse(r).parseStatus()).isEqualTo(ParseStatus.REVIEW_REQUIRED);}
        for(String body:new String[]{"0원 <OWNER> 급여통장(1228) 09.24 16:54 잔액 0원","1,000원 <OWNER> 급여통장(1228) 02.30 16:54 잔액 0원",
                "1,000원 <OWNER> 급여통장(1228) 09.20 16:54 잔액 0원"}){
            assertThat(attempt(raw("SHINHAN","출금",body,NOW)).candidate().parseStatus()).isEqualTo(ParseStatus.REVIEW_REQUIRED);}
    }
    @Test void koreaYearBoundaryAndMinutePrecision(){
        var c=attempt(raw("SHINHAN","입금","1,000원 <OWNER> 급여통장(1228) 12.31 23:59 잔액 2,000원",Instant.parse("2027-01-01T00:00:02+09:00"))).candidate();
        assertThat(c.providerOccurredAt()).isEqualTo(Instant.parse("2026-12-31T23:59:00+09:00"));
        assertThat(c.timeSource()).isEqualTo(TimeSource.PROVIDER_MINUTE);assertThat(c.providerTimeText()).isEqualTo("12.31 23:59");
    }
}
