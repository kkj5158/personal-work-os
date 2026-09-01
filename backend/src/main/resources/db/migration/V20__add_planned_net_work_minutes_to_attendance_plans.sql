-- Attendance follow-up QA round 2 (§5-7): a lightweight, optional day-level
-- planned net-work target — the planning-side counterpart to WorkRecord's
-- actual 실근무, letting a user plan "6 net hours today" WITHOUT being
-- forced to build detailed PlannedTimeBlocks. Deliberately a plain column
-- on attendance_plans, not a derived/computed value: it is explicitly NOT
-- the same source of truth as the sum of that date's PlannedTimeBlocks (see
-- PlannedTimeBlockRepository's own range query, unchanged) — the two may
-- disagree, and nothing here ever forces them to match.
--
-- NULL = not configured (an explicit "unset" state, distinct from 0 minutes
-- planned) — the application layer must never treat NULL and 0 the same way.
ALTER TABLE attendance_plans
    ADD COLUMN planned_net_work_minutes INTEGER;

-- 0 to 24 hours is the sane bound for a single day's planned net-work
-- target — mirrors the existing daily-time reference-line bound
-- (work_chart_reference_lines' "1 and 1440 minutes" rule, see
-- WorkChartReferenceLineService) rather than inventing a new range.
ALTER TABLE attendance_plans
    ADD CONSTRAINT chk_attendance_plans_planned_net_work_minutes_range
        CHECK (planned_net_work_minutes IS NULL OR (planned_net_work_minutes >= 0 AND planned_net_work_minutes <= 1440));
