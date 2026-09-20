package com.kafka.backend.worktimeentry;

import com.kafka.backend.activitycategory.ActivityCategory;
import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.calendar.ActualOverlapChecker;
import com.kafka.backend.calendar.ActualSourceType;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.ActivityTiming;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Objects;
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
    private final WorkRecordRepository workRecordRepository;
    private final ActualOverlapChecker overlapChecker;

    public WorkTimeEntryService(
            WorkTimeEntryRepository repository,
            ActivityCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider,
            WorkRecordRepository workRecordRepository,
            ActualOverlapChecker overlapChecker
    ) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
        this.workRecordRepository = workRecordRepository;
        this.overlapChecker = overlapChecker;
    }

    @Transactional(readOnly = true)
    public List<WorkTimeEntry> findByWorkRecord(UUID workRecordId) {
        return repository.findByWorkRecordIdOrderByPositionAsc(workRecordId);
    }

    @Transactional(readOnly = true)
    public Map<UUID, List<WorkTimeEntry>> findByWorkRecordIds(List<UUID> workRecordIds) {
        if (workRecordIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, List<WorkTimeEntry>> entriesByWorkRecordId = new HashMap<>();
        for (WorkTimeEntry entry : repository.findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(workRecordIds)) {
            entriesByWorkRecordId.computeIfAbsent(entry.getWorkRecordId(), ignored -> new ArrayList<>()).add(entry);
        }
        return entriesByWorkRecordId;
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
            WorkTimeEntry previous=existingById.get(item.id());
            boolean timingUnchanged=previous!=null && ((previous.getExecutionStartAt()!=null && item.startTime()==null && item.endTime()==null && item.minutes()!=null && item.minutes()==0) || (previous.getStartAt()!=null && Objects.equals(AppTimeZone.toDisplay(previous.getStartAt()).toLocalTime(),item.startTime()) && Objects.equals(AppTimeZone.toDisplay(previous.getEndAt()).toLocalTime(),item.endTime())));
            validateShape(item,timingUnchanged);

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
            if (Boolean.TRUE.equals(item.timingProvided()) || item.startTime() != null || item.endTime() != null) {
                int minutes = timingUnchanged ? previous.getMinutes() : ActivityTiming.duration(item.minutes(), item.startTime(), item.endTime());
                target.applyChanges(resolvedCategoryId, item.item().trim(), minutes, normalizeMemo(item.memo()), position);
                if (item.startTime() == null) target.unschedule();
                else {
                    WorkRecord record = workRecordRepository.findById(workRecordId)
                            .orElseThrow(() -> new ResourceNotFoundException("Work record not found: " + workRecordId));
                    target.schedule(AppTimeZone.toStored(record.getWorkDate().atTime(item.startTime())),
                            AppTimeZone.toStored(record.getWorkDate().atTime(item.endTime())));
                }
            } else if (target.getStartAt() != null) {
                // Older clients omit scheduling: preserve the interval and its derived duration.
                target.schedule(target.getStartAt(), target.getEndAt());
            }
            toSave.add(target);
            position++;
        }

        // Anything left unclaimed was dropped by the caller.
        repository.deleteAll(existingById.values());
        return repository.saveAll(toSave);
    }

    private void validateShape(WorkTimeEntryItemRequest item, boolean timingUnchanged) {
        if (item.categoryId() == null) {
            throw new InvalidRequestException("categoryId is required for every work-time entry");
        }
        if (item.item() == null || item.item().isBlank()) {
            throw new InvalidRequestException("item must not be blank");
        }
        if(!timingUnchanged)ActivityTiming.duration(item.minutes(), item.startTime(), item.endTime());
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

    /** Unscheduled Actual -> Time Grid: assigns start/end to an existing entry, validated cross-domain. */
    public WorkTimeEntry schedule(UUID id, LocalTime startTime, LocalTime endTime) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkTimeEntry entry = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Work time entry not found: " + id));
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            throw new InvalidRequestException("endTime must be after startTime");
        }
        ActivityTiming.duration(entry.getMinutes(), startTime, endTime);
        WorkRecord workRecord = workRecordRepository.findById(entry.getWorkRecordId())
                .orElseThrow(() -> new ResourceNotFoundException("Work record not found: " + entry.getWorkRecordId()));

        OffsetDateTime startAt = AppTimeZone.toStored(workRecord.getWorkDate().atTime(startTime));
        OffsetDateTime endAt = AppTimeZone.toStored(workRecord.getWorkDate().atTime(endTime));
        overlapChecker.assertNoConflict(userId, workRecord.getWorkDate(), startAt, endAt, ActualSourceType.WORK_TIME_ENTRY, id);

        entry.schedule(startAt, endAt);
        return repository.save(entry);
    }

    /** Time Grid -> Unscheduled Actual: clears scheduling, preserves duration/identity. */
    public WorkTimeEntry unschedule(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkTimeEntry entry = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Work time entry not found: " + id));
        entry.unschedule();
        return repository.save(entry);
    }

    public WorkTimeEntry setPhase(UUID id, UUID phaseId) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkTimeEntry entry = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Work time entry not found: " + id));
        entry.setPhaseId(phaseId);
        return repository.save(entry);
    }
}
