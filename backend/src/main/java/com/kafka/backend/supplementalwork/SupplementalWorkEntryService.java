package com.kafka.backend.supplementalwork;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class SupplementalWorkEntryService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final SupplementalWorkEntryRepository repository;
    private final ActivityCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;

    public SupplementalWorkEntryService(
            SupplementalWorkEntryRepository repository,
            ActivityCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<SupplementalWorkEntry> findByWorkRecord(UUID workRecordId) {
        return repository.findByWorkRecordIdOrderByPositionAsc(workRecordId);
    }

    @Transactional(readOnly = true)
    public Map<UUID, List<SupplementalWorkEntry>> findByWorkRecordIds(List<UUID> workRecordIds) {
        if (workRecordIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<SupplementalWorkEntry>> entriesByWorkRecordId = new HashMap<>();
        for (SupplementalWorkEntry entry : repository.findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(workRecordIds)) {
            entriesByWorkRecordId.computeIfAbsent(entry.getWorkRecordId(), ignored -> new ArrayList<>()).add(entry);
        }
        return entriesByWorkRecordId;
    }

    public static int sumMinutes(List<SupplementalWorkEntry> entries) {
        return entries.stream().mapToInt(SupplementalWorkEntry::getTotalMinutes).sum();
    }

    /**
     * Replaces the complete Supplemental Work entry list for one WorkRecord —
     * same replace-all model as {@code WorkTimeEntryService.replaceAll}.
     * Called unconditionally on every WorkRecord save regardless of
     * Attendance status: Supplemental Work is allowed under every status and
     * must survive any status transition, so — unlike WorkTimeEntry — this
     * call is never gated on {@code isWorkday()} and its presence never
     * blocks a status change.
     * <p>
     * {@code regularStartAt}/{@code regularEndAt} are the record's own
     * authoritative regular-work interval for this same save (the real
     * clock-in/clock-out being persisted this request — WorkTimeEntry carries
     * no time-of-day and is never used for this comparison); both null when
     * the record has no clock interval (non-working status, or not yet
     * clocked in/out). Every timed entry in the incoming list is validated to
     * not overlap any other timed entry in the same list, nor this interval;
     * touching boundaries are allowed. An entry with no start/end cannot be
     * overlap-validated and is always accepted.
     */
    @Transactional
    public List<SupplementalWorkEntry> replaceAll(
            UUID workRecordId,
            LocalDate workDate,
            List<SupplementalWorkEntryItemRequest> items,
            OffsetDateTime regularStartAt,
            OffsetDateTime regularEndAt
    ) {
        UUID userId = currentUserProvider.getCurrentUserId();

        List<SupplementalWorkEntry> existing = repository.findByWorkRecordIdOrderByPositionAsc(workRecordId);
        Map<UUID, SupplementalWorkEntry> existingById = new HashMap<>();
        for (SupplementalWorkEntry entry : existing) {
            existingById.put(entry.getId(), entry);
        }

        List<SupplementalWorkEntry> toSave = new ArrayList<>();
        List<TimedInterval> timedIntervals = new ArrayList<>();
        int position = 0;
        for (SupplementalWorkEntryItemRequest item : items) {
            validateShape(item);

            OffsetDateTime startAt = toStoredOrNull(workDate, item.startTime());
            OffsetDateTime endAt = toStoredOrNull(workDate, item.endTime());
            if (startAt != null) {
                validateNoOverlap(startAt, endAt, timedIntervals, regularStartAt, regularEndAt);
                timedIntervals.add(new TimedInterval(startAt, endAt));
            }

            SupplementalWorkEntry target;
            UUID existingCategoryIdForUnchangedCheck = null;

            if (item.id() != null && existingById.containsKey(item.id())) {
                target = existingById.remove(item.id());
                existingCategoryIdForUnchangedCheck = target.getCategoryId();
            } else if (item.id() != null) {
                // Not one of this record's own current rows — never let a
                // save silently adopt an id belonging to another record (or,
                // defensively, another user's row entirely).
                Optional<SupplementalWorkEntry> ownedElsewhere = repository.findByIdAndUserId(item.id(), userId);
                if (ownedElsewhere.isPresent() || repository.existsById(item.id())) {
                    throw new InvalidRequestException("Cannot reuse a supplemental work entry id that belongs to another record");
                }
                target = new SupplementalWorkEntry(item.id(), userId, workRecordId, null, null, null, null, null, null, null);
            } else {
                target = new SupplementalWorkEntry(UUID.randomUUID(), userId, workRecordId, null, null, null, null, null, null, null);
            }

            UUID resolvedCategoryId = resolveCategoryId(item.categoryId(), existingCategoryIdForUnchangedCheck, userId);
            target.applyChanges(resolvedCategoryId, item.item().trim(), item.totalMinutes(), startAt, endAt, normalizeMemo(item.memo()), position);
            toSave.add(target);
            position++;
        }

        // Anything left unclaimed was dropped by the caller.
        repository.deleteAll(existingById.values());
        return repository.saveAll(toSave);
    }

    private void validateShape(SupplementalWorkEntryItemRequest item) {
        if (item.categoryId() == null) {
            throw new InvalidRequestException("categoryId is required for every supplemental work entry");
        }
        if (item.item() == null || item.item().isBlank()) {
            throw new InvalidRequestException("item must not be blank");
        }
        if (item.totalMinutes() == null || item.totalMinutes() <= 0) {
            throw new InvalidRequestException("totalMinutes must be positive");
        }
        if ((item.startTime() == null) != (item.endTime() == null)) {
            throw new InvalidRequestException("startTime and endTime must be provided together");
        }
        if (item.startTime() != null && !item.endTime().isAfter(item.startTime())) {
            throw new InvalidRequestException("endTime must be after startTime");
        }
    }

    private OffsetDateTime toStoredOrNull(LocalDate workDate, LocalTime time) {
        return time == null ? null : AppTimeZone.toStored(workDate.atTime(time));
    }

    private void validateNoOverlap(
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            List<TimedInterval> existingTimedIntervals,
            OffsetDateTime regularStartAt,
            OffsetDateTime regularEndAt
    ) {
        for (TimedInterval other : existingTimedIntervals) {
            if (overlaps(startAt, endAt, other.startAt(), other.endAt())) {
                throw new InvalidRequestException(conflictMessage(other.startAt(), other.endAt()));
            }
        }
        if (regularStartAt != null && regularEndAt != null && overlaps(startAt, endAt, regularStartAt, regularEndAt)) {
            throw new InvalidRequestException(conflictMessage(regularStartAt, regularEndAt));
        }
    }

    /** Half-open interval overlap test (touching boundaries are allowed),
     *  matching PlannedTimeBlockService's existing pattern. isBefore/isAfter
     *  on OffsetDateTime compare the instant only, so this is correct
     *  regardless of how either side's offset happens to be represented. */
    private boolean overlaps(OffsetDateTime aStart, OffsetDateTime aEnd, OffsetDateTime bStart, OffsetDateTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private String conflictMessage(OffsetDateTime conflictStartAt, OffsetDateTime conflictEndAt) {
        LocalTime start = AppTimeZone.toDisplay(conflictStartAt).toLocalTime();
        LocalTime end = AppTimeZone.toDisplay(conflictEndAt).toLocalTime();
        return "기존 근무시간 " + start.format(TIME_FORMAT) + "~" + end.format(TIME_FORMAT) + "과 겹칩니다.";
    }

    private UUID resolveCategoryId(UUID requestedCategoryId, UUID existingCategoryIdIfAny, UUID userId) {
        if (existingCategoryIdIfAny != null && existingCategoryIdIfAny.equals(requestedCategoryId)) {
            // Unchanged selection on an existing row — preserve as-is even if
            // the category has since been deactivated; never re-validate a
            // historical reference that wasn't actually touched.
            return existingCategoryIdIfAny;
        }

        ActivityCategory category = categoryRepository.findByIdAndUserId(requestedCategoryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + requestedCategoryId));
        if (category.getParentId() == null) {
            throw new InvalidRequestException("A root category cannot be assigned to a supplemental work entry");
        }
        if (!Boolean.TRUE.equals(category.getIsActive())) {
            throw new InvalidRequestException("Only an active category can be newly assigned to a supplemental work entry");
        }
        return category.getId();
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record TimedInterval(OffsetDateTime startAt, OffsetDateTime endAt) {
    }
}
