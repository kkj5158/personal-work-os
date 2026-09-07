package com.kafka.backend.lifetime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The LIFE-domain counterpart to WorkTimeEntry/SupplementalWorkEntry —
 * actual everyday-life time (exercise, appointments, errands, travel,
 * personal study, rest, household). Deliberately its own table: LIFE
 * actual time has no owning daily record the way WORK time is owned
 * by a WorkRecord, and must never carry WORK-only fields/lifecycle.
 * <p>
 * {@code durationMinutes} is the source of truth (never recomputed
 * from start/end). {@code startAt}/{@code endAt} are optional,
 * same-day, always supplied as a pair (DB-enforced) — an entry with
 * neither is "Unscheduled Actual" and can be scheduled later without
 * changing its identity.
 */
@Entity
@Table(name = "life_time_entries")
public class LifeTimeEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(name = "life_category_id")
    private UUID lifeCategoryId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Column(name = "start_at")
    private OffsetDateTime startAt;

    @Column(name = "end_at")
    private OffsetDateTime endAt;

    @Column(name = "memo")
    private String memo;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected LifeTimeEntry() {
    }

    public LifeTimeEntry(
            UUID userId,
            LocalDate entryDate,
            UUID lifeCategoryId,
            String title,
            Integer durationMinutes,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            String memo
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.entryDate = entryDate;
        this.lifeCategoryId = lifeCategoryId;
        this.title = title;
        this.durationMinutes = durationMinutes;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
    }

    public void applyChanges(
            UUID lifeCategoryId,
            String title,
            Integer durationMinutes,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            String memo
    ) {
        this.lifeCategoryId = lifeCategoryId;
        this.title = title;
        this.durationMinutes = durationMinutes;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
    }

    /** Clears scheduling while preserving duration and identity — the
     *  Time Grid -> Unscheduled Actual direction. */
    public void unschedule() {
        this.startAt = null;
        this.endAt = null;
    }

    /** Assigns start/end to this existing record — the Unscheduled
     *  Actual -> Time Grid direction. Duration is left untouched. */
    public void schedule(OffsetDateTime startAt, OffsetDateTime endAt) {
        this.startAt = startAt;
        this.endAt = endAt;
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

    public LocalDate getEntryDate() {
        return entryDate;
    }

    public UUID getLifeCategoryId() {
        return lifeCategoryId;
    }

    public String getTitle() {
        return title;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
