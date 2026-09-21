-- Source timing stays in the original domain; Calendar stores only relationships.
ALTER TABLE work_time_entries ADD COLUMN execution_start_at TIMESTAMPTZ;
ALTER TABLE life_time_entries ADD COLUMN execution_start_at TIMESTAMPTZ;
ALTER TABLE work_time_entries DROP CONSTRAINT chk_work_time_entries_minutes;
ALTER TABLE work_time_entries ADD CONSTRAINT chk_work_time_entries_minutes CHECK(minutes>0 OR (minutes=0 AND execution_start_at IS NOT NULL));
ALTER TABLE life_time_entries DROP CONSTRAINT chk_life_time_entries_duration;
ALTER TABLE life_time_entries ADD CONSTRAINT chk_life_time_entries_duration CHECK(duration_minutes>0 OR (duration_minutes=0 AND execution_start_at IS NOT NULL));
ALTER TABLE work_time_entries ADD CONSTRAINT uq_execution_work_owner UNIQUE(id,user_id);
ALTER TABLE life_time_entries ADD CONSTRAINT uq_execution_life_owner UNIQUE(id,user_id);
ALTER TABLE planned_time_blocks ADD CONSTRAINT uq_execution_plan_owner UNIQUE(id,user_id);
CREATE TABLE calendar_plan_executions (
 plan_id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 work_id UUID, life_id UUID, running BOOLEAN NOT NULL DEFAULT false,
 CHECK (num_nonnulls(work_id,life_id)=1),
 FOREIGN KEY(plan_id,user_id) REFERENCES planned_time_blocks(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(work_id,user_id) REFERENCES work_time_entries(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(life_id,user_id) REFERENCES life_time_entries(id,user_id) ON DELETE CASCADE,
 UNIQUE(work_id), UNIQUE(life_id)
);
CREATE UNIQUE INDEX uq_calendar_single_running ON calendar_plan_executions(user_id) WHERE running;
ALTER TABLE calendar_plan_executions ENABLE ROW LEVEL SECURITY;

-- A Plan may be deleted after completion, but never strand a running source.
CREATE FUNCTION calendar_guard_running_plan_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM calendar_plan_executions WHERE plan_id=OLD.id AND running) THEN
  RAISE EXCEPTION '종료 또는 실행 취소 후 계획을 삭제하세요.';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER calendar_guard_running_plan_delete BEFORE DELETE ON planned_time_blocks
FOR EACH ROW EXECUTE FUNCTION calendar_guard_running_plan_delete();
