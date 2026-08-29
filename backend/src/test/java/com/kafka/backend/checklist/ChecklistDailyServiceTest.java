package com.kafka.backend.checklist;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistDailyServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private ChecklistDailyEntryRepository dailyEntryRepository;

    @Mock
    private WorkRecordRepository workRecordRepository;

    @Mock
    private ChecklistItemRepository itemRepository;

    @Mock
    private ChecklistItemVersionRepository versionRepository;

    @Mock
    private ChecklistCategoryRepository categoryRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private ChecklistDailyService newService() {
        lenient().when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        lenient().when(categoryRepository.findByUserIdOrderByPositionAscNameAsc(USER_ID)).thenReturn(List.of());
        return new ChecklistDailyService(dailyEntryRepository, workRecordRepository, itemRepository, versionRepository, categoryRepository, currentUserProvider);
    }

    private static WorkRecord workRecord(LocalDate date, WorkAttendanceStatus status) {
        WorkRecord record = new WorkRecord(USER_ID, date);
        record.applyChanges(status, null, null, null, null, null, null, null, null, null, null, false, null);
        return record;
    }

    private static ChecklistDailyEntry entry(UUID workRecordId, UUID itemId, LocalDate date, String name, String emoji, ChecklistPriority priority, boolean achieved) {
        ChecklistDailyEntry entry = new ChecklistDailyEntry(workRecordId, itemId, USER_ID, date, name, emoji, priority, 80, 0);
        entry.setAchieved(achieved);
        return entry;
    }

    @Test
    void rejectsAToBeforeFrom() {
        ChecklistDailyService service = newService();
        assertThatThrownBy(() -> service.getMatrix(LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 1)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void emitsOneRowPerWorkRecordEvenWithNoChecklistEntries() {
        LocalDate day1 = LocalDate.of(2026, 8, 1);
        LocalDate day2 = LocalDate.of(2026, 8, 2);
        WorkRecord record1 = workRecord(day1, WorkAttendanceStatus.WORK);
        WorkRecord record2 = workRecord(day2, WorkAttendanceStatus.WORK);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, day1, day2))
                .thenReturn(List.of(record1, record2));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, day1, day2)).thenReturn(List.of());
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of());

        ChecklistMatrixResponse matrix = newService().getMatrix(day1, day2);

        assertThat(matrix.rows()).hasSize(2);
        assertThat(matrix.rows().get(0).cells()).isEmpty();
        assertThat(matrix.columns()).isEmpty();
    }

    @Test
    void nonWorkDayRowIsMarkedNonApplicableButPreservesCells() {
        LocalDate leaveDate = LocalDate.of(2026, 8, 5);
        WorkRecord record = workRecord(leaveDate, WorkAttendanceStatus.PAID_LEAVE);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistDailyEntry preserved = entry(record.getId(), item.getId(), leaveDate, "물 마시기", "💧", ChecklistPriority.CORE, true);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, leaveDate, leaveDate))
                .thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, leaveDate, leaveDate)).thenReturn(List.of(preserved));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(item));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any(), any()))
                .thenReturn(Optional.empty());

        ChecklistMatrixResponse matrix = newService().getMatrix(leaveDate, leaveDate);

        assertThat(matrix.rows()).hasSize(1);
        assertThat(matrix.rows().get(0).applicable()).isFalse();
        // Preserved — the row still carries its cell, the frontend is what
        // must not render it as a live checkbox while non-applicable.
        assertThat(matrix.rows().get(0).cells()).hasSize(1);
    }

    @Test
    void columnsAreTheUnionOfItemsAcrossTheWholeRangeEvenIfConfigurationChangedMidRange() {
        LocalDate earlyDate = LocalDate.of(2026, 8, 1);
        LocalDate laterDate = LocalDate.of(2026, 8, 20);
        WorkRecord earlyRecord = workRecord(earlyDate, WorkAttendanceStatus.WORK);
        WorkRecord laterRecord = workRecord(laterDate, WorkAttendanceStatus.WORK);

        ChecklistItem itemAEntity = new ChecklistItem(USER_ID, null, 0);
        ChecklistItem itemDEntity = new ChecklistItem(USER_ID, null, 1);
        ChecklistDailyEntry entryA = entry(earlyRecord.getId(), itemAEntity.getId(), earlyDate, "A", "🅰️", ChecklistPriority.CORE, true);
        ChecklistDailyEntry entryD = entry(laterRecord.getId(), itemDEntity.getId(), laterDate, "D", "🇩", ChecklistPriority.SECONDARY, false);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, earlyDate, laterDate))
                .thenReturn(List.of(earlyRecord, laterRecord));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, earlyDate, laterDate)).thenReturn(List.of(entryA, entryD));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(itemAEntity, itemDEntity));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any(), any()))
                .thenReturn(Optional.empty());

        ChecklistMatrixResponse matrix = newService().getMatrix(earlyDate, laterDate);

        assertThat(matrix.columns()).extracting(ChecklistMatrixColumn::name).containsExactlyInAnyOrder("A", "D");
        // Ordered by the item's own persisted position (0 then 1).
        assertThat(matrix.columns()).extracting(ChecklistMatrixColumn::name).containsExactly("A", "D");
    }

    @Test
    void columnOrderIsCategoryPositionThenItemPositionWithinThatCategoryNeverItemPositionAlone() {
        // item.position is scoped PER CATEGORY — two items in different
        // categories can legitimately share the same position value. The
        // matrix must still order them by the category they actually belong
        // to (matching what the management screen displays), never by
        // item.position as if it were a single global sequence.
        LocalDate date = LocalDate.of(2026, 8, 1);
        WorkRecord record = workRecord(date, WorkAttendanceStatus.WORK);

        ChecklistCategory categoryX = new ChecklistCategory(USER_ID, "X", 1); // appears second
        ChecklistCategory categoryY = new ChecklistCategory(USER_ID, "Y", 0); // appears first

        ChecklistItem itemInX = new ChecklistItem(USER_ID, categoryX.getId(), 0); // position 0 within X
        ChecklistItem itemInY = new ChecklistItem(USER_ID, categoryY.getId(), 0); // position 0 within Y — same as itemInX!

        ChecklistDailyEntry entryX = entry(record.getId(), itemInX.getId(), date, "InX", "🅧", ChecklistPriority.CORE, true);
        ChecklistDailyEntry entryY = entry(record.getId(), itemInY.getId(), date, "InY", "🅨", ChecklistPriority.CORE, true);

        // newService() itself sets a lenient default (empty list) stub for
        // categoryRepository — it must be constructed *before* this test's
        // own more specific stub, since the *last* when(...) call for a
        // given mock+args wins. Getting this order backwards is exactly
        // what made this test intermittently flaky (a real bug caught while
        // writing it): with the category stub silently reverted to empty,
        // both items tie on every sort key, and the tie-break falls back to
        // HashMap iteration order, which depends on the JVM's per-run UUID
        // hash codes.
        ChecklistDailyService service = newService();
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, date, date)).thenReturn(List.of(entryX, entryY));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(itemInX, itemInY));
        when(categoryRepository.findByUserIdOrderByPositionAscNameAsc(USER_ID)).thenReturn(List.of(categoryY, categoryX));

        ChecklistMatrixResponse matrix = service.getMatrix(date, date);

        // categoryY (position 0) must sort before categoryX (position 1),
        // even though itemInX and itemInY share the same item.position.
        assertThat(matrix.columns()).extracting(ChecklistMatrixColumn::name).containsExactly("InY", "InX");
    }

    @Test
    void deletedItemColumnUsesItsMostRecentHistoricalSnapshotName() {
        LocalDate date = LocalDate.of(2026, 8, 1);
        WorkRecord record = workRecord(date, WorkAttendanceStatus.WORK);
        ChecklistItem deletedItem = new ChecklistItem(USER_ID, null, 0);
        deletedItem.softDelete(java.time.OffsetDateTime.now());
        ChecklistDailyEntry historicalEntry = entry(record.getId(), deletedItem.getId(), date, "예전 이름", "🗑️", ChecklistPriority.SECONDARY, true);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, date, date)).thenReturn(List.of(historicalEntry));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(deletedItem));

        ChecklistMatrixResponse matrix = newService().getMatrix(date, date);

        assertThat(matrix.columns()).hasSize(1);
        assertThat(matrix.columns().get(0).name()).isEqualTo("예전 이름");
        assertThat(matrix.columns().get(0).deleted()).isTrue();
    }

    @Test
    void noDuplicateRowsOrEntriesForTheSameRecord() {
        LocalDate date = LocalDate.of(2026, 8, 1);
        WorkRecord record = workRecord(date, WorkAttendanceStatus.WORK);
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistDailyEntry entry1 = entry(record.getId(), item.getId(), date, "A", "🅰️", ChecklistPriority.CORE, true);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of(record));
        when(dailyEntryRepository.findByUserIdAndWorkDateBetween(USER_ID, date, date)).thenReturn(List.of(entry1));
        when(itemRepository.findByUserId(USER_ID)).thenReturn(List.of(item));
        when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any(), any()))
                .thenReturn(Optional.empty());

        ChecklistMatrixResponse matrix = newService().getMatrix(date, date);

        assertThat(matrix.rows()).hasSize(1);
        assertThat(matrix.rows().get(0).cells()).hasSize(1);
    }
}
