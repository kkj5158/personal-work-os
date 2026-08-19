package com.kafka.backend.workschedule;

import com.kafka.backend.worksettings.WorkSettings;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import com.kafka.backend.worksettings.WorkSettingsRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EffectiveWorkScheduleServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private WorkScheduleRepository workScheduleRepository;

    @Mock
    private WorkSettingsRepository workSettingsRepository;

    @Test
    void resolvesEffectiveScheduleByCombiningSettingsAndScheduleForTheDate() {
        LocalDate workDate = LocalDate.of(2026, 8, 12);
        WorkSettings settings = new WorkSettings(
                USER_ID, 2026, 12, 5, 3,
                PlannedStatus.WORK, LocalTime.of(9, 0), 10, 480
        );
        WorkSchedule schedule = new WorkSchedule(
                USER_ID, workDate, null, LocalTime.of(13, 0), null, 300, null
        );

        when(workSettingsRepository.findByUserIdAndSettingYear(USER_ID, 2026))
                .thenReturn(Optional.of(settings));
        when(workScheduleRepository.findByUserIdAndWorkDate(USER_ID, workDate))
                .thenReturn(Optional.of(schedule));

        EffectiveWorkScheduleService service =
                new EffectiveWorkScheduleService(workScheduleRepository, workSettingsRepository);

        EffectiveWorkSchedule effective = service.resolve(USER_ID, workDate);

        assertThat(effective.plannedStartTime()).isEqualTo(LocalTime.of(13, 0));
        assertThat(effective.targetDurationMinutes()).isEqualTo(300);
        assertThat(effective.graceMinutes()).isEqualTo(10);
    }

    @Test
    void resolvesUsingOnlyDefaultsWhenNoScheduleExistsForTheDate() {
        LocalDate workDate = LocalDate.of(2026, 8, 11);
        WorkSettings settings = new WorkSettings(
                USER_ID, 2026, 12, 5, 3,
                PlannedStatus.WORK, LocalTime.of(9, 0), 10, 480
        );

        when(workSettingsRepository.findByUserIdAndSettingYear(USER_ID, 2026))
                .thenReturn(Optional.of(settings));
        when(workScheduleRepository.findByUserIdAndWorkDate(USER_ID, workDate))
                .thenReturn(Optional.empty());

        EffectiveWorkScheduleService service =
                new EffectiveWorkScheduleService(workScheduleRepository, workSettingsRepository);

        EffectiveWorkSchedule effective = service.resolve(USER_ID, workDate);

        assertThat(effective.plannedStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(effective.targetDurationMinutes()).isEqualTo(480);
    }

    @Test
    void throwsWhenNoWorkSettingsExistForTheYear() {
        LocalDate workDate = LocalDate.of(2026, 8, 11);

        when(workSettingsRepository.findByUserIdAndSettingYear(USER_ID, 2026))
                .thenReturn(Optional.empty());

        EffectiveWorkScheduleService service =
                new EffectiveWorkScheduleService(workScheduleRepository, workSettingsRepository);

        assertThatThrownBy(() -> service.resolve(USER_ID, workDate))
                .isInstanceOf(WorkSettingsNotFoundException.class);
    }
}
