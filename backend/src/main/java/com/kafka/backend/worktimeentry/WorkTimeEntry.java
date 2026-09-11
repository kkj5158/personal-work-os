package com.kafka.backend.worktimeentry;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One additive time-log line owned by a WorkRecord. {@code categoryId} is a
 * live reference to an ActivityCategory child — unlike WorkRecord's applied
 * start-time criterion, this is never snapshotted: a category rename must
 * be reflected immediately on every entry that references it.
 * <p>
 * Unlike every other entity in this codebase, the id is supplied by the
 * caller rather than always self-generated — WorkTimeEntryService needs to
 * preserve a client-supplied id across a full-list replace so entry
 * identity survives an edit, matching the frontend's own stable
 * per-row id.
 */
@Entity
@Table(name = "work_time_entries")
public class WorkTimeEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "work_record_id", nullable = false)
    private UUID workRecordId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    @Column(name = "item", nullable = false)
    private String item;

    @Column(name = "minutes", nullable = false)
    private Integer minutes;

    @Column(name = "memo")
    private String memo;

    @Column(name = "position", nullable = false)
    private Integer position;

    /** Optional scheduling — added for the Calendar's Unscheduled Actual <->
     *  Time Grid workflow. Both null (unscheduled) or both present (same-day
     *  pair, DB-enforced); {@code minutes} remains the duration source of
     *  truth and is never recomputed from these. */
    @Column(name = "start_at")
    private OffsetDateTime startAt;

    @Column(name = "end_at")
    private OffsetDateTime endAt;

    @Column(name = "phase_id")
    private UUID phaseId;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected WorkTimeEntry() {
    }

    public WorkTimeEntry(UUID id, UUID userId, UUID workRecordId, UUID categoryId, String item, Integer minutes, String memo, Integer position) {
        this.id = id;
        this.userId = userId;
        this.workRecordId = workRecordId;
        this.categoryId = categoryId;
        this.item = item;
        this.minutes = minutes;
        this.memo = memo;
        this.position = position;
    }

    /** Does not touch startAt/endAt/phaseId — those are only changed via
     *  {@link #schedule}/{@link #unschedule}/{@link #setPhaseId}, so a
     *  WorkRecord full-list replace-all save never clobbers Calendar-assigned
     *  scheduling on an otherwise-unrelated field edit. */
    public void applyChanges(UUID categoryId, String item, Integer minutes, String memo, Integer position) {
        this.categoryId = categoryId;
        this.item = item;
        this.minutes = minutes;
        this.memo = memo;
        this.position = position;
    }

    /** Unscheduled Actual -> Time Grid: assigns start/end without changing identity. */
    public void schedule(OffsetDateTime startAt, OffsetDateTime endAt) {
        this.startAt = startAt;
        this.endAt = endAt;
    }

    /** Time Grid -> Unscheduled Actual: clears scheduling, preserves duration/identity. */
    public void unschedule() {
        this.startAt = null;
        this.endAt = null;
    }

    public void setPhaseId(UUID phaseId) {
        this.phaseId = phaseId;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void moveToWorkRecord(UUID workRecordId) {
        this.workRecordId = workRecordId;
    }

    public UUID getWorkRecordId() {
        return workRecordId;
    }

    public UUID getCategoryId() {
        return categoryId;
    }

    public String getItem() {
        return item;
    }

    public Integer getMinutes() {
        return minutes;
    }

    public String getMemo() {
        return memo;
    }

    public Integer getPosition() {
        return position;
    }

    public OffsetDateTime getStartAt() {
        return startAt;
    }

    public OffsetDateTime getEndAt() {
        return endAt;
    }

    public UUID getPhaseId() {
        return phaseId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
