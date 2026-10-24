package com.kafka.backend.reflection;
import com.kafka.backend.calendar.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class CalendarReviewWorkMinutesTest {
 LocalDate date=LocalDate.of(2026,10,24);
 CalendarActualBlockDto block(UUID id,String domain,String start,String end){return new CalendarActualBlockDto(ActualSourceType.WORK_TIME_ENTRY,id,domain,date,"제목",LocalDateTime.parse(start),LocalDateTime.parse(end),120,null,null,null,null);}
 @Test void splitsMidnightClipsRangeAndDeduplicatesOnlySameSource(){var id=UUID.randomUUID();var overnight=block(id,"WORK","2026-10-24T23:00:00","2026-10-25T01:00:00");var other=block(UUID.randomUUID(),"WORK","2026-10-24T23:00:00","2026-10-25T01:00:00");var life=block(UUID.randomUUID(),"LIFE","2026-10-24T20:00:00","2026-10-24T22:00:00");var range=new CalendarRangeResponse(List.of(),List.of(overnight,overnight,other,life),List.of(),List.of(),List.of(),List.of());var result=CalendarReviewWorkMinutes.calculate(range,date,date.plusDays(1));assertThat(result).containsEntry(date,120).containsEntry(date.plusDays(1),120);assertThat(CalendarReviewWorkMinutes.calculate(range,date,date)).hasSize(1);}
 @Test void includesCanonicalUntimedWorkButNotLifeOrDuplicateProjection(){var id=UUID.randomUUID();var work=new CalendarUnscheduledActualDto(ActualSourceType.WORK_TIME_ENTRY,id,"WORK",date,"일",95,null,null,null,null);var life=new CalendarUnscheduledActualDto(ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID(),"LIFE",date,"생활",10,null,null,null,null);var range=new CalendarRangeResponse(List.of(),List.of(),List.of(work,work,life),List.of(),List.of(),List.of());assertThat(CalendarReviewWorkMinutes.calculate(range,date,date)).containsExactly(Map.entry(date,95));}
}
