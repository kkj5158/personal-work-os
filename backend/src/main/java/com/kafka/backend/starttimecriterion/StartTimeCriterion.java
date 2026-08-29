package com.kafka.backend.starttimecriterion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user's reusable, named start-time reference (e.g. "오후 출근" / 15:00),
 * selectable when a future WorkRecord is created. WorkRecord must snapshot
 * the applied criterion's name and start time at that moment rather than
 * referencing this row live — editing or deactivating a criterion here must
 * never retroactively change how an already-saved WorkRecord reads. See
 * docs/backend/start-time-criteria.md.
 */
@Entity
@Table(name = "start_time_criteria")
public class StartTimeCriterion {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    /**
     * At most one active criterion per user may be the default — enforced in
     * {@link StartTimeCriterionService}, backstopped by the partial unique
     * index {@code uq_start_time_criteria_default}. Today preselects this
     * criterion automatically so the user can check in without first
     * touching the criterion selector.
     */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault;

    /** Minutes of lateness grace applied on top of {@link #startTime} — see
     *  docs/backend/start-time-criteria.md. Never negative; validated in
     *  {@link StartTimeCriterionService}. */
    @Column(name = "grace_minutes", nullable = false)
    private Integer graceMinutes;

    /** Optional free-text note (e.g. "평상시 근무 기준"). */
    @Column(name = "memo")
    private String memo;

    /**
     * One-way archive tombstone — set only by {@link StartTimeCriterionService#delete}
     * when this criterion has usage history (a WorkRecord or AttendancePlan
     * references it) and can therefore never be physically deleted. Distinct
     * from {@link #isActive} (temporary, user-reversible deactivation): an
     * archived criterion is hidden from normal management/selectors and is
     * never treated as a normal reactivatable inactive record. {@code null}
     * means not archived.
     */
    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected StartTimeCriterion() {
    }

    public StartTimeCriterion(UUID userId, String name, LocalTime startTime, Integer sortOrder, Integer graceMinutes, String memo) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.startTime = startTime;
        this.sortOrder = sortOrder;
        this.isActive = true;
        this.isDefault = false;
        this.graceMinutes = graceMinutes;
        this.memo = memo;
    }

    public void update(String name, LocalTime startTime, Boolean isActive, Integer graceMinutes, String memo) {
        this.name = name;
        this.startTime = startTime;
        this.isActive = isActive;
        this.graceMinutes = graceMinutes;
        this.memo = memo;
    }

    public void markAsDefault() {
        this.isDefault = true;
    }

    public void clearDefault() {
        this.isDefault = false;
    }

    /** Selectable for a brand-new WorkRecord/AttendancePlan application —
     *  active and not archived. An already-applied/planned reference to a
     *  criterion that has since become inactive or archived remains valid
     *  and displayable; only *new* selection is gated on this. */
    public boolean isSelectableForNewUse() {
        return Boolean.TRUE.equals(isActive) && !isDeleted();
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /** One-way archive — see {@link #deletedAt}'s doc. Forces isActive/isDefault
     *  false, since an archived criterion is never selectable or default. */
    public void archive(OffsetDateTime now) {
        this.deletedAt = now;
        this.isActive = false;
        this.isDefault = false;
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

    public String getName() {
        return name;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public Boolean getIsDefault() {
        return isDefault;
    }

    public Integer getGraceMinutes() {
        return graceMinutes;
    }

    public String getMemo() {
        return memo;
    }

    public OffsetDateTime getDeletedAt() {
        return deletedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
