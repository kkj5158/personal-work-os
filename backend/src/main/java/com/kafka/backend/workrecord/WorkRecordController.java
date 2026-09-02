package com.kafka.backend.workrecord;

import com.kafka.backend.supplementalwork.SupplementalWorkEntry;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import com.kafka.backend.worktimeentry.WorkTimeEntry;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/work-records")
public class WorkRecordController {

    private final WorkRecordService service;
    private final WorkTimeEntryService workTimeEntryService;
    private final SupplementalWorkEntryService supplementalWorkEntryService;

    public WorkRecordController(
            WorkRecordService service,
            WorkTimeEntryService workTimeEntryService,
            SupplementalWorkEntryService supplementalWorkEntryService
    ) {
        this.service = service;
        this.workTimeEntryService = workTimeEntryService;
        this.supplementalWorkEntryService = supplementalWorkEntryService;
    }

    @GetMapping
    public List<WorkRecordResponse> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        List<WorkRecord> records = service.listInRange(from, to);
        List<UUID> recordIds = records.stream().map(WorkRecord::getId).toList();
        Map<UUID, List<WorkTimeEntry>> entriesByWorkRecordId = workTimeEntryService.findByWorkRecordIds(recordIds);
        Map<UUID, List<SupplementalWorkEntry>> supplementalEntriesByWorkRecordId =
                supplementalWorkEntryService.findByWorkRecordIds(recordIds);
        return records.stream()
                .map(record -> WorkRecordResponse.from(
                        record,
                        entriesByWorkRecordId.getOrDefault(record.getId(), List.of()),
                        supplementalEntriesByWorkRecordId.getOrDefault(record.getId(), List.of())
                ))
                .toList();
    }

    @GetMapping("/{date}")
    public ResponseEntity<WorkRecordResponse> detail(@PathVariable LocalDate date) {
        return service.find(date)
                .map(record -> WorkRecordResponse.from(
                        record,
                        workTimeEntryService.findByWorkRecord(record.getId()),
                        supplementalWorkEntryService.findByWorkRecord(record.getId())
                ))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{date}")
    public WorkRecordResponse upsert(@PathVariable LocalDate date, @RequestBody WorkRecordRequest request) {
        WorkRecord saved = service.upsert(date, request);
        return WorkRecordResponse.from(
                saved,
                workTimeEntryService.findByWorkRecord(saved.getId()),
                supplementalWorkEntryService.findByWorkRecord(saved.getId())
        );
    }

    @PostMapping("/{date}/clock-in")
    public WorkRecordResponse clockIn(@PathVariable LocalDate date, @RequestBody WorkRecordActionRequest request) {
        WorkRecord saved = service.clockIn(date, request);
        return WorkRecordResponse.from(
                saved,
                workTimeEntryService.findByWorkRecord(saved.getId()),
                supplementalWorkEntryService.findByWorkRecord(saved.getId())
        );
    }

    @PostMapping("/{date}/clock-out")
    public WorkRecordResponse clockOut(@PathVariable LocalDate date, @RequestBody WorkRecordActionRequest request) {
        WorkRecord saved = service.clockOut(date, request);
        return WorkRecordResponse.from(
                saved,
                workTimeEntryService.findByWorkRecord(saved.getId()),
                supplementalWorkEntryService.findByWorkRecord(saved.getId())
        );
    }

    @PostMapping("/{date}/clock-times/clear")
    public WorkRecordResponse clearClockTimes(@PathVariable LocalDate date, @RequestBody WorkRecordActionRequest request) {
        WorkRecord saved = service.clearClockTimes(date, request);
        return WorkRecordResponse.from(
                saved,
                workTimeEntryService.findByWorkRecord(saved.getId()),
                supplementalWorkEntryService.findByWorkRecord(saved.getId())
        );
    }

    /** 결근 정정 (absence correction) — only eligible on a record whose
     *  current status is ABSENT. See WorkRecordService.correctAbsence. */
    @PostMapping("/{date}/absence-correction")
    public WorkRecordResponse correctAbsence(@PathVariable LocalDate date, @RequestBody WorkRecordRequest request) {
        WorkRecord saved = service.correctAbsence(date, request);
        return WorkRecordResponse.from(
                saved,
                workTimeEntryService.findByWorkRecord(saved.getId()),
                supplementalWorkEntryService.findByWorkRecord(saved.getId())
        );
    }
}
