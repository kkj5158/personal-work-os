package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.common.AppTimeZone;
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

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/planned-blocks")
public class PlannedTimeBlockController {

    private final PlannedTimeBlockService service;

    public PlannedTimeBlockController(PlannedTimeBlockService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlannedTimeBlockResponse> list(
            @RequestParam LocalDateTime rangeStart,
            @RequestParam LocalDateTime rangeEnd
    ) {
        return service.findInRange(AppTimeZone.toStored(rangeStart), AppTimeZone.toStored(rangeEnd))
                .stream()
                .map(PlannedTimeBlockResponse::from)
                .toList();
    }

    @PostMapping
    public ResponseEntity<PlannedTimeBlockResponse> create(@RequestBody PlannedTimeBlockRequest request) {
        PlannedTimeBlock created = service.create(
                request.domainType(),
                request.title(),
                AppTimeZone.toStored(request.startAt()),
                AppTimeZone.toStored(request.endAt()),
                request.activityCategoryId(),
                request.lifeCategoryId(),
                request.phaseId(),
                request.memo()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(PlannedTimeBlockResponse.from(created));
    }

    @PutMapping("/{id}")
    public PlannedTimeBlockResponse update(@PathVariable UUID id, @RequestBody PlannedTimeBlockRequest request) {
        PlannedTimeBlock updated = service.update(
                id,
                request.domainType(),
                request.title(),
                AppTimeZone.toStored(request.startAt()),
                AppTimeZone.toStored(request.endAt()),
                request.activityCategoryId(),
                request.lifeCategoryId(),
                request.phaseId(),
                request.memo()
        );
        return PlannedTimeBlockResponse.from(updated);
    }

    @PutMapping("/{id}/reschedule")
    public PlannedTimeBlockResponse reschedule(@PathVariable UUID id, @RequestBody PlannedTimeBlockRescheduleRequest request) {
        PlannedTimeBlock updated = service.reschedule(
                id, AppTimeZone.toStored(request.startAt()), AppTimeZone.toStored(request.endAt())
        );
        return PlannedTimeBlockResponse.from(updated);
    }

    @PostMapping("/{id}/duplicate")
    public ResponseEntity<PlannedTimeBlockResponse> duplicate(@PathVariable UUID id, @RequestBody PlannedTimeBlockDuplicateRequest request) {
        PlannedTimeBlock copy = service.duplicate(id, AppTimeZone.toStored(request.newStartAt()));
        return ResponseEntity.status(HttpStatus.CREATED).body(PlannedTimeBlockResponse.from(copy));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
