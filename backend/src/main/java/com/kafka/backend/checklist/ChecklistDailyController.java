package com.kafka.backend.checklist;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

@RestController
@RequestMapping("/api/checklist-daily")
public class ChecklistDailyController {

    private final ChecklistDailyService service;

    public ChecklistDailyController(ChecklistDailyService service) {
        this.service = service;
    }

    /** Batch range read for the checklist matrix table — see
     *  ChecklistDailyService.getMatrix. Registered before {@code /{date}}
     *  is irrelevant to Spring's routing (a literal segment always outranks
     *  a path variable at the same position), but kept first for readability. */
    @GetMapping("/matrix")
    public ChecklistMatrixResponse getMatrix(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.getMatrix(from, to);
    }

    @GetMapping("/{date}")
    public ChecklistDailyResponse getForDate(@PathVariable LocalDate date) {
        return service.getForDate(date);
    }

    @PutMapping("/entries/{entryId}/result")
    public ChecklistDailyEntryResponse setResult(@PathVariable UUID entryId, @RequestBody ChecklistResultRequest request) {
        return service.setResult(entryId, request.result());
    }

    @PutMapping("/entries/{entryId}/memo")
    public ChecklistDailyEntryResponse setMemo(@PathVariable UUID entryId, @RequestBody ChecklistMemoRequest request) {
        return service.setMemo(entryId, request.memo());
    }
}
