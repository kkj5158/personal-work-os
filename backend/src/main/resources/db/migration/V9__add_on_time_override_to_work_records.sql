-- Adds the "정시 출근 처리" MVP override flag identified by the Work Log
-- frontend audit (isOnTimeOverride on WorkLogRecord). Deliberately no
-- audit/source metadata beyond the boolean itself, matching the frontend's
-- own documented MVP scope for this flag.
ALTER TABLE work_records
    ADD COLUMN is_on_time_override BOOLEAN NOT NULL DEFAULT false;
