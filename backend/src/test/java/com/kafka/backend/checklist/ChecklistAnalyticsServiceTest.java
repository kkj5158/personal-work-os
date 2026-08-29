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
    void resolveResolutionPicksDailyWeeklyOrMonthlyByRangeLength() {
        LocalDate start = LocalDate.of(2026, 1, 1);
        assertThat(ChecklistAnalyticsService.resolveResolution(start, start.plusDays(30))).isEqualTo(AchievementResolution.DAILY);
        assertThat(ChecklistAnalyticsService.resolveResolution(start, start.plusDays(31))).isEqualTo(AchievementResolution.WEEKLY);
        assertThat(ChecklistAnalyticsService.resolveResolution(start, start.plusDays(185))).isEqualTo(AchievementResolution.WEEKLY);
        assertThat(ChecklistAnalyticsService.resolveResolution(start, start.plusDays(186))).isEqualTo(AchievementResolution.MONTHLY);
    }

    @Test
    void byItemComputesAPooledPerItemRateExcludingTodayAndNonWorkDays() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate day1 = today.minusDays(3);
        LocalDate leaveDay = today.minusDays(2);
        LocalDate day2 = today.minusDays(1);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        WorkRecord record1 = workRecord(day1, WorkAttendanceStatus.WORK);
        WorkRecord leaveRecord = workRecord(leaveDay, WorkAttendanceStatus.PAID_LEAVE);
        WorkRecord record2 = workRecord(day2, WorkAttendanceStatus.WORK);
        WorkRecord todayRecord = workRecord(today, WorkAttendanceStatus.WORK);

        ChecklistDailyEntry e1 = new ChecklistDailyEntry(record1.getId(), item.getId(), USER_ID, day1, "물 마시기", "💧", ChecklistPriority.CORE, 80, 0);
        e1.setAchieved(true);
        ChecklistDailyEntry eLeave = new ChecklistDailyEntry(leaveRecord.getId(), item.getId(), USER_ID, leaveDay, "물 마시기", "💧", ChecklistPriority.CORE, 80, 0);
        eLeave.setAchieved(true); // preserved but must not count — the day is non-work
        ChecklistDailyEntry e2 = new ChecklistDailyEntry(record2.getId(), item.getId(), USER_ID, day2, "물 마시기", "💧", ChecklistPriority.CORE, 80, 0);
        e2.setAchieved(false);
        ChecklistDailyEntry eToday = new ChecklistDailyEntry(todayRecord.getId(), item.getId(), USER_ID, today, "물 마시기", "💧", ChecklistPriority.CORE, 80, 0);
        eToday.setAchieved(true); // today must never count as a confirmed day

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day1, today))
                .thenReturn(List.of(record1, leaveRecord, record2, todayRecord));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day1, today))
                .thenReturn(List.of(e1, eLeave, e2, eToday));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(item));

        List<ItemBreakdownEntry> entries = newService().byItem(day1, today, null, false);

        // Only day1 (achieved) and day2 (missed) are valid, applicable,
        // non-today workdays — the leave day and today must not be pooled
        // in, so the rate is 1/2, not 2/4 or 3/4.
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).applicableCount()).isEqualTo(2);
        assertThat(entries.get(0).achievedCount()).isEqualTo(1);
        assertThat(entries.get(0).rate()).isCloseTo(0.5, offset(0.0001));
    }

    @Test
    void byItemAppliesThePriorityFilter() {
        LocalDate day = LocalDate.of(2026, 8, 3);
        WorkRecord record = workRecord(day, WorkAttendanceStatus.WORK);
        UUID coreItemId = UUID.randomUUID();
        UUID secondaryItemId = UUID.randomUUID();
        ChecklistItem coreItem = new ChecklistItem(USER_ID, null, 0);
        ChecklistItem secondaryItem = new ChecklistItem(USER_ID, null, 1);

        ChecklistDailyEntry coreEntry = new ChecklistDailyEntry(record.getId(), coreItem.getId(), USER_ID, day, "Core", "✅", ChecklistPriority.CORE, 80, 0);
        coreEntry.setAchieved(true);
        ChecklistDailyEntry secondaryEntry = new ChecklistDailyEntry(record.getId(), secondaryItem.getId(), USER_ID, day, "Secondary", "📝", ChecklistPriority.SECONDARY, 80, 0);
        secondaryEntry.setAchieved(true);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day, day)).thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day, day)).thenReturn(List.of(coreEntry, secondaryEntry));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(coreItem, secondaryItem));

        List<ItemBreakdownEntry> coreOnly = newService().byItem(day, day, ChecklistPriority.CORE, false);

        assertThat(coreOnly).extracting(ItemBreakdownEntry::itemId).containsExactly(coreItem.getId());
    }

    @Test
    void byItemExcludesDeletedItemsUnlessIncludeDeletedIsSet() {
        LocalDate day = LocalDate.of(2026, 8, 3);
        WorkRecord record = workRecord(day, WorkAttendanceStatus.WORK);
        ChecklistItem deletedItem = new ChecklistItem(USER_ID, null, 0);
        deletedItem.softDelete(java.time.OffsetDateTime.now());

        ChecklistDailyEntry entry = new ChecklistDailyEntry(record.getId(), deletedItem.getId(), USER_ID, day, "예전 항목", "🗑️", ChecklistPriority.CORE, 80, 0);
        entry.setAchieved(true);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day, day)).thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day, day)).thenReturn(List.of(entry));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(deletedItem));

        assertThat(newService().byItem(day, day, null, false)).isEmpty();

        List<ItemBreakdownEntry> withDeleted = newService().byItem(day, day, null, true);
        assertThat(withDeleted).hasSize(1);
        assertThat(withDeleted.get(0).deleted()).isTrue();
    }

    @Test
    void itemTrendEmitsNoDataStateForABucketWithNoApplicableEntries() {
        UUID itemId = UUID.randomUUID();
        LocalDate day1 = LocalDate.of(2026, 8, 1);
        LocalDate day3 = LocalDate.of(2026, 8, 3);
        WorkRecord record1 = workRecord(day1, WorkAttendanceStatus.WORK);
        WorkRecord record3 = workRecord(day3, WorkAttendanceStatus.WORK);
        ChecklistDailyEntry e1 = new ChecklistDailyEntry(record1.getId(), itemId, USER_ID, day1, "Item", "✅", ChecklistPriority.CORE, 80, 0);
        e1.setAchieved(true);
        ChecklistDailyEntry e3 = new ChecklistDailyEntry(record3.getId(), itemId, USER_ID, day3, "Item", "✅", ChecklistPriority.CORE, 80, 0);
        e3.setAchieved(false);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day1, day3))
                .thenReturn(List.of(record1, record3));
        when(dailyEntryRepository.findByUserIdAndItemIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, itemId, day1, day3))
                .thenReturn(List.of(e1, e3));

        List<ItemTrendPoint> points = newService().itemTrend(itemId, day1, day3);

        assertThat(points).hasSize(3);
        assertThat(points.get(0).state()).isEqualTo("ACTIVE");
        assertThat(points.get(1).state()).isEqualTo("NO_DATA");
        assertThat(points.get(1).rate()).isNull();
        assertThat(points.get(2).state()).isEqualTo("ACTIVE");
        assertThat(points.get(2).rate()).isZero();
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
