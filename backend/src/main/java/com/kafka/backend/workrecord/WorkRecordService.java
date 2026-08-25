package com.kafka.backend.workrecord;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.starttimecriterion.StartTimeCriterion;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryItemRequest;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class WorkRecordService {

    private final WorkRecordRepository repository;
    private final StartTimeCriterionRepository criterionRepository;
    private final WorkTimeEntryService workTimeEntryService;
    private final CurrentUserProvider currentUserProvider;

    public WorkRecordService(
            WorkRecordRepository repository,
            StartTimeCriterionRepository criterionRepository,
            WorkTimeEntryService workTimeEntryService,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.criterionRepository = criterionRepository;
        this.workTimeEntryService = workTimeEntryService;
        this.currentUserProvider = currentUserProvider;
    }

    public List<WorkRecord> listInRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        return repository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(currentUserProvider.getCurrentUserId(), from, to);
    }

    /** Never creates a record as a side effect — a date with no saved
     *  record simply returns empty ("미입력" is a frontend-only concept). */
    public Optional<WorkRecord> find(LocalDate workDate) {
        return repository.findByUserIdAndWorkDate(currentUserProvider.getCurrentUserId(), workDate);
    }

    @Transactional
    public WorkRecord upsert(LocalDate workDate, WorkRecordRequest request) {
        if (request.status() == null) {
            throw new InvalidRequestException("Status is required");
        }
        if (request.workScore() != null && (request.workScore() < 0 || request.workScore() > 100)) {
            throw new InvalidRequestException("Work score must be between 0 and 100");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        Optional<WorkRecord> existing = repository.findByUserIdAndWorkDate(userId, workDate);

        // expectedVersion is required and must match for an update; it is
        // simply irrelevant (and ignored) the first time a date is saved.
        if (existing.isPresent() && !existing.get().getVersion().equals(request.expectedVersion())) {
            throw new OptimisticLockConflictException(
                    "Work record for " + workDate + " has changed since it was last read; reload and try again."
            );
        }

        OffsetDateTime clockInAt = null;
        OffsetDateTime clockOutAt = null;
        Integer basicWorkMinutes = null;
        UUID appliedCriterionId = null;
        String appliedCriterionName = null;
        LocalTime appliedStartTime = null;

        if (request.status().isWorkday()) {
            validateClockCombination(request.clockIn(), request.clockOut());

            if (request.clockIn() != null) {
                clockInAt = AppTimeZone.toStored(workDate.atTime(request.clockIn()));
            }
            if (request.clockOut() != null) {
                // Overnight rule: a clock-out time-of-day earlier than
                // clock-in belongs to the next local day.
                LocalDate clockOutDate = request.clockOut().isBefore(request.clockIn()) ? workDate.plusDays(1) : workDate;
                clockOutAt = AppTimeZone.toStored(clockOutDate.atTime(request.clockOut()));
                basicWorkMinutes = (int) Duration.between(clockInAt, clockOutAt).toMinutes();
            }

            if (request.appliedCriterionId() != null) {
                boolean isUnchangedSelection = existing.isPresent()
                        && request.appliedCriterionId().equals(existing.get().getAppliedCriterionId());

                if (isUnchangedSelection) {
                    // The caller re-sent the same criterion id it already had
                    // (e.g. saving an unrelated memo edit) — preserve the
                    // existing frozen snapshot exactly rather than re-reading
                    // the live criterion, which may have since been renamed,
                    // retimed, or deactivated. Re-deriving here would let an
                    // unrelated edit silently rewrite historical lateness.
                    WorkRecord existingRecord = existing.get();
                    appliedCriterionId = existingRecord.getAppliedCriterionId();
                    appliedCriterionName = existingRecord.getAppliedCriterionName();
                    appliedStartTime = existingRecord.getAppliedStartTime();
                } else {
                    // A genuinely new selection (including the first one) —
                    // snapshot the live criterion now; it must be active.
                    StartTimeCriterion criterion = criterionRepository.findByIdAndUserId(request.appliedCriterionId(), userId)
                            .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + request.appliedCriterionId()));
                    if (!Boolean.TRUE.equals(criterion.getIsActive())) {
                        throw new InvalidRequestException("Only an active start time criterion can be newly applied");
                    }
                    appliedCriterionId = criterion.getId();
                    appliedCriterionName = criterion.getName();
                    appliedStartTime = criterion.getStartTime();
                }
            }
        } else if (request.clockIn() != null || request.clockOut() != null || request.appliedCriterionId() != null) {
            throw new InvalidRequestException("Non-working attendance cannot include clock times or an applied start time criterion");
        } else if (request.workTimeEntries() != null && !request.workTimeEntries().isEmpty()) {
            throw new InvalidRequestException("Non-working attendance cannot contain work-time entries");
        }

        WorkRecord record = existing.orElseGet(() -> new WorkRecord(userId, workDate));
        record.applyChanges(
                request.status(),
                clockInAt,
                clockOutAt,
                basicWorkMinutes,
                request.workLocation(),
                request.workScore(),
                request.memo(),
                appliedCriterionId,
                appliedCriterionName,
                appliedStartTime
        );

        WorkRecord saved = repository.save(record);

        List<WorkTimeEntryItemRequest> entries = request.workTimeEntries() == null ? List.of() : request.workTimeEntries();
        workTimeEntryService.replaceAll(saved.getId(), entries);

        return saved;
    }

    private void validateClockCombination(LocalTime clockIn, LocalTime clockOut) {
        if (clockOut != null && clockIn == null) {
            throw new InvalidRequestException("Clock-out requires a clock-in time");
        }
        if (clockIn != null && clockIn.equals(clockOut)) {
            throw new InvalidRequestException("Clock-in and clock-out cannot be the same time");
        }
    }
}
