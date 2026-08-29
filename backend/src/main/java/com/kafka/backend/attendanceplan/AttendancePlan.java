package com.kafka.backend.attendanceplan;

import com.kafka.backend.workrecord.WorkAttendanceStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user's planned future attendance for one date — deliberately a separate
 * concept from {@link com.kafka.backend.workrecord.WorkRecord} (the actual
 * outcome). At most one plan per (user_id, plan_date). A plan is never
 * deleted merely because the date became actual (see
 * AttendancePlanReconciliation and LeaveAllowanceService) — it remains
 * readable afterward as historical "what was planned" context for the
 * Attendance History view; only an explicit user delete (or archival via
 * the reconciliation catch-up, which leaves the plan row itself untouched)
 * removes it.
 */
@Entity
@Table(name = "attendance_plans")
public class AttendancePlan {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "plan_date", nullable = false, updatable = false)
    private LocalDate planDate;

    /**
     * A subset of {@link WorkAttendanceStatus} — only WORK, HALF_DAY,
     * PAID_LEAVE, DAY_OFF are ever valid here (SICK_LEAVE/EARLY_LEAVE/ABSENT
     * are actual/unplanned-only outcomes) — validated in
     * {@link AttendancePlanService}, backstopped by
     * {@code chk_attendance_plans_status}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "planned_status", nullable = false)
    private WorkAttendanceStatus plannedStatus;

    /**
     * Required for WORK/HALF_DAY, null otherwise. A live reference (not a
     * frozen snapshot like WorkRecord's applied criterion fields) — a plan
     * is inherently tentative until it becomes an actual WorkRecord, at
     * which point WorkRecordService's own snapshot logic takes over.
     */
    @Column(name = "start_time_criterion_id")
    private UUID startTimeCriterionId;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected AttendancePlan() {
    }

    public AttendancePlan(UUID userId, LocalDate planDate) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.planDate = planDate;
    }

    public void update(WorkAttendanceStatus plannedStatus, UUID startTimeCriterionId) {
        this.plannedStatus = plannedStatus;
        this.startTimeCriterionId = startTimeCriterionId;
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

    public LocalDate getPlanDate() {
        return planDate;
    }

    public WorkAttendanceStatus getPlannedStatus() {
        return plannedStatus;
    }

    public UUID getStartTimeCriterionId() {
        return startTimeCriterionId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
