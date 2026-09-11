package com.kafka.backend.calendar;

import java.time.LocalTime;

public record CalendarActualScheduleRequest(LocalTime startTime, LocalTime endTime) {
}
