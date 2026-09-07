package com.kafka.backend.lifetime;

import com.kafka.backend.calendar.ActualOverlapChecker;
import com.kafka.backend.calendar.ActualSourceType;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class LifeTimeEntryService {

    private final LifeTimeEntryRepository repository;
    private final LifeCategoryRepository categoryRepository;
    private final CurrentUserProvider currentUserProvider;
    private final ActualOverlapChecker overlapChecker;

    public LifeTimeEntryService(
            LifeTimeEntryRepository repository,
            LifeCategoryRepository categoryRepository,
            CurrentUserProvider currentUserProvider,
            ActualOverlapChecker overlapChecker
    ) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
        this.currentUserProvider = currentUserProvider;
        this.overlapChecker = overlapChecker;
    }

    @Transactional(readOnly = true)
    public List<LifeTimeEntry> findInRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        return repository.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(
                currentUserProvider.getCurrentUserId(), from, to
        );
    }

    public LifeTimeEntry create(
            LocalDate entryDate, UUID lifeCategoryId, String title, Integer durationMinutes,
            OffsetDateTime startAt, OffsetDateTime endAt, String memo
    ) {
        validateShape(entryDate, title, durationMinutes, startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateCategoryOwnership(lifeCategoryId, userId);
        if (startAt != null) {
            overlapChecker.assertNoConflict(userId, entryDate, startAt, endAt, ActualSourceType.LIFE_TIME_ENTRY, null);
        }

        LifeTimeEntry entry = new LifeTimeEntry(userId, entryDate, lifeCategoryId, title.trim(), durationMinutes, startAt, endAt, normalizeMemo(memo));
        return repository.save(entry);
    }

    public LifeTimeEntry update(
            UUID id, UUID lifeCategoryId, String title, Integer durationMinutes,
            OffsetDateTime startAt, OffsetDateTime endAt, String memo
    ) {
        LifeTimeEntry entry = findOwned(id);
        validateShape(entry.getEntryDate(), title, durationMinutes, startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateCategoryOwnership(lifeCategoryId, userId);
        if (startAt != null) {
            overlapChecker.assertNoConflict(userId, entry.getEntryDate(), startAt, endAt, ActualSourceType.LIFE_TIME_ENTRY, id);
        }

        entry.applyChanges(lifeCategoryId, title.trim(), durationMinutes, startAt, endAt, normalizeMemo(memo));
        return repository.save(entry);
    }

    /** Unscheduled Actual -> Time Grid: assigns start/end to this existing record without changing its identity. */
    public LifeTimeEntry schedule(UUID id, java.time.LocalTime startTime, java.time.LocalTime endTime) {
        LifeTimeEntry entry = findOwned(id);
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            throw new InvalidRequestException("endTime must be after startTime");
        }
        OffsetDateTime startAt = com.kafka.backend.common.AppTimeZone.toStored(entry.getEntryDate().atTime(startTime));
        OffsetDateTime endAt = com.kafka.backend.common.AppTimeZone.toStored(entry.getEntryDate().atTime(endTime));
        UUID userId = currentUserProvider.getCurrentUserId();
        overlapChecker.assertNoConflict(userId, entry.getEntryDate(), startAt, endAt, ActualSourceType.LIFE_TIME_ENTRY, id);
        entry.schedule(startAt, endAt);
        return repository.save(entry);
    }

    /** Time Grid -> Unscheduled Actual: clears start/end, preserves duration and identity. */
    public LifeTimeEntry unschedule(UUID id) {
        LifeTimeEntry entry = findOwned(id);
        entry.unschedule();
        return repository.save(entry);
    }

    public void delete(UUID id) {
        repository.delete(findOwned(id));
    }

    private LifeTimeEntry findOwned(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Life time entry not found: " + id));
    }

    private void validateShape(LocalDate entryDate, String title, Integer durationMinutes, OffsetDateTime startAt, OffsetDateTime endAt) {
        if (entryDate == null) {
            throw new InvalidRequestException("entryDate is required");
        }
        if (title == null || title.isBlank()) {
            throw new InvalidRequestException("title must not be blank");
        }
        if (durationMinutes == null || durationMinutes <= 0) {
            throw new InvalidRequestException("durationMinutes must be positive");
        }
        if ((startAt == null) != (endAt == null)) {
            throw new InvalidRequestException("startAt and endAt must be provided together");
        }
        if (startAt != null && !endAt.isAfter(startAt)) {
            throw new InvalidRequestException("endAt must be after startAt");
        }
    }

    private void validateCategoryOwnership(UUID lifeCategoryId, UUID userId) {
        if (lifeCategoryId == null) {
            return;
        }
        categoryRepository.findByIdAndUserId(lifeCategoryId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Life category not found: " + lifeCategoryId));
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
