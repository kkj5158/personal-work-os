package com.kafka.backend.shareddesk.storage;

import java.util.UUID;
import static com.kafka.backend.shareddesk.storage.StorageFailure.Code.DISABLED;

/** Missing configuration disables file routes without preventing text/memo startup. */
public final class DisabledObjectStorage implements ObjectStorage {
    private StorageFailure unavailable() { return new StorageFailure(DISABLED); }
    public boolean enabled() { return false; }
    public String newStagingKey(UUID owner) { throw unavailable(); }
    public String newFinalKey(UUID owner) { throw unavailable(); }
    public SignedTicket presignPut(UUID owner, String key, FilePolicy.Claim claim) { throw unavailable(); }
    public FilePolicy.Verified promoteAndVerify(UUID owner, String staging, String target, FilePolicy.Claim claim) { throw unavailable(); }
    public SignedTicket presignGet(UUID owner, String key, String name) { throw unavailable(); }
    public void delete(UUID owner, String key) { throw unavailable(); }
}
