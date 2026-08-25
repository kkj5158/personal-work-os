package com.kafka.backend.worktimeentry;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkTimeEntryServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final UUID WORK_RECORD_ID = UUID.randomUUID();
    private static final UUID ROOT_ID = UUID.randomUUID();

    @Mock
    private WorkTimeEntryRepository repository;

    @Mock
    private ActivityCategoryRepository categoryRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private WorkTimeEntryService newService() {
        return new WorkTimeEntryService(repository, categoryRepository, currentUserProvider);
    }

    private static ActivityCategory activeChild(UUID parentId) {
        return new ActivityCategory(USER_ID, "일반 업무", parentId, false);
    }

    private static WorkTimeEntryItemRequest item(UUID id, UUID categoryId, String label, int minutes, String memo) {
        return new WorkTimeEntryItemRequest(id, categoryId, label, minutes, memo);
    }

    @Test
    void createsMultipleOrderedEntries() {
        UUID categoryId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<WorkTimeEntry> saved = newService().replaceAll(WORK_RECORD_ID, List.of(
                item(null, categoryId, "기획", 30, null),
                item(null, categoryId, "개발", 60, null)
        ));

        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getPosition()).isZero();
        assertThat(saved.get(1).getPosition()).isEqualTo(1);
    }

    @Test
    void retrievesEntriesInDeterministicOrder() {
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());

        newService().findByWorkRecord(WORK_RECORD_ID);

        verify(repository).findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID);
    }

    @Test
    void updatesAnEntryWhileRetainingItsIdentity() {
        UUID entryId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        WorkTimeEntry existing = new WorkTimeEntry(entryId, USER_ID, WORK_RECORD_ID, categoryId, "기획", 30, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(existing));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Same categoryId as the existing row — the "unchanged selection"
        // path applies, so the category repository is deliberately never
        // stubbed/consulted here; this test is about identity/item/minutes.
        List<WorkTimeEntry> saved = newService().replaceAll(WORK_RECORD_ID, List.of(
                item(entryId, categoryId, "기획 수정", 45, null)
        ));

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getId()).isEqualTo(entryId);
        assertThat(saved.get(0).getItem()).isEqualTo("기획 수정");
        assertThat(saved.get(0).getMinutes()).isEqualTo(45);
    }

    @Test
    void addingAndRemovingEntriesReplacesTheFullSet() {
        UUID categoryId = UUID.randomUUID();
        UUID keptId = UUID.randomUUID();
        UUID droppedId = UUID.randomUUID();
        WorkTimeEntry kept = new WorkTimeEntry(keptId, USER_ID, WORK_RECORD_ID, categoryId, "기획", 30, null, 0);
        WorkTimeEntry dropped = new WorkTimeEntry(droppedId, USER_ID, WORK_RECORD_ID, categoryId, "구 항목", 20, null, 1);
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(kept, dropped));
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        newService().replaceAll(WORK_RECORD_ID, List.of(
                item(keptId, categoryId, "기획", 30, null),
                item(null, categoryId, "새 항목", 15, null)
        ));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<WorkTimeEntry>> deletedCaptor = ArgumentCaptor.forClass(Collection.class);
        verify(repository).deleteAll(deletedCaptor.capture());
        assertThat(deletedCaptor.getValue()).containsExactly(dropped);
    }

    @Test
    void rejectsABlankItem() {
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "   ", 30, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsZeroMinutes() {
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "기획", 0, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsNegativeMinutes() {
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "기획", -5, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsARootCategory() {
        UUID rootCategoryId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "업무", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(rootCategoryId, USER_ID)).thenReturn(Optional.of(root));

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, rootCategoryId, "기획", 30, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsANewlyAssignedInactiveCategory() {
        // ActivityCategory has no deactivate feature/setter — a mock is the
        // only way to represent an inactive category here (same approach
        // already used in ActivityCategoryServiceTest/WorkRecordServiceTest).
        UUID categoryId = UUID.randomUUID();
        ActivityCategory inactiveCategory = org.mockito.Mockito.mock(ActivityCategory.class);
        when(inactiveCategory.getParentId()).thenReturn(ROOT_ID);
        when(inactiveCategory.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(inactiveCategory));

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "기획", 30, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void preservesAnUnchangedHistoricalInactiveCategory() {
        UUID entryId = UUID.randomUUID();
        UUID inactiveCategoryId = UUID.randomUUID();
        WorkTimeEntry existing = new WorkTimeEntry(entryId, USER_ID, WORK_RECORD_ID, inactiveCategoryId, "팀 회고", 45, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(existing));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Same entry id, same (now-inactive) category id — the category
        // repository must never be consulted.
        List<WorkTimeEntry> saved = newService().replaceAll(WORK_RECORD_ID, List.of(
                item(entryId, inactiveCategoryId, "팀 회고", 45, "메모 추가")
        ));

        assertThat(saved.get(0).getCategoryId()).isEqualTo(inactiveCategoryId);
        verify(categoryRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void rejectsACategoryBelongingToAnotherUser() {
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "기획", 30, null))))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsManipulatingAnotherRecordsEntry() {
        UUID foreignEntryId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        // Owned by the current user, but under a DIFFERENT work record.
        WorkTimeEntry foreignRecordEntry = new WorkTimeEntry(foreignEntryId, USER_ID, UUID.randomUUID(), categoryId, "다른 기록", 10, null, 0);
        when(repository.findByIdAndUserId(foreignEntryId, USER_ID)).thenReturn(Optional.of(foreignRecordEntry));

        assertThatThrownBy(() -> newService().replaceAll(WORK_RECORD_ID, List.of(item(foreignEntryId, categoryId, "탈취 시도", 10, null))))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void categoryOnlyEditPreservesTotalMinutes() {
        UUID entryId = UUID.randomUUID();
        UUID oldCategoryId = UUID.randomUUID();
        UUID newCategoryId = UUID.randomUUID();
        WorkTimeEntry existing = new WorkTimeEntry(entryId, USER_ID, WORK_RECORD_ID, oldCategoryId, "기획", 30, null, 0);
        ActivityCategory newCategory = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(existing));
        when(categoryRepository.findByIdAndUserId(newCategoryId, USER_ID)).thenReturn(Optional.of(newCategory));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<WorkTimeEntry> saved = newService().replaceAll(WORK_RECORD_ID, List.of(
                item(entryId, newCategoryId, "기획", 30, null)
        ));

        assertThat(WorkTimeEntryService.sumMinutes(saved)).isEqualTo(30);
    }

    @Test
    void memoOnlyEditPreservesTotalMinutes() {
        UUID entryId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        WorkTimeEntry existing = new WorkTimeEntry(entryId, USER_ID, WORK_RECORD_ID, categoryId, "기획", 30, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of(existing));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<WorkTimeEntry> saved = newService().replaceAll(WORK_RECORD_ID, List.of(
                item(entryId, categoryId, "기획", 30, "메모 추가")
        ));

        assertThat(WorkTimeEntryService.sumMinutes(saved)).isEqualTo(30);
        assertThat(saved.get(0).getMemo()).isEqualTo("메모 추가");
    }

    @Test
    void replacingOneRecordsEntriesDoesNotTouchAnotherRecord() {
        UUID categoryId = UUID.randomUUID();
        UUID otherWorkRecordId = UUID.randomUUID();
        ActivityCategory category = activeChild(ROOT_ID);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByWorkRecordIdOrderByPositionAsc(WORK_RECORD_ID)).thenReturn(List.of());
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.of(category));
        when(repository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        newService().replaceAll(WORK_RECORD_ID, List.of(item(null, categoryId, "기획", 30, null)));

        verify(repository, never()).findByWorkRecordIdOrderByPositionAsc(otherWorkRecordId);
    }
}
