package com.kafka.backend.calendar;
import com.kafka.backend.common.*;
import java.time.LocalDate;
public final class CalendarActualDateRule {
    private CalendarActualDateRule() {}
    public static boolean isFuture(LocalDate date) { return date != null && date.isAfter(LocalDate.now(AppTimeZone.ZONE)); }
    public static void requireAllowed(LocalDate date) {
        if (isFuture(date)) throw new InvalidRequestException("내일 이후 일정은 Plan으로 기록됩니다.");
    }
}
