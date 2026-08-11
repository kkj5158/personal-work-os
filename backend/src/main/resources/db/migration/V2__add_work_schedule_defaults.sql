ALTER TABLE work_settings
    ADD COLUMN default_planned_status VARCHAR(30) NOT NULL DEFAULT 'WORK',
    ADD COLUMN default_start_time TIME,
    ADD COLUMN default_grace_minutes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN default_target_duration_minutes INTEGER;

ALTER TABLE work_settings
    ADD CONSTRAINT chk_work_settings_default_status
        CHECK (
            default_planned_status IN (
                                       'WORK',
                                       'DAY_OFF',
                                       'ANNUAL_LEAVE',
                                       'SICK_LEAVE'
                )
            ),

    ADD CONSTRAINT chk_work_settings_default_grace
        CHECK (
            default_grace_minutes BETWEEN 0 AND 1440
            ),

    ADD CONSTRAINT chk_work_settings_default_target_duration
        CHECK (
            default_target_duration_minutes IS NULL
                OR default_target_duration_minutes BETWEEN 0 AND 1440
            );


-- Date-specific schedule values act as overrides.
-- NULL means "inherit the value from yearly work_settings".

ALTER TABLE work_schedules
    ALTER COLUMN planned_status DROP NOT NULL,
    ALTER COLUMN planned_status DROP DEFAULT;