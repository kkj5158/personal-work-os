package com.kafka.backend.supplementalwork;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the Supplemental Work ("보강근무") replace-all/overlap contract.
 * Attendance-independence (allowed under every status, never blocks a status
 * transition, survives a status change) is covered at the WorkRecordService
 * level in {@code WorkRecordServiceTest}, since that's where the actual
 * independence guarantee is enforced (or rather, deliberately never
 * enforced against this table).
 */
@ExtendWith(MockitoExtension.class)
class SupplementalWorkEntryServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final UUID WORK_RECORD_ID = UUID.randomUUID();
    private static final UUID ROOT_ID = UUID.randomUUID();
    private static final LocalDate WORK_DATE = LocalDate.of(2026, 8, 30);

    @Mock
    private SupplementalWorkEntryRepository repository;

    @Mock
    private ActivityCategoryRepository categoryRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private SupplementalWorkEntryService newService() {
        return new SupplementalWorkEntryService(repository, categoryRepository, currentUserProvider);
    }

    private static ActivityCategory activeChild(UUID parentId) {
        return new ActivityCategory(USER_ID, "개인 개발", parentId, false);
    }

    private static SupplementalWorkEntryItemRequest item(UUID id, UUID categoryId, String label, Integer totalMinutes, LocalTime start, LocalTime end, String memo) {
        return new SupplementalWorkEntryItemRequest(id, categoryId, label, totalMinutes, start, end, memo);
    }

    private List<SupplementalWorkEntry> replace(List<SupplementalWorkEntryItemRequest> items, OffsetDateTime regularStart, OffsetDateTime regularEnd) {
        return newService().replaceAll(WORK_RECORD_ID, WORK_DATE, items, regularStart, regularEnd);
    }

    // --- A. Creation ---

    @Test
    void createsAnEntryWithTotalDurationOnly() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "데이터 분석 스터디 수강", 90, null, null, null)),
                null, null
        );

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getTotalMinutes()).isEqualTo(90);
        assertThat(saved.get(0).getStartAt()).isNull();
        assertThat(saved.get(0).getEndAt()).isNull();
    }

    @Test
    void createsAnEntryWithStartAndEnd() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "헬스 - 근력운동", 30, LocalTime.of(19, 0), LocalTime.of(20, 30), null)),
                null, null
        );

        assertThat(saved.get(0).getStartAt()).isEqualTo(AppTimeZone.toStored(WORK_DATE.atTime(19, 0)));
        assertThat(saved.get(0).getEndAt()).isEqualTo(AppTimeZone.toStored(WORK_DATE.atTime(20, 30)));
    }

    @Test
    void rejectsAMissingCategory() {
        assertThatThrownBy(() -> replace(List.of(item(null, null, "항목", 30, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsABlankItem() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "   ", 30, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAMissingTotalDuration() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", null, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAZeroOrNegativeTotalDuration() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 0, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsStartWithoutEnd() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 30, LocalTime.of(19, 0), null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsEndWithoutStart() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 30, null, LocalTime.of(20, 0), null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsEndAtOrBeforeStart() {
        UUID categoryId = UUID.randomUUID();
        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 30, LocalTime.of(20, 0), LocalTime.of(20, 0), null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- C. Multiple entries per date ---

    @Test
    void createsMultipleOrderedEntriesOnOneDate() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(List.of(
                item(null, categoryId, "온라인 강의", 90, LocalTime.of(19, 0), LocalTime.of(20, 30), null),
                item(null, categoryId, "헬스", 30, LocalTime.of(22, 0), LocalTime.of(22, 30), null)
        ), null, null);

        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getPosition()).isZero();
        assertThat(saved.get(1).getPosition()).isEqualTo(1);
        assertThat(SupplementalWorkEntryService.sumMinutes(saved)).isEqualTo(120);
    }

    // --- F. Overlap ---

    @Test
    void rejectsTwoOverlappingSupplementalEntries() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));

        assertThatThrownBy(() -> replace(List.of(
                item(null, categoryId, "A", 120, LocalTime.of(20, 0), LocalTime.of(22, 0), null),
                item(null, categoryId, "B", 90, LocalTime.of(21, 30), LocalTime.of(23, 0), null)
        ), null, null)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void allowsTwoSupplementalEntriesThatOnlyTouchAtTheBoundary() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(List.of(
                item(null, categoryId, "A", 120, LocalTime.of(20, 0), LocalTime.of(22, 0), null),
                item(null, categoryId, "B", 60, LocalTime.of(22, 0), LocalTime.of(23, 0), null)
        ), null, null);

        assertThat(saved).hasSize(2);
    }

    @Test
    void rejectsASupplementalEntryOverlappingTheRegularWorkInterval() {
        UUID categoryId = UUID.randomUUID();
        OffsetDateTime regularStart = AppTimeZone.toStored(WORK_DATE.atTime(9, 0));
        OffsetDateTime regularEnd = AppTimeZone.toStored(WORK_DATE.atTime(18, 0));

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        // Overlap is validated before category resolution — the category
        // repository must never be consulted for a rejected entry.

        assertThatThrownBy(() -> replace(
                List.of(item(null, categoryId, "야근", 120, LocalTime.of(17, 0), LocalTime.of(19, 0), null)),
                regularStart, regularEnd
        )).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void allowsASupplementalEntryThatOnlyTouchesTheRegularWorkIntervalBoundary() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);
        OffsetDateTime regularStart = AppTimeZone.toStored(WORK_DATE.atTime(9, 0));
        OffsetDateTime regularEnd = AppTimeZone.toStored(WORK_DATE.atTime(18, 0));

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "저녁 스터디", 120, LocalTime.of(18, 0), LocalTime.of(20, 0), null)),
                regularStart, regularEnd
        );

        assertThat(saved).hasSize(1);
    }

    @Test
    void anUntimedEntryIsNeverOverlapValidated() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);
        OffsetDateTime regularStart = AppTimeZone.toStored(WORK_DATE.atTime(9, 0));
        OffsetDateTime regularEnd = AppTimeZone.toStored(WORK_DATE.atTime(18, 0));

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // No start/end at all — must be accepted regardless of the regular
        // interval or any other entry, since it cannot be overlap-validated.
        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "총시간만 기록", 60, null, null, null)),
                regularStart, regularEnd
        );

        assertThat(saved).hasSize(1);
    }

    @Test
    void noRegularIntervalMeansNoRegularOverlapCheck() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // regularStart/regularEnd both null (e.g. a non-working Attendance
        // status, or a workday not yet clocked in/out) — nothing to conflict
        // with, so any timed entry is accepted.
        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "연차일의 보강근무", 120, LocalTime.of(19, 0), LocalTime.of(21, 0), null)),
                null, null
        );

        assertThat(saved).hasSize(1);
    }

    // --- G. Duration semantics ---

    @Test
    void totalDurationMayDifferFromEndMinusStartAndIsNeverRecomputed() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // 20:00-23:00 is a 3-hour interval, but the user manually overrode
        // the total to 2.5 hours (e.g. the session included a break) — the
        // backend must persist the requested total verbatim, never silently
        // replace it with end-start.
        List<SupplementalWorkEntry> saved = replace(
                List.of(item(null, categoryId, "야간 세션", 150, LocalTime.of(20, 0), LocalTime.of(23, 0), null)),
                null, null
        );

        assertThat(saved.get(0).getTotalMinutes()).isEqualTo(150);
    }

    // --- Category validation ---

    @Test
    void rejectsARootCategory() {
        UUID rootCategoryId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "업무", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(rootCategoryId, USER_ID)).thenReturn(Optional.of(root));

        assertThatThrownBy(() -> replace(List.of(item(null, rootCategoryId, "항목", 30, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsANewlyAssignedInactiveCategory() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory inactiveCategory = org.mockito.Mockito.mock(ActivityCategory.class);
        when(inactiveCategory.getParentId()).thenReturn(ROOT_ID);
        when(inactiveCategory.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(inactiveCategory));

        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 30, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void preservesAnUnchangedHistoricalInactiveCategory() {
        UUID entryId = UUID.randomUUID();
        UUID inactiveCategoryId = UUID.randomUUID();
        SupplementalWorkEntry existing = new SupplementalWorkEntry(entryId, USER_ID, WORK_RECORD_ID, inactiveCategoryId, "과거 항목", 45, null, null, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(existing));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(
                List.of(item(entryId, inactiveCategoryId, "과거 항목", 45, null, null, "메모 추가")),
                null, null
        );

        assertThat(saved.get(0).getCategoryId()).isEqualTo(inactiveCategoryId);
        verify(categoryRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void rejectsACategoryBelongingToAnotherUser() {
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> replace(List.of(item(null, categoryId, "항목", 30, null, null, null)), null, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // --- H. Lifecycle ---

    @Test
    void editingOneEntryDoesNotCorruptOthers() {
        UUID categoryId = UUID.randomUUID();
        UUID editedId = UUID.randomUUID();
        UUID untouchedId = UUID.randomUUID();
        SupplementalWorkEntry edited = new SupplementalWorkEntry(editedId, USER_ID, WORK_RECORD_ID, categoryId, "원본", 60, null, null, null, 0);
        SupplementalWorkEntry untouched = new SupplementalWorkEntry(untouchedId, USER_ID, WORK_RECORD_ID, categoryId, "그대로", 30, null, null, null, 1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(edited, untouched));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<SupplementalWorkEntry> saved = replace(List.of(
                item(editedId, categoryId, "수정됨", 90, null, null, null),
                item(untouchedId, categoryId, "그대로", 30, null, null, null)
        ), null, null);

        assertThat(saved).hasSize(2);
        SupplementalWorkEntry savedEdited = saved.stream().filter(e -> e.getId().equals(editedId)).findFirst().orElseThrow();
        SupplementalWorkEntry savedUntouched = saved.stream().filter(e -> e.getId().equals(untouchedId)).findFirst().orElseThrow();
        assertThat(savedEdited.getItem()).isEqualTo("수정됨");
        assertThat(savedEdited.getTotalMinutes()).isEqualTo(90);
        assertThat(savedUntouched.getItem()).isEqualTo("그대로");
        assertThat(savedUntouched.getTotalMinutes()).isEqualTo(30);
    }

    @Test
    void deletingOneEntryDoesNotDeleteOthers() {
        UUID categoryId = UUID.randomUUID();
        UUID keptId = UUID.randomUUID();
        UUID droppedId = UUID.randomUUID();
        SupplementalWorkEntry kept = new SupplementalWorkEntry(keptId, USER_ID, WORK_RECORD_ID, categoryId, "유지", 30, null, null, null, 0);
        SupplementalWorkEntry dropped = new SupplementalWorkEntry(droppedId, USER_ID, WORK_RECORD_ID, categoryId, "삭제 대상", 20, null, null, null, 1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(kept, dropped));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        replace(List.of(item(keptId, categoryId, "유지", 30, null, null, null)), null, null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<SupplementalWorkEntry>> deletedCaptor = ArgumentCaptor.forClass(Collection.class);
        verify(repository).deleteAll(deletedCaptor.capture());
        assertThat(deletedCaptor.getValue()).containsExactly(dropped);
    }

    @Test
    void rejectsManipulatingAnotherRecordsEntry() {
        UUID foreignEntryId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        SupplementalWorkEntry foreignRecordEntry = new SupplementalWorkEntry(foreignEntryId, USER_ID, UUID.randomUUID(), categoryId, "다른 기록", 10, null, null, null, 0);
        when(repository.findByIdAndUserId(foreignEntryId, USER_ID)).thenReturn(Optional.of(foreignRecordEntry));

        assertThatThrownBy(() -> replace(List.of(item(foreignEntryId, categoryId, "탈취 시도", 10, null, null, null)), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Batch retrieval ---

    @Test
    void retrievesAndGroupsEntriesForMultipleWorkRecordsInOneBatch() {
        UUID secondWorkRecordId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        SupplementalWorkEntry first = new SupplementalWorkEntry(UUID.randomUUID(), USER_ID, WORK_RECORD_ID, categoryId, "A", 30, null, null, null, 0);
        SupplementalWorkEntry otherRecord = new SupplementalWorkEntry(UUID.randomUUID(), USER_ID, secondWorkRecordId, categoryId, "B", 45, null, null, null, 0);
        List<UUID> workRecordIds = List.of(WORK_RECORD_ID, secondWorkRecordId);

        when(repository.findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(workRecordIds))
                .thenReturn(List.of(first, otherRecord));

        Map<UUID, List<SupplementalWorkEntry>> result = newService().findByWorkRecordIds(workRecordIds);

        assertThat(result.get(WORK_RECORD_ID)).containsExactly(first);
        assertThat(result.get(secondWorkRecordId)).containsExactly(otherRecord);
    }

    @Test
    void skipsTheBatchQueryWhenThereAreNoWorkRecords() {
        assertThat(newService().findByWorkRecordIds(List.of())).isEmpty();

        verify(repository, never()).findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(any());
    }
}
