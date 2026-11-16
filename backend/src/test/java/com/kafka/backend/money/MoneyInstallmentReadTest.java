package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class MoneyInstallmentReadTest {
 private final UUID source=UUID.randomUUID(),destination=UUID.randomUUID();
 private MoneyInstallmentReadService.Fact fact(String fromGroup,String fromSubtype,String toGroup,String toSubtype,String amount,String currency) {
  return new MoneyInstallmentReadService.Fact(new MoneySavingsReadService.Transfer(UUID.randomUUID(),new BigDecimal(amount),currency,Instant.parse("2026-11-01T00:00:00Z"),source,destination,null,null,null,"source","installment",fromGroup,toGroup),fromSubtype,toSubtype);
 }
 @Test void ordinaryAndGatewayCountButInternalWithdrawalsAndLiquidSavingsDoNot() {
  var totals=MoneyInstallmentReadService.totals(List.of(
   fact("LIVING",null,"SAVINGS","INSTALLMENT","100000","KRW"),
   fact("SAVINGS","SAVINGS_ACCOUNT","SAVINGS","INSTALLMENT","60000","KRW"),
   fact("SAVINGS","INSTALLMENT","SAVINGS","INSTALLMENT","30000","KRW"),
   fact("SAVINGS","INSTALLMENT","LIVING",null,"50000","KRW"),
   fact("LIVING",null,"SAVINGS","SAVINGS_ACCOUNT","90000","KRW")),false);
  assertThat(totals.amount()).isEqualByComparingTo("160000");
  assertThat(totals.count()).isEqualTo(2);
  assertThat(totals.composition()).singleElement().satisfies(s->{assertThat(s.amount()).isEqualByComparingTo(totals.amount());assertThat(s.count()).isEqualTo(2);});
 }
 @Test void repeatedCanonicalIdentityNeverMultipliesDetailsOrTotal() {
  var f=fact("OTHER",null,"SAVINGS","INSTALLMENT","10.25","KRW");
  assertThat(MoneyInstallmentReadService.unique(List.of(f,f))).hasSize(1);
  assertThat(MoneyInstallmentReadService.totals(List.of(f,f),false).amount()).isEqualByComparingTo("10.25");
 }
 @Test void missingHistoryInvalidAmountAndUnsupportedCurrencyAreNotKnownZero() {
  for(var f:List.of(fact(null,null,"SAVINGS","INSTALLMENT","1","KRW"),fact("LIVING",null,null,null,"1","KRW"),fact("LIVING",null,"SAVINGS",null,"1","KRW"),fact("LIVING",null,"SAVINGS","INSTALLMENT","-1","KRW"))) {
   var total=MoneyInstallmentReadService.totals(List.of(f),false);
   assertThat(total.analyticsUnavailable()).isTrue();assertThat(total.amount()).isNull();assertThat(total.unknownHistoryCount()).isEqualTo(1);
  }
  var usd=fact("OTHER",null,"SAVINGS","INSTALLMENT","5","USD");
  assertThat(MoneyInstallmentReadService.totals(List.of(usd),false).amount()).isNull();
  assertThat(MoneyInstallmentReadService.totals(List.of(usd),true).amount()).isEqualByComparingTo("5");
  assertThat(MoneyInstallmentReadService.totals(List.of(usd,fact("OTHER",null,"SAVINGS","INSTALLMENT","1","KRW")),true).amount()).isNull();
 }
 @Test void irrelevantForeignCurrencyAndEmptyMonthHaveKnownZero() {
  var total=MoneyInstallmentReadService.totals(List.of(fact("SAVINGS","INSTALLMENT","OTHER",null,"5","USD")),false);
  assertThat(total.amount()).isZero();assertThat(total.currencies()).isEmpty();
  assertThat(MoneyInstallmentReadService.totals(List.of(),false).amount()).isZero();
 }
}
