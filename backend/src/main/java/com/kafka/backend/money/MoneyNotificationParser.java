package com.kafka.backend.money;

import static com.kafka.backend.money.MoneyTypes.*;

/** Server-side, versioned parser SPI. Parsing never modifies a raw notification or writes a transaction. */
public interface MoneyNotificationParser {
    String key();
    String version();
    boolean supports(MoneyRawNotification notification);
    ParsedCandidate parse(MoneyRawNotification notification);
}
