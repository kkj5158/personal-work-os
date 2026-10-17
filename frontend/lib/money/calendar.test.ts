import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, applyTemplate, calendarComposition, calendarDates, changeCalendarMonth, dailyEarnings, directEarnings, confirmedEarnings, legacyWageReview, earningsDetails, earningsDraft, kstDate, newWorkRecord, nonWorkingRecord, offTemplateId, settlement, validateWork, workDraftForDate, workMinutes, type WorkMonth, type WorkTemplate } from "./calendar";

test("spending composition groups categories and income preserves distinct sources", () => {
  const items = [{ categoryId: "food", counterpartyText: "가게 A", amount: 100, count: 1 }, { categoryId: "food", counterpartyText: "가게 B", amount: -20, count: 1 }];
  assert.deepEqual(calendarComposition(items, false), [{ categoryId: "food", counterpartyText: null, amount: 80, count: 2 }]);
  assert.deepEqual(calendarComposition(items, true), items);
});
test("confirmed daily components reject negative or fractional KRW and agree with weekly additive math", () => {
  for (const values of [[0, 0, 0], [168560, 15000, 5000], [999999999999, 0, 0], [1200, 300, 1500]]) {
    const result = dailyEarnings(...values as [number, number, number]); assert.equal(result.valid, true); assert.equal(result.total, values[0] + values[1] - values[2]);
  }
  for (const values of [[0, 0, 1], [-1, 0, 0], [1, 0.1, 0], [NaN, 0, 0], [999999999999, 1, 0]]) assert.equal(dailyEarnings(...values as [number, number, number]).valid, false);
  const days = [[168560, 15000, 5000], [40000, 0, 1000]];
  const sumDaily = days.reduce((sum, day) => sum + dailyEarnings(...day as [number, number, number]).total, 0) + 30000 + 40000;
  assert.equal(sumDaily, 168560 + 40000 + 30000 + 40000 + 15000 - 5000 - 1000);
  const legacy = { ...newWorkRecord("2026-10-15", "2026-10-15", "legacy"), version: 1, expectedAmount: 65000 };
  assert.equal(earningsDraft(legacy).confirmedDailyPay, null); assert.equal(earningsDraft(legacy).expectedAmount, 65000); assert.equal(earningsDraft({ ...legacy, version: 0 }).confirmedDailyPay, null);
});

test("direct wages retain V2 take-home and included incentives without recomputing snapshots", () => {
  const v2 = { ...newWorkRecord("2026-10-02", "2026-10-17", "v2"), version: 2, wageModel: "CONFIRMED_V2", basePay: 42520, dailyIncentive: 2000, totalDeduction: 6110, confirmedDailyPay: 38410 };
  assert.deepEqual(earningsDraft(v2), v2); assert.equal(confirmedEarnings(v2), true);
  assert.deepEqual(directEarnings(38410, 2000), { total: 38410, valid: true });
  assert.deepEqual(directEarnings(38410, 0), { total: 38410, valid: true });
  for (const incentive of [-1, 38411, 0.5, NaN]) assert.equal(directEarnings(38410, incentive).valid, false);
  assert.equal(confirmedEarnings({ ...v2, wageModel: "CONFIRMED_DIRECT_V3" }), true);
  assert.deepEqual(earningsDetails().map(row => row[0]), ["확정 일급 합계", "+ 특근수당", "+ 주휴수당", "인센 합계 (포함 내역)"]);
});

test("legacy review is limited to active unconfirmed historical working records", () => {
  const legacy = { ...newWorkRecord("2026-10-02", "2026-10-17", "legacy"), version: 1, expectedAmount: 42140 };
  assert.equal(legacyWageReview(legacy, "2026-10-17"), true);
  for (const status of ["OFF", "CANCELLED"] as const) assert.equal(legacyWageReview({ ...legacy, status }, "2026-10-17"), false);
  assert.equal(legacyWageReview({ ...legacy, removed: true }, "2026-10-17"), false);
  assert.equal(legacyWageReview({ ...legacy, status: "SCHEDULED", workDate: "2026-10-18" }, "2026-10-17"), false);
  assert.equal(legacyWageReview({ ...legacy, status: "SCHEDULED", workDate: "2026-10-17" }, "2026-10-17"), false);
  for (const wageModel of ["CONFIRMED_V2", "CONFIRMED_DIRECT_V3"]) assert.equal(legacyWageReview({ ...legacy, wageModel, confirmedDailyPay: 38410 }, "2026-10-17"), false);
});

test("Monday calendars cover every day once with 28/35/42 cells across leap years", () => {
  for (let year = 2024; year <= 2028; year++) for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, "0")}`, dates = calendarDates(key);
    assert.ok([28, 35, 42].includes(dates.length)); assert.equal(new Set(dates).size, dates.length);
    assert.equal(new Date(dates[0] + "T00:00:00Z").getUTCDay(), 1);
    assert.equal(new Date(dates.at(-1)! + "T00:00:00Z").getUTCDay(), 0);
    assert.equal(dates.filter(date => date.startsWith(key)).length, new Date(Date.UTC(year, month, 0)).getUTCDate());
    dates.slice(1).forEach((date, index) => assert.equal(date, addDays(dates[index], 1)));
  }
  assert.equal(calendarDates("2021-02").length, 28);
  assert.equal(changeCalendarMonth("2026-12", 1), "2027-01");
});
test("KST rolls over at UTC 15:00 and overnight requires explicit next-day flag", () => {
  assert.equal(kstDate(new Date("2026-10-14T14:59:59Z")), "2026-10-14");
  assert.equal(kstDate(new Date("2026-10-14T15:00:00Z")), "2026-10-15");
  assert.equal(workMinutes("22:00", "02:30", 30, true), 240);
  assert.ok(Number.isNaN(workMinutes("22:00", "02:30", 30, false)));
  assert.ok(Number.isNaN(workMinutes("09:00", "18:00", 600, false)));
  assert.ok(Number.isNaN(workMinutes("09:00", "18:00", 0, true)));
  assert.ok(Number.isNaN(workMinutes("24:00", "02:00", 0, true)));
});
test("four explicit zeros confirm no allowances; incomplete and excess remain unconfirmed", () => {
  assert.deepEqual(settlement(371700, [10000, 24000, 18000, 5000]), { sum: 57000, base: 314700, valid: true });
  assert.equal(settlement(100, [0, 0, 0, 0]).valid, true);
  for (const values of [[null, 0, 0, 0], [-1, 0, 0, 0], [1.5, 0, 0, 0], [101, 0, 0, 0]]) assert.equal(settlement(100, values).valid, false);
});
test("template changes and per-day expected edits preserve saved snapshots and payments", () => {
  const template: WorkTemplate = { id: "template", version: 1, name: "야간", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "", groupName: "2조", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본", amount: 65000, active: true }] };
  const historical = newWorkRecord("2026-10-10", "2026-10-15", "stable-id", template);
  const snapshot = structuredClone(historical); template.name = "수정 이름"; template.presets[0].amount = 66000;
  assert.deepEqual(historical, snapshot);
  const edited = { ...historical, expectedAmount: 70000 }; assert.equal(template.presets[0].amount, 66000); assert.equal(edited.presetAmount, 65000);
  assert.equal(applyTemplate(historical, template).expectedAmount, 66000);
  assert.equal(validateWork({ ...historical, payments: [{ id: "p1", depositDate: "2026-10-12", amount: 20000 }, { id: "p2", depositDate: "2026-10-14", amount: 45000 }] }, "2026-10-15"), "");
  assert.equal(validateWork({ ...historical, payments: [{ id: "p1", depositDate: "2026-10-09", amount: 1 }] }, "2026-10-15"), "", "immutable legacy deposit rows are outside daily pay editing");
  assert.match(validateWork({ ...historical, workDate: "2026-10-16", status: "COMPLETED" }, "2026-10-15"), /미래/);
});
test("work calendar alone starts Sunday and covers active full weeks across month and leap boundaries", () => {
  for (let year = 2024; year <= 2028; year++) for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, "0")}`, dates = calendarDates(key, "sunday");
    assert.ok([28, 35, 42].includes(dates.length)); assert.equal(new Set(dates).size, dates.length);
    assert.equal(new Date(dates[0] + "T00:00:00Z").getUTCDay(), 0); assert.equal(new Date(dates.at(-1)! + "T00:00:00Z").getUTCDay(), 6);
    assert.equal(dates.filter(date => date.startsWith(key)).length, new Date(Date.UTC(year, month, 0)).getUTCDate());
    dates.slice(1).forEach((date, index) => assert.equal(date, addDays(dates[index], 1)));
  }
  assert.equal(calendarDates("2026-10", "sunday")[0], "2026-09-27"); assert.equal(calendarDates("2026-10")[0], "2026-09-28");
});
test("built-in OFF zeros pay/timing and ordinary template restores date-appropriate work without stale values", () => {
  const normal: WorkTemplate = { id: "normal", version: 1, name: "야간", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset", presets: [{ id: "preset", name: "일급", amount: 65000, active: true }] };
  const off: WorkTemplate = { ...normal, id: offTemplateId, name: "🏠 휴무", builtIn: "OFF", durationMinutes: 0, startTime: null, endTime: null, overnight: false, presets: [] };
  const historical = { ...newWorkRecord("2026-10-16", "2026-10-15", "stable", normal), payments: [{ id: "legacy", depositDate: "2026-10-17", amount: 65000 }] };
  const dayOff = applyTemplate(historical, off, "2026-10-15");
  assert.equal(dayOff.status, "OFF"); assert.equal(dayOff.templateId, null); assert.equal(dayOff.presetId, null); assert.equal(dayOff.expectedAmount, 0); assert.equal(dayOff.durationMinutes, 0); assert.equal(dayOff.startTime, null); assert.equal(dayOff.endTime, null); assert.equal(dayOff.overnight, false); assert.deepEqual(dayOff.payments, historical.payments);
  assert.equal(validateWork(dayOff, "2026-10-15"), "");
  const restored = applyTemplate(dayOff, normal, "2026-10-15"); assert.equal(restored.status, "SCHEDULED"); assert.equal(restored.expectedAmount, 65000); assert.equal(restored.durationMinutes, 240); assert.equal(restored.overnight, true);
  assert.equal(nonWorkingRecord(restored, "CANCELLED").expectedAmount, 0);
  const month: WorkMonth = { records: [], archivedRecords: [{ ...dayOff, version: 4, removed: true, memo: "old removed memo" }], weeks: [], legacyWeeks: [], summary: { completedWorkdays: 0, completedMinutes: 0, receivableAmount: 0, scheduledAmount: 0 } };
  const fresh = workDraftForDate(month, dayOff.workDate, "2026-10-15", "new-id", normal);
  assert.equal(fresh.id, "stable"); assert.equal(fresh.version, 4); assert.equal(fresh.memo, ""); assert.equal(fresh.status, "SCHEDULED"); assert.equal(fresh.expectedAmount, 65000); assert.equal(fresh.removed, true);
});
