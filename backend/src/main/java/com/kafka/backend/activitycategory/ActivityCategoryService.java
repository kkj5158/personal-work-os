package com.kafka.backend.activitycategory;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ActivityCategoryService {

    private final ActivityCategoryRepository repository;
    private final CurrentUserProvider currentUserProvider;
    private final WorkTimeEntryRepository workTimeEntryRepository;
    private final PlannedTimeBlockRepository plannedTimeBlockRepository;

    public ActivityCategoryService(
            ActivityCategoryRepository repository,
            CurrentUserProvider currentUserProvider,
            WorkTimeEntryRepository workTimeEntryRepository,
            PlannedTimeBlockRepository plannedTimeBlockRepository
    ) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
        this.workTimeEntryRepository = workTimeEntryRepository;
        this.plannedTimeBlockRepository = plannedTimeBlockRepository;
    }

    public List<ActivityCategory> list() {
        return repository.findByUserIdOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    public ActivityCategory create(String name, UUID parentId) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }

        UUID userId = currentUserProvider.getCurrentUserId();

        if (parentId == null) {
            // A root category is a grouping node only and can never be a default.
            return repository.save(new ActivityCategory(userId, name.trim(), null, false));
        }

        ActivityCategory parent = repository.findByIdAndUserId(parentId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Parent category not found: " + parentId));

        if (parent.getParentId() != null) {
            throw new InvalidRequestException(
                    "Category depth cannot exceed 2 levels; '" + parent.getName() + "' is already a child category"
            );
        }

        // First child under this parent (for this user) automatically becomes
        // the default; any later child does not. Scoped strictly to the
        // current user and this exact parent — another user's or another
        // parent's default is never consulted.
        boolean parentHasDefault = repository.findByUserIdAndParentIdAndIsDefaultTrue(userId, parentId).isPresent();

        return repository.save(new ActivityCategory(userId, name.trim(), parentId, !parentHasDefault));
    }

    /**
     * Sets {@code id} as its parent's default child. Idempotent when it is
     * already the default. Replacing an existing default clears and flushes
     * the previous one first, so the partial unique index on
     * (user_id, parent_id) WHERE is_default is never transiently violated
     * within the transaction.
     */
    @Transactional
    public ActivityCategory setDefault(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();

        ActivityCategory target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        if (target.getParentId() == null) {
            throw new InvalidRequestException("A root category cannot be set as a default");
        }
        if (!Boolean.TRUE.equals(target.getIsActive())) {
            throw new InvalidRequestException("An inactive category cannot be set as a default");
        }

        if (Boolean.TRUE.equals(target.getIsDefault())) {
            return target;
        }

        repository.findByUserIdAndParentIdAndIsDefaultTrue(userId, target.getParentId())
                .ifPresent(previousDefault -> {
                    previousDefault.clearDefault();
                    repository.saveAndFlush(previousDefault);
                });

        target.markAsDefault();
        return repository.save(target);
    }

    public ActivityCategory rename(UUID id, String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        ActivityCategory target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        target.rename(name.trim());
        return repository.save(target);
    }

    /**
     * Activating is always side-effect-free. Deactivating a category that is
     * currently its parent's default child clears the default first (in the
     * same transaction) — required by the DB CHECK constraint that a default
     * child must be active, and matching the product rule that an inactive
     * category can never remain a default.
     */
    @Transactional
    public ActivityCategory setActive(UUID id, boolean active) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ActivityCategory target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        if (active) {
            if (Boolean.TRUE.equals(target.getIsActive())) {
                return target;
            }
            target.activate();
            return repository.save(target);
        }

        if (!Boolean.TRUE.equals(target.getIsActive())) {
            return target;
        }
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            target.clearDefault();
        }
        target.deactivate();
        return repository.save(target);
    }

    /**
     * Physical deletion (pre-production final polish): safe only when
     * deleting the row cannot damage historical or persisted business data.
     * A root category may be deleted only once it has no remaining children
     * — this endpoint never cascades a child delete, so the user must
     * explicitly delete eligible children first. A child category may be
     * deleted only when nothing references it — a root itself is never
     * directly referenced by WorkTimeEntry or PlannedTimeBlock (both reject
     * a root id at assignment time), so this check only matters for
     * children. An unused default child is safe to delete outright: the
     * default flag lives on the row being removed, so there is nothing else
     * to reconcile.
     */
    @Transactional
    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ActivityCategory target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        if (target.getParentId() == null) {
            if (repository.existsByUserIdAndParentId(userId, target.getId())) {
                throw new InvalidRequestException("Category has child categories and cannot be deleted");
            }
        } else if (workTimeEntryRepository.existsByCategoryId(target.getId()) || plannedTimeBlockRepository.existsByCategoryId(target.getId())) {
            throw new InvalidRequestException("Category is referenced by existing records and cannot be deleted");
        }

        repository.delete(target);
    }
}
