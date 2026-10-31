package com.kafka.backend.money;

import java.time.*;
import java.util.*;

public final class MoneyCalendarTypes {
 private MoneyCalendarTypes() {}
 public record Preset(UUID id,String name,Long amount,Boolean active) {}
 public record TemplateInput(Long expectedVersion,String name,Integer durationMinutes,String startTime,String endTime,
   Integer breakMinutes,Boolean overnight,String shiftDescription,String groupName,Boolean active,List<Preset> presets,UUID defaultPresetId,UUID workplaceId) {
  public TemplateInput(Long v,String name,Integer duration,String start,String end,Integer rest,Boolean overnight,String description,String group,Boolean active,List<Preset> presets,UUID defaultId){this(v,name,duration,start,end,rest,overnight,description,group,active,presets,defaultId,null);}
 }
 public record WorkplaceInput(Long expectedVersion,String name,Boolean active,List<Preset> presets) {}
 public record CalendarPreferences(long version,String weekStart,boolean weekStartConfigured,UUID defaultTemplateId) {}
 public record WeekStartInput(Long expectedVersion,String weekStart) {}
 public record DefaultTemplateInput(Long expectedVersion,UUID defaultTemplateId) {}
 public record PaymentInput(UUID id,LocalDate depositDate,Long amount) {}
 public record WorkInput(Long expectedVersion,LocalDate workDate,String status,UUID templateId,UUID presetId,
   String startTime,String endTime,Boolean overnight,Integer breakMinutes,Integer durationMinutes,Long expectedAmount,
   String memo,List<PaymentInput> payments,String saveAsPresetName) {}
 public record WeekInput(Long expectedVersion,Long specialWorkAllowance,Long weeklyHolidayAllowance,Long publicHolidayAllowance,Long incentive,Long expectedTotalPay) {}
 public record RemoveOffInput(Long expectedVersion) {}
 public record EarningsInput(Long expectedVersion,LocalDate workDate,String status,UUID templateId,UUID presetId,
   String startTime,String endTime,Boolean overnight,Integer breakMinutes,Integer durationMinutes,
   Long basePay,Long dailyIncentive,Long totalDeduction,String memo,String saveAsPresetName,Long confirmedDailyPay,
   Integer contractVersion,Long selectedTemplateVersion,Boolean reselectPreset,Boolean receiptConfirmed) {
  public EarningsInput(Long expectedVersion,LocalDate workDate,String status,UUID templateId,UUID presetId,
    String startTime,String endTime,Boolean overnight,Integer breakMinutes,Integer durationMinutes,
    Long basePay,Long dailyIncentive,Long totalDeduction,String memo,String saveAsPresetName,Long confirmedDailyPay){
   this(expectedVersion,workDate,status,templateId,presetId,startTime,endTime,overnight,breakMinutes,durationMinutes,basePay,dailyIncentive,totalDeduction,memo,saveAsPresetName,confirmedDailyPay,null,null,null,null);
  }
  public EarningsInput(Long expectedVersion,LocalDate workDate,String status,UUID templateId,UUID presetId,
    String startTime,String endTime,Boolean overnight,Integer breakMinutes,Integer durationMinutes,
    Long basePay,Long dailyIncentive,Long totalDeduction,String memo,String saveAsPresetName){
   this(expectedVersion,workDate,status,templateId,presetId,startTime,endTime,overnight,breakMinutes,durationMinutes,basePay,dailyIncentive,totalDeduction,memo,saveAsPresetName,null);
  }
 }
 public record EarningsWeekInput(Long expectedVersion,String expectedDailyFingerprint,Long specialWorkAllowance,Long weeklyHolidayAllowance) {}
}
