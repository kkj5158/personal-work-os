-- Existing observations remain untouched and unscheduled. Only newly inserted raws enroll.
ALTER TABLE money_raw_notifications ADD COLUMN processing_due_at TIMESTAMPTZ;
ALTER TABLE money_raw_notifications ADD COLUMN processing_reason VARCHAR(80);
ALTER TABLE money_raw_notifications ALTER COLUMN processing_due_at SET DEFAULT now();
CREATE INDEX idx_money_due ON money_raw_notifications(processing_due_at,user_id)
    WHERE processing_due_at IS NOT NULL;
-- Transaction-time now() can tie multiple deliberate attempts inside one transaction.
ALTER TABLE money_parse_attempts ALTER COLUMN created_at SET DEFAULT clock_timestamp();
