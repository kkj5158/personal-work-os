-- One actual measured/saved time per logical record slot (MORNING / BEFORE_SLEEP).
-- Independent of the slot choice; existing rows keep NULL (unknown time).
ALTER TABLE diet_days ADD COLUMN morning_measured_at TIMESTAMPTZ;
ALTER TABLE diet_days ADD COLUMN bedtime_measured_at TIMESTAMPTZ;
