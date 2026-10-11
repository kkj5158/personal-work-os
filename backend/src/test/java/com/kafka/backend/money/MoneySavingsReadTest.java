package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class MoneySavingsReadTest {
 private final UUID living=UUID.randomUUID(),saving=UUID.randomUUID();
 MoneySavingsReadService.Transfer fact(UUID id,String from,String to,String amount,String currency){return new MoneySavingsReadService.Transfer(id,new BigDecimal(amount),currency,Instant.parse("2026-10-01T00:00:00Z"),living,saving,null,null,null,"생활비","저축",from,to);}
 @Test void grossIncludesEveryBoundaryDepositAndNetSubtractsWithdrawalsWithoutReturnConcept(){
  var facts=List.of(fact(UUID.randomUUID(),"LIVING","SAVINGS","500000","KRW"),fact(UUID.randomUUID(),"OTHER","SAVINGS","300000","KRW"),fact(UUID.randomUUID(),"LIVING","SAVINGS","70000","KRW"),fact(UUID.randomUUID(),"SAVINGS","LIVING","100000","KRW"),fact(UUID.randomUUID(),"SAVINGS","SAVINGS","900000","KRW"),fact(UUID.randomUUID(),"LIVING","OTHER","50000","KRW"));
  var totals=MoneySavingsReadService.totals(facts);
  assertThat(totals.gross()).isEqualByComparingTo("870000");assertThat(totals.net()).isEqualByComparingTo("770000");assertThat(totals.withdrawals()).isEqualByComparingTo("100000");
  assertThat(totals.composition()).singleElement().satisfies(slice->{assertThat(slice.amount()).isEqualByComparingTo("870000");assertThat(slice.count()).isEqualTo(3);});
 }
 @Test void negativeNetAndDuplicateCanonicalIdAreHandled(){
  var deposit=fact(UUID.randomUUID(),"LIVING","SAVINGS","10.25","KRW");
  var totals=MoneySavingsReadService.totals(List.of(deposit,deposit,fact(UUID.randomUUID(),"SAVINGS","OTHER","20.50","KRW")));
  assertThat(totals.gross()).isEqualByComparingTo("10.25");assertThat(totals.net()).isEqualByComparingTo("-10.25");
 }
 @Test void mixedCurrencyOrMissingHistoryNeverProducesAnInventedKrwTotal(){
  var mixed=MoneySavingsReadService.totals(List.of(fact(UUID.randomUUID(),"LIVING","SAVINGS","10","KRW"),fact(UUID.randomUUID(),"LIVING","SAVINGS","10","USD")));
  assertThat(mixed.analyticsUnavailable()).isTrue();assertThat(mixed.gross()).isNull();assertThat(mixed.net()).isNull();assertThat(mixed.composition()).isEmpty();
  var missing=MoneySavingsReadService.totals(List.of(fact(UUID.randomUUID(),null,"SAVINGS","10","KRW")));
  assertThat(missing.unknownHistoryCount()).isEqualTo(1);assertThat(missing.gross()).isNull();
 }
 @Test void emptyMonthHasKnownZeroAndInternalCurrencyTransfersDoNotPolluteBoundary(){
  var totals=MoneySavingsReadService.totals(List.of(fact(UUID.randomUUID(),"SAVINGS","SAVINGS","100","USD")));
  assertThat(totals.analyticsUnavailable()).isFalse();assertThat(totals.gross()).isZero();assertThat(totals.net()).isZero();
 }
}
