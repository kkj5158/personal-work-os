package com.kafka.backend.reflection;

import com.kafka.backend.calendar.CalendarRangeResponse;
import java.time.*;
import java.util.*;

/** Same duration/source identity as WORK OS. Intentional independent records stay independent. */
public final class CalendarReviewWorkMinutes {
    private CalendarReviewWorkMinutes() {}
    public static Map<LocalDate,Integer> calculate(CalendarRangeResponse range,LocalDate from,LocalDate to) {
        Map<LocalDate,Integer> result=new HashMap<>();Set<String> seen=new HashSet<>();
        for(var b:range.actualBlocks()) {
            if(!"WORK".equals(b.domainType())||!seen.add(b.sourceType()+":"+b.sourceId()))continue;
            LocalDate start=b.startAt().toLocalDate(),end=b.endAt().toLocalDate();
            for(LocalDate d=start;!d.isAfter(end);d=d.plusDays(1)) {
                if(d.isBefore(from)||d.isAfter(to))continue;
                var a=b.startAt().isAfter(d.atStartOfDay())?b.startAt():d.atStartOfDay();
                var z=b.endAt().isBefore(d.plusDays(1).atStartOfDay())?b.endAt():d.plusDays(1).atStartOfDay();
                int minutes=(int)Duration.between(a,z).toMinutes();
                if(minutes>0)result.merge(d,minutes,Integer::sum);
            }
        }
        for(var b:range.unscheduledActual())if("WORK".equals(b.domainType())&&seen.add(b.sourceType()+":"+b.sourceId())&&!b.date().isBefore(from)&&!b.date().isAfter(to))result.merge(b.date(),b.durationMinutes(),Integer::sum);
        return result;
    }
}
