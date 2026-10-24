package com.kafka.backend.reflection;

import com.kafka.backend.common.InvalidRequestException;
import java.math.BigDecimal;

/** Full date annotation value; null explicitly clears an optional field.
 * Decimal decoding avoids Jackson silently truncating a fractional integer. */
public record ReflectionDailyRequest(String title, BigDecimal dayScore, BigDecimal moodLevel, String memo, long expectedVersion) {
    public Integer dayScoreValue() { return exactInteger(dayScore); }
    public Integer moodLevelValue() { return exactInteger(moodLevel); }
    private static Integer exactInteger(BigDecimal value) {
        try { return value == null ? null : value.intValueExact(); }
        catch (ArithmeticException exception) { throw new InvalidRequestException("Score and mood must be integers."); }
    }
}
