import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as nodeModule from "node:module";
import { moneyApi } from "../../lib/money/model";
import { addDays, kstDate, monday, newWorkRecord, type CalendarWeek, type WorkMonth, type WorkTemplate } from "../../lib/money/calendar";
import { MoneyDataProvider, useMoneyCache } from "./MoneyDataProvider";
import { PanelContext } from "./MoneyPanel";
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { load: (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown }) => unknown };
registerHooks({ load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true }; return next(url, context); } });

test("same-date background creation cannot replace an open new work draft or its save identity", async () => {
  const { MoneyCalendar } = await import("./MoneyCalendar");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.scrollTo = () => {};
  const today = kstDate(), template: WorkTemplate = { id: "template", version: 1, name: "주간", durationMinutes: 240, startTime: "09:00", endTime: "13:00", overnight: false, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본", amount: 65000, active: true }] };
  const serverRecord = { ...newWorkRecord(today, today, "other-session-record", template), version: 1, templateName: "다른 서버 템플릿", presetName: "다른 서버 프리셋", memo: "다른 세션에서 생성" };
  const week: CalendarWeek = { start: monday(today), end: addDays(monday(today), 6), version: 0, totalPay: 0, basePay: null, allowancesConfirmed: false, needsReview: false, specialWorkAllowance: null, weeklyHolidayAllowance: null, publicHolidayAllowance: null, incentive: null, payments: [], completedWorkdays: 0, completedMinutes: 0, outstandingAmount: 0 };
  const empty: WorkMonth = { records: [], payments: [], weeks: [week], summary: { completedWorkdays: 0, completedMinutes: 0, receivedAmount: 0, outstandingAmount: 0, scheduledAmount: 0 } };
  const oldGet = moneyApi.get, oldPut = moneyApi.put, calls: { path: string; body: { expectedVersion: number; payments: unknown[] } }[] = [];
  let refreshing = false, resolveRefresh: (value: WorkMonth) => void = () => {};
  moneyApi.get = async <T,>(path: string) => { if (path === "/calendar/templates") return [template] as T; if (path === "/calendar/weeks/" + week.start) return week as T; if (path.startsWith("/calendar/work?")) return refreshing ? await new Promise<WorkMonth>(resolve => { resolveRefresh = resolve; }) as T : empty as T; throw new Error("Unexpected request " + path); };
  moneyApi.put = async <T,>(path: string, body: unknown): Promise<T> => { calls.push({ path, body: body as { expectedVersion: number; payments: unknown[] } }); throw new Error("이 날짜에 다른 근무 기록이 있습니다."); };
  function CalendarFixture() { const cache = useMoneyCache(); return <><button onClick={() => { refreshing = true; cache.invalidate(key => key.startsWith("/calendar/work?")); }}>refresh fixture</button><MoneyCalendar section="coupang-work-calendar" accounts={[]} categories={[]} ready period={{ preset: "month", from: today, to: today }} select={() => {}} changeContext={() => true} /></>; }
  const root = createRoot(document.getElementById("root")!);
  const findButton = (text: string) => { const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes(text)); assert.ok(button, text); return button; };
  try {
    await act(async () => root.render(<MoneyDataProvider><PanelContext.Provider value={{ setDirty: () => {} }}><CalendarFixture /></PanelContext.Provider></MoneyDataProvider>));
    await act(async () => { findButton("＋ 근무 기록").click(); });
    await act(async () => { findButton("＋ 실제 입금 추가").click(); });
    const draftForm = document.querySelector(".mc-editor")!; assert.equal(draftForm.querySelectorAll(".mc-payment").length, 1);
    await act(async () => { findButton("refresh fixture").click(); });
    assert.equal(document.querySelector(".mc-editor"), draftForm, "loading retains the mounted editor");
    await act(async () => { resolveRefresh({ ...empty, records: [serverRecord] }); });
    assert.equal(document.querySelector(".mc-editor"), draftForm, "a new server ID cannot change the open editor identity");
    assert.equal(draftForm.querySelectorAll(".mc-payment").length, 1, "the unsaved payment remains");
    assert.doesNotMatch(draftForm.textContent!, /다른 서버 템플릿|다른 서버 프리셋/, "background rows cannot replace the opened snapshot");
    await act(async () => { draftForm.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 1); assert.notEqual(calls[0].path, "/calendar/work-records/other-session-record"); assert.equal(calls[0].body.expectedVersion, 0); assert.equal(calls[0].body.payments.length, 1);
    assert.match(document.body.textContent!, /다른 근무 기록.*초안은 유지/);
    await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    const day = document.querySelector<HTMLButtonElement>(`[data-calendar-date="${today}"]`)!;
    assert.equal(document.activeElement, day, "closing the new editor returns focus to its selected calendar day");
    await act(async () => { day.focus(); day.click(); });
    await act(async () => { findButton("refresh fixture").click(); });
    assert.equal(day.isConnected, false, "background loading replaces the original opener node");
    await act(async () => { resolveRefresh({ ...empty, records: [serverRecord] }); });
    await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, document.querySelector(`[data-calendar-date="${today}"]`), "Escape returns focus to the replacement day button after the old opener detached");
    for (const source of ["grid", "table"]) {
      const selector = `[data-calendar-week="${week.start}"][data-week-source="${source}"]`;
      const weekOpener = document.querySelector<HTMLButtonElement>(selector)!;
      assert.ok(weekOpener, source + " weekly opener exists");
      await act(async () => { weekOpener.focus(); weekOpener.click(); });
      assert.match(document.querySelector('[role="dialog"]')!.textContent!, /주급 총액/);
      await act(async () => { findButton("refresh fixture").click(); });
      assert.equal(weekOpener.isConnected, false, source + " opener detaches during refresh");
      await act(async () => { resolveRefresh({ ...empty, records: [serverRecord] }); });
      await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, document.querySelector(selector), "Escape restores the replacement " + source + " opener for the same week");
    }
  } finally { moneyApi.get = oldGet; moneyApi.put = oldPut; await act(async () => root.unmount()); }
});
