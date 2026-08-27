package com.kafka.backend.starttimecriterion;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/start-time-criteria")
public class StartTimeCriterionController {

    private final StartTimeCriterionService service;

    public StartTimeCriterionController(StartTimeCriterionService service) {
        this.service = service;
    }

    @GetMapping
    public List<StartTimeCriterionResponse> list() {
        return service.list().stream().map(StartTimeCriterionResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<StartTimeCriterionResponse> create(@RequestBody StartTimeCriterionRequest request) {
        StartTimeCriterion created = service.create(request.name(), request.startTime(), request.graceMinutes());
        return ResponseEntity.status(HttpStatus.CREATED).body(StartTimeCriterionResponse.from(created));
    }

    @PutMapping("/{id}")
    public StartTimeCriterionResponse update(@PathVariable UUID id, @RequestBody StartTimeCriterionRequest request) {
        StartTimeCriterion updated = service.update(id, request.name(), request.startTime(), request.isActive(), request.graceMinutes());
        return StartTimeCriterionResponse.from(updated);
    }
}
