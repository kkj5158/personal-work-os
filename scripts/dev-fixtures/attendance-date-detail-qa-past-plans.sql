-- Attendance Date Detail QA fixtures — past AttendancePlan rows (§21-23).
-- DEV ONLY. NEVER run against the prod database.
--
-- Why this exists as raw SQL instead of API calls (like the rest of this
-- fixture set, in attendance-date-detail-qa.mjs): AttendancePlanService
-- hard-rejects creating OR editing a plan for any date before "today" —
-- this is the exact immutability rule the dormant-planning feature exists
-- to protect (see docs/product/work-attendance-management-design.md). A
-- genuinely historical AttendancePlan can therefore only ever exist because
-- it was created while its date was still current/future and time passed —
-- there is no sanctioned API path to backfill one after the fact. This
-- script exists solely to seed that otherwise-unreachable state for manual
-- QA of the Date Detail Dialog's past/read-only behavior.
--
-- Fixture window: 2026-04-28 and 2026-04-29 — confirmed empty of any
-- WorkRecord/AttendancePlan/PlannedTimeBlock via a live API check against
-- this DEV database before use (see attendance-date-detail-qa.mjs's header
-- for the full case mapping). This script only INSERTs into that verified-
-- empty window; it never touches any other row.
--
-- No user UUID or credential is hardcoded here (per project policy) — pass
-- both as psql variables at run time:
--
--   psql "$(echo "$DEV_DB_URL" | sed 's#^jdbc:##')" \
--     -v dev_user_id="'$APP_DEV_USER_ID'" \
--     -f scripts/dev-fixtures/attendance-date-detail-qa-past-plans.sql
--
-- (DEV_DB_URL/DEV_DB_USERNAME/DEV_DB_PASSWORD/APP_DEV_USER_ID are the exact
-- same env vars backend/src/main/resources/application-dev.yml already
-- requires — see that file.)

-- CASE 1 (2026-04-28): WORK plan with the user's default StartTimeCriterion
-- and a 06:00 계획 실근무 target — pairs with the actual WorkRecord + two
-- PlannedTimeBlocks the .mjs script creates via the normal API for the same
-- date.
INSERT INTO attendance_plans (id, user_id, plan_date, planned_status, start_time_criterion_id, planned_net_work_minutes)
SELECT gen_random_uuid(), :dev_user_id, DATE '2026-04-28', 'WORK', c.id, 360
FROM start_time_criteria c
WHERE c.user_id = :dev_user_id AND c.is_default = true AND c.deleted_at IS NULL
ON CONFLICT (user_id, plan_date) DO NOTHING;

-- CASE 2 (2026-04-29): PAID_LEAVE plan, no criterion needed, no
-- plannedNetWorkMinutes — a plan-only past date with no actual WorkRecord.
INSERT INTO attendance_plans (id, user_id, plan_date, planned_status, start_time_criterion_id, planned_net_work_minutes)
VALUES (gen_random_uuid(), :dev_user_id, DATE '2026-04-29', 'PAID_LEAVE', NULL, NULL)
ON CONFLICT (user_id, plan_date) DO NOTHING;

-- To remove exactly these two rows later:
--   DELETE FROM attendance_plans WHERE user_id = :dev_user_id AND plan_date IN (DATE '2026-04-28', DATE '2026-04-29');
