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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
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
        UUID userId = currentUserProvider.getCurrentUserId();
        Optional<WorkRecord> existing = repository.findByUserIdAndWorkDate(userId, workDate);
        return applyUpsert(workDate, request, userId, existing, false);
    }

    /**
     * 결근 정정 ("absence correction") — the same full-state upsert as
     * {@link #upsert}, but only ever on a record whose *current* status is
     * `ABSENT` (whether scheduler-generated or previously set some other
     * way), and stamps {@code absenceCorrectedAt}. A record that is no
     * longer `ABSENT` because it was already corrected once is not
     * re-eligible through this endpoint — a plain {@link #upsert} continues
     * to carry the existing correction timestamp forward unchanged.
     */
    @Transactional
    public WorkRecord correctAbsence(LocalDate workDate, WorkRecordRequest request) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkRecord existing = findExistingOrThrow(userId, workDate);
        if (existing.getStatus() != WorkAttendanceStatus.ABSENT) {
            throw new InvalidRequestException("Only a record whose current status is ABSENT can be corrected");
        }
        return applyUpsert(workDate, request, userId, Optional.of(existing), true);
    }

    private WorkRecord applyUpsert(
            LocalDate workDate,
            WorkRecordRequest request,
            UUID userId,
            Optional<WorkRecord> existing,
            boolean isCorrection
    ) {
        if (request.status() == null) {
            throw new InvalidRequestException("Status is required");
        }
        if (request.workScore() != null && (request.workScore() < 0 || request.workScore() > 100)) {
            throw new InvalidRequestException("Work score must be between 0 and 100");
        }

        // expectedVersion is required and must match for an update; it is
        // simply irrelevant (and ignored) the first time a date is saved.
        if (existing.isPresent() && !Objects.equals(existing.get().getVersion(), request.expectedVersion())) {
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
        Integer appliedGraceMinutes = null;

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
                    // retimed, regraced, or deactivated. Re-deriving here
                    // would let an unrelated edit silently rewrite historical
                    // lateness.
                    WorkRecord existingRecord = existing.get();
                    appliedCriterionId = existingRecord.getAppliedCriterionId();
                    appliedCriterionName = existingRecord.getAppliedCriterionName();
                    appliedStartTime = existingRecord.getAppliedStartTime();
                    appliedGraceMinutes = existingRecord.getAppliedGraceMinutes();
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
                    appliedGraceMinutes = criterion.getGraceMinutes();
                }
            }
        } else if (request.clockIn() != null || request.clockOut() != null || request.appliedCriterionId() != null) {
            throw new InvalidRequestException("Non-working attendance cannot include clock times or an applied start time criterion");
        } else if (request.workTimeEntries() != null && !request.workTimeEntries().isEmpty()) {
            throw new InvalidRequestException("Non-working attendance cannot contain work-time entries");
        }

        boolean isOnTimeOverride = resolveOnTimeOverride(existing, request, clockInAt, appliedCriterionId, appliedStartTime, appliedGraceMinutes);
        // A correction call always stamps "now"; an ordinary upsert simply
        // carries forward whatever the record already had (null if it was
        // never an absence, or if it was never corrected).
        OffsetDateTime absenceCorrectedAt = isCorrection
                ? OffsetDateTime.now(AppTimeZone.ZONE)
                : existing.map(WorkRecord::getAbsenceCorrectedAt).orElse(null);

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
                appliedStartTime,
                appliedGraceMinutes,
                isOnTimeOverride,
                absenceCorrectedAt
        );

        WorkRecord saved = repository.save(record);

        List<WorkTimeEntryItemRequest> entries = request.workTimeEntries() == null ? List.of() : request.workTimeEntries();
        workTimeEntryService.replaceAll(saved.getId(), entries);

        return saved;
    }

    /**
     * Server-timestamped clock-in for the current date, in {@link AppTimeZone}.
     * Only ever operates on an existing record — the record-creation
     * semantics (applying a criterion for the first time) belong to
     * {@link #upsert}, not this action. Restricted to today because a
     * server-stamped "now" would otherwise be meaningless for any other date.
     */
    @Transactional
    public WorkRecord clockIn(LocalDate workDate, WorkRecordActionRequest action) {
        requireToday(workDate, "Clock-in");
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkRecord record = findExistingOrThrow(userId, workDate);
        checkVersion(record, action.expectedVersion(), workDate);

        if (!record.getStatus().isWorkday()) {
            throw new InvalidRequestException("Only a workday status can be clocked in");
        }
        if (record.getClockInAt() != null) {
            throw new InvalidRequestException("Already clocked in for this date");
        }
        if (record.getAppliedCriterionId() == null) {
            throw new InvalidRequestException("An active start-time criterion must be applied before clocking in");
        }

        record.recordClockIn(OffsetDateTime.now(AppTimeZone.ZONE));
        return repository.save(record);
    }

    /** Server-timestamped clock-out for the current date. See {@link #clockIn}. */
    @Transactional
    public WorkRecord clockOut(LocalDate workDate, WorkRecordActionRequest action) {
        requireToday(workDate, "Clock-out");
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkRecord record = findExistingOrThrow(userId, workDate);
        checkVersion(record, action.expectedVersion(), workDate);

        if (!record.getStatus().isWorkday()) {
            throw new InvalidRequestException("Only a workday status can be clocked out");
        }
        if (record.getClockInAt() == null) {
            throw new InvalidRequestException("Cannot clock out before clocking in");
        }
        if (record.getClockOutAt() != null) {
            throw new InvalidRequestException("Already clocked out for this date");
        }

        OffsetDateTime now = OffsetDateTime.now(AppTimeZone.ZONE);
        int basicWorkMinutes = (int) Duration.between(record.getClockInAt(), now).toMinutes();
        record.recordClockOut(now, basicWorkMinutes);
        return repository.save(record);
    }

    /**
     * Clears clock-in, clock-out, the derived duration, and the on-time
     * override together — covers both the frontend's "cancel" (only
     * clock-in set) and "delete" (both set) actions, which reduce to the
     * same end state. Unlike clock-in/out, this may target any date (the
     * record-detail modal uses it on historical records too), and is
     * blocked while the record still has work-time entries, matching the
     * frontend's own rule.
     */
    @Transactional
    public WorkRecord clearClockTimes(LocalDate workDate, WorkRecordActionRequest action) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkRecord record = findExistingOrThrow(userId, workDate);
        checkVersion(record, action.expectedVersion(), workDate);

        if (record.getClockInAt() == null && record.getClockOutAt() == null) {
            throw new InvalidRequestException("No clock times to clear for this date");
        }
        if (!workTimeEntryService.findByWorkRecord(record.getId()).isEmpty()) {
            throw new InvalidRequestException("Remove this date's work-time entries before clearing its clock times");
        }

        record.clearClockTimes();
        return repository.save(record);
    }

    private WorkRecord findExistingOrThrow(UUID userId, LocalDate workDate) {
        return repository.findByUserIdAndWorkDate(userId, workDate)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No work record exists for " + workDate + "; save one (e.g. apply a start-time criterion) first"));
    }

    private void checkVersion(WorkRecord record, Integer expectedVersion, LocalDate workDate) {
        if (!Objects.equals(record.getVersion(), expectedVersion)) {
            throw new OptimisticLockConflictException(
                    "Work record for " + workDate + " has changed since it was last read; reload and try again."
            );
        }
    }

    private void requireToday(LocalDate workDate, String action) {
        if (!workDate.equals(LocalDate.now(AppTimeZone.ZONE))) {
            throw new InvalidRequestException(action + " is only allowed for the current date");
        }
    }

    private void validateClockCombination(LocalTime clockIn, LocalTime clockOut) {
        if (clockOut != null && clockIn == null) {
            throw new InvalidRequestException("Clock-out requires a clock-in time");
        }
        if (clockIn != null && clockIn.equals(clockOut)) {
            throw new InvalidRequestException("Clock-in and clock-out cannot be the same time");
        }
    }

    /**
     * The "정시 출근 처리" override is invalidated (forced back to false,
     * regardless of what the request asked for) whenever clockIn, the
     * applied criterion, or a workday-to-non-workday status change would
     * make the previous override meaningless. Otherwise, a newly *requested*
     * override is only honored when it is actually eligible: workday,
     * clocked in, a criterion applied, and genuinely late right now.
     */
    private boolean resolveOnTimeOverride(
            Optional<WorkRecord> existing,
            WorkRecordRequest request,
            OffsetDateTime clockInAt,
            UUID appliedCriterionId,
            LocalTime appliedStartTime,
            Integer appliedGraceMinutes
    ) {
        boolean requested = Boolean.TRUE.equals(request.isOnTimeOverride());

        if (existing.isPresent()) {
            WorkRecord existingRecord = existing.get();
            // Compared as a display-local, minute-truncated LocalDateTime —
            // deliberately not raw OffsetDateTime equality, for two
            // independent reasons found only by real end-to-end testing
            // against actual PostgreSQL:
            //   1. TIMESTAMPTZ does not store an offset — Postgres/the JDBC
            //      driver returns a value read back from the database
            //      normalized to a UTC ("Z") offset, while a freshly
            //      computed value here uses AppTimeZone's own +09:00. The
            //      two represent the exact same instant but are NOT
            //      OffsetDateTime.equals() (which compares local-date-time
            //      *and* offset, unlike isEqual()) — every resend of an
            //      unchanged clock-in looked like a change on the very next
            //      save after a real round-trip through the database.
            //   2. A real clock-in (the dedicated action endpoint) stamps
            //      full second/nanosecond precision, but every clock time
            //      the client can ever see or resend is "HH:MM" only — a
            //      reconstruction from that string is always exactly
            //      zero-second, so it must be truncated before comparing.
            // Neither surfaced in the mock-based unit test suite, which
            // never round-trips a real OffsetDateTime through Postgres.
            boolean clockInChanged = !Objects.equals(toComparableMinute(existingRecord.getClockInAt()), toComparableMinute(clockInAt));
            boolean criterionChanged = !Objects.equals(existingRecord.getAppliedCriterionId(), appliedCriterionId);
            boolean leftWorkday = existingRecord.getStatus().isWorkday() && !request.status().isWorkday();
            if (clockInChanged || criterionChanged || leftWorkday) {
                return false;
            }
        }

        if (!requested) {
            return false;
        }

        if (!request.status().isWorkday() || clockInAt == null || appliedStartTime == null) {
            throw new InvalidRequestException("On-time override is not eligible: a workday clock-in with an applied start-time criterion is required");
        }
        LocalTime clockIn = AppTimeZone.toDisplay(clockInAt).toLocalTime();
        int clockInMinutes = clockIn.getHour() * 60 + clockIn.getMinute();
        int effectiveThresholdMinutes = appliedStartTime.getHour() * 60 + appliedStartTime.getMinute()
                + (appliedGraceMinutes != null ? appliedGraceMinutes : 0);
        if (clockInMinutes - effectiveThresholdMinutes <= 0) {
            throw new InvalidRequestException("On-time override is not eligible: this clock-in is not late");
        }
        return true;
    }

    /**
     * Normalizes an OffsetDateTime for equality comparison across a real
     * database round-trip: converts to the application's display-local
     * {@link java.time.LocalDateTime} (side-stepping Postgres TIMESTAMPTZ's
     * offset-representation quirk — see the caller's comment) and truncates
     * to the minute (side-stepping the dedicated clock-in action's
     * sub-minute precision that a "HH:MM"-only client can never resend).
     */
    private static LocalDateTime toComparableMinute(OffsetDateTime value) {
        return value == null ? null : AppTimeZone.toDisplay(value).truncatedTo(ChronoUnit.MINUTES);
    }
}
