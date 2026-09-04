package com.kafka.backend.checklist;

import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistSnapshotServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate WORK_DATE = LocalDate.of(2026, 8, 24);

    @Mock
    private ChecklistItemRepository itemRepository;

    @Mock
    private ChecklistItemVersionRepository versionRepository;

    @Mock
    private ChecklistGoalService goalService;

    @Mock
    private ChecklistDailyEntryRepository dailyEntryRepository;

    private ChecklistSnapshotService newService() {
        return new ChecklistSnapshotService(itemRepository, versionRepository, goalService, dailyEntryRepository);
    }

    private static WorkRecord workRecord(WorkAttendanceStatus status) {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(status, null, null, null, null, null, null, null, null, null, null, false, null);
        return record;
    }

    @Test
    void doesNothingForANonWorkdayStatus() {
        ChecklistSnapshotService service = newService();

        service.ensureSnapshot(workRecord(WorkAttendanceStatus.DAY_OFF));

        verify(itemRepository, never()).findByUserIdAndDeletedAtIsNullOrderByPositionAsc(any());
    }

    @Test
    void doesNothingWhenEveryEligibleItemAlreadyHasAnEntry() {
        WorkRecord record = workRecord(WorkAttendanceStatus.WORK);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistDailyEntry existingEntry = new ChecklistDailyEntry(record.getId(), item.getId(), USER_ID, WORK_DATE, "Read", "📖", ChecklistPriority.CORE, 80, 0);

        when(itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(USER_ID)).thenReturn(List.of(item));
        when(dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(existingEntry));

        newService().ensureSnapshot(record);

        verify(dailyEntryRepository, never()).insertIfAbsent(any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    void backfillsAnEntryForAnItemThatBecameEligibleAfterTheRecordAlreadyHadOtherEntries() {
        // The bug this guards: today's WorkRecord/checklist already existed
        // when a brand-new item (effective today) was created — that new
        // item must still get an entry the next time ensureSnapshot runs
        // for today's record, without disturbing the entry that already
        // existed for the other item.
        WorkRecord record = workRecord(WorkAttendanceStatus.WORK);
        ChecklistItem existingItem = new ChecklistItem(USER_ID, null, 0);
        ChecklistItem newItem = new ChecklistItem(USER_ID, null, 1);
        ChecklistDailyEntry existingEntry = new ChecklistDailyEntry(record.getId(), existingItem.getId(), USER_ID, WORK_DATE, "Read", "📖", ChecklistPriority.CORE, 80, 0);
        ChecklistItemVersion newItemVersion = new ChecklistItemVersion(newItem.getId(), WORK_DATE, "Stretch", "🧘", ChecklistPriority.SECONDARY, true, null);

        when(itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(USER_ID)).thenReturn(List.of(existingItem, newItem));
        when(dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(existingEntry));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(newItem.getId(), WORK_DATE))
                .thenReturn(Optional.of(newItemVersion));
        when(goalService.effectiveGoalPercent(USER_ID, WORK_DATE)).thenReturn(80);

        newService().ensureSnapshot(record);

        verify(dailyEntryRepository, times(1)).insertIfAbsent(any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt());
        verify(dailyEntryRepository).insertIfAbsent(any(), any(), eq(newItem.getId()), any(), any(), any(), any(), any(), anyInt(), anyInt());
        // existingItem must never be re-resolved/re-saved — it already had
        // an entry.
        verify(versionRepository, never()).findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(eq(existingItem.getId()), any());
    }

    @Test
    void snapshotsOnlyItemsActiveAsOfTheWorkDate() {
        WorkRecord record = workRecord(WorkAttendanceStatus.WORK);
        ChecklistItem activeItem = new ChecklistItem(USER_ID, null, 0);
        ChecklistItem inactiveItem = new ChecklistItem(USER_ID, null, 1);
        ChecklistItem notYetEffectiveItem = new ChecklistItem(USER_ID, null, 2);

        ChecklistItemVersion activeVersion = new ChecklistItemVersion(activeItem.getId(), WORK_DATE.minusDays(30), "Read", "📖", ChecklistPriority.CORE, true, null);
        ChecklistItemVersion inactiveVersion = new ChecklistItemVersion(inactiveItem.getId(), WORK_DATE.minusDays(30), "Rest", "😴", ChecklistPriority.SECONDARY, false, null);

        when(dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of());
        when(itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(USER_ID))
                .thenReturn(List.of(activeItem, inactiveItem, notYetEffectiveItem));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(activeItem.getId(), WORK_DATE))
                .thenReturn(Optional.of(activeVersion));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(inactiveItem.getId(), WORK_DATE))
                .thenReturn(Optional.of(inactiveVersion));
        // notYetEffectiveItem's first version starts after WORK_DATE — no
        // applicable definition exists yet on that date.
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(notYetEffectiveItem.getId(), WORK_DATE))
                .thenReturn(Optional.empty());
        when(goalService.effectiveGoalPercent(USER_ID, WORK_DATE)).thenReturn(80);

        newService().ensureSnapshot(record);

        verify(dailyEntryRepository, times(1)).insertIfAbsent(any(), any(), any(), any(), any(), any(), any(), any(), anyInt(), anyInt());
        verify(dailyEntryRepository).insertIfAbsent(any(), any(), eq(activeItem.getId()), any(), any(), any(), any(), any(), anyInt(), anyInt());
    }

    @Test
    void usesTheItemsOwnGoalOverrideInsteadOfTheGlobalGoalWhenPresent() {
        WorkRecord record = workRecord(WorkAttendanceStatus.HALF_DAY);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistItemVersion versionWithOverride = new ChecklistItemVersion(item.getId(), WORK_DATE, "Exercise", "🏃", ChecklistPriority.CORE, true, 95);

        when(dailyEntryRepository.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of());
        when(itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(USER_ID)).thenReturn(List.of(item));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(item.getId(), WORK_DATE))
                .thenReturn(Optional.of(versionWithOverride));

        newService().ensureSnapshot(record);

        verify(dailyEntryRepository).insertIfAbsent(any(), any(), any(), any(), any(), any(), any(), any(), eq(95), anyInt());
        verify(goalService, never()).effectiveGoalPercent(eq(USER_ID), eq(WORK_DATE));
    }
}
