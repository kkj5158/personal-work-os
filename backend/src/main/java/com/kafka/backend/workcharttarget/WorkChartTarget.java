package com.kafka.backend.workcharttarget;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The user's current Daily Work chart targets (actual work time, work
 * score). Deliberately simple CURRENT values with no effective-dated
 * history — at most one row per user, always overwritten in place. See
 * REQ-04 in the post-production iteration brief.
 */
@Entity
@Table(name = "work_chart_targets")
public class WorkChartTarget {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "target_work_minutes", nullable = false)
    private Integer targetWorkMinutes;

    @Column(name = "target_score", nullable = false)
    private Integer targetScore;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected WorkChartTarget() {
    }

    public WorkChartTarget(UUID userId, Integer targetWorkMinutes, Integer targetScore) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.targetWorkMinutes = targetWorkMinutes;
        this.targetScore = targetScore;
    }

    public void update(Integer targetWorkMinutes, Integer targetScore) {
        this.targetWorkMinutes = targetWorkMinutes;
        this.targetScore = targetScore;
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

    public Integer getTargetWorkMinutes() {
        return targetWorkMinutes;
    }

    public Integer getTargetScore() {
        return targetScore;
    }
}
