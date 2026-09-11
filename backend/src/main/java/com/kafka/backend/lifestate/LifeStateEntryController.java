package com.kafka.backend.lifestate;

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
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/life-state-entries")
public class LifeStateEntryController {

    private final LifeStateEntryService service;

    public LifeStateEntryController(LifeStateEntryService service) {
        this.service = service;
    }

    @GetMapping
    public List<LifeStateEntryResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.findInRange(from, to).stream().map(LifeStateEntryResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<LifeStateEntryResponse> create(@RequestBody LifeStateEntryRequest request) {
        LifeStateEntry created = service.create(
                request.entryDate(), request.stateGroup(), request.label(),
                toStored(request.entryDate(), request.startTime()), toStored(request.entryDate(), request.endTime()),
                request.memo()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(LifeStateEntryResponse.from(created));
    }

    @PutMapping("/{id}")
    public LifeStateEntryResponse update(@PathVariable UUID id, @RequestBody LifeStateEntryRequest request) {
        LifeStateEntry updated = service.update(
                id, request.stateGroup(), request.label(),
                toStored(request.entryDate(), request.startTime()), toStored(request.entryDate(), request.endTime()),
                request.memo()
        );
        return LifeStateEntryResponse.from(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private OffsetDateTime toStored(LocalDate date, LocalTime time) {
        return (date == null || time == null) ? null : AppTimeZone.toStored(date.atTime(time));
    }
}
