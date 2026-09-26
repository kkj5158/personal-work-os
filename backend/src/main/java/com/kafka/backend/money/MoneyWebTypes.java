package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class MoneyWebTypes {
 private MoneyWebTypes() {}
 public record BookkeepingEdit(Long expectedVersion, Long expectedTransactionVersion, Map<String,Object> overrides) {}
 public record LoanInput(String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,Long expectedVersion) {}
 public record Loan(UUID id,String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,long version,Instant updatedAt) {}
 public record AccountInclusion(Boolean includeInAssets,Boolean includeInStatistics,Long expectedVersion) {}
}
