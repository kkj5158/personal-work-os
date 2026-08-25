package com.kafka.backend.worktimeentry;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class WorkTimeEntryService {

    private final WorkTimeEntryRepository repository;
    private final ActivityCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;

    public WorkTimeEntryService(
            WorkTimeEntryRepository repository,
            ActivityCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<WorkTimeEntry> findByWorkRecord(UUID workRecordId) {
        return repository.findByWorkRecordIdOrderByPositionAsc(workRecordId);
    }

    public static int sumMinutes(List<WorkTimeEntry> entries) {
        return entries.stream().mapToInt(WorkTimeEntry::getMinutes).sum();
    }

    /**
     * Replaces the complete entry list for one WorkRecord, matching the
     * frontend's own save model (the whole list is always resent together).
     * An incoming row whose id matches one of this record's own current
     * rows is updated in place, preserving identity and — if its category
     * id is unchanged — its existing category reference even if that
     * category has since been deactivated. Any current row not present in
     * the incoming list is deleted. Position is the row's index in the
     * incoming list.
     */
    @Transactional
    public List<WorkTimeEntry> replaceAll(UUID workRecordId, List<WorkTimeEntryItemRequest> items) {
        UUID userId = currentUserProvider.getCurrentUserId();

        List<WorkTimeEntry> existing = repository.findByWorkRecordIdOrderByPositionAsc(workRecordId);
        Map<UUID, WorkTimeEntry> existingById = new HashMap<>();
        for (WorkTimeEntry entry : existing) {
            existingById.put(entry.getId(), entry);
        }

        List<WorkTimeEntry> toSave = new ArrayList<>();
        int position = 0;
        for (WorkTimeEntryItemRequest item : items) {
            validateShape(item);

            WorkTimeEntry target;
            UUID existingCategoryIdForUnchangedCheck = null;

            if (item.id() != null && existingById.containsKey(item.id())) {
                target = existingById.remove(item.id());
                existingCategoryIdForUnchangedCheck = target.getCategoryId();
            } else if (item.id() != null) {
                // Not one of this record's own current rows — never let a
                // save silently adopt an id belonging to another record
                // (or, defensively, another user's row entirely).
                Optional<WorkTimeEntry> ownedElsewhere = repository.findByIdAndUserId(item.id(), userId);
                if (ownedElsewhere.isPresent() || repository.existsById(item.id())) {
                    throw new InvalidRequestException("Cannot reuse a work-time entry id that belongs to another record");
                }
                target = new WorkTimeEntry(item.id(), userId, workRecordId, null, null, null, null, null);
            } else {
                target = new WorkTimeEntry(UUID.randomUUID(), userId, workRecordId, null, null, null, null, null);
            }

            UUID resolvedCategoryId = resolveCategoryId(item.categoryId(), existingCategoryIdForUnchangedCheck, userId);
            target.applyChanges(resolvedCategoryId, item.item().trim(), item.minutes(), normalizeMemo(item.memo()), position);
            toSave.add(target);
            position++;
        }

        // Anything left unclaimed was dropped by the caller.
        repository.deleteAll(existingById.values());
        return repository.saveAll(toSave);
    }

    private void validateShape(WorkTimeEntryItemRequest item) {
        if (item.categoryId() == null) {
            throw new InvalidRequestException("categoryId is required for every work-time entry");
        }
        if (item.item() == null || item.item().isBlank()) {
            throw new InvalidRequestException("item must not be blank");
        }
        if (item.minutes() == null || item.minutes() <= 0) {
            throw new InvalidRequestException("minutes must be positive");
        }
    }

    private UUID resolveCategoryId(UUID requestedCategoryId, UUID existingCategoryIdIfAny, UUID userId) {
        if (existingCategoryIdIfAny != null && existingCategoryIdIfAny.equals(requestedCategoryId)) {
            // Unchanged selection on an existing row — preserve as-is even
            // if the category has since been deactivated; never re-validate
            // (and never silently drop) a historical reference that wasn't
            // actually touched.
            return existingCategoryIdIfAny;
        }

        ActivityCategory category = categoryRepository.findByIdAndUserId(requestedCategoryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + requestedCategoryId));
        if (category.getParentId() == null) {
            throw new InvalidRequestException("A root category cannot be assigned to a work-time entry");
        }
        if (!Boolean.TRUE.equals(category.getIsActive())) {
            throw new InvalidRequestException("Only an active category can be newly assigned to a work-time entry");
        }
        return category.getId();
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
