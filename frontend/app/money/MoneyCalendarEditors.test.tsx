import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { newWorkRecord, type CalendarWeek, type WorkRecord, type WorkTemplate } from "../../lib/money/calendar";
import { PanelContext } from "./MoneyPanel";
import { WorkRecordEditor, TemplateEditor, WeeklyForm } from "./MoneyCalendarEditors";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  return { root, dom };
}
const template: WorkTemplate = { id: "template", version: 3, name: "야간 2조", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "야간", groupName: "2조", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본", amount: 65000, active: true }] };
function button(text: string) { const node = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes(text)); assert.ok(node, `button ${text}`); return node; }
test("work editor submits stable payment IDs and expected version; failed save retains draft for retry", async () => {
  const { root, dom } = setup(), calls: unknown[] = [], old = moneyApi.put;
  const record = { ...newWorkRecord("2020-10-07", "2020-10-15", "work-stable", template), version: 7, payments: [{ id: "payment-stable-1", depositDate: "2020-10-10", amount: 20000 }, { id: "payment-stable-2", depositDate: "2020-10-13", amount: 45000 }] };
  let fail = true;
  moneyApi.put = async <T,>(path: string, body: unknown) => { calls.push({ path, body }); if (fail) throw new Error("연결 실패"); return { ...record, version: 8 } as T; };
  try {
    await act(async () => root.render(<PanelContext.Provider value={{ setDirty: () => {} }}><WorkRecordEditor value={record} templates={[template]} onSaved={() => {}} onClose={() => {}} /></PanelContext.Provider>));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.match(document.body.textContent!, /연결 실패.*초안은 유지/);
    assert.equal(document.querySelectorAll(".mc-payment").length, 2);
    fail = false; await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
    const body = (calls[0] as { body: WorkRecord & { expectedVersion: number } }).body;
    assert.equal(body.expectedVersion, 7); assert.equal(body.durationMinutes, 240); assert.deepEqual(body.payments.map(payment => payment.id), ["payment-stable-1", "payment-stable-2"]);
    assert.match(document.body.textContent!, /근무 기록을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
test("weekly editor orders total, base, allowances and blocks incomplete breakdown", async () => {
  const { root } = setup();
  const week: CalendarWeek = { start: "2026-10-05", end: "2026-10-11", version: 1, totalPay: 371700, basePay: null, allowancesConfirmed: false, needsReview: true, specialWorkAllowance: null, weeklyHolidayAllowance: 24000, publicHolidayAllowance: 18000, incentive: 5000, payments: [], completedWorkdays: 3, completedMinutes: 720, outstandingAmount: 52000 };
  try {
    await act(async () => root.render(<WeeklyForm initial={week} onClose={() => {}} onSaved={() => {}} />));
    const text = document.body.textContent!; assert.ok(text.indexOf("주급 총액") < text.indexOf("기본급")); assert.ok(text.indexOf("기본급") < text.indexOf("별도 수당 내역"));
    assert.match(text, /재검토가/); assert.equal(button("수당 내역 저장").disabled, true);
  } finally { await act(async () => root.unmount()); }
});
test("template save preserves preset IDs and version without changing historical record", async () => {
  const { root, dom } = setup(), old = moneyApi.put, calls: { path: string; body: unknown }[] = [];
  const historic = newWorkRecord("2020-10-07", "2020-10-15", "historic", template), before = structuredClone(historic);
  moneyApi.put = async <T,>(path: string, body: unknown) => { calls.push({ path, body }); return { ...template, version: 4 } as T; };
  try {
    await act(async () => root.render(<TemplateEditor initial={template} onSaved={() => {}} />));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 1); assert.equal((calls[0].body as { expectedVersion: number }).expectedVersion, 3);
    assert.deepEqual(historic, before); assert.match(document.body.textContent!, /템플릿을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
test("weekly save carries both allowance version and observed receipt total", async () => {
  const { root, dom } = setup(), old = moneyApi.put, calls: unknown[] = [];
  const week: CalendarWeek = { start: "2026-10-05", end: "2026-10-11", version: 4, totalPay: 371700, basePay: 371700, allowancesConfirmed: false, needsReview: false, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, publicHolidayAllowance: 0, incentive: 0, payments: [], completedWorkdays: 0, completedMinutes: 0, outstandingAmount: 0 };
  moneyApi.put = async <T,>(_path: string, body: unknown) => { calls.push(body); return { ...week, version: 5, allowancesConfirmed: true } as T; };
  try {
    await act(async () => root.render(<WeeklyForm initial={week} onClose={() => {}} onSaved={() => {}} />));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(calls[0], { expectedVersion: 4, expectedTotalPay: 371700, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, publicHolidayAllowance: 0, incentive: 0 });
    assert.match(document.body.textContent!, /수당 내역을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
