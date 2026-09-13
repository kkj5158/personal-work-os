package com.kafka.backend.calendarvisualgroup;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record VisualGroupRequest(String title, LocalDate startDate, LocalDate endDate,
        VisualGroupTimeRule timeRule, String color, LocalTime startTime, LocalTime endTime,
        List<Integer> weekdays, List<Day> days) {
    /** Missing dates are OFF. Disabled overrides do not carry time values. */
    public record Day(LocalDate date, Boolean enabled, LocalTime startTime, LocalTime endTime) {}
}
