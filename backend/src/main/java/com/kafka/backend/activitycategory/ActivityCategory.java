package com.kafka.backend.activitycategory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The canonical user-owned category, shared across Planning, Work Log
 * work-time entries, the future time calendar, and future plan-versus-actual
 * analytics. This is intentionally the single category model for the whole
 * application — do not create a module-specific duplicate.
 */
@Entity
@Table(name = "activity_categories")
public class ActivityCategory {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "parent_id", updatable = false)
    private UUID parentId;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "is_default", nullable = false)
    private Boolean isDefault;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected ActivityCategory() {
    }

    public ActivityCategory(UUID userId, String name, UUID parentId, Boolean isDefault) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.parentId = parentId;
        this.sortOrder = 0;
        this.isActive = true;
        this.isDefault = isDefault;
    }

    /** Called only after the previous default (if any) for the same user and
     *  parent has already been cleared and flushed — see ActivityCategoryService.setDefault. */
    public void markAsDefault() {
        this.isDefault = true;
    }

    public void clearDefault() {
        this.isDefault = false;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void activate() {
        this.isActive = true;
    }

    /** Caller must clear this category's own default status first if it is
     *  currently a default child — the DB CHECK constraint
     *  (chk_activity_categories_default_requires_active_child) forbids
     *  is_default = TRUE with is_active = FALSE on the same row. */
    public void deactivate() {
        this.isActive = false;
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

    public UUID getParentId() {
        return parentId;
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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
