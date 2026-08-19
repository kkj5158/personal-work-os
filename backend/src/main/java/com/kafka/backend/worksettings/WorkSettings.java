package com.kafka.backend.worksettings;

import com.kafka.backend.workschedule.PlannedStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "work_settings")
public class WorkSettings {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "setting_year", nullable = false, updatable = false)
    private Integer settingYear;

    @Column(name = "annual_leave_allowance", nullable = false)
    private Integer annualLeaveAllowance;

    @Column(name = "sick_leave_allowance", nullable = false)
    private Integer sickLeaveAllowance;

    @Column(name = "early_leave_allowance", nullable = false)
    private Integer earlyLeaveAllowance;

    @Enumerated(EnumType.STRING)
    @Column(name = "default_planned_status", nullable = false)
    private PlannedStatus defaultPlannedStatus;

    @Column(name = "default_start_time")
    private LocalTime defaultStartTime;

    @Column(name = "default_grace_minutes", nullable = false)
    private Integer defaultGraceMinutes;

    @Column(name = "default_target_duration_minutes")
    private Integer defaultTargetDurationMinutes;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    protected WorkSettings() {
    }

    public WorkSettings(
            UUID userId,
            Integer settingYear,
            Integer annualLeaveAllowance,
            Integer sickLeaveAllowance,
            Integer earlyLeaveAllowance,
            PlannedStatus defaultPlannedStatus,
            LocalTime defaultStartTime,
            Integer defaultGraceMinutes,
            Integer defaultTargetDurationMinutes
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.settingYear = settingYear;
        this.annualLeaveAllowance = annualLeaveAllowance;
        this.sickLeaveAllowance = sickLeaveAllowance;
        this.earlyLeaveAllowance = earlyLeaveAllowance;
        this.defaultPlannedStatus = defaultPlannedStatus;
        this.defaultStartTime = defaultStartTime;
        this.defaultGraceMinutes = defaultGraceMinutes;
        this.defaultTargetDurationMinutes = defaultTargetDurationMinutes;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Integer getSettingYear() {
        return settingYear;
    }

    public Integer getAnnualLeaveAllowance() {
        return annualLeaveAllowance;
    }

    public Integer getSickLeaveAllowance() {
        return sickLeaveAllowance;
    }

    public Integer getEarlyLeaveAllowance() {
        return earlyLeaveAllowance;
    }

    public PlannedStatus getDefaultPlannedStatus() {
        return defaultPlannedStatus;
    }

    public LocalTime getDefaultStartTime() {
        return defaultStartTime;
    }

    public Integer getDefaultGraceMinutes() {
        return defaultGraceMinutes;
    }

    public Integer getDefaultTargetDurationMinutes() {
        return defaultTargetDurationMinutes;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
