package com.kafka.backend.workrecord;

/**
 * Body for the dedicated clock-in / clock-out / clear-clock-times action
 * endpoints. {@code expectedVersion} is required and checked the same way
 * as {@code WorkRecordRequest.expectedVersion} — these actions only ever
 * operate on an existing record.
 */
public record WorkRecordActionRequest(Integer expectedVersion) {
}
