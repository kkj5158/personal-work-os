package com.kafka.backend.workschedule;

import com.kafka.backend.worksettings.WorkSettings;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Applies WorkSchedule overrides on top of yearly WorkSettings defaults.
 * A null override field means "inherit the value from WorkSettings".
 */
public final class EffectiveWorkScheduleResolver {

    private EffectiveWorkScheduleResolver() {
    }

    public static EffectiveWorkSchedule resolve(LocalDate workDate, WorkSchedule schedule, WorkSettings settings) {
        Objects.requireNonNull(workDate, "workDate must not be null");
        Objects.requireNonNull(settings, "settings must not be null");

        PlannedStatus plannedStatus = schedule != null && schedule.getPlannedStatus() != null
                ? schedule.getPlannedStatus()
                : settings.getDefaultPlannedStatus();

        return new EffectiveWorkSchedule(
                workDate,
                plannedStatus,
                schedule != null && schedule.getPlannedStartTime() != null
                        ? schedule.getPlannedStartTime()
                        : settings.getDefaultStartTime(),
                schedule != null && schedule.getGraceMinutes() != null
                        ? schedule.getGraceMinutes()
                        : settings.getDefaultGraceMinutes(),
                schedule != null && schedule.getTargetDurationMinutes() != null
                        ? schedule.getTargetDurationMinutes()
                        : settings.getDefaultTargetDurationMinutes(),
                schedule != null ? schedule.getMemo() : null
        );
    }
}
