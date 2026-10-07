package com.kafka.backend.sleep;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class SleepTimeTest {
 @Test void smallMidnightSampleHasMeanButNoRegularity(){
  var times=List.of(Instant.parse("2026-01-01T23:50:00Z"),Instant.parse("2026-01-02T00:10:00Z"));var r=SleepTime.circular(times,List.of("UTC","UTC"));
  assertThat((double)r.get("centerMinutes")).isCloseTo(0,within(0.001));assertThat(r).containsEntry("status","INSUFFICIENT_SAMPLES").containsEntry("deviationMinutes",null).containsEntry("sampleCount",2);
 }
 @Test void midnightCircularMeansAndRealVariance(){
  var times=List.of(1380,60,1380,60,1380,60).stream().map(m->LocalDate.of(2026,1,1).atStartOfDay(ZoneId.of("Asia/Seoul")).plusMinutes(m).toInstant()).toList();
  var r=SleepTime.circular(times,Collections.nCopies(6,"Asia/Seoul"));
  assertThat((double)r.get("centerMinutes")).isCloseTo(0,within(0.001));
  assertThat((double)r.get("deviationMinutes")).isCloseTo(60.34808165261931,within(0.000001));
 }
 @Test void lowConcentrationAndTravelUnavailable(){
  var t=List.of(0,720,0,720,0,720).stream().map(m->Instant.parse("2026-01-01T00:00:00Z").plusSeconds(m*60)).toList();
  assertThat(SleepTime.circular(t,Collections.nCopies(6,"UTC"))).containsEntry("status","UNAVAILABLE_LOW_CONCENTRATION").containsEntry("centerMinutes",null);
  assertThat(SleepTime.circular(t,List.of("UTC","Asia/Seoul","UTC","UTC","UTC","UTC"))).containsEntry("status","MIXED_TIMEZONES");
 }
 @Test void anchorsIgnoreAlertEnabledAndDstInstantsPreserveOffset(){
  var z=ZoneId.of("Asia/Seoul");var t=Instant.parse("2026-10-02T15:05:00Z");
  assertThat(SleepTime.anchor(t,z,LocalTime.of(7,10),true)).isEqualTo(LocalDate.of(2026,10,3));
  assertThat(SleepTime.anchor(t,z,LocalTime.of(7,10),false)).isEqualTo(LocalDate.of(2026,10,2));
  var ny=ZoneId.of("America/New_York");
  SleepTime.offset(Instant.parse("2026-11-01T05:30:00Z"),ny,-240);
  SleepTime.offset(Instant.parse("2026-11-01T06:30:00Z"),ny,-300);
  assertThatThrownBy(()->SleepTime.offset(Instant.parse("2026-11-01T06:30:00Z"),ny,-240)).isInstanceOf(SleepError.class);
 }
 @Test void intervalValidationDoesNotSynthesizeUnknown(){
  var now=Instant.parse("2026-10-03T12:00:00Z");
  SleepTime.validate(null,now,now,false);
  assertThatThrownBy(()->SleepTime.validate(now,now,now,true)).isInstanceOf(SleepError.class);
  SleepTime.validate(now.minusSeconds(90000),now,now,true);
  assertThatThrownBy(()->SleepTime.validate(now.minusSeconds(70000),now,now,false)).isInstanceOf(SleepError.class);
  SleepTime.validate(now.minusSeconds(70000),now,now,true);
 }
}
