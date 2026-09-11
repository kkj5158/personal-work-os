package com.kafka.backend.calendar;

import com.kafka.backend.lifetime.LifeTimeEntryResponse;
import com.kafka.backend.lifetime.LifeTimeEntryService;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryResponse;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import com.kafka.backend.worktimeentry.WorkTimeEntryResponse;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The single home for the "Unscheduled Actual <-> Time Grid" workflow
 * (locked V1 policy §9) across every Actual source, so this behavior is
 * implemented once rather than duplicated per-domain. Each action still
 * delegates ownership/overlap validation to the owning domain service.
 */
@RestController
@RequestMapping("/api/calendar/actual/{sourceType}/{id}")
public class CalendarActualController {

    private final WorkTimeEntryService workTimeEntryService;
    private final SupplementalWorkEntryService supplementalWorkEntryService;
    private final LifeTimeEntryService lifeTimeEntryService;

    public CalendarActualController(
            WorkTimeEntryService workTimeEntryService,
            SupplementalWorkEntryService supplementalWorkEntryService,
            LifeTimeEntryService lifeTimeEntryService
    ) {
        this.workTimeEntryService = workTimeEntryService;
        this.supplementalWorkEntryService = supplementalWorkEntryService;
        this.lifeTimeEntryService = lifeTimeEntryService;
    }

    @PutMapping("/schedule")
    public Object schedule(@PathVariable ActualSourceType sourceType, @PathVariable UUID id, @RequestBody CalendarActualScheduleRequest request) {
        return switch (sourceType) {
            case WORK_TIME_ENTRY -> WorkTimeEntryResponse.from(workTimeEntryService.schedule(id, request.startTime(), request.endTime()));
            case SUPPLEMENTAL_WORK_ENTRY -> SupplementalWorkEntryResponse.from(supplementalWorkEntryService.schedule(id, request.startTime(), request.endTime()));
            case LIFE_TIME_ENTRY -> LifeTimeEntryResponse.from(lifeTimeEntryService.schedule(id, request.startTime(), request.endTime()));
        };
    }

    @PutMapping("/unschedule")
    public Object unschedule(@PathVariable ActualSourceType sourceType, @PathVariable UUID id) {
        return switch (sourceType) {
            case WORK_TIME_ENTRY -> WorkTimeEntryResponse.from(workTimeEntryService.unschedule(id));
            case SUPPLEMENTAL_WORK_ENTRY -> SupplementalWorkEntryResponse.from(supplementalWorkEntryService.unschedule(id));
            case LIFE_TIME_ENTRY -> LifeTimeEntryResponse.from(lifeTimeEntryService.unschedule(id));
        };
    }
}
