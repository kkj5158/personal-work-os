package com.kafka.backend.money;

import java.time.*;
import java.util.*;

public final class MoneyCalendarTypes {
 private MoneyCalendarTypes() {}
 public record Preset(UUID id,String name,Long amount,Boolean active) {}
 public record TemplateInput(Long expectedVersion,String name,Integer durationMinutes,String startTime,String endTime,
   Integer breakMinutes,Boolean overnight,String shiftDescription,String groupName,Boolean active,List<Preset> presets,UUID defaultPresetId) {}
 public record PaymentInput(UUID id,LocalDate depositDate,Long amount) {}
 public record WorkInput(Long expectedVersion,LocalDate workDate,String status,UUID templateId,UUID presetId,
   String startTime,String endTime,Boolean overnight,Integer breakMinutes,Integer durationMinutes,Long expectedAmount,
   String memo,List<PaymentInput> payments,String saveAsPresetName) {}
 public record WeekInput(Long expectedVersion,Long specialWorkAllowance,Long weeklyHolidayAllowance,Long publicHolidayAllowance,Long incentive,Long expectedTotalPay) {}
}
