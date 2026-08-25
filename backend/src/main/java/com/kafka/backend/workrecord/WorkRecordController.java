package com.kafka.backend.workrecord;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/work-records")
public class WorkRecordController {

    private final WorkRecordService service;

    public WorkRecordController(WorkRecordService service) {
        this.service = service;
    }

    @GetMapping
    public List<WorkRecordResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.listInRange(from, to).stream().map(WorkRecordResponse::from).toList();
    }

    @GetMapping("/{date}")
    public ResponseEntity<WorkRecordResponse> detail(@PathVariable LocalDate date) {
        return service.find(date)
                .map(WorkRecordResponse::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{date}")
    public WorkRecordResponse upsert(@PathVariable LocalDate date, @RequestBody WorkRecordRequest request) {
        WorkRecord saved = service.upsert(date, request);
        return WorkRecordResponse.from(saved);
    }
}
