package com.kafka.backend.checklist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One effective-dated definition of a {@link ChecklistItem} — name, emoji,
 * priority, whether it counts as active, and an optional per-item goal
 * override. The version whose {@code effectiveFrom} is the latest one on or
 * before a given date is that date's applicable definition; a row already
 * applying (effectiveFrom strictly before today) is immutable — see
 * ChecklistItemService.
 */
@Entity
@Table(name = "checklist_item_versions")
public class ChecklistItemVersion {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "item_id", nullable = false, updatable = false)
    private UUID itemId;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "emoji", nullable = false)
    private String emoji;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false)
    private ChecklistPriority priority;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    /** {@code null} = uses the global default goal effective on the same date. */
    @Column(name = "goal_override_percent")
    private Integer goalOverridePercent;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected ChecklistItemVersion() {
    }

    public ChecklistItemVersion(
            UUID itemId,
            LocalDate effectiveFrom,
            String name,
            String emoji,
            ChecklistPriority priority,
            boolean active,
            Integer goalOverridePercent
    ) {
        this.id = UUID.randomUUID();
        this.itemId = itemId;
        this.effectiveFrom = effectiveFrom;
        this.name = name;
        this.emoji = emoji;
        this.priority = priority;
        this.active = active;
        this.goalOverridePercent = goalOverridePercent;
    }

    public void update(String name, String emoji, ChecklistPriority priority, boolean active, Integer goalOverridePercent) {
        this.name = name;
        this.emoji = emoji;
        this.priority = priority;
        this.active = active;
        this.goalOverridePercent = goalOverridePercent;
    }

    public UUID getId() {
        return id;
    }

    public UUID getItemId() {
        return itemId;
    }

    public LocalDate getEffectiveFrom() {
        return effectiveFrom;
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

    public boolean isActive() {
        return active;
    }

    public Integer getGoalOverridePercent() {
        return goalOverridePercent;
    }
}
