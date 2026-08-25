package com.kafka.backend.starttimecriterion;

import java.time.LocalTime;

/**
 * Shared by both create and update. {@code isActive} is ignored on create
 * (a new criterion always starts active) and required on update.
 */
public record StartTimeCriterionRequest(String name, LocalTime startTime, Boolean isActive) {
}
