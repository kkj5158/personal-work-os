package com.kafka.backend.checklist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A management-organization grouping for checklist items — not a
 * statistical or historical identity (see docs/backend/checklist.md).
 * Category changes take effect immediately; unlike {@link ChecklistItem},
 * there is no effective-dated version history here.
 */
@Entity
@Table(name = "checklist_categories")
public class ChecklistCategory {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "position", nullable = false)
    private Integer position;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected ChecklistCategory() {
    }

    public ChecklistCategory(UUID userId, String name, int position) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.position = position;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void reorder(int position) {
        this.position = position;
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

    public Integer getPosition() {
        return position;
    }
}
