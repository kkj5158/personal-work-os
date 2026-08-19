package com.kafka.backend.workschedule;

import com.kafka.backend.worksettings.WorkSettings;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import com.kafka.backend.worksettings.WorkSettingsRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.UUID;

@Service
public class EffectiveWorkScheduleService {

    private final WorkScheduleRepository workScheduleRepository;
    private final WorkSettingsRepository workSettingsRepository;

    public EffectiveWorkScheduleService(
            WorkScheduleRepository workScheduleRepository,
            WorkSettingsRepository workSettingsRepository
    ) {
        this.workScheduleRepository = workScheduleRepository;
        this.workSettingsRepository = workSettingsRepository;
    }

    public EffectiveWorkSchedule resolve(UUID userId, LocalDate workDate) {
        WorkSettings settings = workSettingsRepository
                .findByUserIdAndSettingYear(userId, workDate.getYear())
                .orElseThrow(() -> new WorkSettingsNotFoundException(userId, workDate.getYear()));

        WorkSchedule schedule = workScheduleRepository
                .findByUserIdAndWorkDate(userId, workDate)
                .orElse(null);

        return EffectiveWorkScheduleResolver.resolve(workDate, schedule, settings);
    }
}
