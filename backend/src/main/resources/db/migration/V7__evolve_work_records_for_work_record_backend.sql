-- ============================================================
-- Time & Work Management V7
-- Evolves the work_records table (created empty in V1, never
-- consumed by any application code since) into the confirmed
-- WorkRecord backend contract: renamed attendance values, a
-- computed stay-duration column, an applied start-time-criterion
-- snapshot, and an optimistic-locking version column.
--
-- This is a pure ALTER of the existing table, following the same
-- style already used by V3/V4 to evolve calendar_categories into
-- activity_categories — V1 itself is untouched, and no other V1
-- table is affected.
--
-- work_records was never populated by any backend code prior to
-- this migration, so the data rewrite below is safe.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Attendance status: rename PRESENT -> WORK, ANNUAL_LEAVE -> PAID_LEAVE.
--    DAY_OFF / EARLY_LEAVE / ABSENT / SICK_LEAVE are unchanged.
-- ------------------------------------------------------------

ALTER TABLE work_records DROP CONSTRAINT chk_work_records_status;

UPDATE work_records SET status = 'WORK' WHERE status = 'PRESENT';
UPDATE work_records SET status = 'PAID_LEAVE' WHERE status = 'ANNUAL_LEAVE';

ALTER TABLE work_records ALTER COLUMN status SET DEFAULT 'WORK';

ALTER TABLE work_records
    ADD CONSTRAINT chk_work_records_status
        CHECK (
            status IN (
                       'WORK',
                       'EARLY_LEAVE',
                       'DAY_OFF',
                       'PAID_LEAVE',
                       'SICK_LEAVE',
                       'ABSENT'
                )
            );

-- ------------------------------------------------------------
-- 2. Retire the pre-WorkTimeEntry manual-duration-override
--    concept. Work Log's confirmed frontend policy no longer
--    supports directly adjusting work duration — net work
--    minutes are always derived from WorkTimeEntry rows
--    (added in a later migration), never stored or overridden
--    on WorkRecord itself.
-- ------------------------------------------------------------

ALTER TABLE work_records DROP COLUMN manual_duration_minutes;

-- ------------------------------------------------------------
-- 3. Computed stay-duration (체류 시간) — recomputed server-side
--    whenever clock times change, stored like the frontend's own
--    basicWorkMinutes field.
-- ------------------------------------------------------------

ALTER TABLE work_records ADD COLUMN basic_work_minutes INTEGER;

ALTER TABLE work_records
    ADD CONSTRAINT chk_work_records_basic_work_minutes
        CHECK (
            basic_work_minutes IS NULL
                OR basic_work_minutes BETWEEN 0 AND 1440
            );

-- ------------------------------------------------------------
-- 4. Applied start-time-criterion snapshot. Deliberately three
--    plain columns, not a live foreign key to start_time_criteria
--    (StartTimeCriterion is explicitly out of scope to modify in
--    this migration, and the whole point of a snapshot is that it
--    must keep displaying correctly even if the original
--    criterion is later renamed or deactivated). Ownership of the
--    referenced criterion is validated once, at write time, in
--    the application layer.
-- ------------------------------------------------------------

ALTER TABLE work_records ADD COLUMN applied_criterion_id UUID;
ALTER TABLE work_records ADD COLUMN applied_criterion_name VARCHAR(100);
ALTER TABLE work_records ADD COLUMN applied_start_time TIME;

ALTER TABLE work_records
    ADD CONSTRAINT chk_work_records_applied_start_time
        CHECK (
            (applied_start_time IS NULL AND applied_criterion_name IS NULL)
                OR (applied_start_time IS NOT NULL AND applied_criterion_name IS NOT NULL)
            );

-- ------------------------------------------------------------
-- 5. Optimistic locking.
-- ------------------------------------------------------------

ALTER TABLE work_records ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
