package com.kafka.backend.common;

/**
 * Thrown when a caller's supplied version does not match the current stored
 * version of a record — the caller was working from stale data and must
 * re-fetch before retrying. Never silently overwrites the newer data.
 */
public class OptimisticLockConflictException extends RuntimeException {

    public OptimisticLockConflictException(String message) {
        super(message);
    }
}
