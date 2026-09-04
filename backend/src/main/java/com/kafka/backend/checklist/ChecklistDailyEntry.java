package com.kafka.backend.checklist;

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
 * One day's frozen checklist snapshot AND result for one item — created by
 * {@link ChecklistSnapshotService} as soon as the item becomes eligible for
 * the parent WorkRecord's date, idempotently per (record, item) pair (never
 * duplicated once created). {@code result} (UNSET/PASS/FAIL) is the field
 * ordinary daily use changes.
 *
 * Applicability (whether this row currently counts toward statistics) is
 * deliberately never stored here — it is always derived live from the
 * parent WorkRecord's status, so a date's checklist rows automatically
 * become non-applicable (attendance changed to non-work) or re-applicable
 * (changed back) with nothing here to keep in sync.
 */
@Entity
@Table(name = "checklist_daily_entries")
public class ChecklistDailyEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "work_record_id", nullable = false, updatable = false)
    private UUID workRecordId;

    @Column(name = "item_id", nullable = false, updatable = false)
    private UUID itemId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "work_date", nullable = false, updatable = false)
    private LocalDate workDate;

    @Column(name = "name", nullable = false, updatable = false)
    private String name;

    @Column(name = "emoji", nullable = false, updatable = false)
    private String emoji;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, updatable = false)
    private ChecklistPriority priority;

    @Column(name = "goal_percent", nullable = false, updatable = false)
    private Integer goalPercent;

    @Column(name = "position", nullable = false, updatable = false)
    private Integer position;

    /** Legacy mirror of {@link #result} ({@code result == PASS}) — kept only
     *  so the pre-existing NOT NULL column stays populated; never read by
     *  new code (see {@link #getResult()}/{@link ChecklistAnalyticsService}). */
    @Column(name = "achieved", nullable = false)
    private boolean achieved;

    @Enumerated(EnumType.STRING)
    @Column(name = "result", nullable = false)
    private ChecklistResult result = ChecklistResult.UNSET;

    /** Per-date x per-item bullet memo (never a global Item description) —
     *  bullet lines newline-joined, null/blank means no memo. Plain mutable
     *  field, no versioning, matching WorkRecord.memo's own shape. */
    @Column(name = "memo")
    private String memo;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected ChecklistDailyEntry() {
    }

    public ChecklistDailyEntry(
            UUID workRecordId,
            UUID itemId,
            UUID userId,
            LocalDate workDate,
            String name,
            String emoji,
            ChecklistPriority priority,
            int goalPercent,
            int position
    ) {
        this.id = UUID.randomUUID();
        this.workRecordId = workRecordId;
        this.itemId = itemId;
        this.userId = userId;
        this.workDate = workDate;
        this.name = name;
        this.emoji = emoji;
        this.priority = priority;
        this.goalPercent = goalPercent;
        this.position = position;
        this.achieved = false;
        this.result = ChecklistResult.UNSET;
    }

    /** PASS/FAIL/UNSET action — saves immediately, no separate save step. */
    public void setResult(ChecklistResult result) {
        this.result = result;
        this.achieved = (result == ChecklistResult.PASS);
    }

    /** Debounced autosave target — {@code null}/blank means no memo. */
    public void setMemo(String memo) {
        this.memo = (memo == null || memo.isBlank()) ? null : memo;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkRecordId() {
        return workRecordId;
    }

    public UUID getItemId() {
        return itemId;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getWorkDate() {
        return workDate;
    }

    public String getName() {
        return name;
    }

    public String getEmoji() {
        return emoji;
    }

    public ChecklistPriority getPriority() {
        return priority;
    }

    public Integer getGoalPercent() {
        return goalPercent;
    }

    public Integer getPosition() {
        return position;
    }

    public boolean isAchieved() {
        return achieved;
    }

    public ChecklistResult getResult() {
        return result;
    }

    public String getMemo() {
        return memo;
    }
}
