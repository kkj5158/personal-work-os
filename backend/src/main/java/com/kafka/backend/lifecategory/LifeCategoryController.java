package com.kafka.backend.lifecategory;

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
@RequestMapping("/api/life-categories")
public class LifeCategoryController {

    private final LifeCategoryService service;

    public LifeCategoryController(LifeCategoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<LifeCategoryResponse> list() {
        return service.list().stream().map(LifeCategoryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<LifeCategoryResponse> create(@RequestBody LifeCategoryRequest request) {
        LifeCategory created = service.create(request.name());
        return ResponseEntity.status(HttpStatus.CREATED).body(LifeCategoryResponse.from(created));
    }

    @PutMapping("/reorder")
    public List<LifeCategoryResponse> reorder(@RequestBody LifeCategoryReorderRequest request) {
        service.reorder(request.orderedIds());
        return service.list().stream().map(LifeCategoryResponse::from).toList();
    }

    @PutMapping("/{id}")
    public LifeCategoryResponse rename(@PathVariable UUID id, @RequestBody LifeCategoryRenameRequest request) {
        return LifeCategoryResponse.from(service.rename(id, request.name()));
    }

    @PutMapping("/{id}/default")
    public LifeCategoryResponse setDefault(@PathVariable UUID id) {
        return LifeCategoryResponse.from(service.setDefault(id));
    }

    @PutMapping("/{id}/active")
    public LifeCategoryResponse setActive(@PathVariable UUID id, @RequestBody LifeCategoryActiveRequest request) {
        if (request.isActive() == null) {
            throw new InvalidRequestException("isActive must not be null");
        }
        return LifeCategoryResponse.from(service.setActive(id, request.isActive()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
