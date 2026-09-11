package com.kafka.backend.project;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Phase enriched with its parent Project — the shape the Phase selector
 *  and the Project/Phase timeline widget both need (date-first, Project as
 *  compact secondary context; see the locked Calendar UI contract). */
public record PhaseWithProjectResponse(
        UUID id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        UUID projectId,
        String projectName,
        String projectColorToken
) {
    public static List<PhaseWithProjectResponse> fromAll(List<Phase> phases, List<Project> projects) {
        Map<UUID, Project> projectsById = projects.stream()
                .collect(java.util.stream.Collectors.toMap(Project::getId, project -> project));
        return phases.stream()
                .map(phase -> {
                    Project project = projectsById.get(phase.getProjectId());
                    return new PhaseWithProjectResponse(
                            phase.getId(),
                            phase.getTitle(),
                            phase.getStartDate(),
                            phase.getEndDate(),
                            phase.getProjectId(),
                            project != null ? project.getName() : "",
                            project != null ? project.getColorToken() : "slate"
                    );
                })
                .toList();
    }
}
