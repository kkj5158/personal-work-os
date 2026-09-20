package com.kafka.backend.common;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

/** Direct activity input uses five-minute precision; attendance is intentionally independent. */
public final class ActivityTiming {
    private ActivityTiming() {}

    public static boolean isFiveMinute(LocalTime time) {
        return time == null || (time.getMinute() % 5 == 0 && time.getSecond() == 0 && time.getNano() == 0);
    }

    public static Integer duration(Integer manual, LocalTime start, LocalTime end) {
        if ((start == null) != (end == null)) throw new InvalidRequestException("시작/종료 시간을 함께 입력하세요.");
        if (start == null) {
            if (manual == null || manual <= 0) throw new InvalidRequestException("소요 시간은 0분보다 커야 합니다.");
            return manual;
        }
        if (!end.isAfter(start)) throw new InvalidRequestException("종료 시간은 같은 날짜의 시작 시간 이후여야 합니다.");
        if (!isFiveMinute(start) || (!isFiveMinute(end) && !end.equals(LocalTime.of(23,59)))) throw new InvalidRequestException("시간은 5분 단위로 입력하세요.");
        return (int) Duration.between(start, end).toMinutes();
    }

    public static Integer duration(Integer manual, LocalDate date, OffsetDateTime start, OffsetDateTime end) {
        if ((start == null) != (end == null)) throw new InvalidRequestException("시작/종료 시간을 함께 입력하세요.");
        if (start == null) return duration(manual, (LocalTime) null, null);
        var localStart = AppTimeZone.toDisplay(start);
        var localEnd = AppTimeZone.toDisplay(end);
        if (!localStart.toLocalDate().equals(date) || !localEnd.toLocalDate().equals(date))
            throw new InvalidRequestException("시작/종료 시간은 기록 날짜 안에 있어야 합니다.");
        return duration(manual, localStart.toLocalTime(), localEnd.toLocalTime());
    }
}
