package com.kafka.backend.calendarvisualgroup;

import java.time.*;
import java.util.*;
import java.util.stream.IntStream;

public record VisualGroupResponse(UUID id, String title, LocalDate startDate, LocalDate endDate,
        VisualGroupTimeRule timeRule, String color, LocalTime startTime, LocalTime endTime,
        List<Integer> weekdays, List<VisualGroupRequest.Day> days, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    public static VisualGroupResponse from(CalendarVisualGroup group) {
        return new VisualGroupResponse(group.getId(), group.getTitle(), group.getStartDate(), group.getEndDate(),
                group.getTimeRule(),group.getColor(),group.getStartTime(),group.getEndTime(),
                IntStream.rangeClosed(1,7).filter(d->(group.getWeekdayMask() & (1<<(d-1)))!=0).boxed().toList(),
                group.getDays().stream().sorted(Comparator.comparing(CalendarVisualGroupDay::getEntryDate))
                        .map(d->new VisualGroupRequest.Day(d.getEntryDate(),d.isEnabled(),d.getStartTime(),d.getEndTime())).toList(),
                group.getCreatedAt(),group.getUpdatedAt());
    }
    public VisualGroupRequest request(){return new VisualGroupRequest(title,startDate,endDate,timeRule,color,startTime,endTime,weekdays,days);}
}
