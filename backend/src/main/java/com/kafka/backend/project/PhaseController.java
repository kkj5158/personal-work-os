package com.kafka.backend.project;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
public class PhaseController {

    private final PhaseService phaseService;
    private final ProjectService projectService;

    public PhaseController(PhaseService phaseService, ProjectService projectService) {
        this.phaseService = phaseService;
        this.projectService = projectService;
    }

    @GetMapping("/api/projects/{projectId}/phases")
    public List<PhaseResponse> listByProject(@PathVariable UUID projectId) {
        return phaseService.listByProject(projectId).stream().map(PhaseResponse::from).toList();
    }

    @PostMapping("/api/projects/{projectId}/phases")
    public ResponseEntity<PhaseResponse> create(@PathVariable UUID projectId, @RequestBody PhaseRequest request) {
        Phase created = phaseService.create(projectId, request.title(), request.startDate(), request.endDate());
        return ResponseEntity.status(HttpStatus.CREATED).body(PhaseResponse.from(created));
    }

    @PutMapping("/api/phases/{id}")
    public PhaseResponse update(@PathVariable UUID id, @RequestBody PhaseRequest request) {
        return PhaseResponse.from(phaseService.update(id, request.title(), request.startDate(), request.endDate()));
    }

    @DeleteMapping("/api/phases/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        phaseService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** Backs the searchable Phase selector — every phase, most-recent first,
     *  each carrying its parent Project as secondary context for grouping. */
    @GetMapping("/api/phases/selector")
    public List<PhaseWithProjectResponse> selector() {
        List<Phase> phases = phaseService.listAllForSelector();
        List<Project> projects = projectService.list();
        return PhaseWithProjectResponse.fromAll(phases, projects);
    }

    /** Backs the date-first Project/Phase timeline widget: every phase
     *  intersecting the requested window. */
    @GetMapping("/api/phases/timeline")
    public List<PhaseWithProjectResponse> timeline(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        List<Phase> phases = phaseService.findInRange(from, to);
        List<Project> projects = projectService.list();
        return PhaseWithProjectResponse.fromAll(phases, projects);
    }
}
