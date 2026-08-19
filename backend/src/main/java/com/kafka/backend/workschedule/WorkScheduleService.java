package com.kafka.backend.workschedule;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class WorkScheduleService {

    private final WorkScheduleRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public WorkScheduleService(WorkScheduleRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public Optional<WorkSchedule> findOverride(LocalDate workDate) {
        return repository.findByUserIdAndWorkDate(currentUserProvider.getCurrentUserId(), workDate);
    }

    public WorkSchedule upsertOverride(
            LocalDate workDate,
            PlannedStatus plannedStatus,
            LocalTime plannedStartTime,
            Integer graceMinutes,
            Integer targetDurationMinutes,
            String memo
    ) {
        if (graceMinutes != null && (graceMinutes < 0 || graceMinutes > 1440)) {
            throw new InvalidRequestException("graceMinutes must be between 0 and 1440");
        }
        if (targetDurationMinutes != null && (targetDurationMinutes < 0 || targetDurationMinutes > 1440)) {
            throw new InvalidRequestException("targetDurationMinutes must be between 0 and 1440");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        WorkSchedule schedule = repository.findByUserIdAndWorkDate(userId, workDate)
                .orElseGet(() -> new WorkSchedule(userId, workDate, null, null, null, null, null));

        schedule.applyOverrides(plannedStatus, plannedStartTime, graceMinutes, targetDurationMinutes, memo);
        return repository.save(schedule);
    }
}
