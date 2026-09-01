package com.kafka.backend.leaveallowance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user's manually configured leave allowance for one calendar month. There
 * is no carryover between months and no accrual — this row is simply "how
 * many leave days this user has for this month," set explicitly by the user.
 *
 * Usage is never stored here or anywhere else — it is always derived on
 * demand from {@code work_records} (see {@code LeaveAllowanceService}), so it
 * can never drift out of sync with actual attendance history. A month with
 * no row here is "never configured" (annual leave / half-day cannot be
 * selected yet), distinct from a row explicitly set to {@code 0.0} (the user
 * has no leave available that month) — see
 * {@code uq_monthly_leave_allowances_user_month}.
 */
@Entity
@Table(name = "monthly_leave_allowances")
public class MonthlyLeaveAllowance {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "leave_year", nullable = false, updatable = false)
    private Integer year;

    @Column(name = "leave_month", nullable = false, updatable = false)
    private Integer month;

    @Column(name = "allowance_days", nullable = false)
    private BigDecimal allowanceDays;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected MonthlyLeaveAllowance() {
    }

    public MonthlyLeaveAllowance(UUID userId, int year, int month, BigDecimal allowanceDays) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.year = year;
        this.month = month;
        this.allowanceDays = allowanceDays;
    }

    public void setAllowanceDays(BigDecimal allowanceDays) {
        this.allowanceDays = allowanceDays;
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

    public Integer getYear() {
        return year;
    }

    public Integer getMonth() {
        return month;
    }

    public BigDecimal getAllowanceDays() {
        return allowanceDays;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
