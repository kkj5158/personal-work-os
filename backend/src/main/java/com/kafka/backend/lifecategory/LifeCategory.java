package com.kafka.backend.lifecategory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The LIFE-domain counterpart to ActivityCategory — a small, flat,
 * user-owned category list (exercise, appointment, errands, travel,
 * personal study, rest, household, ...). Deliberately not a
 * two-level tree like ActivityCategory: LIFE categories are not
 * expected to need parent/child grouping in V1.
 */
@Entity
@Table(name = "life_categories")
public class LifeCategory {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

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

    protected LifeCategory() {
    }

    public LifeCategory(UUID userId, String name, Boolean isDefault) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.sortOrder = 0;
        this.isActive = true;
        this.isDefault = isDefault;
    }

    public void markAsDefault() {
        this.isDefault = true;
    }

    public void clearDefault() {
        this.isDefault = false;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void reorder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public void activate() {
        this.isActive = true;
    }

    public void deactivate() {
        this.isActive = false;
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
