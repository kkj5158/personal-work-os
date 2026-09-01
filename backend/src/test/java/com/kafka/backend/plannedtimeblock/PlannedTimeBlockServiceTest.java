package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
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
    private ActivityCategoryRepository categoryRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Test
    void createsBlockWhenEndIsAfterStart() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        PlannedTimeBlock created = service.create("Deep work", start, end, null, null);

        assertThat(created.getStartAt()).isEqualTo(start);
        assertThat(created.getEndAt()).isEqualTo(end);
    }

    @Test
    void rejectsCreationWhenEndEqualsStart() {
        OffsetDateTime start = OffsetDateTime.now();

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.create("Deep work", start, start, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationWhenEndIsBeforeStart() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.minusMinutes(30);

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.create("Deep work", start, end, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCreationWithACategoryOwnedByAnotherUser() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        UUID categoryId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(categoryRepository.findByIdAndUserId(categoryId, USER_ID)).thenReturn(Optional.empty());

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.create("Deep work", start, end, categoryId, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void updatesAnExistingBlockOwnedByTheCurrentUser() {
        OffsetDateTime originalStart = OffsetDateTime.now();
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, "Old title", originalStart, originalStart.plusHours(1), null, null);
        OffsetDateTime newStart = originalStart.plusHours(2);
        OffsetDateTime newEnd = newStart.plusMinutes(30);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        PlannedTimeBlock updated = service.update(existing.getId(), "New title", newStart, newEnd, null, "moved");

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

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.update(blockId, "title", start, end, null, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void deletesAnExistingBlockOwnedByTheCurrentUser() {
        OffsetDateTime start = OffsetDateTime.now();
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, "title", start, start.plusHours(1), null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        service.delete(existing.getId());

        verify(blockRepository).delete(existing);
    }

    @Test
    void rejectsRangeQueryWhenRangeEndIsNotAfterRangeStart() {
        OffsetDateTime start = OffsetDateTime.now();

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.findInRange(start, start))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Overlap prevention (attendance refinement batch §13) ---

    @Test
    void rejectsCreationWhenItOverlapsAnExistingBlock() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, "Existing", start.minusMinutes(30), start.plusMinutes(30), null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findOverlapping(USER_ID, start, end)).thenReturn(java.util.List.of(existing));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.create("New block", start, end, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void allowsCreationOfBackToBackNonOverlappingBlocks() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        // findOverlapping's own query condition (startAt < rangeEnd AND endAt >
        // rangeStart) never matches a block that ends exactly when the new one
        // starts — simulated here by simply returning no conflicts.
        when(blockRepository.findOverlapping(USER_ID, start, end)).thenReturn(java.util.List.of());
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        PlannedTimeBlock created = service.create("New block", start, end, null, null);

        assertThat(created.getStartAt()).isEqualTo(start);
    }

    @Test
    void updateExcludesTheBlockItselfFromTheOverlapCheck() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, "title", start, end, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        // Only the block being updated occupies this exact range — it must
        // never conflict with itself when its own time range is unchanged.
        when(blockRepository.findOverlapping(USER_ID, start, end)).thenReturn(java.util.List.of(existing));
        when(blockRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        PlannedTimeBlock updated = service.update(existing.getId(), "renamed", start, end, null, null);

        assertThat(updated.getTitle()).isEqualTo("renamed");
    }

    @Test
    void updateRejectsMovingIntoAnotherExistingBlocksRange() {
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(1);
        PlannedTimeBlock existing = new PlannedTimeBlock(USER_ID, "title", start, end, null, null);
        PlannedTimeBlock other = new PlannedTimeBlock(USER_ID, "other", start.plusHours(2), start.plusHours(3), null, null);
        OffsetDateTime newStart = start.plusHours(2).plusMinutes(15);
        OffsetDateTime newEnd = newStart.plusMinutes(30);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(blockRepository.findOverlapping(USER_ID, newStart, newEnd)).thenReturn(java.util.List.of(other));

        PlannedTimeBlockService service = new PlannedTimeBlockService(blockRepository, categoryRepository, currentUserProvider);

        assertThatThrownBy(() -> service.update(existing.getId(), "title", newStart, newEnd, null, null))
                .isInstanceOf(InvalidRequestException.class);
    }
}
