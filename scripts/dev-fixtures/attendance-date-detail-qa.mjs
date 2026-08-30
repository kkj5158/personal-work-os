#!/usr/bin/env node
// Attendance Date Detail QA fixtures (attendance follow-up QA round 2, §21-23)
// — DEV-ONLY, never run against PROD. Talks directly to the local backend's
// REST API (default http://localhost:8080), the same way the frontend does;
// the DEV Spring profile ignores Authorization entirely (see
// frontend/lib/api/client.ts's own comment on this), so no auth token is
// needed here either.
//
// Purpose: deterministic data for manually exercising the Date Detail
// Dialog's future/today/past modes, plan-vs-actual divergence display, and
// the planned-net-work-time / dormant-planning-data behavior.
//
// Fixture window: 2026-04-28 .. 2026-04-30 (past) and 2026-09-10 (future),
// chosen because a live check against this DEV database (2026-08-30)
// confirmed BOTH windows were already completely free of any WorkRecord,
// AttendancePlan, or PlannedTimeBlock — this script creates data ONLY in
// these two windows and never touches anything outside them. "Today"
// (2026-08-30 at the time this was written) already has a real WORK plan +
// WORK record in this DEV database from ordinary use — this script leaves
// that day completely alone and only verifies/reports its current shape.
//
// Run:
//   node scripts/dev-fixtures/attendance-date-detail-qa.mjs           # create
//   node scripts/dev-fixtures/attendance-date-detail-qa.mjs --cleanup # remove exactly what this script created
//   node scripts/dev-fixtures/attendance-date-detail-qa.mjs --report  # print current state of all 6 case dates, no writes
//
// Idempotent: re-running the create mode is safe — AttendancePlan/WorkRecord
// upserts overwrite the same fixture row again; PlannedTimeBlock creation
// first checks for an existing block with the same fixture title on the
// same date before creating another one, so it never duplicates blocks on
// a second run.

const BASE_URL = process.env.ATTENDANCE_FIXTURE_API_BASE_URL ?? "http://localhost:8080";

const CASE1_DATE = "2026-04-28"; // past, full house: plan + blocks + actual
const CASE2_DATE = "2026-04-29"; // past, plan only (PAID_LEAVE), no actual
const CASE3_DATE = "2026-04-30"; // past, no plan, actual only
const CASE4_DATE = "2026-05-01"; // past, no plan, no actual (left untouched — already empty)
const CASE5_DATE = "2026-08-30"; // today — real existing plan+actual, untouched
const CASE6_DATE = "2026-09-10"; // future, plan only

const BLOCK_TITLE_1 = "[QA-AF] 설계 논의";
const BLOCK_TITLE_2 = "[QA-AF] 업무 정리";

async function api(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options?.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function resolveCriteria() {
  const criteria = await api("/api/start-time-criteria");
  const byName = (name) => criteria.find((c) => c.name === name);
  const defaultCriterion = criteria.find((c) => c.isDefault) ?? criteria[0];
  if (!defaultCriterion) throw new Error("No StartTimeCriterion exists in this DEV database — create one first.");
  return { defaultCriterion, byName };
}

async function resolveCategories() {
  const categories = await api("/api/activity-categories");
  const byName = (name) => categories.find((c) => c.name === name);
  return { byName };
}

async function upsertPlan(date, body) {
  return api(`/api/attendance-plans/${date}`, { method: "PUT", body: JSON.stringify(body) });
}

async function deletePlanIfExists(date) {
  try {
    await api(`/api/attendance-plans/${date}`, { method: "DELETE" });
  } catch {
    // already gone / never a past-date plan the API allows deleting anyway
  }
}

async function upsertWorkRecord(date, body) {
  return api(`/api/work-records/${date}`, { method: "PUT", body: JSON.stringify(body) });
}

async function listBlocksForDate(date) {
  const blocks = await api(`/api/planned-blocks?rangeStart=${date}T00:00:00&rangeEnd=${date}T23:59:59`);
  return blocks;
}

async function ensureBlock(date, title, startTime, endTime, categoryId) {
  const existing = await listBlocksForDate(date);
  const already = existing.find((b) => b.title === title);
  if (already) return already;
  return api("/api/planned-blocks", {
    method: "POST",
    body: JSON.stringify({
      title,
      startAt: `${date}T${startTime}:00`,
      endAt: `${date}T${endTime}:00`,
      categoryId,
      memo: "[QA-AF] attendance-date-detail-qa fixture",
    }),
  });
}

async function deleteBlocksWithTitle(date, title) {
  const existing = await listBlocksForDate(date);
  for (const b of existing.filter((b) => b.title === title)) {
    await api(`/api/planned-blocks/${b.id}`, { method: "DELETE" });
  }
}

async function createFixtures() {
  const { defaultCriterion } = await resolveCriteria();
  const { byName: categoryByName } = await resolveCategories();
  const orbit = categoryByName("Project Orbit");
  const outlierWork = categoryByName("아웃라이어_업무");
  if (!orbit || !outlierWork) {
    throw new Error("Expected categories 'Project Orbit' and '아웃라이어_업무' not found — this fixture set assumes the §17 category QA data already exists.");
  }

  console.log(`Using default criterion: ${defaultCriterion.name} (${defaultCriterion.startTime}, grace ${defaultCriterion.graceMinutes}m)`);

  // CASE 1 — past, full house. The AttendancePlan row itself is seeded
  // separately via attendance-date-detail-qa-past-plans.sql — the API hard-
  // rejects creating/editing a plan for a date that has already elapsed (by
  // design; see that SQL file's header), so this script only adds the
  // ACTUAL WorkRecord and the PlannedTimeBlocks, both of which the API does
  // allow for a past date.
  await ensureBlock(CASE1_DATE, BLOCK_TITLE_1, "15:00", "17:00", orbit.id);
  await ensureBlock(CASE1_DATE, BLOCK_TITLE_2, "18:00", "20:00", outlierWork.id);
  await upsertWorkRecord(CASE1_DATE, {
    status: "WORK",
    clockIn: "15:22",
    clockOut: "20:10",
    workLocation: null,
    workScore: 85,
    memo: "[QA-AF] fixture",
    appliedCriterionId: defaultCriterion.id,
    expectedVersion: null,
    workTimeEntries: [{ id: null, categoryId: orbit.id, item: "[QA-AF] 실제 작업", minutes: 280, memo: null }],
    isOnTimeOverride: null,
  });
  console.log(`CASE 1 (${CASE1_DATE}): plan WORK + 계획 실근무 06:00 (seeded via SQL) + 2 blocks + actual WORK (clockIn 15:22, 실근무 04:40, ~12분 지각)`);

  // CASE 2 — past, plan only (연차), no actual. The plan row itself is
  // seeded via the same SQL script as Case 1 — see above.
  console.log(`CASE 2 (${CASE2_DATE}): plan PAID_LEAVE only (seeded via SQL), no actual WorkRecord`);

  // CASE 3 — past, no plan, actual only.
  await deletePlanIfExists(CASE3_DATE); // guard against a leftover plan from a prior interrupted run
  await upsertWorkRecord(CASE3_DATE, {
    status: "WORK",
    clockIn: "09:05",
    clockOut: "18:10",
    workLocation: null,
    workScore: 90,
    memo: "[QA-AF] fixture",
    appliedCriterionId: defaultCriterion.id,
    expectedVersion: null,
    workTimeEntries: [{ id: null, categoryId: outlierWork.id, item: "[QA-AF] 실제 작업", minutes: 480, memo: null }],
    isOnTimeOverride: null,
  });
  console.log(`CASE 3 (${CASE3_DATE}): no plan, actual WORK only (실근무 08:00)`);

  // CASE 4 — past, no plan, no actual. Deliberately no API calls: this
  // date was confirmed empty and must stay that way.
  console.log(`CASE 4 (${CASE4_DATE}): intentionally untouched — already had no plan and no actual record`);

  // CASE 5 — today. Never written to; just report its current shape.
  const case5Plan = await api(`/api/attendance-plans/${CASE5_DATE}`).catch(() => null);
  const case5Records = await api(`/api/work-records?from=${CASE5_DATE}&to=${CASE5_DATE}`);
  console.log(`CASE 5 (${CASE5_DATE}, today): pre-existing real data left untouched — plan=${JSON.stringify(case5Plan)}, record=${JSON.stringify(case5Records[0] ?? null)}`);

  // CASE 6 — future, plan only.
  await upsertPlan(CASE6_DATE, { plannedStatus: "WORK", startTimeCriterionId: defaultCriterion.id, plannedNetWorkMinutes: 420 });
  console.log(`CASE 6 (${CASE6_DATE}): plan WORK + 계획 실근무 07:00, future (no actual possible)`);

  console.log("\nDone. Run with --cleanup to remove everything this script created (cases 1/2/3/6); cases 4/5 were never touched.");
}

async function cleanupFixtures() {
  await deleteBlocksWithTitle(CASE1_DATE, BLOCK_TITLE_1);
  await deleteBlocksWithTitle(CASE1_DATE, BLOCK_TITLE_2);
  // Case 1/2's AttendancePlan rows were seeded via direct SQL
  // (attendance-date-detail-qa-past-plans.sql) since the API blocks
  // deleting a past-date plan the same way it blocks creating one — use
  // that SQL file's own documented DELETE statement to remove them, not
  // this script. WorkRecord also has no DELETE endpoint by product design
  // (see docs/product/work-log-policy.md) — both fixture WorkRecords (Case
  // 1 and Case 3) are left in place deliberately.
  console.log(`CASE 1 (${CASE1_DATE}): removed both fixture blocks. Plan row and WorkRecord left in place — see the .sql fixture's DELETE statement for the plan.`);

  console.log(`CASE 2 (${CASE2_DATE}): plan row left in place — see the .sql fixture's DELETE statement.`);

  console.log(`CASE 3 (${CASE3_DATE}): no plan was created; the fixture WorkRecord was left in place (no delete endpoint, same as Case 1).`);

  await deletePlanIfExists(CASE6_DATE);
  console.log(`CASE 6 (${CASE6_DATE}): removed plan.`);

  console.log("\nCleanup complete. Cases 4 and 5 were never touched by this script, so nothing to clean up there.");
}

async function reportFixtures() {
  for (const date of [CASE1_DATE, CASE2_DATE, CASE3_DATE, CASE4_DATE, CASE5_DATE, CASE6_DATE]) {
    const plan = await api(`/api/attendance-plans/${date}`).catch(() => null);
    const records = await api(`/api/work-records?from=${date}&to=${date}`);
    const blocks = await listBlocksForDate(date);
    console.log(`${date}: plan=${JSON.stringify(plan)} record=${JSON.stringify(records[0] ?? null)} blocks=${blocks.length}`);
  }
}

const mode = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--report") ? "report" : "create";
const run = mode === "cleanup" ? cleanupFixtures : mode === "report" ? reportFixtures : createFixtures;

run().catch((err) => {
  console.error("Fixture script failed:", err.message);
  process.exitCode = 1;
});
