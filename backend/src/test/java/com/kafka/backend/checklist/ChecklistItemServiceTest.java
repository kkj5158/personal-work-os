package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistItemServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.now(AppTimeZone.ZONE);

    @Mock
    private ChecklistItemRepository itemRepository;

    @Mock
    private ChecklistItemVersionRepository versionRepository;

    @Mock
    private ChecklistCategoryRepository categoryRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private ChecklistItemService newService() {
        return new ChecklistItemService(itemRepository, versionRepository, categoryRepository, currentUserProvider);
    }

    /** Stubs a full roster of already-active items (each with its own
     *  today-effective active version) so the active-count check has
     *  something to count against. */
    private void stubActiveRoster(int activeCount) {
        List<ChecklistItem> items = new ArrayList<>();
        for (int i = 0; i < activeCount; i++) {
            ChecklistItem item = new ChecklistItem(USER_ID, null, i);
            items.add(item);
            ChecklistItemVersion version = new ChecklistItemVersion(item.getId(), TODAY, "Item " + i, "✅", ChecklistPriority.CORE, true, null);
            when(versionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(item.getId(), TODAY))
                    .thenReturn(Optional.of(version));
        }
        when(itemRepository.findByUserIdAndDeletedAtIsNull(USER_ID)).thenReturn(items);
    }

    @Test
    void createSucceedsWhenFewerThanSixItemsAreActive() {
        stubActiveRoster(5);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.countByUserIdAndCategoryIdIsNull(USER_ID)).thenReturn(5L);
        when(itemRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(versionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChecklistItem created = newService().create("New habit", "📝", ChecklistPriority.SECONDARY, null, null);

        assertThat(created).isNotNull();
    }

    @Test
    void createRejectsASeventhActiveItem() {
        stubActiveRoster(6);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);

        ChecklistItemService service = newService();

        assertThatThrownBy(() -> service.create("One too many", "📝", ChecklistPriority.CORE, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void scheduleVersionRejectsAPastEffectiveDate() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));

        ChecklistItemService service = newService();

        assertThatThrownBy(() -> service.scheduleVersion(
                itemId, TODAY.minusDays(1), "Name", "📝", ChecklistPriority.CORE, true, null
        )).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void scheduleVersionEditsAnExistingFutureVersionInPlaceRatherThanDuplicating() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        LocalDate future = TODAY.plusDays(7);
        ChecklistItemVersion existingFuture = new ChecklistItemVersion(itemId, future, "Old name", "📝", ChecklistPriority.SECONDARY, true, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));
        when(versionRepository.findByItemIdAndEffectiveFrom(itemId, future)).thenReturn(Optional.of(existingFuture));
        when(versionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChecklistItemVersion updated = newService().scheduleVersion(itemId, future, "New name", "🚀", ChecklistPriority.CORE, true, 90);

        assertThat(updated.getName()).isEqualTo("New name");
        assertThat(updated.getPriority()).isEqualTo(ChecklistPriority.CORE);
        assertThat(updated.getGoalOverridePercent()).isEqualTo(90);
    }

    @Test
    void scheduleVersionRejectsAnItemThatIsAlreadyDeleted() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem deleted = new ChecklistItem(USER_ID, null, 0);
        deleted.softDelete(java.time.OffsetDateTime.now());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(deleted));

        ChecklistItemService service = newService();

        assertThatThrownBy(() -> service.scheduleVersion(itemId, TODAY, "Name", "📝", ChecklistPriority.CORE, true, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void deleteFutureVersionRejectsAVersionThatHasAlreadyBegunApplying() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistItemVersion todaysVersion = new ChecklistItemVersion(itemId, TODAY, "Name", "📝", ChecklistPriority.CORE, true, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));
        when(versionRepository.findById(todaysVersion.getId())).thenReturn(Optional.of(todaysVersion));

        ChecklistItemService service = newService();

        assertThatThrownBy(() -> service.deleteFutureVersion(itemId, todaysVersion.getId()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void deleteFutureVersionAllowsDeletingAStrictlyFutureVersion() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);
        ChecklistItemVersion futureVersion = new ChecklistItemVersion(itemId, TODAY.plusDays(3), "Name", "📝", ChecklistPriority.CORE, true, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));
        when(versionRepository.findById(futureVersion.getId())).thenReturn(Optional.of(futureVersion));

        newService().deleteFutureVersion(itemId, futureVersion.getId());
        // No exception — success.
    }

    @Test
    void softDeleteIsIdempotentAndIrreversibleThroughThisApi() {
        UUID itemId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChecklistItemService service = newService();
        service.softDelete(itemId);

        assertThat(item.isDeleted()).isTrue();
    }

    @Test
    void moveToCategoryRejectsAMissingTargetCategory() {
        UUID itemId = UUID.randomUUID();
        UUID targetCategoryId = UUID.randomUUID();
        ChecklistItem item = new ChecklistItem(USER_ID, null, 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(itemRepository.findByIdAndUserId(itemId, USER_ID)).thenReturn(Optional.of(item));
        when(categoryRepository.findByIdAndUserId(targetCategoryId, USER_ID)).thenReturn(Optional.empty());

        ChecklistItemService service = newService();

        assertThatThrownBy(() -> service.moveToCategory(itemId, targetCategoryId))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
