-- Additive provenance only; source-domain Actual rows remain the statistics authority.
ALTER TABLE planned_time_blocks ADD COLUMN converted_source_type VARCHAR(40);
ALTER TABLE planned_time_blocks ADD COLUMN converted_source_id UUID;
ALTER TABLE planned_time_blocks ADD COLUMN preferred_actual_source_type VARCHAR(40);
ALTER TABLE planned_time_blocks ADD COLUMN retained_duration_minutes INTEGER;
CREATE UNIQUE INDEX uq_calendar_converted_source ON planned_time_blocks(user_id, converted_source_type, converted_source_id) WHERE converted_source_id IS NOT NULL;
