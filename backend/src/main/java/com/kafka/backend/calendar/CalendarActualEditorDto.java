package com.kafka.backend.calendar;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
public record CalendarActualEditorDto(ActualSourceType sourceType, UUID id, LocalDate date,
        UUID categoryId, String title, Integer durationMinutes, LocalTime startTime,
        LocalTime endTime, String memo, UUID phaseId) {}
