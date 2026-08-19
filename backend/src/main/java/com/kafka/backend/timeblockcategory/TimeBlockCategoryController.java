package com.kafka.backend.timeblockcategory;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/time-block-categories")
public class TimeBlockCategoryController {

    private final TimeBlockCategoryService service;

    public TimeBlockCategoryController(TimeBlockCategoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<TimeBlockCategoryResponse> list() {
        return service.list().stream().map(TimeBlockCategoryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<TimeBlockCategoryResponse> create(@RequestBody TimeBlockCategoryRequest request) {
        TimeBlockCategory created = service.create(request.name(), request.parentId());
        return ResponseEntity.status(HttpStatus.CREATED).body(TimeBlockCategoryResponse.from(created));
    }
}
