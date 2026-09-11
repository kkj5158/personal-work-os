package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.project.PhaseRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlannedTimeBlockServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private PlannedTimeBlockRepository blockRepository;

    @Mock
    private ActivityCategoryRepository activityCategoryRepository;

    @Mock
    private LifeCategoryRepository lifeCategoryRepository;

    @Mock
    private PhaseRepository phaseRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private PlannedTimeBlockService newService() {
        return new PlannedTimeBlockService(blockRepository, activityCategoryRepository, lifeCategoryRepository, phaseRepository, currentUserProvider);
    }

    @Test
    void createsBlockWhenEndIsAfterStart() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlock created = newService().create(PlanDomainType.WORK, "Deep work", start, end, null, null, null, null);

        assertThat(created.getStartAt()).isEqualTo(start);
        assertThat(created.getEndAt()).isEqualTo(end);
        assertThat(created.getDomainType()).isEqualTo(PlanDomainType.WORK);
    }

    @Test
    void rejectsCreationWhenEndEqualsStart() {
        OffsetDateTime start = OffsetDateTime.now();

        assertThatThrownBy(() -> newService().create(PlanDomainType.WORK, "Deep work", start, start, null, null, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationWhenEndIsBeforeStart() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.minusMinutes(30);

        assertThatThrownBy(() -> newService().create(PlanDomainType.WORK, "Deep work", start, end, null, null, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationWithAnActivityCategoryOwnedByAnotherUser() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(activityCategoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().create(PlanDomainType.WORK, "Deep work", start, end, categoryId, null, null, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsALifeCategoryOnAWorkBlock() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);

        assertThatThrownBy(() -> newService().create(PlanDomainType.WORK, "Deep work", start, end, null, UUID.randomUUID(), null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void updatesAnExistingBlockOwnedByTheCurrentUser() {
        OffsetDateTime originalStart = OffsetDateTime.now();
        PlannedTimeBlock existing = new PlannedTimeBlock(
                USER_ID, PlanDomainType.WORK, "Old title", originalStart, originalStart.plusHours(1), null, null, null, null
        );
        OffsetDateTime newStart = originalStart.plusHours(2);
        OffsetDateTime newEnd = newStart.plusMinutes(30);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlock updated = newService().update(existing.getId(), PlanDomainType.WORK, "New title", newStart, newEnd, null, null, null, "moved");

        assertThat(updated.getTitle()).isEqualTo("New title");
        assertThat(updated.getStartAt()).isEqualTo(newStart);
        assertThat(updated.getEndAt()).isEqualTo(newEnd);
        assertThat(updated.getMemo()).isEqualTo("moved");
    }

    @Test
    void rejectsUpdateOfABlockNotOwnedByTheCurrentUser() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        UUID blockId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(blockId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().update(blockId, PlanDomainType.WORK, "title", start, end, null, null, null, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void deletesAnExistingBlockOwnedByTheCurrentUser() {
        OffsetDateTime start = OffsetDateTime.now();
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, PlanDomainType.WORK, "title", start, start.plusHours(1), null, null, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));

        newService().delete(existing.getId());

        verify(blockRepository).delete(existing);
    }

    @Test
    void rejectsRangeQueryWhenRangeEndIsNotAfterRangeStart() {
        OffsetDateTime start = OffsetDateTime.now();

        assertThatThrownBy(() -> newService().findInRange(start, start))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Planning overlap is intentionally ALLOWED (locked V1 policy) ---

    @Test
    void allowsCreatingABlockThatOverlapsAnExistingOne() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlock created = newService().create(PlanDomainType.WORK, "New block", start, end, null, null, null, null);

        assertThat(created.getStartAt()).isEqualTo(start);
        // No overlap query is ever consulted for Planning — save proceeds unconditionally.
        verifyNoOverlapQuery();
    }

    @Test
    void allowsUpdatingABlockIntoAnotherExistingBlocksRange() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, PlanDomainType.WORK, "title", start, end, null, null, null, null);
        OffsetDateTime newStart = start.plusHours(2).plusMinutes(15);
        OffsetDateTime newEnd = newStart.plusMinutes(30);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlock updated = newService().update(existing.getId(), PlanDomainType.WORK, "title", newStart, newEnd, null, null, null, null);

        assertThat(updated.getStartAt()).isEqualTo(newStart);
        verifyNoOverlapQuery();
    }

    private void verifyNoOverlapQuery() {
        org.mockito.Mockito.verify(blockRepository, org.mockito.Mockito.never()).findOverlapping(any(), any(), any());
    }
}
