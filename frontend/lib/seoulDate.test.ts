// Deterministic verification for Seoul day-boundary behavior (FIX 5/FIX 7).
// The frontend has no test runner installed (no jest/vitest — see
// package.json); adding one is out of scope for a QA fix pass, so this is a
// small assert-based script runnable directly via Node's built-in
// TypeScript support (`node lib/seoulDate.test.ts`, Node 22.6+) rather than
// a framework-dependent test file.
import assert from "node:assert/strict";
import { isFutureSeoulDate, msUntilNextSeoulMidnight, seoulNow, seoulToday } from "./seoulDate.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const realDateNow = Date.now;

function withFixedUtcNow(isoUtc: string, fn: () => void) {
  const fixedMs = new Date(isoUtc).getTime();
  Date.now = () => fixedMs;
  try {
    fn();
  } finally {
    Date.now = realDateNow;
  }
}

// 2026-08-27T15:30:00Z is 2026-08-28T00:30:00+09:00 — just past Seoul
// midnight, still 2026-08-27 almost everywhere west of Seoul (including a
// browser running in UTC or US timezones).
test("seoulToday resolves the Seoul calendar date even when it has already rolled past UTC midnight-of-day boundary in reverse (UTC evening, Seoul next day)", () => {
  withFixedUtcNow("2026-08-27T15:30:00Z", () => {
    const today = seoulToday();
    assert.equal(today.getFullYear(), 2026);
    assert.equal(today.getMonth(), 7); // 0-indexed: August
    assert.equal(today.getDate(), 28);
  });
});

// 2026-08-27T14:59:00Z is 2026-08-27T23:59:00+09:00 — one minute before
// Seoul midnight.
test("seoulToday stays on the prior Seoul date one minute before Seoul midnight", () => {
  withFixedUtcNow("2026-08-27T14:59:00Z", () => {
    const today = seoulToday();
    assert.equal(today.getDate(), 27);
  });
});

test("isFutureSeoulDate treats tomorrow (Seoul) as future and today/yesterday as not future", () => {
  withFixedUtcNow("2026-08-27T15:30:00Z", () => {
    // Seoul "today" here is 2026-08-28 (see the first test above).
    const seoulTodayDate = new Date(2026, 7, 28);
    const tomorrow = new Date(2026, 7, 29);
    const yesterday = new Date(2026, 7, 27);
    assert.equal(isFutureSeoulDate(tomorrow), true);
    assert.equal(isFutureSeoulDate(seoulTodayDate), false);
    assert.equal(isFutureSeoulDate(yesterday), false);
  });
});

test("isFutureSeoulDate ignores time-of-day — a later time on today's date is still not future", () => {
  withFixedUtcNow("2026-08-27T15:30:00Z", () => {
    const laterTodaySameDate = new Date(2026, 7, 28, 23, 59, 59);
    assert.equal(isFutureSeoulDate(laterTodaySameDate), false);
  });
});

test("msUntilNextSeoulMidnight is always positive and shrinks as Seoul midnight approaches", () => {
  withFixedUtcNow("2026-08-27T14:00:00Z", () => {
    // 2026-08-27T23:00:00+09:00 — one hour before Seoul midnight.
    const oneHourOut = msUntilNextSeoulMidnight();
    assert.ok(oneHourOut > 0);
    assert.ok(oneHourOut <= 60 * 60 * 1000);
    assert.ok(oneHourOut > 59 * 60 * 1000);
  });
  withFixedUtcNow("2026-08-27T14:59:59.900Z", () => {
    // 2026-08-27T23:59:59.900+09:00 — 100ms before Seoul midnight.
    const almostThere = msUntilNextSeoulMidnight();
    assert.ok(almostThere > 0);
    assert.ok(almostThere <= 200);
  });
});

test("seoulNow's UTC getters read as Seoul wall-clock time, independent of the host's own timezone interpretation", () => {
  withFixedUtcNow("2026-01-01T00:00:00Z", () => {
    // 2026-01-01T00:00:00Z is 2026-01-01T09:00:00+09:00.
    const s = seoulNow();
    assert.equal(s.getUTCFullYear(), 2026);
    assert.equal(s.getUTCMonth(), 0);
    assert.equal(s.getUTCDate(), 1);
    assert.equal(s.getUTCHours(), 9);
  });
});
