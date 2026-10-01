-- WORK FLOW Waiting revision (2026-10-01). Additive and backward-compatible: three nullable columns on work_tasks.
-- No existing column is rewritten. The canonical WorkTask stays the only Waiting item; there is no second entity.
--
-- waiting_agent        : Waiting execution metadata shown as 담당 Agent (NULL = 미지정). Not an assignee/collaboration field.
-- waiting_since        : when the Task entered its current WAITING period (for 평균 / 최장 대기일).
-- waiting_completed_at : set when a WAITING Task is completed from the Waiting queue. Its waiting context is kept on the
--                        row as completed Waiting history and the same Task can be reactivated (다시 대기하기).
ALTER TABLE work_tasks ADD COLUMN waiting_agent VARCHAR(16);
ALTER TABLE work_tasks ADD CONSTRAINT chk_work_tasks_waiting_agent CHECK (waiting_agent IS NULL OR waiting_agent IN ('CODEX','CLAUDE_CODE','CHATGPT','DIRECT'));
ALTER TABLE work_tasks ADD COLUMN waiting_since TIMESTAMPTZ;
ALTER TABLE work_tasks ADD COLUMN waiting_completed_at TIMESTAMPTZ;

-- Fill only the new column for Tasks that are WAITING right now: the latest WAITING event, else the last update.
UPDATE work_tasks t SET waiting_since = COALESCE(
  (SELECT max(e.created_at) FROM work_task_events e WHERE e.task_id = t.id AND e.kind = 'WAITING'), t.updated_at)
WHERE t.status = 'WAITING';
