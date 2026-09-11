package com.kafka.backend.lifestate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The "State Block" — independent LIFE-owned time-state data, never an
 * attribute of an Activity/Planning block (locked V1 policy §10). May
 * overlap Planning and Actual freely, but two State entries for the same
 * owner must not overlap each other (enforced in LifeStateEntryService).
 * State duration is a separate metric and is never added to WORK/LIFE
 * Actual totals.
 */
@Entity
@Table(name = "life_state_entries")
public class LifeStateEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "state_group", nullable = false)
    private StateGroup stateGroup;

    @Column(name = "label", nullable = false)
    private String label;

    @Column(name = "start_at", nullable = false)
    private OffsetDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private OffsetDateTime endAt;

    @Column(name = "memo")
    private String memo;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected LifeStateEntry() {
    }

    public LifeStateEntry(
            UUID userId, LocalDate entryDate, StateGroup stateGroup, String label,
            OffsetDateTime startAt, OffsetDateTime endAt, String memo
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.entryDate = entryDate;
        this.stateGroup = stateGroup;
        this.label = label;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
    }

    public void applyChanges(StateGroup stateGroup, String label, OffsetDateTime startAt, OffsetDateTime endAt, String memo) {
        this.stateGroup = stateGroup;
        this.label = label;
        this.startAt = startAt;
        this.endAt = endAt;
        this.memo = memo;
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

    public StateGroup getStateGroup() {
        return stateGroup;
    }

    public String getLabel() {
        return label;
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
