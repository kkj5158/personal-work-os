package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.util.UUID;

public record ChecklistGoalResponse(UUID id, LocalDate effectiveFrom, Integer goalPercent, boolean immutable) {
    public static ChecklistGoalResponse from(ChecklistGlobalGoal goal) {
        boolean immutable = goal.getEffectiveFrom().isBefore(LocalDate.now(AppTimeZone.ZONE));
        return new ChecklistGoalResponse(goal.getId(), goal.getEffectiveFrom(), goal.getGoalPercent(), immutable);
    }
}
