package com.kafka.backend.attendanceplan;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/attendance-plans")
public class AttendancePlanController {

    private final AttendancePlanService service;
    private final AttendancePlanningReplaceService replaceService;

    public AttendancePlanController(AttendancePlanService service, AttendancePlanningReplaceService replaceService) {
        this.service = service;
        this.replaceService = replaceService;
    }

    @GetMapping
    public List<AttendancePlanResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.listInRange(from, to).stream().map(AttendancePlanResponse::from).toList();
    }

    @GetMapping("/{date}")
    public ResponseEntity<AttendancePlanResponse> get(@PathVariable LocalDate date) {
        return service.find(date)
                .map(AttendancePlanResponse::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{date}")
    public AttendancePlanResponse upsert(@PathVariable LocalDate date, @RequestBody AttendancePlanRequest request) {
        return AttendancePlanResponse.from(service.upsert(date, request));
    }

    @DeleteMapping("/{date}")
    public ResponseEntity<Void> delete(@PathVariable LocalDate date) {
        service.delete(date);
        return ResponseEntity.noContent().build();
    }

    /** P1-C: atomically replaces one date's entire AttendancePlan +
     *  PlannedTimeBlock state — see {@link AttendancePlanningReplaceService}. */
    @PutMapping("/{date}/replace")
    public AttendancePlanningReplaceResponse replace(@PathVariable LocalDate date, @RequestBody AttendancePlanningReplaceRequest request) {
        return AttendancePlanningReplaceResponse.from(replaceService.replace(date, request));
    }
}
