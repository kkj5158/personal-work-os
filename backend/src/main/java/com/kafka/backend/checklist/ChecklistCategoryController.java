package com.kafka.backend.checklist;

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
@RequestMapping("/api/checklist-categories")
public class ChecklistCategoryController {

    private final ChecklistCategoryService service;

    public ChecklistCategoryController(ChecklistCategoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<ChecklistCategoryResponse> list() {
        return service.list().stream().map(ChecklistCategoryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<ChecklistCategoryResponse> create(@RequestBody ChecklistCategoryRequest request) {
        ChecklistCategory created = service.create(request.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(ChecklistCategoryResponse.from(created));
    }

    @PutMapping("/{id}")
    public ChecklistCategoryResponse rename(@PathVariable UUID id, @RequestBody ChecklistCategoryRequest request) {
        return ChecklistCategoryResponse.from(service.rename(id, request.name()));
    }

    @PutMapping("/reorder")
    public List<ChecklistCategoryResponse> reorder(@RequestBody ChecklistReorderRequest request) {
        service.reorder(request.orderedIds());
        return service.list().stream().map(ChecklistCategoryResponse::from).toList();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
