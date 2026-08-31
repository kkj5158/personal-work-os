package com.kafka.backend.workschedule;

import com.kafka.backend.worksettings.WorkSettings;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import com.kafka.backend.worksettings.WorkSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

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

    @Transactional(readOnly = true)
    public EffectiveWorkSchedule resolve(UUID userId, LocalDate workDate) {
        WorkSettings settings = workSettingsRepository
                .findByUserIdAndSettingYear(userId, workDate.getYear())
                .orElseThrow(() -> new WorkSettingsNotFoundException(userId, workDate.getYear()));

        WorkSchedule schedule = workScheduleRepository
                .findByUserIdAndWorkDate(userId, workDate)
                .orElse(null);

        return EffectiveWorkScheduleResolver.resolve(workDate, schedule, settings);
    }

    /**
     * Batched equivalent of {@link #resolve} for a whole date range — used by
     * {@code AbsenceBackfillService}, which otherwise would issue two queries
     * (WorkSettings + WorkSchedule) per date. Loads each distinct calendar
     * year's WorkSettings once and the whole range's WorkSchedule overrides
     * in one query, then resolves every date in memory. A date whose year has
     * no WorkSettings configured is simply omitted from the result (mirrors
     * {@link #resolve} throwing {@link WorkSettingsNotFoundException} for
     * that case — callers here treat "no settings" as "nothing to resolve"
     * rather than an error).
     */
    @Transactional(readOnly = true)
    public Map<LocalDate, EffectiveWorkSchedule> resolveRange(UUID userId, LocalDate from, LocalDate to) {
        Map<Integer, WorkSettings> settingsByYear = new HashMap<>();
        for (int year = from.getYear(); year <= to.getYear(); year++) {
            int currentYear = year;
            workSettingsRepository.findByUserIdAndSettingYear(userId, currentYear)
                    .ifPresent(settings -> settingsByYear.put(currentYear, settings));
        }

        Map<LocalDate, WorkSchedule> scheduleByDate = workScheduleRepository
                .findByUserIdAndWorkDateBetween(userId, from, to)
                .stream()
                .collect(Collectors.toMap(WorkSchedule::getWorkDate, schedule -> schedule));

        Map<LocalDate, EffectiveWorkSchedule> result = new HashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            WorkSettings settings = settingsByYear.get(date.getYear());
            if (settings == null) {
                continue;
            }
            result.put(date, EffectiveWorkScheduleResolver.resolve(date, scheduleByDate.get(date), settings));
        }
        return result;
    }
}
