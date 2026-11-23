ALTER TABLE work_task_events ADD COLUMN event_order bigint;

CREATE SEQUENCE work_task_event_order_seq AS bigint;

-- Existing rows keep their historical timestamps and UUID order. The default also
-- assigns an order to events inserted by the previous application during rollout.
ALTER TABLE work_task_events ALTER COLUMN event_order
    SET DEFAULT nextval('work_task_event_order_seq');
