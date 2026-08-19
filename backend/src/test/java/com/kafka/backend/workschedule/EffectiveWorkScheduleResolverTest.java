package com.kafka.backend.workschedule;

import com.kafka.backend.worksettings.WorkSettings;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class EffectiveWorkScheduleResolverTest {

    private static final UUID USER_ID = UUID.randomUUID();

    private WorkSettings yearlyDefaults() {
        return new WorkSettings(
                USER_ID,
                2026,
                12,
                5,
                3,
                PlannedStatus.WORK,
                LocalTime.of(9, 0),
                10,
                480
        );
    }

    @Test
    void inheritsAllFieldsWhenNoScheduleExistsForTheDate() {
        LocalDate workDate = LocalDate.of(2026, 8, 11);

        EffectiveWorkSchedule effective = EffectiveWorkScheduleResolver.resolve(workDate, null, yearlyDefaults());

        assertThat(effective.workDate()).isEqualTo(workDate);
        assertThat(effective.plannedStatus()).isEqualTo(PlannedStatus.WORK);
        assertThat(effective.plannedStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(effective.graceMinutes()).isEqualTo(10);
        assertThat(effective.targetDurationMinutes()).isEqualTo(480);
        assertThat(effective.memo()).isNull();
    }

    @Test
    void overridesOnlyTheFieldsSetOnTheScheduleAndInheritsTheRest() {
        // Matches the example in the task spec:
        // defaults = WORK / 09:00 / grace 10 / target 480
        // override = null / 13:00 / null / 300
        // effective = WORK / 13:00 / grace 10 / target 300
        LocalDate workDate = LocalDate.of(2026, 8, 12);
        WorkSchedule schedule = new WorkSchedule(
                USER_ID,
                workDate,
                null,
                LocalTime.of(13, 0),
                null,
                300,
                null
        );

        EffectiveWorkSchedule effective = EffectiveWorkScheduleResolver.resolve(workDate, schedule, yearlyDefaults());

        assertThat(effective.plannedStatus()).isEqualTo(PlannedStatus.WORK);
        assertThat(effective.plannedStartTime()).isEqualTo(LocalTime.of(13, 0));
        assertThat(effective.graceMinutes()).isEqualTo(10);
        assertThat(effective.targetDurationMinutes()).isEqualTo(300);
    }

    @Test
    void fullyOverriddenScheduleIgnoresAllDefaults() {
        LocalDate workDate = LocalDate.of(2026, 8, 13);
        WorkSchedule schedule = new WorkSchedule(
                USER_ID,
                workDate,
                PlannedStatus.DAY_OFF,
                null,
                null,
                null,
                "Public holiday"
        );

        EffectiveWorkSchedule effective = EffectiveWorkScheduleResolver.resolve(workDate, schedule, yearlyDefaults());

        assertThat(effective.plannedStatus()).isEqualTo(PlannedStatus.DAY_OFF);
        assertThat(effective.plannedStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(effective.graceMinutes()).isEqualTo(10);
        assertThat(effective.targetDurationMinutes()).isEqualTo(480);
        assertThat(effective.memo()).isEqualTo("Public holiday");
    }
}
