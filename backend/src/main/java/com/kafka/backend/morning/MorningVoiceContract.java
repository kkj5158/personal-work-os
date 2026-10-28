package com.kafka.backend.morning;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class MorningVoiceContract {
    private MorningVoiceContract() {}
    public record AuthorizeRequest(@NotNull UUID occurrenceId, @NotNull UUID attemptId,
                                   @AssertTrue boolean accepted) {}
    public record Capabilities(boolean streamingAudio, boolean microphoneMute, boolean interruption,
                               boolean transcription, boolean sessionResumption, boolean toolCalling,
                               boolean usageReporting, boolean serverSideTurnDetection) {}
    public record Readiness(boolean realProviderEnabled, String provider, String release,
                            String status, Capabilities capabilities) {}
    /** Deliberately suppress record toString: connection credentials must never enter logs. */
    public interface Connection { String type(); }
    public record ElevenLabsConnection(String type, String conversationToken) implements Connection {
        @Override public String toString() { return "ElevenLabsConnection[REDACTED]"; }
    }
    public record Authorization(UUID sessionId, UUID attemptId, String provider, String release,
                                String transport, Instant expiresAt, Instant sessionDeadline,
                                int maxDurationSeconds, Capabilities capabilities,
                                Connection connection, String usageStatus) {
        @Override public String toString() { return "MorningAuthorization[REDACTED]"; }
    }
    public enum EndReason { ENDED, FAILED, INTERRUPTED }
    public enum ClientEvent { CONNECTED }
    public record EndRequest(@NotNull UUID eventId, @NotNull EndReason reason) {}
    public record EventRequest(@NotNull UUID eventId, @NotNull ClientEvent event) {}
    public record Usage(String providerStatus, String usageStatus, Instant credentialIssuedAt,
                        Instant clientConnectedAt, Instant clientEndedAt, Long durationSeconds,
                        Long inputTokens, Long outputTokens, Long audioTokens, BigDecimal providerCredits,
                        BigDecimal reservedMaximumCost, BigDecimal estimatedCost, BigDecimal finalReportedCost,
                        String currency, String pricingVersion) {}
    public record Session(UUID sessionId, UUID occurrenceId, UUID attemptId, String provider,
                          String release, String status, Instant createdAt, Instant expiresAt,
                          Instant sessionDeadline, Usage usage) {}
}
