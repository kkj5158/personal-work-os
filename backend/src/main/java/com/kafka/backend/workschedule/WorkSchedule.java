package com.kafka.backend.workschedule;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "work_schedules")
public class WorkSchedule {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "work_date", nullable = false, updatable = false)
    private LocalDate workDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "planned_status")
    private PlannedStatus plannedStatus;

    @Column(name = "planned_start_time")
    private LocalTime plannedStartTime;

    @Column(name = "grace_minutes")
    private Integer graceMinutes;

    @Column(name = "target_duration_minutes")
    private Integer targetDurationMinutes;

    @Column(name = "memo")
    private String memo;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected WorkSchedule() {
    }

    public WorkSchedule(
            UUID userId,
            LocalDate workDate,
            PlannedStatus plannedStatus,
            LocalTime plannedStartTime,
            Integer graceMinutes,
            Integer targetDurationMinutes,
            String memo
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.workDate = workDate;
        this.plannedStatus = plannedStatus;
        this.plannedStartTime = plannedStartTime;
        this.graceMinutes = graceMinutes;
        this.targetDurationMinutes = targetDurationMinutes;
        this.memo = memo;
    }

    public void applyOverrides(
            PlannedStatus plannedStatus,
            LocalTime plannedStartTime,
            Integer graceMinutes,
            Integer targetDurationMinutes,
            String memo
    ) {
        this.plannedStatus = plannedStatus;
        this.plannedStartTime = plannedStartTime;
        this.graceMinutes = graceMinutes;
        this.targetDurationMinutes = targetDurationMinutes;
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

    public LocalDate getWorkDate() {
        return workDate;
    }

    public PlannedStatus getPlannedStatus() {
        return plannedStatus;
    }

    public LocalTime getPlannedStartTime() {
        return plannedStartTime;
    }

    public Integer getGraceMinutes() {
        return graceMinutes;
    }

    public Integer getTargetDurationMinutes() {
        return targetDurationMinutes;
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
