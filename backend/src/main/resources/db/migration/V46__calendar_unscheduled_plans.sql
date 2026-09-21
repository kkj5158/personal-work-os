ALTER TABLE planned_time_blocks ADD COLUMN plan_date DATE;
UPDATE planned_time_blocks SET plan_date=(start_at AT TIME ZONE 'Asia/Seoul')::date;
ALTER TABLE planned_time_blocks ALTER COLUMN plan_date SET NOT NULL;
ALTER TABLE planned_time_blocks ALTER COLUMN start_at DROP NOT NULL;
ALTER TABLE planned_time_blocks ALTER COLUMN end_at DROP NOT NULL;
ALTER TABLE planned_time_blocks ADD CONSTRAINT chk_plan_time_pair CHECK ((start_at IS NULL)=(end_at IS NULL));
CREATE INDEX idx_plan_unscheduled_date ON planned_time_blocks(user_id,plan_date) WHERE start_at IS NULL;
