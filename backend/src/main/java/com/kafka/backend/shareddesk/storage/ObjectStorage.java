package com.kafka.backend.shareddesk.storage;

import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Domain-independent object access. Caller must authorize the owner, item state and quota first. */
public interface ObjectStorage extends AutoCloseable {
    record SignedTicket(URI url, Instant expiresAt, Map<String,String> requiredHeaders) {
        public SignedTicket { requiredHeaders = Map.copyOf(requiredHeaders); }
        @Override public String toString() { return "SignedTicket[redacted, expiresAt=" + expiresAt + "]"; }
    }
    boolean enabled();
    String newStagingKey(UUID owner);
    String newFinalKey(UUID owner);
    SignedTicket presignPut(UUID owner, String stagingKey, FilePolicy.Claim claim);
    FilePolicy.Verified promoteAndVerify(UUID owner, String stagingKey, String finalKey, FilePolicy.Claim claim);
    SignedTicket presignGet(UUID owner, String finalKey, String displayName);
    default void download(UUID owner, String finalKey, long expectedSize, java.io.OutputStream destination) {
        throw new StorageFailure(StorageFailure.Code.DISABLED);
    }
    void delete(UUID owner, String key);
    @Override default void close() {}
}
