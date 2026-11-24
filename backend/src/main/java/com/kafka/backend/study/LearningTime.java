package com.kafka.backend.study;

import java.time.*;
import java.util.*;

/** All persisted intervals are half-open epoch seconds. Missing observations stay unobserved. */
final class LearningTime {
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    record Span(long start, long end, String state) {}
    record Totals(long elapsedSeconds, long measuredSeconds, long idleSeconds, long awaySeconds,
                  long manualPausedSeconds, long unobservedSeconds, String measurementCoverage,
                  Map<LocalDate,Long> measuredDays) {}

    static LocalDate day(long second) { return Instant.ofEpochSecond(second).atZone(KST).toLocalDate(); }
    static long midnight(LocalDate day) { return day.atStartOfDay(KST).toEpochSecond(); }

    static Totals project(long start, long end, List<Span> observations, List<Span> pauses) {
        var changes = new TreeMap<Long,Map<String,Integer>>();
        changes.put(start,new HashMap<>());
        changes.put(end,new HashMap<>());
        for (var spans : List.of(observations, pauses)) {
            for (var span : spans) {
                long left = Math.max(start, span.start()), right = Math.min(end, span.end());
                if (right <= left) continue;
                changes.computeIfAbsent(left,k->new HashMap<>()).merge(span.state(),1,Integer::sum);
                changes.computeIfAbsent(right,k->new HashMap<>()).merge(span.state(),-1,Integer::sum);
            }
        }
        var active = new HashMap<String,Integer>();
        var sums = new HashMap<String,Long>();
        var days = new TreeMap<LocalDate,Long>();
        long previous = start;
        for (var point : changes.entrySet()) {
            long until = point.getKey();
            String state = "UNOBSERVED";
            for (String candidate : List.of("MANUAL_PAUSED","AWAY","IDLE","STUDYING")) {
                if (active.getOrDefault(candidate,0)>0) { state=candidate; break; }
            }
            sums.merge(state,until-previous,Long::sum);
            if (state.equals("STUDYING")) {
                while (previous < until) {
                    var day = day(previous);
                    long edge = Math.min(until,midnight(day.plusDays(1)));
                    days.merge(day,edge-previous,Long::sum);
                    previous=edge;
                }
            }
            point.getValue().forEach((key,count)->active.merge(key,count,Integer::sum));
            previous=until;
        }
        long gap=sums.getOrDefault("UNOBSERVED",0L);
        return new Totals(end-start,sums.getOrDefault("STUDYING",0L),sums.getOrDefault("IDLE",0L),
            sums.getOrDefault("AWAY",0L),sums.getOrDefault("MANUAL_PAUSED",0L),gap,
            end==start || gap==end-start ? "UNOBSERVED" : gap>0 ? "PARTIAL" : "OBSERVED",days);
    }
}
