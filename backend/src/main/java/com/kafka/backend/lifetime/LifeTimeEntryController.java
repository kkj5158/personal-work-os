package com.kafka.backend.lifetime;

import com.kafka.backend.common.AppTimeZone;
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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/life-time-entries")
public class LifeTimeEntryController {

    private final LifeTimeEntryService service;

    public LifeTimeEntryController(LifeTimeEntryService service) {
        this.service = service;
    }

    @GetMapping
    public List<LifeTimeEntryResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.findInRange(from, to).stream().map(LifeTimeEntryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<LifeTimeEntryResponse> create(@RequestBody LifeTimeEntryRequest request) {
        LifeTimeEntry created = service.create(
                request.entryDate(),
                request.lifeCategoryId(),
                request.title(),
                request.durationMinutes(),
                toStoredOrNull(request.entryDate(), request.startTime()),
                toStoredOrNull(request.entryDate(), request.endTime()),
                request.memo()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(LifeTimeEntryResponse.from(created));
    }

    @PutMapping("/{id}")
    public LifeTimeEntryResponse update(@PathVariable UUID id, @RequestBody LifeTimeEntryRequest request) {
        LifeTimeEntry updated = service.update(
                id,
                request.lifeCategoryId(),
                request.title(),
                request.durationMinutes(),
                toStoredOrNull(request.entryDate(), request.startTime()),
                toStoredOrNull(request.entryDate(), request.endTime()),
                request.memo()
        );
        return LifeTimeEntryResponse.from(updated);
    }

    @PutMapping("/{id}/schedule")
    public LifeTimeEntryResponse schedule(@PathVariable UUID id, @RequestBody LifeTimeEntryScheduleRequest request) {
        LifeTimeEntry updated = service.schedule(id, request.startTime(), request.endTime());
        return LifeTimeEntryResponse.from(updated);
    }

    @PutMapping("/{id}/unschedule")
    public LifeTimeEntryResponse unschedule(@PathVariable UUID id) {
        return LifeTimeEntryResponse.from(service.unschedule(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private OffsetDateTime toStoredOrNull(LocalDate date, java.time.LocalTime time) {
        return (date == null || time == null) ? null : AppTimeZone.toStored(date.atTime(time));
    }
}
