package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class PlannedTimeBlockService {

    private final PlannedTimeBlockRepository blockRepository;
    private final ActivityCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;

    public PlannedTimeBlockService(
            PlannedTimeBlockRepository blockRepository,
            ActivityCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.blockRepository = blockRepository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<PlannedTimeBlock> findInRange(OffsetDateTime rangeStart, OffsetDateTime rangeEnd) {
        if (rangeStart == null || rangeEnd == null || !rangeEnd.isAfter(rangeStart)) {
            throw new InvalidRequestException("rangeEnd must be after rangeStart");
        }
        return blockRepository.findOverlapping(currentUserProvider.getCurrentUserId(), rangeStart, rangeEnd);
    }

    public PlannedTimeBlock create(String title, OffsetDateTime startAt, OffsetDateTime endAt, UUID categoryId, String memo) {
        validateTitle(title);
        validateTimeRange(startAt, endAt);

        UUID userId = currentUserProvider.getCurrentUserId();
        validateCategoryOwnership(categoryId, userId);
        validateNoOverlap(userId, startAt, endAt, null);

        PlannedTimeBlock block = new PlannedTimeBlock(userId, title.trim(), startAt, endAt, categoryId, memo);
        return blockRepository.save(block);
    }

    public PlannedTimeBlock update(UUID id, String title, OffsetDateTime startAt, OffsetDateTime endAt, UUID categoryId, String memo) {
        validateTitle(title);
        validateTimeRange(startAt, endAt);

        UUID userId = currentUserProvider.getCurrentUserId();
        validateCategoryOwnership(categoryId, userId);
        validateNoOverlap(userId, startAt, endAt, id);

        PlannedTimeBlock block = blockRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Planned time block not found: " + id));

        block.update(title.trim(), startAt, endAt, categoryId, memo);
        return blockRepository.save(block);
    }

    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        PlannedTimeBlock block = blockRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Planned time block not found: " + id));
        blockRepository.delete(block);
    }

    private void validateTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new InvalidRequestException("Title must not be blank");
        }
    }

    private void validateTimeRange(OffsetDateTime startAt, OffsetDateTime endAt) {
        if (startAt == null || endAt == null || !endAt.isAfter(startAt)) {
            throw new InvalidRequestException("endAt must be after startAt");
        }
    }

    /**
     * Attendance refinement batch §13: no existing scheduling/planning
     * convention prevented overlap before this (PlanningGrid.tsx lets blocks
     * visually stack with no conflict layout) — with none established, this
     * defaults to preventing two blocks for the same user overlapping in
     * time, rather than silently allowing concurrent tasks the UI has no way
     * to render distinctly. Reuses the same findOverlapping range query the
     * calendar fetch already relies on; {@code excludeId} lets an update
     * ignore the block's own pre-existing row when checking itself.
     */
    private void validateNoOverlap(UUID userId, OffsetDateTime startAt, OffsetDateTime endAt, UUID excludeId) {
        boolean conflicts = blockRepository.findOverlapping(userId, startAt, endAt).stream()
                .anyMatch(existing -> !existing.getId().equals(excludeId));
        if (conflicts) {
            throw new InvalidRequestException("This time range overlaps an existing planned work block");
        }
    }

    private void validateCategoryOwnership(UUID categoryId, UUID userId) {
        if (categoryId == null) {
            return;
        }
        categoryRepository.findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + categoryId));
    }
}
