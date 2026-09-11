package com.kafka.backend.calendar;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
/** Full editor values. Null times mean unscheduled; duration remains explicit. */
public record CalendarActualEditRequest(LocalDate date, UUID categoryId, String title,
        Integer durationMinutes, LocalTime startTime, LocalTime endTime, String memo, UUID phaseId) {}
