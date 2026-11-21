package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class MoneyWebTypes {
 private MoneyWebTypes() {}
 public record BookkeepingEdit(Long expectedVersion, Long expectedTransactionVersion, Map<String,Object> overrides, Long expectedProjectionVersion) {
  public BookkeepingEdit(Long expectedVersion,Long expectedTransactionVersion,Map<String,Object> overrides){this(expectedVersion,expectedTransactionVersion,overrides,null);}
 }
 public record LoanInput(String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,Long expectedVersion) {}
 public record LoanStatusInput(String status, Long expectedVersion) {}
 public record LoanRateInput(
   @com.fasterxml.jackson.annotation.JsonProperty(value = "interestRate", required = true) BigDecimal interestRate,
   Long expectedVersion) {}
 public record ConfirmedRepayment(Instant occurredAt, BigDecimal amount) {}
 public record Loan(UUID id,String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,long version,Instant updatedAt,long linkedFactCount,long unresolvedAllocationCount,BigDecimal facilityLimit,BigDecimal usedPrincipal,Instant utilizationAsOf, ConfirmedRepayment latestConfirmedRepayment) {
 public Loan(UUID id,String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,long version,Instant updatedAt,long linkedFactCount,long unresolvedAllocationCount, ConfirmedRepayment latestConfirmedRepayment){this(id,name,lender,type,originalPrincipal,remainingPrincipal,interestRate,monthlyPayment,paymentDay,nextDueDate,paymentAccountId,startDate,maturityDate,status,memo,version,updatedAt,linkedFactCount,unresolvedAllocationCount,null,null,null,latestConfirmedRepayment);}
 public Loan withFacility(BigDecimal limit,BigDecimal used,Instant at){return new Loan(id,name,lender,type,originalPrincipal,remainingPrincipal,interestRate,monthlyPayment,paymentDay,nextDueDate,paymentAccountId,startDate,maturityDate,status,memo,version,updatedAt,linkedFactCount,unresolvedAllocationCount,limit,used,at,latestConfirmedRepayment);}
 }
 public record AccountInclusion(Boolean includeInAssets,Boolean includeInStatistics,Long expectedVersion) {}
}
