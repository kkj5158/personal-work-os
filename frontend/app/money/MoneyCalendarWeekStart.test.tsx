import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import * as nodeModule from "node:module";
import { moneyApi } from "../../lib/money/model";
import { addDays, calendarDates, newWorkRecord, type EarningsMonth, type EarningsWeek } from "../../lib/money/calendar";
import { MoneyDataProvider, useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { PanelContext } from "./MoneyPanel";
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { load: (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown }) => unknown };
registerHooks({ load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true }; return next(url, context); } });

test("server week toggle preserves authoritative payroll, filters, editor and adjacent records without payroll writes", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client"), { MoneyCalendar } = await import("./MoneyCalendar");
  const today = "2026-10-25", makeRecord = (date: string, id: string) => ({ ...newWorkRecord(date, today, id), workplaceId: "place", workplaceName: "보관 근무지", templateName: "주간", version: 1, confirmedDailyPay: 65000, dailyIncentive: 5000, wageModel: "CONFIRMED_DIRECT_V3", receiptConfirmation: { confirmed: true, amount: 65000, revision: 2 } });
  const allRecords = [makeRecord("2026-09-27", "invisible-sunday"), makeRecord("2026-10-03", "saturday"), makeRecord("2026-10-04", "sunday"), makeRecord("2026-10-05", "monday1"), makeRecord("2026-10-05", "monday2"), makeRecord("2026-11-01", "adjacent")];
  const response = (month: string, status: string): EarningsMonth => {
    const dates = calendarDates(month, "sunday"), records = allRecords.filter(r => dates.includes(r.workDate));
    const weeks: EarningsWeek[] = dates.filter((_, i) => i % 7 === 0).map(start => ({ start, end: addDays(start, 6), version: 1, baseTotal: 60000, incentiveTotal: 5000, deductionTotal: 3000, dailyTotal: 65000, finalPay: 95000, specialWorkAllowance: 10000, weeklyHolidayAllowance: 20000, legacyReviewCount: 0, dailyFingerprint: "original", workEntries: allRecords.filter(r => r.workDate >= start && r.workDate <= addDays(start, 6)), workplaceBreakdowns: [] }));
    return { records: status === "OFF" ? [] : records, allRecords: records, archivedRecords: [], weeks, legacyWeeks: [], legacyDepositWeeks: [], summary: { workdays: 4, workMinutes: 960, confirmedDailyPay: 260000, baseTotal: 240000, incentiveTotal: 20000, deductionTotal: 12000, legacyReviewCount: 0, legacyRecordedAmount: 0, receiptConfirmedAmount: 260000 } };
  };
  const originalGet = moneyApi.get, originalPut = moneyApi.put, reads: string[] = []; let writes = 0, owner = "original";
  const preferences = new Map<string, { version: number; weekStart: string; weekStartConfigured: boolean; defaultTemplateId: null }>();
  const savedPreference = () => preferences.get(owner) ?? { version: 0, weekStart: "SUNDAY", weekStartConfigured: false, defaultTemplateId: null };
  moneyApi.get = async <T,>(path: string) => {
    reads.push(path);
    if (path === "/calendar/preferences") return savedPreference() as T;
    if (path === "/calendar/workplaces") return [{ id: "place", version: 1, name: "보관 근무지", active: false, presets: [] }] as T;
    if (path === "/calendar/templates") return [] as T;
    if (path.startsWith("/calendar/earnings-calendar?")) { const params = new URLSearchParams(path.split("?")[1]); return response(params.get("month")!, params.get("status") ?? "ALL") as T; }
    throw Error("Unexpected read " + path);
  };
  moneyApi.put = async <T,>(path: string, body: unknown) => { assert.equal(path, "/calendar/preferences/week-start"); const input = body as { expectedVersion: number; weekStart: string }; assert.equal(input.expectedVersion, savedPreference().version); const value = { ...savedPreference(), version: input.expectedVersion + 1, weekStart: input.weekStart, weekStartConfigured: true }; preferences.set(owner, value); writes++; return value as T; };
  function Fixture() {
    const cache = useMoneyCache(), [, setMonth] = useMoneyViewState("calendar-coupang-work-calendar-month", () => "2026-10");
    return <><button onClick={() => setMonth("2026-10")}>October fixture</button><button onClick={() => { owner = "other"; cache.setScope("other:session"); }}>Other account</button><button onClick={() => { owner = "original"; cache.setScope("dev-fixed-owner:new-session"); }}>Original account</button><MoneyCalendar section="coupang-work-calendar" accounts={[]} categories={[]} ready period={{ preset: "month", from: today, to: today }} select={() => {}} changeContext={() => true} /></>;
  }
  const tree = () => <MoneyDataProvider><PanelContext.Provider value={{ setDirty() {} }}><Fixture /></PanelContext.Provider></MoneyDataProvider>;
  let root = createRoot(document.getElementById("root")!);
  const select = () => ({ value: document.querySelector('.mc-week-toggle button[aria-pressed="true"]')!.textContent === "월요일 시작" ? "MONDAY" : "SUNDAY" });
  const toggle = async (mode: string) => act(async () => { const buttons = document.querySelectorAll<HTMLButtonElement>('.mc-week-toggle button'); buttons[mode === "MONDAY" ? 0 : 1].click(); });
  const click = async (selector: string) => act(async () => document.querySelector<HTMLButtonElement>(selector)!.click());
  const buttonText = async (text: string) => act(async () => Array.from(document.querySelectorAll("button")).find(b => b.textContent === text)!.click());
  try {
    await act(async () => root.render(tree())); await buttonText("October fixture");
    assert.equal(select().value, "SUNDAY"); const metrics = document.querySelector(".mc-summary")!.textContent, comparison = document.querySelector(".mc-below table")!.textContent;
    const snapshot = JSON.stringify(allRecords), amounts = () => Array.from(document.querySelectorAll(".mc-week-cell strong")).map(n => n.textContent);
    const before = amounts(); assert.equal(before.length, 5);
    for (const mode of ["MONDAY", "SUNDAY", "MONDAY"]) {
      await toggle(mode);
      assert.deepEqual(Array.from(document.querySelectorAll(".mc-weekday")).slice(0, 7).map(n => n.textContent), mode === "MONDAY" ? ["월", "화", "수", "목", "금", "토", "일"] : ["일", "월", "화", "수", "목", "금", "토"]);
      assert.deepEqual(amounts(), before); assert.equal(document.querySelector(".mc-summary")!.textContent, metrics); assert.equal(document.querySelector(".mc-below table")!.textContent, comparison);
      assert.equal(JSON.stringify(allRecords), snapshot);
    }
    assert.equal(document.querySelector(".mc-day")!.getAttribute("data-calendar-date"), "2026-09-28");
    assert.match(document.querySelector('[data-display-week="2026-09-28"]')!.textContent!, /정산 09.27–10.03.*95,000원/);
    assert.equal(document.querySelectorAll('.mc-grid [data-calendar-week="2026-09-27"]').length, 1);
    assert.match(document.querySelector('[data-calendar-date="2026-11-01"]')!.textContent!, /65,000원.*입금 완료/);
    await click('[data-calendar-date="2026-10-05"]'); assert.equal(document.querySelectorAll(".mc-date-list button").length, 2);
    await click(".mc-date-list button"); const editor = document.querySelector(".mc-editor"); assert.ok(editor);
    await toggle("SUNDAY"); assert.equal(document.querySelector(".mc-editor"), editor, "toggle retains the mounted draft/editor");
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await toggle("MONDAY"); await click('[data-calendar-date="2026-11-01"]'); assert.match(document.querySelector(".mc-editor")!.textContent!, /2026-11-01/);
    await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => root.unmount()); root = createRoot(document.getElementById("root")!); await act(async () => root.render(tree())); await buttonText("October fixture"); assert.equal(select().value, "MONDAY");
    await buttonText("Other account"); assert.equal(select().value, "SUNDAY"); await buttonText("Original account"); assert.equal(select().value, "MONDAY");
    await act(async () => { const status = document.querySelector<HTMLSelectElement>(".mc-toolbar label:last-child select")!; status.value = "OFF"; status.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await toggle("SUNDAY"); await toggle("MONDAY"); assert.equal(document.querySelector<HTMLSelectElement>(".mc-toolbar label:last-child select")!.value, "OFF");
    assert.ok(reads.some(path => path.includes("month=2026-11&status=OFF"))); assert.ok(writes > 0);
    assert.ok(reads.every(path => !/weekStart|displayWeek|MONDAY/.test(path)), "display preference never enters financial API payloads");
  } finally { await act(async () => root.unmount()); moneyApi.get = originalGet; moneyApi.put = originalPut; dom.window.close(); }
});
