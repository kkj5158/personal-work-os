package com.kafka.backend.workschedule;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/work-plans")
public class WorkPlanController {

    private final EffectiveWorkScheduleService effectiveWorkScheduleService;
    private final WorkScheduleService workScheduleService;
    private final CurrentUserProvider currentUserProvider;

    public WorkPlanController(
            EffectiveWorkScheduleService effectiveWorkScheduleService,
            WorkScheduleService workScheduleService,
            CurrentUserProvider currentUserProvider
    ) {
        this.effectiveWorkScheduleService = effectiveWorkScheduleService;
        this.workScheduleService = workScheduleService;
        this.currentUserProvider = currentUserProvider;
    }

    @GetMapping("/{date}")
    public EffectiveWorkSchedule effective(@PathVariable LocalDate date) {
        return effectiveWorkScheduleService.resolve(currentUserProvider.getCurrentUserId(), date);
    }

    @GetMapping("/{date}/override")
    public ResponseEntity<WorkScheduleOverrideResponse> override(@PathVariable LocalDate date) {
        return workScheduleService.findOverride(date)
                .map(WorkScheduleOverrideResponse::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{date}/override")
    public WorkScheduleOverrideResponse upsertOverride(
            @PathVariable LocalDate date,
            @RequestBody WorkScheduleOverrideRequest request
    ) {
        WorkSchedule schedule = workScheduleService.upsertOverride(
                date,
                request.plannedStatus(),
                request.plannedStartTime(),
                request.graceMinutes(),
                request.targetDurationMinutes(),
                request.memo()
        );
        return WorkScheduleOverrideResponse.from(schedule);
    }
}
