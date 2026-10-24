package com.kafka.backend.reflection;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class CalendarReviewTypes {
    private CalendarReviewTypes() {}
    public record Daily(LocalDate date, String title, Integer score, Integer mood, String memo, String status, long version) {}
    public record Weekly(UUID id, LocalDate weekStart, String title, Integer score, Integer mood, String memo,
                         String strengths, String regrets, String nextWeekDirection, long version,
                         OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
    public record WeeklyInput(Long expectedVersion, String title, Integer score, Integer mood, String memo,
                              String strengths, String regrets, String nextWeekDirection) {}
    public record DayMetrics(LocalDate date, Integer workMinutes, Integer workScore, Daily reflection) {}
    public record Range(List<DayMetrics> days, List<Weekly> weeks) {}
}
