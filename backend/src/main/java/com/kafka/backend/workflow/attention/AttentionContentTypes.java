package com.kafka.backend.workflow.attention;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AttentionContentTypes {
    private AttentionContentTypes() {}

    public record Proposal(String schemaVersion, UUID logicalTaskId, UUID runId, String environment,
                           String title, String request, UUID projectId, String publicKey, String sandboxMode) {}
    public record Grant(UUID itemId, UUID logicalTaskId, UUID runId, String environment, String sourceKey,
                        UUID generation, UUID createReceipt, Instant expiresAt, String proposalHash) {}
    public record Start(UUID operationId, String proposalHash) {}
    public record Outcome(String state, String fact) {}
    public record Evidence(String id, String kind, String label, String reference) {}
    public record Remaining(String id, String kind, String fact, String state) {}
    public record Report(String sourceTitle, String request, List<String> performed, Outcome outcome,
                         List<Evidence> evidence, List<Remaining> remaining, List<String> limitations) {}
    public record DesktopConsent(UUID scopeId, UUID credentialId) {}
    public record DesktopScope(UUID scopeId, UUID credentialId, Instant createdAt) {}
    public record DesktopSubmission(String schemaVersion, UUID scopeId, UUID operationId, UUID sessionId,
                                    String turnId, String observation, int expectedContentRevision,
                                    Instant producedAt, boolean requestCaptured, boolean answerCaptured, Report report) {}
    public record DesktopReceipt(UUID itemId, UUID operationId, UUID reportId, int contentRevision,
                                 String bodyHash, long queueRevision) {}
    public record Submission(String schemaVersion, UUID operationId, UUID reportId, int reportRevision,
                             int expectedContentRevision, UUID logicalTaskId, UUID runId, String sourceKey,
                             UUID generation, UUID createReceipt, UUID sessionId, String turnId,
                             String eventId, String upstreamTurnId, Instant producedAt, Report report) {}
    public record Verification(String schemaVersion, UUID receiptId, String environment, String sourceKey,
                               UUID reportId, int contentRevision, String reportBodyHash, String evidenceId,
                               String evidenceReference, String result, Instant expiresAt, TestAttestation attestation) {}
    public record TestFailure(String input,String reason) {}
    public record TestAttestation(String sourceOrigin,String sourceSha,String suiteSha256,String script,
                                  List<String> arguments,Instant startedAt,Instant finishedAt,Integer exitCode,
                                  Integer total,Integer failed,List<TestFailure> failures) {}
    public record VerificationReceipt(UUID receiptId, UUID itemId, int contentRevision, String evidenceId,
                                      String result, Instant verifiedAt) {}
    public record Receipt(UUID itemId, UUID operationId, UUID reportId, int reportRevision,
                          int contentRevision, String bodyHash, Instant receivedAt) {}
}

