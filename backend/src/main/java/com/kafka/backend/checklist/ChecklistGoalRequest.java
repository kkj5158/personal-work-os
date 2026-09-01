package com.kafka.backend.checklist;

import java.time.LocalDate;

public record ChecklistGoalRequest(LocalDate effectiveFrom, Integer goalPercent) {
}
