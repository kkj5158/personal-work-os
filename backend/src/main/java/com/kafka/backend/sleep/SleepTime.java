package com.kafka.backend.sleep;
import java.time.*;
import java.util.*;
public final class SleepTime {
 private SleepTime(){}
 public static Instant instant(Object value){return value==null?null:Instant.parse(OffsetDateTime.parse(value.toString()).toInstant().toString());}
 public static ZoneId zone(Object value){return ZoneId.of(Objects.toString(value,"Asia/Seoul"));}
 public static void validate(Instant bed,Instant wake,Instant now,boolean confirmed){
  if((bed!=null&&bed.isAfter(now.plusSeconds(300)))||(wake!=null&&wake.isAfter(now.plusSeconds(300))))
   throw new SleepError(422,"FUTURE_TIME","휴대폰 날짜와 시각을 확인해주세요.","fieldErrors",Map.of("time","미래 시각은 저장할 수 없어요."));
  if(bed!=null&&wake!=null){var duration=Duration.between(bed,wake);
   if(!wake.isAfter(bed))throw new SleepError(422,"INVALID_TIME_RANGE","기상은 취침 이후로 입력해주세요.","fieldErrors",Map.of("wakeAt","날짜와 시각을 확인해주세요."));
   if(duration.compareTo(Duration.ofHours(18))>=0&&!confirmed)throw new SleepError(422,"TIME_CONFIRMATION_REQUIRED","18시간 이상 간격의 시각을 확인해주세요.");
  }
 }
 public static void offset(Instant at,ZoneId zone,int minutes){
  if(zone.getRules().getOffset(at).getTotalSeconds()!=minutes*60)throw new SleepError(422,"AMBIGUOUS_LOCAL_TIME","시간대와 UTC offset을 확인해주세요.");
 }
 public static LocalDate anchor(Instant at,ZoneId zone,LocalTime wake,boolean next){
  ZonedDateTime local=at.atZone(zone);LocalDate date=local.toLocalDate();
  Instant anchor=date.atTime(wake).atZone(zone).toInstant();
  return next?(at.isBefore(anchor)?date:date.plusDays(1)):(at.isBefore(anchor)?date.minusDays(1):date);
 }
 public static Map<String,Object> circular(List<Instant> values,List<String> zones){
  Map<String,Object> r=new LinkedHashMap<>();r.put("sampleCount",values.size());r.put("metricVersion","circular-time.v1");
  r.put("centerMinutes",null);r.put("deviationMinutes",null);
  if(values.isEmpty()){r.put("status","INSUFFICIENT_SAMPLES");return r;}
  if(new HashSet<>(zones).size()!=1){r.put("status","MIXED_TIMEZONES");return r;}
  double c=0,s=0;for(int i=0;i<values.size();i++){var t=values.get(i).atZone(zone(zones.get(i))).toLocalTime();double theta=2*Math.PI*(t.toSecondOfDay()/60.0)/1440;c+=Math.cos(theta);s+=Math.sin(theta);}
  c/=values.size();s/=values.size();double length=Math.min(1,Math.hypot(c,s));r.put("resultantLength",length);r.put("timezoneRegime",zones.getFirst());
  if(length<0.1){r.put("status","UNAVAILABLE_LOW_CONCENTRATION");return r;}
  double center=(Math.atan2(s,c)*1440/(2*Math.PI)+1440)%1440;if(center>1439.999999)center=0;
  r.put("centerMinutes",center);
  r.put("status",values.size()<5?"INSUFFICIENT_SAMPLES":"AVAILABLE");
  if(values.size()>=5)r.put("deviationMinutes",Math.sqrt(-2*Math.log(length))*1440/(2*Math.PI));return r;
 }
}
