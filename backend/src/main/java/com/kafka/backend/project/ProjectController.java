package com.kafka.backend.project;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService service;

    public ProjectController(ProjectService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProjectResponse> list() {
        return service.list().stream().map(ProjectResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> create(@RequestBody ProjectRequest request) {
        Project created = service.create(request.name(), request.colorToken());
        return ResponseEntity.status(HttpStatus.CREATED).body(ProjectResponse.from(created));
    }

    @PutMapping("/{id}")
    public ProjectResponse update(@PathVariable UUID id, @RequestBody ProjectRequest request) {
        return ProjectResponse.from(service.update(id, request.name(), request.colorToken()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
