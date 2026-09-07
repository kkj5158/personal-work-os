package com.kafka.backend.project;

import java.util.UUID;

public record ProjectResponse(UUID id, String name, String colorToken, Integer sortOrder) {
    public static ProjectResponse from(Project project) {
        return new ProjectResponse(project.getId(), project.getName(), project.getColorToken(), project.getSortOrder());
    }
}
