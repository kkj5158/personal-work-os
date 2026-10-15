import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, applyTemplate, calendarComposition, calendarDates, changeCalendarMonth, kstDate, newWorkRecord, settlement, validateWork, workMinutes, type WorkTemplate } from "./calendar";

test("spending composition groups categories and income preserves distinct sources", () => {
  const items = [{ categoryId: "food", counterpartyText: "가게 A", amount: 100, count: 1 }, { categoryId: "food", counterpartyText: "가게 B", amount: -20, count: 1 }];
  assert.deepEqual(calendarComposition(items, false), [{ categoryId: "food", counterpartyText: null, amount: 80, count: 2 }]);
  assert.deepEqual(calendarComposition(items, true), items);
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
  assert.match(validateWork({ ...historical, payments: [{ id: "p1", depositDate: "2026-10-09", amount: 1 }] }, "2026-10-15"), /입금/);
  assert.match(validateWork({ ...historical, workDate: "2026-10-16", status: "COMPLETED" }, "2026-10-15"), /미래/);
});
