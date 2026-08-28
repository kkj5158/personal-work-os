package com.kafka.backend.activitycategory;

import com.kafka.backend.common.InvalidRequestException;
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

    @PutMapping("/reorder")
    public List<ActivityCategoryResponse> reorder(@RequestBody ActivityCategoryReorderRequest request) {
        service.reorder(request.parentId(), request.orderedIds());
        return service.list().stream().map(ActivityCategoryResponse::from).toList();
    }

    @PutMapping("/{id}/parent")
    public ActivityCategoryResponse move(@PathVariable UUID id, @RequestBody ActivityCategoryMoveRequest request) {
        ActivityCategory moved = service.move(id, request.parentId());
        return ActivityCategoryResponse.from(moved);
    }

    @PutMapping("/{id}/default")
    public ActivityCategoryResponse setDefault(@PathVariable UUID id) {
        ActivityCategory updated = service.setDefault(id);
        return ActivityCategoryResponse.from(updated);
    }

    @PutMapping("/{id}")
    public ActivityCategoryResponse rename(@PathVariable UUID id, @RequestBody ActivityCategoryRenameRequest request) {
        ActivityCategory updated = service.rename(id, request.name());
        return ActivityCategoryResponse.from(updated);
    }

    @PutMapping("/{id}/active")
    public ActivityCategoryResponse setActive(@PathVariable UUID id, @RequestBody ActivityCategoryActiveRequest request) {
        if (request.isActive() == null) {
            throw new InvalidRequestException("isActive must not be null");
        }
        ActivityCategory updated = service.setActive(id, request.isActive());
        return ActivityCategoryResponse.from(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
