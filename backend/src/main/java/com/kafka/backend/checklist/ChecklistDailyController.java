package com.kafka.backend.checklist;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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

    @GetMapping("/{date}")
    public ChecklistDailyResponse getForDate(@PathVariable LocalDate date) {
        return service.getForDate(date);
    }

    @PutMapping("/entries/{entryId}/achieved")
    public ChecklistDailyEntryResponse setAchieved(@PathVariable UUID entryId, @RequestBody ChecklistAchievedRequest request) {
        return service.setAchieved(entryId, request.achieved());
    }
}
