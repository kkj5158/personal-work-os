package com.kafka.backend.money;

import static com.kafka.backend.money.MoneyTypes.*;

/** Server-side SPI. No bank package discovery or production parser is installed in Batch 1. */
public interface MoneyNotificationParser {
    String key();
    String version();
    boolean supports(MoneyRawNotification notification);
    ParsedCandidate parse(MoneyRawNotification notification);
}
