package com.kafka.backend.project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A minimal Project — just enough identity for Calendar's Phase
 * selector and Project/Phase timeline to have something to group
 * Phases under. Deliberately NOT the full Project Management domain
 * (no status, no members, no task hierarchy, no progress tracking) —
 * see docs/product for the explicit V1 scope boundary.
 */
@Entity
@Table(name = "projects")
public class Project {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "color_token", nullable = false)
    private String colorToken;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected Project() {
    }

    public Project(UUID userId, String name, String colorToken) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.colorToken = colorToken;
        this.sortOrder = 0;
    }

    public void update(String name, String colorToken) {
        this.name = name;
        this.colorToken = colorToken;
    }

    public void reorder(int sortOrder) {
        this.sortOrder = sortOrder;
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

    public String getColorToken() {
        return colorToken;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
