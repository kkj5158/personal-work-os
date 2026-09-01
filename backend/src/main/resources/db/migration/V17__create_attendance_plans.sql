-- AttendancePlan: future planned attendance, kept entirely separate from
-- work_records (actual outcomes). At most one plan per (user_id, plan_date).
--
-- planned_status is deliberately a subset of the existing work_records
-- status vocabulary (WORK, HALF_DAY, PAID_LEAVE, DAY_OFF) — never a
-- duplicate synonym enum. SICK_LEAVE/EARLY_LEAVE/ABSENT are actual/unplanned
-- outcomes only and are never valid here (enforced both by this CHECK and by
-- AttendancePlanService).
--
-- start_time_criterion_id is a plain UUID column, not a foreign key — the
-- same "ownership validated at write time via repository, not a DB
-- constraint" convention start_time_criteria's other consumers already use
-- (see docs/backend/start-time-criteria.md §6). Required for WORK/HALF_DAY,
-- must be null otherwise; enforced in the application layer.
CREATE TABLE attendance_plans (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    plan_date DATE NOT NULL,
    planned_status VARCHAR(30) NOT NULL,
    start_time_criterion_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_plans_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,

    CONSTRAINT uq_attendance_plans_user_date
        UNIQUE (user_id, plan_date),

    CONSTRAINT chk_attendance_plans_status
        CHECK (planned_status IN ('WORK', 'HALF_DAY', 'PAID_LEAVE', 'DAY_OFF'))
);

CREATE INDEX idx_attendance_plans_user_date
    ON attendance_plans (user_id, plan_date);
