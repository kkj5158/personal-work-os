package com.kafka.backend.shareddesk.storage;

/** Public errors deliberately contain no object keys, URLs, file names, or provider details. */
public final class StorageFailure extends RuntimeException {
    public enum Code { DISABLED, INVALID_FILE, SIZE_MISMATCH, DIGEST_MISMATCH, TYPE_MISMATCH, UNAVAILABLE, NOT_FOUND }
    private final Code code;
    public StorageFailure(Code code) { super("Shared Desk storage: " + code.name()); this.code = code; }
    public Code code() { return code; }
}
