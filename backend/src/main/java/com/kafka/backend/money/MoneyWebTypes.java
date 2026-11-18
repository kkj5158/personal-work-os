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
 public record Loan(UUID id,String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,long version,Instant updatedAt,long linkedFactCount,long unresolvedAllocationCount,BigDecimal facilityLimit,BigDecimal usedPrincipal,Instant utilizationAsOf) {
 public Loan(UUID id,String name,String lender,String type,BigDecimal originalPrincipal,BigDecimal remainingPrincipal,
   BigDecimal interestRate,BigDecimal monthlyPayment,Integer paymentDay,LocalDate nextDueDate,UUID paymentAccountId,
   LocalDate startDate,LocalDate maturityDate,String status,String memo,long version,Instant updatedAt,long linkedFactCount,long unresolvedAllocationCount){this(id,name,lender,type,originalPrincipal,remainingPrincipal,interestRate,monthlyPayment,paymentDay,nextDueDate,paymentAccountId,startDate,maturityDate,status,memo,version,updatedAt,linkedFactCount,unresolvedAllocationCount,null,null,null);}
 public Loan withFacility(BigDecimal limit,BigDecimal used,Instant at){return new Loan(id,name,lender,type,originalPrincipal,remainingPrincipal,interestRate,monthlyPayment,paymentDay,nextDueDate,paymentAccountId,startDate,maturityDate,status,memo,version,updatedAt,linkedFactCount,unresolvedAllocationCount,limit,used,at);}
 }
 public record AccountInclusion(Boolean includeInAssets,Boolean includeInStatistics,Long expectedVersion) {}
}
