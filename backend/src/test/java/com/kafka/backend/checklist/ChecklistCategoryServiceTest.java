package com.kafka.backend.checklist;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistCategoryServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private ChecklistCategoryRepository repository;

    @Mock
    private ChecklistItemRepository itemRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private ChecklistCategoryService newService() {
        return new ChecklistCategoryService(repository, itemRepository, currentUserProvider);
    }

    @Test
    void deleteMovesMemberItemsToUncategorizedRatherThanDeletingThem() {
        UUID categoryId = UUID.randomUUID();
        ChecklistCategory category = new ChecklistCategory(USER_ID, "Health", 0);
        ChecklistItem member = new ChecklistItem(USER_ID, categoryId, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(java.util.Optional.of(category));
        when(itemRepository.findByUserIdAndCategoryId(USER_ID, categoryId)).thenReturn(List.of(member));

        newService().delete(categoryId);

        // The item itself is preserved (never deleted) and reassigned to
        // "Uncategorized" (categoryId == null) — never removed outright.
        assertThat(member.getCategoryId()).isNull();
        assertThat(member.isDeleted()).isFalse();
        verify(itemRepository).saveAll(List.of(member));
        verify(repository).delete(category);
    }

    @Test
    void reorderRejectsAnIncompleteCategorySet() {
        ChecklistCategory first = new ChecklistCategory(USER_ID, "A", 0);
        ChecklistCategory second = new ChecklistCategory(USER_ID, "B", 1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdOrderByPositionAscNameAsc(USER_ID)).thenReturn(List.of(first, second));

        ChecklistCategoryService service = newService();

        assertThatThrownBy(() -> service.reorder(List.of(first.getId())))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void reorderPersistsThePositionsInTheSuppliedOrder() {
        ChecklistCategory first = new ChecklistCategory(USER_ID, "A", 0);
        ChecklistCategory second = new ChecklistCategory(USER_ID, "B", 1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdOrderByPositionAscNameAsc(USER_ID)).thenReturn(List.of(first, second));

        newService().reorder(List.of(second.getId(), first.getId()));

        assertThat(second.getPosition()).isZero();
        assertThat(first.getPosition()).isEqualTo(1);
    }
}
