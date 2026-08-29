package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistAnalyticsServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private ChecklistDailyEntryRepository dailyEntryRepository;

    @Mock
    private ChecklistItemRepository itemRepository;

    @Mock
    private ChecklistItemVersionRepository versionRepository;

    @Mock
    private ChecklistGoalService goalService;

    @Mock
    private WorkRecordRepository workRecordRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private ChecklistAnalyticsService newService() {
        lenient().when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        lenient().when(goalService.effectiveGoalPercent(any(), any())).thenReturn(80);
        return new ChecklistAnalyticsService(dailyEntryRepository, itemRepository, versionRepository, goalService, workRecordRepository, currentUserProvider);
    }

    private static WorkRecord workRecord(LocalDate date, WorkAttendanceStatus status) {
        WorkRecord record = new WorkRecord(USER_ID, date);
        record.applyChanges(status, null, null, null, null, null, null, null, null, null, null, false, null);
        return record;
    }

    private static ChecklistDailyEntry entry(UUID workRecordId, LocalDate date, ChecklistPriority priority, boolean achieved) {
        ChecklistDailyEntry entry = new ChecklistDailyEntry(workRecordId, UUID.randomUUID(), USER_ID, date, "Item", "✅", priority, 80, 0);
        entry.setAchieved(achieved);
        return entry;
    }

    @Test
    void overallTrendWeightsEachDayEquallyRegardlessOfHowManyItemsThatDayHad() {
        // A day with 2 items, half achieved, must count exactly the same as
        // a day with 6 items, fully achieved — the equal-day-weighting
        // policy this whole feature is built around.
        LocalDate day1 = LocalDate.of(2026, 8, 3);
        LocalDate day2 = LocalDate.of(2026, 8, 4);
        WorkRecord record1 = workRecord(day1, WorkAttendanceStatus.WORK);
        WorkRecord record2 = workRecord(day2, WorkAttendanceStatus.WORK);

        List<ChecklistDailyEntry> entries = new ArrayList<>();
        entries.add(entry(record1.getId(), day1, ChecklistPriority.CORE, true));
        entries.add(entry(record1.getId(), day1, ChecklistPriority.CORE, false));
        for (int i = 0; i < 6; i++) {
            entries.add(entry(record2.getId(), day2, ChecklistPriority.CORE, true));
        }

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day1, day2))
                .thenReturn(List.of(record1, record2));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day1, day2)).thenReturn(entries);

        List<AchievementPoint> points = newService().overallTrend(day1, day2);

        double sumOfRates = points.stream().mapToDouble(AchievementPoint::overallRate).sum();
        // day1 rate = 0.5, day2 rate = 1.0 -> mean-of-daily-rates = 0.75.
        // A pooled (non-day-weighted) calculation would instead give
        // (1 + 6) / (2 + 6) = 0.875 — this assertion fails if that bug creeps in.
        double meanOfDailyRates = sumOfRates / points.size();
        assertThat(meanOfDailyRates).isCloseTo(0.75, offset(0.0001));
    }

    @Test
    void todayIsExcludedFromTheOverallTrendEvenIfFullyChecked() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate yesterday = today.minusDays(1);
        WorkRecord todayRecord = workRecord(today, WorkAttendanceStatus.WORK);
        WorkRecord yesterdayRecord = workRecord(yesterday, WorkAttendanceStatus.WORK);

        List<ChecklistDailyEntry> entries = List.of(
                entry(yesterdayRecord.getId(), yesterday, ChecklistPriority.CORE, true),
                entry(todayRecord.getId(), today, ChecklistPriority.CORE, true)
        );

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, yesterday, today))
                .thenReturn(List.of(yesterdayRecord, todayRecord));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, yesterday, today)).thenReturn(entries);

        List<AchievementPoint> points = newService().overallTrend(yesterday, today);

        int totalValidDays = points.stream().mapToInt(AchievementPoint::validDays).sum();
        assertThat(totalValidDays).isEqualTo(1);
    }

    @Test
    void nonWorkDatesAreExcludedEvenWhenPreservedChecklistEntriesExist() {
        LocalDate leaveDate = LocalDate.of(2026, 8, 5);
        LocalDate workDate = LocalDate.of(2026, 8, 6);
        WorkRecord leaveRecord = workRecord(leaveDate, WorkAttendanceStatus.PAID_LEAVE);
        WorkRecord workRecordDay = workRecord(workDate, WorkAttendanceStatus.WORK);

        // Preserved entries from before the date became PAID_LEAVE — must
        // not count toward the aggregate now that the day is non-work.
        List<ChecklistDailyEntry> entries = List.of(
                entry(leaveRecord.getId(), leaveDate, ChecklistPriority.CORE, false),
                entry(workRecordDay.getId(), workDate, ChecklistPriority.CORE, true)
        );

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, leaveDate, workDate))
                .thenReturn(List.of(leaveRecord, workRecordDay));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, leaveDate, workDate)).thenReturn(entries);

        List<AchievementPoint> points = newService().overallTrend(leaveDate, workDate);

        int totalValidDays = points.stream().mapToInt(AchievementPoint::validDays).sum();
        assertThat(totalValidDays).isEqualTo(1);
        double meanRate = points.stream().map(AchievementPoint::overallRate).filter(java.util.Objects::nonNull)
                .mapToDouble(Double::doubleValue).average().orElseThrow();
        assertThat(meanRate).isCloseTo(1.0, offset(0.0001));
    }

    @Test
    void overallTrendEmitsExplicitNullPointForEmptyBucket() {
        LocalDate day1 = LocalDate.of(2026, 8, 3);
        LocalDate day3 = LocalDate.of(2026, 8, 5);
        WorkRecord record1 = workRecord(day1, WorkAttendanceStatus.WORK);
        WorkRecord record3 = workRecord(day3, WorkAttendanceStatus.WORK);
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day1, day3))
                .thenReturn(List.of(record1, record3));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day1, day3)).thenReturn(List.of(
                entry(record1.getId(), day1, ChecklistPriority.CORE, true),
                entry(record3.getId(), day3, ChecklistPriority.CORE, false)
        ));

        List<AchievementPoint> points = newService().overallTrend(day1, day3);

        assertThat(points).hasSize(3);
        assertThat(points.get(1).periodStart()).isEqualTo(day1.plusDays(1));
        assertThat(points.get(1).overallRate()).isNull();
        assertThat(points.get(1).validDays()).isZero();
    }
}
