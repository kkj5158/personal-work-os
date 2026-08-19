package com.kafka.backend.plannedtimeblock;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "planned_time_blocks")
public class PlannedTimeBlock {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "start_at", nullable = false)
    private OffsetDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private OffsetDateTime endAt;

    @Column(name = "memo")
    private String memo;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected PlannedTimeBlock() {
    }

    public PlannedTimeBlock(
            UUID userId,
            String title,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            UUID categoryId,
            String memo
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.title = title;
        this.startAt = startAt;
        this.endAt = endAt;
        this.categoryId = categoryId;
        this.memo = memo;
    }

    public void update(String title, OffsetDateTime startAt, OffsetDateTime endAt, UUID categoryId, String memo) {
        this.title = title;
        this.startAt = startAt;
        this.endAt = endAt;
        this.categoryId = categoryId;
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

    public UUID getCategoryId() {
        return categoryId;
    }

    public String getTitle() {
        return title;
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
