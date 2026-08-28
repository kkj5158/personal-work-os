package com.kafka.backend.checklist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The permanent identity of one checklist item — the longitudinal analysis
 * axis. Renaming, re-emoji-ing, or reclassifying Core/Secondary never
 * changes this identity (a new {@link ChecklistItemVersion} is created
 * instead); only {@link #deletedAt} ever permanently retires it. See
 * docs/backend/checklist.md.
 */
@Entity
@Table(name = "checklist_items")
public class ChecklistItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "position", nullable = false)
    private Integer position;

    /** One-way tombstone — see the class doc. Never cleared once set. */
    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected ChecklistItem() {
    }

    public ChecklistItem(UUID userId, UUID categoryId, int position) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.categoryId = categoryId;
        this.position = position;
    }

    /** Category assignment takes effect immediately — never versioned. */
    public void setCategoryId(UUID categoryId) {
        this.categoryId = categoryId;
    }

    public void reorder(int position) {
        this.position = position;
    }

    public void moveToCategory(UUID categoryId, int position) {
        this.categoryId = categoryId;
        this.position = position;
    }

    public void softDelete(OffsetDateTime now) {
        this.deletedAt = now;
    }

    public boolean isDeleted() {
        return deletedAt != null;
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

    public UUID getCategoryId() {
        return categoryId;
    }

    public Integer getPosition() {
        return position;
    }

    public OffsetDateTime getDeletedAt() {
        return deletedAt;
    }
}
