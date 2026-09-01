-- Half-day leave + monthly leave allowance (post-production iteration 1).
--
-- HALF_DAY is a work-included attendance status (like WORK/EARLY_LEAVE) that
-- additionally consumes 0.5 day of the user's monthly leave allowance. It is
-- distinct from EARLY_LEAVE (unplanned early finish, consumes no leave).
--
-- Monthly leave usage itself is never stored as a separate number — it is
-- always derived on demand from the work_records rows for that month
-- (PAID_LEAVE = 1.0 day, HALF_DAY = 0.5 day), so it can never drift out of
-- sync with the actual attendance history. Only the user-configured
-- *allowance* per month needs its own row, since it cannot be derived from
-- anything else.

ALTER TABLE work_records DROP CONSTRAINT chk_work_records_status;

ALTER TABLE work_records
    ADD CONSTRAINT chk_work_records_status
        CHECK (
            status IN (
                       'WORK',
                       'EARLY_LEAVE',
                       'HALF_DAY',
                       'DAY_OFF',
                       'PAID_LEAVE',
                       'SICK_LEAVE',
                       'ABSENT'
                )
            );

CREATE TABLE monthly_leave_allowances (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    leave_year INTEGER NOT NULL,
    leave_month INTEGER NOT NULL,
    -- 0.5-day granularity (full or half-day leave usage); validated again in
    -- the application layer, enforced here as a defense-in-depth backstop.
    allowance_days NUMERIC(4, 1) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_monthly_leave_allowances_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,

    -- A month explicitly configured as 0.0 must be distinguishable from a
    -- month with no row at all ("never configured") — see
    -- LeaveAllowanceService. This unique constraint is what makes "exists
    -- with 0.0" and "no row" two different, queryable states.
    CONSTRAINT uq_monthly_leave_allowances_user_month
        UNIQUE (user_id, leave_year, leave_month),

    CONSTRAINT chk_monthly_leave_allowances_month_range
        CHECK (leave_month BETWEEN 1 AND 12),

    CONSTRAINT chk_monthly_leave_allowances_non_negative
        CHECK (allowance_days >= 0),

    CONSTRAINT chk_monthly_leave_allowances_half_day_granularity
        CHECK (MOD(allowance_days * 2, 1) = 0)
);

CREATE INDEX idx_monthly_leave_allowances_user_year_month
    ON monthly_leave_allowances (user_id, leave_year, leave_month);
