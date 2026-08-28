package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/checklist-goal")
public class ChecklistGoalController {

    private final ChecklistGoalService service;

    public ChecklistGoalController(ChecklistGoalService service) {
        this.service = service;
    }

    @GetMapping("/history")
    public List<ChecklistGoalResponse> history() {
        return service.history().stream().map(ChecklistGoalResponse::from).toList();
    }

    @GetMapping("/current")
    public Map<String, Object> current() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        return Map.of("goalPercent", service.effectiveGoalPercentForCurrentUser(today));
    }

    @PutMapping
    public ChecklistGoalResponse schedule(@RequestBody ChecklistGoalRequest request) {
        return ChecklistGoalResponse.from(service.schedule(request.effectiveFrom(), request.goalPercent()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteFutureVersion(@PathVariable UUID id) {
        service.deleteFutureVersion(id);
    }
}
