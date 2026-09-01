package com.kafka.backend.workchartreferenceline;

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
@RequestMapping("/api/work-chart-reference-lines")
public class WorkChartReferenceLineController {

    private final WorkChartReferenceLineService service;

    public WorkChartReferenceLineController(WorkChartReferenceLineService service) {
        this.service = service;
    }

    @GetMapping
    public List<WorkChartReferenceLineResponse> list() {
        return service.list().stream().map(WorkChartReferenceLineResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<WorkChartReferenceLineResponse> create(@RequestBody WorkChartReferenceLineCreateRequest request) {
        WorkChartReferenceLine created = service.create(request.scope(), request.label(), request.value(), request.color());
        return ResponseEntity.status(HttpStatus.CREATED).body(WorkChartReferenceLineResponse.from(created));
    }

    @PutMapping("/{id}")
    public WorkChartReferenceLineResponse update(@PathVariable UUID id, @RequestBody WorkChartReferenceLineUpdateRequest request) {
        WorkChartReferenceLine updated = service.update(id, request.label(), request.value(), request.color());
        return WorkChartReferenceLineResponse.from(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
