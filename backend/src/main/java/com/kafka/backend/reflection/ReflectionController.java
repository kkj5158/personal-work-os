package com.kafka.backend.reflection;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.notesystem.integration.ReflectionProvider;
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
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * WORK_OS's own Reflection surface — used by both the Calendar's Reflection
 * modal and (via the same ReflectionProvider boundary) Note System's
 * embedded Reflection popover. See ReflectionService for the domain logic.
 */
@RestController
@RequestMapping("/api/reflections")
public class ReflectionController {

    private final ReflectionProvider reflectionProvider;
    private final ReflectionEntryRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public ReflectionController(ReflectionProvider reflectionProvider, ReflectionEntryRepository repository, CurrentUserProvider currentUserProvider) {
        this.reflectionProvider = reflectionProvider;
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/{date}")
    public ResponseEntity<ReflectionProvider.Entry> get(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return reflectionProvider.findMain(currentUserProvider.getCurrentUserId(), date)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{date}")
    public ResponseEntity<ReflectionProvider.Entry> create(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        ReflectionProvider.Entry entry = reflectionProvider.createMain(currentUserProvider.getCurrentUserId(), date);
        return ResponseEntity.status(HttpStatus.CREATED).body(entry);
    }

    @PutMapping("/{date}/content")
    public ReflectionProvider.Entry updateContent(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestBody ReflectionContentRequest request
    ) {
        UUID userId = currentUserProvider.getCurrentUserId();
        UUID reflectionId = resolveId(userId, date);
        return reflectionProvider.updateMain(userId, reflectionId, request.content(), request.expectedVersion());
    }

    @PostMapping("/{date}/complete")
    public ReflectionProvider.Entry complete(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestBody ReflectionVersionRequest request
    ) {
        UUID userId = currentUserProvider.getCurrentUserId();
        UUID reflectionId = resolveId(userId, date);
        return reflectionProvider.complete(userId, reflectionId, request.expectedVersion());
    }

    @PostMapping("/{date}/edit")
    public ReflectionProvider.Entry edit(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestBody ReflectionVersionRequest request
    ) {
        UUID userId = currentUserProvider.getCurrentUserId();
        UUID reflectionId = resolveId(userId, date);
        return reflectionProvider.reopen(userId, reflectionId, request.expectedVersion());
    }

    @DeleteMapping("/{date}")
    public ResponseEntity<Void> delete(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        UUID userId = currentUserProvider.getCurrentUserId();
        repository.findByUserIdAndEntryDate(userId, date).ifPresent(repository::delete);
        return ResponseEntity.noContent().build();
    }

    private UUID resolveId(UUID userId, LocalDate date) {
        return repository.findByUserIdAndEntryDate(userId, date)
                .orElseThrow(() -> new ResourceNotFoundException("No reflection exists yet for " + date))
                .getId();
    }
}
