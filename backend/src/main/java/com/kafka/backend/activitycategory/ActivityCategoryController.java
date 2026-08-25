package com.kafka.backend.activitycategory;

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
@RequestMapping("/api/activity-categories")
public class ActivityCategoryController {

    private final ActivityCategoryService service;

    public ActivityCategoryController(ActivityCategoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<ActivityCategoryResponse> list() {
        return service.list().stream().map(ActivityCategoryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<ActivityCategoryResponse> create(@RequestBody ActivityCategoryRequest request) {
        ActivityCategory created = service.create(request.name(), request.parentId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ActivityCategoryResponse.from(created));
    }

    @PutMapping("/{id}/default")
    public ActivityCategoryResponse setDefault(@PathVariable UUID id) {
        ActivityCategory updated = service.setDefault(id);
        return ActivityCategoryResponse.from(updated);
    }
}
