package com.kafka.backend.common;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * V1 supports a single application timezone. All date-time input
 * received from the frontend (naive, no offset) is interpreted as
 * this zone, and all date-time output is converted back to it.
 * Multi-timezone user settings are out of scope for V1.
 */
public final class AppTimeZone {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private AppTimeZone() {
    }

    public static OffsetDateTime toStored(LocalDateTime localDateTime) {
        return localDateTime.atZone(ZONE).toOffsetDateTime();
    }

    public static LocalDateTime toDisplay(OffsetDateTime storedDateTime) {
        return storedDateTime.atZoneSameInstant(ZONE).toLocalDateTime();
    }
}
