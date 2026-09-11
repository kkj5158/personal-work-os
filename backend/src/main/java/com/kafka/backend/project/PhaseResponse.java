package com.kafka.backend.project;

import java.time.LocalDate;
import java.util.UUID;

public record PhaseResponse(UUID id, UUID projectId, String title, LocalDate startDate, LocalDate endDate, Integer sortOrder) {
    public static PhaseResponse from(Phase phase) {
        return new PhaseResponse(phase.getId(), phase.getProjectId(), phase.getTitle(), phase.getStartDate(), phase.getEndDate(), phase.getSortOrder());
    }
}
