package com.kafka.backend.supplementalwork;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One additive Supplemental Work ("보강근무") line owned by a WorkRecord —
 * additional actual-work time recorded separately from ordinary
 * {@code WorkTimeEntry} ("정규근무"), explicitly created by the user (never
 * inferred from clock times), allowed under every Attendance status, and
 * never deleted as a side effect of an Attendance transition.
 * <p>
 * Deliberately a separate entity rather than a {@code workType} discriminator
 * on {@code WorkTimeEntry}: {@code WorkTimeEntry}'s existing lifecycle
 * carries assumptions specific to regular work (no start/end fields, and its
 * mere presence blocks a working-to-non-working Attendance transition in
 * {@code WorkRecordService}) that must NOT apply here. A shared discriminator
 * would require conditionally suppressing those regular-work invariants
 * everywhere they're enforced; a parallel table with its own service is the
 * smaller, less error-prone change and keeps "must survive any Attendance
 * transition" structurally impossible to violate by accident.
 * <p>
 * {@code categoryId} is a live reference to an ActivityCategory child — never
 * snapshotted, matching {@code WorkTimeEntry}'s own category policy (a
 * category rename must be reflected immediately). {@code totalMinutes} is the
 * aggregation source of truth and is never recomputed from
 * {@code startAt}/{@code endAt} by the backend, even when both are present —
 * the frontend may prefill it from the interval, but the user's own value (if
 * different) is what gets persisted. {@code startAt}/{@code endAt} are
 * optional but always supplied as a pair (enforced by
 * {@code chk_supplemental_work_entries_start_end_pair}) and represent a
 * same-day interval (no overnight rule in this version, unlike WorkRecord's
 * clock-in/clock-out).
 * <p>
 * No {@code @Version} — like {@code WorkTimeEntry}, this avoids the
 * client-assigned-id + optimistic-locking pitfall documented on
 * {@code WorkRecord}. The owning {@code WorkRecord}'s own version is forced
 * to advance whenever this table changes (see {@code WorkRecordService}),
 * closing the same lost-update gap {@code WorkTimeEntry} already closes.
 */
@Entity
@Table(name = "supplemental_work_entries")
public class SupplementalWorkEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "work_record_id", nullable = false, updatable = false)
    private UUID workRecordId;

    @Column(name = "category_id", nullable = false)
    private UUID categoryId;

    @Column(name = "item", nullable = false)
    private String item;

    @Column(name = "total_minutes", nullable = false)
    private Integer totalMinutes;

    @Column(name = "start_at")
    private OffsetDateTime startAt;

    @Column(name = "end_at")
    private OffsetDateTime endAt;

    @Column(name = "memo")
    private String memo;

    @Column(name = "position", nullable = false)
    private Integer position;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected SupplementalWorkEntry() {
    }

    public SupplementalWorkEntry(
            UUID id,
            UUID userId,
            UUID workRecordId,
            UUID categoryId,
            String item,
            Integer totalMinutes,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            String memo,
            Integer position
    ) {
        this.id = id;
        this.userId = userId;
        this.workRecordId = workRecordId;
        this.categoryId = categoryId;
        this.item = item;
        this.totalMinutes = totalMinutes;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
        this.position = position;
    }

    public void applyChanges(
            UUID categoryId,
            String item,
            Integer totalMinutes,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            String memo,
            Integer position
    ) {
        this.categoryId = categoryId;
        this.item = item;
        this.totalMinutes = totalMinutes;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
        this.position = position;
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

    public UUID getWorkRecordId() {
        return workRecordId;
    }

    public UUID getCategoryId() {
        return categoryId;
    }

    public String getItem() {
        return item;
    }

    public Integer getTotalMinutes() {
        return totalMinutes;
    }

    public OffsetDateTime getStartAt() {
        return startAt;
    }

    public OffsetDateTime getEndAt() {
        return endAt;
    }

    public String getMemo() {
        return memo;
    }

    public Integer getPosition() {
        return position;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
