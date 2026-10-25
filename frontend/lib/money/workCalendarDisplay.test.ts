import assert from "node:assert/strict";
import { test } from "node:test";
import { MoneyCache } from "./cache";
import { addDays, newWorkRecord, type EarningsMonth, type EarningsWeek } from "./calendar";
import { displayDates, displayRows, displayWeekdays, mergeDisplayData, readWeekStart, supplementalMonths, weekStartPreferenceKey } from "./workCalendarDisplay";

const week = (start: string, workplaceId = "a"): EarningsWeek => ({ start, end: addDays(start, 6), workplaceId, version: 7, baseTotal: 100000, incentiveTotal: 5000, deductionTotal: 3000, dailyTotal: 102000, finalPay: 132000, specialWorkAllowance: 10000, weeklyHolidayAllowance: 20000, legacyReviewCount: 0, dailyFingerprint: "unchanged", workEntries: [{ ...newWorkRecord(start, "2026-10-25", "sunday"), version: 2, confirmedDailyPay: 102000, receiptConfirmation: { confirmed: true, amount: 102000, revision: 1 } }] });
const month = (weeks: EarningsWeek[], records = weeks.flatMap(w => w.workEntries)): EarningsMonth => ({ weeks, records, allRecords: records, archivedRecords: [], legacyWeeks: [], legacyDepositWeeks: [], summary: { workdays: 1, workMinutes: 240, confirmedDailyPay: 102000, baseTotal: 100000, incentiveTotal: 5000, deductionTotal: 3000, legacyReviewCount: 0, legacyRecordedAmount: 0 } });

test("October 2026 layouts and settlement end anchoring preserve every original amount and receipt", () => {
  const settled = week("2026-09-27"), snapshot = JSON.stringify(settled);
  assert.deepEqual(displayWeekdays("SUNDAY"), ["일", "월", "화", "수", "목", "금", "토"]);
  assert.deepEqual(displayWeekdays("MONDAY"), ["월", "화", "수", "목", "금", "토", "일"]);
  assert.deepEqual(displayDates("2026-10", "SUNDAY").slice(0, 7), Array.from({ length: 7 }, (_, i) => addDays("2026-09-27", i)));
  const monday = displayDates("2026-10", "MONDAY");
  assert.equal(monday[0], "2026-09-28"); assert.equal(monday.at(-1), "2026-11-01");
  for (const mode of ["SUNDAY", "MONDAY", "SUNDAY", "MONDAY"] as const) {
    const rows = displayRows(displayDates("2026-10", mode), [settled]);
    assert.equal(rows.flatMap(row => row.settlements).length, 1);
    assert.equal(rows[0].settlements[0], settled); assert.equal(rows[0].settlements[0].finalPay, 132000);
    assert.equal(JSON.stringify(settled), snapshot);
  }
});

test("full-period API amounts include invisible Sunday; supplemental reads cover both month boundaries", () => {
  const settled = week("2026-09-27"), original = month([settled]);
  const extraRecord = newWorkRecord("2026-11-01", "2026-10-25", "adjacent-sunday");
  const merged = mergeDisplayData(original, [month([settled, week("2026-11-01")], [extraRecord])], displayDates("2026-10", "MONDAY"));
  assert.equal(merged.records.some(r => r.workDate === "2026-09-27"), false);
  assert.equal(merged.weeks[0].finalPay, 132000); assert.equal(merged.weeks[0].workEntries[0].workDate, "2026-09-27");
  assert.equal(merged.records[0].id, "adjacent-sunday"); assert.equal(merged.weeks.length, 2);
  assert.deepEqual(supplementalMonths("2026-10", "MONDAY"), { previous: null, next: "2026-11" });
  assert.deepEqual(supplementalMonths("2026-11", "MONDAY"), { previous: "2026-10", next: "2026-12" });
  assert.deepEqual(supplementalMonths("2026-10", "SUNDAY"), { previous: null, next: null });
});

test("4/5/6-row and leap-year calendars have unique consecutive dates including all nominal days", () => {
  for (const month of ["2021-02", "2026-08", "2026-11", "2024-02", "2027-02"]) for (const mode of ["SUNDAY", "MONDAY"] as const) {
    const dates = displayDates(month, mode); assert.ok([28, 35, 42].includes(dates.length)); assert.equal(new Set(dates).size, dates.length);
    dates.forEach((date, i) => assert.equal(date, addDays(dates[0], i)));
    assert.ok(dates.includes(month + "-01"));
  }
  assert.ok(displayDates("2024-02", "MONDAY").includes("2024-02-29"));
  assert.equal(displayDates("2021-02", "MONDAY").length, 28); assert.equal(displayDates("2026-08", "MONDAY").length, 42);
});

test("empty weeks, archived workplace facts, differing periods and multiple workplaces are retained once", () => {
  const a = week("2026-09-27"), b = { ...week("2026-09-28", "archived"), end: "2026-10-04" };
  const rows = displayRows(displayDates("2026-10", "MONDAY"), [a, b]);
  assert.deepEqual(rows[0].settlements, [a, b]); assert.equal(rows[1].settlements.length, 0);
  assert.equal(rows.flatMap(r => r.settlements).reduce((n, w) => n + w.finalPay, 0), 264000);
  const snapshot = month([a]); const merged = mergeDisplayData(snapshot, [snapshot], displayDates("2026-10", "SUNDAY"));
  assert.equal(merged.records.length, 1); assert.equal(merged.weeks.length, 1);
});

test("preference defaults Sunday, persists per account across sessions, tolerates invalid or blocked storage", () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.equal(readWeekStart(storage, "a"), "SUNDAY"); values.set(weekStartPreferenceKey("a"), "MONDAY");
  assert.equal(readWeekStart(storage, "a"), "MONDAY"); assert.equal(readWeekStart(storage, "b"), "SUNDAY");
  const cache = new MoneyCache(async () => null); cache.setScope("a:session1"); const owner = cache.preferenceOwner;
  cache.setScope("a:session2"); assert.equal(cache.preferenceOwner, owner); assert.equal(readWeekStart(storage, cache.preferenceOwner!), "MONDAY");
  cache.setScope("b:session1"); assert.equal(readWeekStart(storage, cache.preferenceOwner!), "SUNDAY"); cache.setScope(null); assert.equal(cache.preferenceOwner, null);
  values.set(weekStartPreferenceKey("a"), "invalid"); assert.equal(readWeekStart(storage, "a"), "SUNDAY");
  assert.equal(readWeekStart({ getItem() { throw Error("blocked"); } }, "a"), "SUNDAY");
});
