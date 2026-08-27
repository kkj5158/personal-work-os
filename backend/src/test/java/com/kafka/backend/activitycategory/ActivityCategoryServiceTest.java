package com.kafka.backend.activitycategory;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ActivityCategoryServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private ActivityCategoryRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Mock
    private WorkTimeEntryRepository workTimeEntryRepository;

    @Mock
    private PlannedTimeBlockRepository plannedTimeBlockRepository;

    private ActivityCategoryService newService() {
        return new ActivityCategoryService(repository, currentUserProvider, workTimeEntryRepository, plannedTimeBlockRepository);
    }

    @Test
    void createsRootCategoryWhenNoParentGiven() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory created = service.create("Work Time", null);

        assertThat(created.getName()).isEqualTo("Work Time");
        assertThat(created.getParentId()).isNull();
        assertThat(created.getIsDefault()).isFalse();
    }

    @Test
    void createsChildCategoryUnderARootCategory() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory child = service.create("Outlier Prep", rootId);

        assertThat(child.getParentId()).isEqualTo(rootId);
    }

    @Test
    void firstChildUnderAParentBecomesItsDefault() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory firstChild = service.create("General Work", rootId);

        assertThat(firstChild.getIsDefault()).isTrue();
    }

    @Test
    void secondChildUnderTheSameParentIsNotDefault() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);
        ActivityCategory existingDefault = new ActivityCategory(USER_ID, "General Work", rootId, true);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.of(existingDefault));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory secondChild = service.create("Meetings", rootId);

        assertThat(secondChild.getIsDefault()).isFalse();
    }

    @Test
    void anotherUsersDefaultDoesNotAffectTheCurrentUsersCreation() {
        // The repository call itself is always scoped by the current user's
        // id — stubbing only USER_ID's (empty) lookup and never another
        // user's is what proves isolation here: if the service ever looked
        // up a different user's default, Mockito's strict stubbing would
        // have nothing configured for that call and the test would fail
        // loudly rather than silently leaking another user's state in.
        UUID rootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory child = service.create("General Work", rootId);

        assertThat(child.getIsDefault()).isTrue();
    }

    @Test
    void defaultsUnderAnotherParentDoNotAffectCreation() {
        // otherRootId already has its own default child. Creating the first
        // child under the unrelated rootId must still become rootId's own
        // default — the lookup is scoped per-parent, so otherRootId's
        // existing default is irrelevant here.
        UUID rootId = UUID.randomUUID();
        UUID otherRootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory child = service.create("General Work", rootId);

        assertThat(child.getIsDefault()).isTrue();
        verify(repository, never()).findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, otherRootId);
    }

    @Test
    void rejectsThirdLevelCategoryUnderAnExistingChild() {
        UUID childId = UUID.randomUUID();
        ActivityCategory child = new ActivityCategory(USER_ID, "Outlier Prep", UUID.randomUUID(), false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(childId, USER_ID)).thenReturn(Optional.of(child));

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.create("Grandchild", childId))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationUnderAMissingParent() {
        UUID missingParentId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingParentId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.create("Orphan", missingParentId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsBlankName() {
        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.create("   ", null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void settingANonDefaultActiveChildMakesItTheDefault() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory target = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory updated = service.setDefault(target.getId());

        assertThat(updated.getIsDefault()).isTrue();
    }

    @Test
    void settingANewDefaultClearsThePreviousDefaultUnderTheSameParent() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory previousDefault = new ActivityCategory(USER_ID, "General Work", rootId, true);
        ActivityCategory target = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.of(previousDefault));
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory updated = service.setDefault(target.getId());

        assertThat(previousDefault.getIsDefault()).isFalse();
        assertThat(updated.getIsDefault()).isTrue();
        verify(repository).saveAndFlush(previousDefault);
    }

    @Test
    void settingTheAlreadyDefaultChildIsIdempotent() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory target = new ActivityCategory(USER_ID, "General Work", rootId, true);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));

        ActivityCategoryService service = newService();

        ActivityCategory result = service.setDefault(target.getId());

        assertThat(result.getIsDefault()).isTrue();
        verify(repository, never()).saveAndFlush(any());
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsSettingARootAsDefault() {
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(root.getId(), USER_ID)).thenReturn(Optional.of(root));

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.setDefault(root.getId()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsSettingAnInactiveChildAsDefault() {
        // ActivityCategory has no setter/mutator for isActive (there is no
        // deactivate feature yet) — a Mockito mock is the only way to
        // represent an inactive child here without adding entity API
        // surface this task doesn't otherwise need.
        UUID rootId = UUID.randomUUID();
        UUID inactiveChildId = UUID.randomUUID();
        ActivityCategory inactiveChild = mock(ActivityCategory.class);
        when(inactiveChild.getParentId()).thenReturn(rootId);
        when(inactiveChild.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(inactiveChildId, USER_ID)).thenReturn(Optional.of(inactiveChild));

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.setDefault(inactiveChildId))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void settingAMissingOrForeignOwnedChildAsDefaultDoesNotRevealOwnership() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.setDefault(missingId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void changingOneParentsDefaultDoesNotTouchAnotherParentOrUser() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory target = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        // Only this exact (user, parent) pair is ever queried for an
        // existing default to clear — no other parent or user is touched.
        when(repository.findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        service.setDefault(target.getId());

        verify(repository).findByUserIdAndParentIdAndIsDefaultTrue(USER_ID, rootId);
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void responseMappingExposesIsDefault() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory category = new ActivityCategory(USER_ID, "General Work", rootId, true);

        ActivityCategoryResponse response = ActivityCategoryResponse.from(category);

        assertThat(response.isDefault()).isTrue();
        assertThat(response.id()).isEqualTo(category.getId());
        assertThat(response.parentId()).isEqualTo(rootId);
    }

    @Test
    void renameTrimsAndPersistsTheNewName() {
        ActivityCategory target = new ActivityCategory(USER_ID, "Old Name", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory renamed = service.rename(target.getId(), "  New Name  ");

        assertThat(renamed.getName()).isEqualTo("New Name");
    }

    @Test
    void rejectsRenamingToABlankName() {
        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.rename(UUID.randomUUID(), "   "))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsRenamingAMissingOrForeignOwnedCategory() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.rename(missingId, "New Name"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void activatingAnInactiveCategoryTurnsItActive() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory target = mock(ActivityCategory.class);
        when(target.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(target));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        service.setActive(rootId, true);

        verify(target).activate();
        verify(repository).save(target);
    }

    @Test
    void activatingAnAlreadyActiveCategoryIsIdempotent() {
        ActivityCategory target = new ActivityCategory(USER_ID, "Meetings", UUID.randomUUID(), false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));

        ActivityCategoryService service = newService();

        service.setActive(target.getId(), true);

        verify(repository, never()).save(any());
    }

    @Test
    void deactivatingTheCurrentDefaultChildClearsItsDefaultFirst() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory target = new ActivityCategory(USER_ID, "General Work", rootId, true);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(target.getId(), USER_ID)).thenReturn(Optional.of(target));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = newService();

        ActivityCategory updated = service.setActive(target.getId(), false);

        assertThat(updated.getIsDefault()).isFalse();
        assertThat(updated.getIsActive()).isFalse();
    }

    @Test
    void deactivatingAnAlreadyInactiveCategoryIsIdempotent() {
        ActivityCategory target = mock(ActivityCategory.class);
        when(target.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(target));

        ActivityCategoryService service = newService();

        service.setActive(UUID.randomUUID(), false);

        verify(repository, never()).save(any());
    }

    @Test
    void settingActiveOnAMissingOrForeignOwnedCategoryDoesNotRevealOwnership() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.setActive(missingId, false))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void listIsScopedToTheCurrentUserOnly() {
        UUID otherUserId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdOrderBySortOrderAscNameAsc(USER_ID)).thenReturn(java.util.List.of());

        ActivityCategoryService service = newService();
        service.list();

        verify(repository).findByUserIdOrderBySortOrderAscNameAsc(USER_ID);
        verify(repository, never()).findByUserIdOrderBySortOrderAscNameAsc(otherUserId);
    }

    @Test
    void deletesAnUnusedChildCategory() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory child = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(child.getId(), USER_ID)).thenReturn(Optional.of(child));
        when(workTimeEntryRepository.existsByCategoryId(child.getId())).thenReturn(false);
        when(plannedTimeBlockRepository.existsByCategoryId(child.getId())).thenReturn(false);

        ActivityCategoryService service = newService();
        service.delete(child.getId());

        verify(repository).delete(child);
    }

    @Test
    void rejectsDeletingAChildReferencedByAWorkTimeEntry() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory child = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(child.getId(), USER_ID)).thenReturn(Optional.of(child));
        when(workTimeEntryRepository.existsByCategoryId(child.getId())).thenReturn(true);

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.delete(child.getId()))
                .isInstanceOf(InvalidRequestException.class);
        verify(repository, never()).delete(any());
    }

    @Test
    void rejectsDeletingAChildReferencedByAPlannedTimeBlock() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory child = new ActivityCategory(USER_ID, "Meetings", rootId, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(child.getId(), USER_ID)).thenReturn(Optional.of(child));
        when(workTimeEntryRepository.existsByCategoryId(child.getId())).thenReturn(false);
        when(plannedTimeBlockRepository.existsByCategoryId(child.getId())).thenReturn(true);

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.delete(child.getId()))
                .isInstanceOf(InvalidRequestException.class);
        verify(repository, never()).delete(any());
    }

    @Test
    void deletingAMissingOrForeignOwnedCategoryDoesNotRevealOwnership() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.delete(missingId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void deletesAnUnusedDefaultChildOutright() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory defaultChild = new ActivityCategory(USER_ID, "General Work", rootId, true);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(defaultChild.getId(), USER_ID)).thenReturn(Optional.of(defaultChild));
        when(workTimeEntryRepository.existsByCategoryId(defaultChild.getId())).thenReturn(false);
        when(plannedTimeBlockRepository.existsByCategoryId(defaultChild.getId())).thenReturn(false);

        ActivityCategoryService service = newService();
        service.delete(defaultChild.getId());

        verify(repository).delete(defaultChild);
    }

    @Test
    void rejectsDeletingAParentThatStillHasChildren() {
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(root.getId(), USER_ID)).thenReturn(Optional.of(root));
        when(repository.existsByUserIdAndParentId(USER_ID, root.getId())).thenReturn(true);

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.delete(root.getId()))
                .isInstanceOf(InvalidRequestException.class);
        verify(repository, never()).delete(any());
    }

    @Test
    void deletesAnEmptyUnusedParent() {
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null, false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(root.getId(), USER_ID)).thenReturn(Optional.of(root));
        when(repository.existsByUserIdAndParentId(USER_ID, root.getId())).thenReturn(false);

        ActivityCategoryService service = newService();
        service.delete(root.getId());

        verify(repository).delete(root);
        // A parent's own delete never consults WorkTimeEntry/PlannedTimeBlock —
        // a root is structurally never directly referenced by either.
        verify(workTimeEntryRepository, never()).existsByCategoryId(any());
        verify(plannedTimeBlockRepository, never()).existsByCategoryId(any());
    }

    @Test
    void repeatedDeleteOfAnAlreadyDeletedCategoryIsNotFound() {
        UUID id = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(id, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = newService();

        assertThatThrownBy(() -> service.delete(id))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
