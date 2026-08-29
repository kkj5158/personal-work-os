package com.kafka.backend.starttimecriterion;

import java.time.LocalTime;

/**
 * Shared by both create and update. {@code isActive} is ignored on create
 * (a new criterion always starts active) and required on update.
 * {@code graceMinutes} is optional on both — {@code null} defaults to 0.
 * {@code memo} is optional free text on both.
 */
public record StartTimeCriterionRequest(String name, LocalTime startTime, Boolean isActive, Integer graceMinutes, String memo) {
}
