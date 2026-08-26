-- Marks a WorkRecord as having been created by the ABSENT backfill
-- scheduler (as opposed to a user directly saving/setting ABSENT, or any
-- other status). Used together with the future absence_corrected_at column
-- (see V11) to distinguish "automatically absent, uncorrected" from
-- "corrected" for statistics and UI display.
ALTER TABLE work_records
    ADD COLUMN absence_auto_generated BOOLEAN NOT NULL DEFAULT false;
