-- Per-criterion lateness grace period (pre-production final polish).
-- Effective lateness threshold = criterion start_time + grace_minutes.
-- Existing criteria all become grace_minutes = 0 via the column default,
-- preserving their exact current lateness behavior unless a user
-- explicitly configures a grace period going forward.
ALTER TABLE start_time_criteria
    ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT 0;

-- 0 to 2 hours is a sane range for a lateness grace period — large enough
-- for any realistic policy, small enough to reject fat-fingered/nonsensical
-- input (e.g. a value meant as a clock time typed into this field).
ALTER TABLE start_time_criteria
    ADD CONSTRAINT chk_start_time_criteria_grace_minutes_range
        CHECK (grace_minutes >= 0 AND grace_minutes <= 120);

-- WorkRecord must snapshot the grace period actually applied at the moment
-- a criterion was selected, exactly like applied_start_time already does
-- for the start time itself — editing a StartTimeCriterion's grace later
-- must never retroactively change how an already-saved WorkRecord's
-- lateness is interpreted. Nullable for the same reason applied_start_time
-- is: no criterion applied means no grace snapshot either, and every
-- pre-existing row (which predates this column) has no snapshot to report,
-- so it must never be misread as "grace 0 was explicitly applied" — the
-- lateness calculation treats NULL as 0 minutes of grace, which is exactly
-- the pre-grace-period behavior these rows actually had.
ALTER TABLE work_records
    ADD COLUMN applied_grace_minutes INTEGER;
