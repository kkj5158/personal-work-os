package com.kafka.backend.morning;

import java.time.Instant;

/** Provider adapters issue narrowly scoped client credentials, never permanent keys. */
public interface MorningCredentialBroker {
    String provider();
    String transport();
    default boolean configured(MorningVoiceProperties.Release release) { return true; }
    Credential issue(MorningVoiceProperties.Release release, Instant now);
    record Credential(MorningVoiceContract.Connection connection, String providerConversationId, Instant expiresAt) {
        @Override public String toString() { return "MorningCredential[REDACTED]"; }
    }
}
