package com.kafka.backend.checklist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One effective-dated version of the user's shared default achievement
 * goal, used by any {@link ChecklistItem} whose applicable
 * {@link ChecklistItemVersion} has no {@code goalOverridePercent}. Same
 * immutability rule as item versions — see ChecklistGoalService.
 */
@Entity
@Table(name = "checklist_global_goals")
public class ChecklistGlobalGoal {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "goal_percent", nullable = false)
    private Integer goalPercent;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected ChecklistGlobalGoal() {
    }

    public ChecklistGlobalGoal(UUID userId, LocalDate effectiveFrom, Integer goalPercent) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.effectiveFrom = effectiveFrom;
        this.goalPercent = goalPercent;
    }

    public void update(Integer goalPercent) {
        this.goalPercent = goalPercent;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getEffectiveFrom() {
        return effectiveFrom;
    }

    public Integer getGoalPercent() {
        return goalPercent;
    }
}
