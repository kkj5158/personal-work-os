package com.kafka.backend.activitycategory;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ActivityCategoryServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private ActivityCategoryRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Test
    void createsRootCategoryWhenNoParentGiven() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = new ActivityCategoryService(repository, currentUserProvider);

        ActivityCategory created = service.create("Work Time", null);

        assertThat(created.getName()).isEqualTo("Work Time");
        assertThat(created.getParentId()).isNull();
    }

    @Test
    void createsChildCategoryUnderARootCategory() {
        UUID rootId = UUID.randomUUID();
        ActivityCategory root = new ActivityCategory(USER_ID, "Work Time", null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(rootId, USER_ID)).thenReturn(Optional.of(root));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ActivityCategoryService service = new ActivityCategoryService(repository, currentUserProvider);

        ActivityCategory child = service.create("Outlier Prep", rootId);

        assertThat(child.getParentId()).isEqualTo(rootId);
    }

    @Test
    void rejectsThirdLevelCategoryUnderAnExistingChild() {
        UUID childId = UUID.randomUUID();
        ActivityCategory child = new ActivityCategory(USER_ID, "Outlier Prep", UUID.randomUUID());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(childId, USER_ID)).thenReturn(Optional.of(child));

        ActivityCategoryService service = new ActivityCategoryService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.create("Grandchild", childId))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationUnderAMissingParent() {
        UUID missingParentId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingParentId, USER_ID)).thenReturn(Optional.empty());

        ActivityCategoryService service = new ActivityCategoryService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.create("Orphan", missingParentId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsBlankName() {
        ActivityCategoryService service = new ActivityCategoryService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.create("   ", null))
                .isInstanceOf(InvalidRequestException.class);
    }
}
