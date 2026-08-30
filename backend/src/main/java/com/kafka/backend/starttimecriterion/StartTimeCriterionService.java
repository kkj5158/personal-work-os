package com.kafka.backend.starttimecriterion;

import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StartTimeCriterionService {

    private final StartTimeCriterionRepository repository;
    private final WorkRecordRepository workRecordRepository;
    private final AttendancePlanRepository attendancePlanRepository;
    private final CurrentUserProvider currentUserProvider;

    public StartTimeCriterionService(
            StartTimeCriterionRepository repository,
            WorkRecordRepository workRecordRepository,
            AttendancePlanRepository attendancePlanRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.workRecordRepository = workRecordRepository;
        this.attendancePlanRepository = attendancePlanRepository;
        this.currentUserProvider = currentUserProvider;
    }

    /** Excludes archived criteria — see {@link StartTimeCriterion#isDeleted()}. */
    public List<StartTimeCriterion> list() {
        return repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    /** 0–120 minutes — see V12's chk_start_time_criteria_grace_minutes_range,
     *  which enforces the same bound at the database level. */
    private static final int MAX_GRACE_MINUTES = 120;

    public StartTimeCriterion create(String name, LocalTime startTime, Integer graceMinutes, String memo) {
        validateName(name);
        validateStartTime(startTime);
        int resolvedGraceMinutes = validateGraceMinutes(graceMinutes);

        UUID userId = currentUserProvider.getCurrentUserId();
        int nextSortOrder = repository.findTopByUserIdOrderBySortOrderDesc(userId)
                .map(existing -> existing.getSortOrder() + 1)
                .orElse(0);

        // The first criterion a user ever creates becomes their default
        // automatically — see docs/product/work-log-policy.md's default
        // start-time-criterion invariant.
        boolean makeDefault = repository.findByUserIdAndIsDefaultTrue(userId).isEmpty();
        StartTimeCriterion criterion = new StartTimeCriterion(userId, name.trim(), startTime, nextSortOrder, resolvedGraceMinutes, normalizeMemo(memo));
        if (makeDefault) {
            criterion.markAsDefault();
        }
        return repository.save(criterion);
    }

    @Transactional
    public StartTimeCriterion update(UUID id, String name, LocalTime startTime, Boolean isActive, Integer graceMinutes, String memo) {
        validateName(name);
        validateStartTime(startTime);
        if (isActive == null) {
            throw new InvalidRequestException("isActive must not be null");
        }
        int resolvedGraceMinutes = validateGraceMinutes(graceMinutes);

        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion criterion = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));
        if (criterion.isDeleted()) {
            throw new InvalidRequestException("This criterion has been deleted and can no longer be edited");
        }

        boolean wasDefault = Boolean.TRUE.equals(criterion.getIsDefault());
        criterion.update(name.trim(), startTime, isActive, resolvedGraceMinutes, normalizeMemo(memo));

        if (wasDefault && !isActive) {
            // Deactivating the current default — maintain the invariant by
            // deterministically handing the default to another active
            // criterion, if one exists (lowest sortOrder, then name).
            criterion.clearDefault();
            StartTimeCriterion saved = repository.save(criterion);
            repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(userId, id)
                    .ifPresent(replacement -> {
                        replacement.markAsDefault();
                        repository.save(replacement);
                    });
            return saved;
        }

        StartTimeCriterion saved = repository.save(criterion);
        // Reactivating a criterion (or any other update) while the user
        // currently has no default at all — e.g. every criterion had been
        // inactive — restores the invariant by promoting this one.
        if (Boolean.TRUE.equals(isActive) && repository.findByUserIdAndIsDefaultTrue(userId).isEmpty()) {
            saved.markAsDefault();
            saved = repository.save(saved);
        }
        return saved;
    }

    /**
     * Explicitly designates {@code id} as the user's default criterion,
     * clearing whichever criterion previously held that role. Idempotent
     * when already the default. Only an active criterion may be default.
     */
    @Transactional
    public StartTimeCriterion setDefault(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));

        if (!Boolean.TRUE.equals(target.getIsActive())) {
            throw new InvalidRequestException("Only an active start time criterion can be set as default");
        }
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            return target;
        }

        repository.findByUserIdAndIsDefaultTrue(userId).ifPresent(current -> {
            current.clearDefault();
            repository.saveAndFlush(current);
        });

        target.markAsDefault();
        return repository.save(target);
    }

    /**
     * User-facing delete. A criterion with no usage history at all (never
     * applied to a WorkRecord, never referenced by an AttendancePlan) is
     * physically removed from the table. A criterion WITH history is
     * archived instead (see {@link StartTimeCriterion#archive}) — hidden
     * from normal management/selectors, never a normal reactivatable
     * inactive record, but its row remains resolvable for historical
     * display. Idempotent when already archived. Deactivating the current
     * default (either way) hands the default to another active criterion,
     * if one exists — same deterministic rule {@link #update} already uses.
     */
    @Transactional
    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion criterion = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));
        if (criterion.isDeleted()) {
            return;
        }

        boolean wasDefault = Boolean.TRUE.equals(criterion.getIsDefault());
        boolean hasHistory = workRecordRepository.existsByUserIdAndAppliedCriterionId(userId, id)
                || attendancePlanRepository.existsByUserIdAndStartTimeCriterionId(userId, id);

        if (hasHistory) {
            criterion.archive(OffsetDateTime.now(AppTimeZone.ZONE));
            repository.save(criterion);
        } else {
            repository.delete(criterion);
        }

        if (wasDefault) {
            repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(userId, id)
                    .ifPresent(replacement -> {
                        replacement.markAsDefault();
                        repository.save(replacement);
                    });
        }
    }

    /**
     * Persists a full drag-and-drop reordering of the user's own start-time
     * criteria — archived criteria are excluded from the sibling set,
     * matching {@link #list()}. {@code orderedIds} must name exactly that
     * current set (no adding/removing through this call). Presentation
     * metadata only: never touches {@code isDefault} or any WorkRecord/
     * AttendancePlan historical snapshot — the criterion selector used by
     * Work Record/Today's Work already sorts by this same sortOrder via
     * {@link #list()}, so there is no separate frontend ordering to keep in
     * sync once this persists.
     */
    @Transactional
    public void reorder(List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) {
            throw new InvalidRequestException("orderedIds must not be empty");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        List<StartTimeCriterion> siblings = repository.findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(userId);

        Map<UUID, StartTimeCriterion> byId = siblings.stream()
                .collect(Collectors.toMap(StartTimeCriterion::getId, criterion -> criterion));

        if (orderedIds.size() != byId.size() || !byId.keySet().containsAll(orderedIds)) {
            throw new InvalidRequestException("orderedIds must contain exactly the current sibling set, no more and no fewer");
        }

        for (int position = 0; position < orderedIds.size(); position++) {
            byId.get(orderedIds.get(position)).reorder(position);
        }
        repository.saveAll(byId.values());
    }

    private String normalizeMemo(String memo) {
        if (memo == null) {
            return null;
        }
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Criterion name must not be blank");
        }
    }

    private void validateStartTime(LocalTime startTime) {
        if (startTime == null) {
            throw new InvalidRequestException("Start time is required");
        }
    }

    /** {@code null} defaults to 0 (no grace), matching every pre-existing
     *  criterion's exact current behavior. */
    private int validateGraceMinutes(Integer graceMinutes) {
        if (graceMinutes == null) {
            return 0;
        }
        if (graceMinutes < 0) {
            throw new InvalidRequestException("Grace minutes must not be negative");
        }
        if (graceMinutes > MAX_GRACE_MINUTES) {
            throw new InvalidRequestException("Grace minutes must not exceed " + MAX_GRACE_MINUTES);
        }
        return graceMinutes;
    }
}
