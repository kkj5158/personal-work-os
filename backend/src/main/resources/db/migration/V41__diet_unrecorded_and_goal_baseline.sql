-- Preserve all existing check rows and goal values. Legacy goals have no inferred baseline.
ALTER TABLE diet_checks ALTER COLUMN state TYPE VARCHAR(12);
ALTER TABLE diet_checks DROP CONSTRAINT diet_checks_state_check;
ALTER TABLE diet_checks ADD CONSTRAINT diet_checks_state_check
 CHECK(state IN ('SUCCESS','FAILURE','MISSING','UNRECORDED'));
ALTER TABLE diet_global_goals ADD COLUMN baseline_date DATE;
ALTER TABLE diet_global_goals ADD COLUMN baseline_weight DOUBLE PRECISION;
ALTER TABLE diet_global_goals ADD CONSTRAINT diet_global_goals_baseline_check CHECK (
 (baseline_date IS NULL AND baseline_weight IS NULL) OR
 (baseline_date IS NOT NULL AND baseline_weight IS NOT NULL AND baseline_weight>0 AND baseline_weight<=1000000 AND target_date>baseline_date)
);
