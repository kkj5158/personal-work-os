package com.kafka.backend.reflection;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The single WORK_OS-owned Reflection row per (user, date) — fulfills
 * notesystem.integration.ReflectionProvider, which Note System already
 * calls (previously always answering "unavailable"). {@code content}
 * autosaves while {@link ReflectionStatus#EDITING}. {@code snapshotJson} is
 * generated wholesale on every completion (never partially patched, no
 * revision history in V1) and stored as raw JSON text mapped to a native
 * {@code jsonb} column.
 * <p>
 * Has no client-assigned id (unlike WorkTimeEntry/PlannedTimeBlock), so a
 * plain {@code @Version} is safe here without WorkRecord's Persistable/isNew
 * workaround (see WorkRecord's own class doc for why that combination is
 * otherwise dangerous).
 */
@Entity
@Table(name = "reflection_entries")
public class ReflectionEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "entry_date", nullable = false, updatable = false)
    private LocalDate entryDate;

    @Column(name = "content", nullable = false)
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ReflectionStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", columnDefinition = "jsonb")
    private String snapshotJson;

    @Version
    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected ReflectionEntry() {
    }

    public ReflectionEntry(UUID userId, LocalDate entryDate) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.entryDate = entryDate;
        this.content = "";
        this.status = ReflectionStatus.EDITING;
    }

    /** Autosave while EDITING. */
    public void updateContent(String content) {
        this.content = content == null ? "" : content;
    }

    /** 회고 완료: freezes the current structured snapshot and flips to COMPLETED. */
    public void complete(String snapshotJson) {
        this.snapshotJson = snapshotJson;
        this.status = ReflectionStatus.COMPLETED;
    }

    /** 수정: returns to EDITING; autosave resumes, 회고 완료 becomes available again. */
    public void reopen() {
        this.status = ReflectionStatus.EDITING;
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

    public LocalDate getEntryDate() {
        return entryDate;
    }

    public String getContent() {
        return content;
    }

    public ReflectionStatus getStatus() {
        return status;
    }

    public String getSnapshotJson() {
        return snapshotJson;
    }

    public Integer getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
