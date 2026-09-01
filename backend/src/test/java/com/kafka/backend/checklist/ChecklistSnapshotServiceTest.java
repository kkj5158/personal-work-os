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
    void doesNothingWhenASnapshotAlreadyExists() {
        WorkRecord record = workRecord(WorkAttendanceStatus.WORK);
        when(dailyEntryRepository.existsByWorkRecordId(record.getId())).thenReturn(true);

        newService().ensureSnapshot(record);

        verify(itemRepository, never()).findByUserIdAndDeletedAtIsNullOrderByPositionAsc(any());
    }

    @Test
    void snapshotsOnlyItemsActiveAsOfTheWorkDate() {
        WorkRecord record = workRecord(WorkAttendanceStatus.WORK);
        ChecklistItem activeItem = new ChecklistItem(USER_ID, null, 0);
        ChecklistItem inactiveItem = new ChecklistItem(USER_ID, null, 1);
        ChecklistItem notYetEffectiveItem = new ChecklistItem(USER_ID, null, 2);

        ChecklistItemVersion activeVersion = new ChecklistItemVersion(activeItem.getId(), WORK_DATE.minusDays(30), "Read", "📖", ChecklistPriority.CORE, true, null);
        ChecklistItemVersion inactiveVersion = new ChecklistItemVersion(inactiveItem.getId(), WORK_DATE.minusDays(30), "Rest", "😴", ChecklistPriority.SECONDARY, false, null);

        when(dailyEntryRepository.existsByWorkRecordId(record.getId())).thenReturn(false);
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

        verify(dailyEntryRepository, times(1)).save(any());
        verify(dailyEntryRepository).save(argThatMatchesItem(activeItem.getId()));
    }

    private static ChecklistDailyEntry argThatMatchesItem(UUID itemId) {
        return org.mockito.ArgumentMatchers.argThat(entry -> entry != null && entry.getItemId().equals(itemId));
    }

    @Test
    void usesTheItemsOwnGoalOverrideInsteadOfTheGlobalGoalWhenPresent() {
        WorkRecord record = workRecord(WorkAttendanceStatus.HALF_DAY);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistItemVersion versionWithOverride = new ChecklistItemVersion(item.getId(), WORK_DATE, "Exercise", "🏃", ChecklistPriority.CORE, true, 95);

        when(dailyEntryRepository.existsByWorkRecordId(record.getId())).thenReturn(false);
        when(itemRepository.findByUserIdAndDeletedAtIsNullOrderByPositionAsc(USER_ID)).thenReturn(List.of(item));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(item.getId(), WORK_DATE))
                .thenReturn(Optional.of(versionWithOverride));

        newService().ensureSnapshot(record);

        verify(dailyEntryRepository).save(org.mockito.ArgumentMatchers.argThat(entry -> entry.getGoalPercent() == 95));
        verify(goalService, never()).effectiveGoalPercent(eq(USER_ID), eq(WORK_DATE));
    }
}
