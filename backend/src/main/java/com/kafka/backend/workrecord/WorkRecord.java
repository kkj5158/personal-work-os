package com.kafka.backend.workrecord;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import jakarta.persistence.Version;
import org.springframework.data.domain.Persistable;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user's actual attendance/work outcome for one local work date. At most
 * one row exists per (user_id, work_date) — enforced by
 * uq_work_records_user_date. Absence of a row is a distinct, non-absence
 * state ("미입력" on the frontend) from an explicit ABSENT row; this class
 * never infers one from the other. See docs/backend/work-record.md.
 *
 * Implements {@link Persistable} deliberately: this entity has a
 * client-assigned {@code id} (like every other entity in this codebase)
 * <em>and</em> a {@code @Version} column — the one combination that breaks
 * Spring Data JPA's default new-vs-existing detection. Without
 * {@link Persistable}, that detection falls back to "is {@code version}
 * null," which only works if a freshly-constructed entity's version is
 * actually left null (see the constructor). An earlier version of this
 * class seeded {@code version = 0} at construction (purely to make
 * mock-based unit tests convenient, so a bare {@code new WorkRecord(...)}
 * standing in for "an existing row" had a non-null version to compare
 * against a caller-supplied {@code expectedVersion}) — but a non-null
 * version on an entity Hibernate has never persisted breaks *both* possible
 * paths against a real database: {@code merge()} throws
 * {@code StaleObjectStateException} ("Row was already updated or deleted by
 * another transaction," since merge() takes a non-null version as proof the
 * row must already exist), and even after routing to {@code persist()} via
 * {@link Persistable#isNew()}, Hibernate's own transient/detached
 * determination independently checks the version field's nullness and
 * throws {@code InvalidDataAccessApiUsageException: Detached entity passed
 * to persist} for the same reason. Neither surfaces in a mock-based unit
 * test (which stubs {@code repository.save()} directly, never exercising
 * real Hibernate semantics) — only a real-database HTTP smoke test catches
 * it, which is exactly how this was found. The fix is both parts together:
 * {@link Persistable} so Spring Data routes a genuinely new entity to
 * {@code persist()}, and leaving {@code version} null in the constructor so
 * Hibernate agrees it's transient. {@code WorkRecordService} compares
 * versions null-safely so a null version never risks an NPE.
 */
@Entity
@Table(name = "work_records")
public class WorkRecord implements Persistable<UUID> {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Not a persisted column — see the class doc. True until this
     *  instance is actually persisted or loaded from the database. */
    @Transient
    private boolean isNew = true;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "work_date", nullable = false, updatable = false)
    private LocalDate workDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private WorkAttendanceStatus status;

    @Column(name = "clock_in_at")
    private OffsetDateTime clockInAt;

    @Column(name = "clock_out_at")
    private OffsetDateTime clockOutAt;

    @Column(name = "basic_work_minutes")
    private Integer basicWorkMinutes;

    @Column(name = "work_location")
    private String workLocation;

    @Column(name = "work_score")
    private Integer workScore;

    @Column(name = "memo")
    private String memo;

    /**
     * Frozen at the moment the criterion was applied — never a live
     * reference. Editing or deactivating the original StartTimeCriterion
     * must never change what an already-saved WorkRecord displays.
     */
    @Column(name = "applied_criterion_id")
    private UUID appliedCriterionId;

    @Column(name = "applied_criterion_name")
    private String appliedCriterionName;

    @Column(name = "applied_start_time")
    private LocalTime appliedStartTime;

    /**
     * "정시 출근 처리" MVP override — forces the displayed lateness to
     * on-time regardless of the raw clock-in-vs-criterion comparison.
     * Deliberately no source/audit metadata, matching the frontend's
     * documented MVP scope. The service layer is responsible for clearing
     * this whenever clockIn, the applied criterion, or a workday-to-non-workday
     * status change invalidates it — see WorkRecordService.
     */
    @Column(name = "is_on_time_override", nullable = false)
    private boolean isOnTimeOverride;

    /**
     * True only for an ABSENT row created by the absence backfill
     * scheduler (never for a user-set ABSENT, and never changed once set)
     * — see {@link #createAbsence}. Used to distinguish an automatically
     * generated absence from any other record for statistics/UI display.
     */
    @Column(name = "absence_auto_generated", nullable = false)
    private boolean absenceAutoGenerated;

    /**
     * Set (and reset) only by a 결근 정정 ("absence correction") call —
     * {@code null} means never corrected. Preserved untouched across later
     * ordinary edits to the same record. See {@code WorkRecordService.correctAbsence}.
     */
    @Column(name = "absence_corrected_at")
    private OffsetDateTime absenceCorrectedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected WorkRecord() {
    }

    public WorkRecord(UUID userId, LocalDate workDate) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.workDate = workDate;
        this.status = WorkAttendanceStatus.WORK;
        // Deliberately left null, matching Hibernate's own expectation for a
        // genuinely transient entity — see the class doc. A previous version
        // of this constructor seeded `version = 0` here (to match the DB
        // column's own DEFAULT 0) so a freshly constructed entity was safe
        // to compare against a caller-supplied expectedVersion without an
        // NPE. That seeding was wrong: a non-null version on an entity
        // Hibernate has never persisted makes both merge() (StaleObjectStateException)
        // and persist() (InvalidDataAccessApiUsageException: "Detached
        // entity passed to persist") fail against a real database — this
        // only ever surfaced against real Postgres, never in mock-based
        // unit tests. WorkRecordService now compares versions null-safely
        // instead.
    }

    /**
     * Factory for the absence backfill scheduler only — an explicit,
     * fully-empty ABSENT row for a past date that had no record at all.
     * Everything besides status/absenceAutoGenerated stays at its default
     * (no clock times, no criterion, no memo) since nothing actually
     * happened on this date to record.
     */
    public static WorkRecord createAbsence(UUID userId, LocalDate workDate) {
        WorkRecord record = new WorkRecord(userId, workDate);
        record.status = WorkAttendanceStatus.ABSENT;
        record.absenceAutoGenerated = true;
        return record;
    }

    public void applyChanges(
            WorkAttendanceStatus status,
            OffsetDateTime clockInAt,
            OffsetDateTime clockOutAt,
            Integer basicWorkMinutes,
            String workLocation,
            Integer workScore,
            String memo,
            UUID appliedCriterionId,
            String appliedCriterionName,
            LocalTime appliedStartTime,
            boolean isOnTimeOverride,
            OffsetDateTime absenceCorrectedAt
    ) {
        this.status = status;
        this.clockInAt = clockInAt;
        this.clockOutAt = clockOutAt;
        this.basicWorkMinutes = basicWorkMinutes;
        this.workLocation = workLocation;
        this.workScore = workScore;
        this.memo = memo;
        this.appliedCriterionId = appliedCriterionId;
        this.appliedCriterionName = appliedCriterionName;
        this.appliedStartTime = appliedStartTime;
        this.isOnTimeOverride = isOnTimeOverride;
        this.absenceCorrectedAt = absenceCorrectedAt;
    }

    /** Server-timestamped clock-in via the dedicated action endpoint. */
    public void recordClockIn(OffsetDateTime clockInAt) {
        this.clockInAt = clockInAt;
    }

    /** Server-timestamped clock-out via the dedicated action endpoint. */
    public void recordClockOut(OffsetDateTime clockOutAt, int basicWorkMinutes) {
        this.clockOutAt = clockOutAt;
        this.basicWorkMinutes = basicWorkMinutes;
    }

    /** Clears both clock times, the derived duration, and the on-time
     *  override together — used by the clock-times clear action endpoint. */
    public void clearClockTimes() {
        this.clockInAt = null;
        this.clockOutAt = null;
        this.basicWorkMinutes = null;
        this.isOnTimeOverride = false;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    @PostPersist
    @PostLoad
    void markNotNew() {
        this.isNew = false;
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getWorkDate() {
        return workDate;
    }

    public WorkAttendanceStatus getStatus() {
        return status;
    }

    public OffsetDateTime getClockInAt() {
        return clockInAt;
    }

    public OffsetDateTime getClockOutAt() {
        return clockOutAt;
    }

    public Integer getBasicWorkMinutes() {
        return basicWorkMinutes;
    }

    public String getWorkLocation() {
        return workLocation;
    }

    public Integer getWorkScore() {
        return workScore;
    }

    public String getMemo() {
        return memo;
    }

    public UUID getAppliedCriterionId() {
        return appliedCriterionId;
    }

    public String getAppliedCriterionName() {
        return appliedCriterionName;
    }

    public LocalTime getAppliedStartTime() {
        return appliedStartTime;
    }

    public boolean isOnTimeOverride() {
        return isOnTimeOverride;
    }

    public boolean isAbsenceAutoGenerated() {
        return absenceAutoGenerated;
    }

    public OffsetDateTime getAbsenceCorrectedAt() {
        return absenceCorrectedAt;
    }

    public Integer getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
