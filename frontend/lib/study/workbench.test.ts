import assert from "node:assert/strict";
import { test } from "node:test";
import { weeklySlots, jobStateLabel, workerConnection } from "./workbench";
import { emptySnapshot, makePackage } from "./fixtures";
import type { EngineJob, EngineStatus } from "./engine";
const week = "2026-11-16",
  at = "2026-11-16T03:00:00Z";
const job = (
  id: string,
  state: string,
  version = 1,
  kind: EngineJob["kind"] = "GENERATE",
  updatedAt = at,
): EngineJob => ({
  id,
  kind,
  state,
  workbookId: "book",
  workbookVersion: version,
  date: week,
  week,
  updatedAt,
  attempts: 1,
  checkpoint: 0,
  receipt: {},
});
const pkg = (version = 1) => ({
  ...makePackage(
    week,
    {
      version: 1,
      format: "classic",
      explanation: "standard",
      effectiveWeek: week,
      reason: "test",
    },
    version,
  ),
  id: "book",
});
const published = (version = 1) => {
  const p = pkg(version);
  p.status = "published";
  p.questionPdf = {
    workbookId: p.id,
    workbookVersion: version,
    kind: "question",
    state: "ready",
    url: "https://example.test/question.pdf",
  };
  p.answerExplanationPdf = {
    workbookId: p.id,
    workbookVersion: version,
    kind: "answer",
    state: "ready",
    url: "https://example.test/answer.pdf",
  };
  return p;
};
test("one dated slot retains operation identities and prioritizes new review over published history", () => {
  const snapshot = { ...emptySnapshot(), packages: [published(), pkg(2)] };
  const jobs = [
    job("older", "PUBLISHED"),
    job("new-ready", "READY", 2),
    job("parallel-queued", "QUEUED", 3),
  ];
  const slots = weeklySlots(week, snapshot, jobs);
  assert.equal(slots.length, 7);
  assert.equal(slots[0].state, "action");
  assert.equal(slots[0].job?.id, "new-ready");
  assert.equal(slots[0].pkg?.version, 2);
  assert.deepEqual(
    new Set(slots[0].jobs.map((j) => j.id)),
    new Set(jobs.map((j) => j.id)),
  );
  assert.equal(slots[0].packages.length, 2);
  assert.equal(slots.filter((s) => s.state === "published").length, 0);
});
test("READY INDEX and COACH never become workbook review slots", () => {
  assert.equal(jobStateLabel(job("index", "READY", 1, "INDEX")), "분석 처리됨");
  assert.equal(jobStateLabel(job("coach", "READY", 1, "COACH")), "처리됨");
  assert.equal(
    weeklySlots(week, emptySnapshot(), [
      job("index", "READY", 1, "INDEX"),
      job("coach", "READY", 1, "COACH"),
    ])[0].state,
    "empty",
  );
});
test("render failures are actionable and incomplete PDF pairs never count as published", () => {
  const p = published();
  p.answerExplanationPdf.state = "missing";
  let slot = weeklySlots(week, { ...emptySnapshot(), packages: [p] }, [
    job("generation", "READY"),
    job("render", "FAILED", 1, "RENDER"),
  ])[0];
  assert.equal(slot.state, "failed");
  assert.equal(slot.job?.id, "render");
  slot = weeklySlots(week, { ...emptySnapshot(), packages: [p] }, [
    job("generation", "PUBLISHED"),
  ])[0];
  assert.notEqual(slot.state, "published");
});
test("retry supersedes stale same-version failure while other version failures stay visible", () => {
  let slot = weeklySlots(week, emptySnapshot(), [
    job("failed", "FAILED", 1, "RENDER", "2026-11-16T01:00:00Z"),
    job("running", "RUNNING", 1, "RENDER", "2026-11-16T02:00:00Z"),
  ])[0];
  assert.equal(slot.state, "progress");
  slot = weeklySlots(week, emptySnapshot(), [
    job("failed", "FAILED", 2, "GENERATE", "2026-11-16T01:00:00Z"),
    job("running", "RUNNING", 1, "RENDER", "2026-11-16T02:00:00Z"),
  ])[0];
  assert.equal(slot.state, "failed");
  assert.equal(slot.job?.id, "failed");
});
const status = (overrides: Partial<EngineStatus> = {}): EngineStatus => ({
  engineEnabled: true,
  workerOnline: false,
  provider: "local",
  paidProvider: "disabled",
  pdf: "ready",
  version: "v2",
  goals: {
    goal: "test",
    interests: "",
    weeklyTarget: { new: 60, review: 25, application: 15 },
  },
  jobs: [],
  workers: [],
  schedule: { enabled: false, time: "20:00", zone: "Asia/Seoul", nextRun: at },
  ...overrides,
});
test("five-minute polling differs from two-minute badge and expiry overrides stale online flag", () => {
  const now = Date.parse(at),
    worker = {
      id: "w",
      label: "worker",
      expiresAt: "2026-11-17T03:00:00Z",
      online: false,
      revoked: false,
      lastSeenAt: new Date(now - 4 * 60_000).toISOString(),
    };
  assert.equal(
    workerConnection(status({ workers: [worker] }), now).label,
    "다음 워커 확인 대기",
  );
  assert.equal(
    workerConnection(
      status({
        workers: [
          { ...worker, lastSeenAt: new Date(now - 7 * 60_000).toISOString() },
        ],
      }),
      now,
    ).label,
    "워커 연결 대기",
  );
  assert.match(
    workerConnection(
      status({
        workers: [{ ...worker, expiresAt: new Date(now - 1).toISOString() }],
        workerOnline: true,
      }),
      now,
    ).detail,
    /만료/,
  );
  assert.equal(
    workerConnection(status({ workers: [{ ...worker, revoked: true }] }), now)
      .label,
    "워커 연결 대기",
  );
  assert.equal(
    workerConnection(status({ workers: [worker], workerOnline: true }), now)
      .label,
    "워커 응답 확인",
  );
});
