import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import * as nodeModule from "node:module";
import { moneyApi } from "../../lib/money/model";
import { addDays, kstDate, newWorkRecord, overlappingWork, selectableTemplate, type EarningsMonth, type WorkTemplate } from "../../lib/money/calendar";
import { MoneyDataProvider } from "./MoneyDataProvider";
import { PanelContext } from "./MoneyPanel";
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { load: (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown }) => unknown };
registerHooks({ load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true }; return next(url, context); } });
const a: WorkTemplate = { id: "template-a", workplaceId: "place-a", workplaceName: "쿠팡", workplaceActive: true, version: 1, name: "주간", durationMinutes: 240, startTime: "09:00", endTime: "13:00", overnight: false, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset-a", presets: [{ id: "preset-a", name: "기본", amount: 65000, active: true }] };
const b: WorkTemplate = { ...a, id: "template-b", workplaceId: "place-b", workplaceName: "카페" };
const places = [a, b].map(t => ({ id: t.workplaceId!, name: t.workplaceName!, active: true, version: 1, presets: t.presets }));

test("P04 overnight overlap is a nonblocking warning, touching endpoints and rest markers do not overlap", () => {
  const day = "2026-09-30", original = { ...newWorkRecord(day, day, "a", a), startTime: "22:00", endTime: "02:00", overnight: true };
  const adjacent = { ...newWorkRecord("2026-10-01", "2026-10-02", "b", b), startTime: "01:00", endTime: "03:00" };
  assert.deepEqual(overlappingWork(original, [original, adjacent]).map(r => r.id), ["b"]);
  assert.equal(overlappingWork(original, [{ ...adjacent, startTime: "02:00" }, { ...adjacent, status: "OFF" }, { ...adjacent, removed: true }]).length, 0);
  assert.equal(selectableTemplate({ ...a, workplaceActive: false }), false);
});

test("P09 date routing uses all records, allows adding after one shift and exposes excluded workplace rows", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client"), { MoneyCalendar } = await import("./MoneyCalendar");
  const today = kstDate(), single = addDays(today, -1), empty = addDays(today, -2);
  const record = (id: string, date: string, template: WorkTemplate) => ({ ...newWorkRecord(date, today, id, template), version: 1, confirmedDailyPay: 38410, dailyIncentive: 2000, wageModel: "CONFIRMED_DIRECT_V3" });
  const records = [record("single", single, a), record("first", today, a), record("second", today, b)];
  const old = moneyApi.get, calls: string[] = [];
  moneyApi.get = async <T,>(path: string) => {
    calls.push(path); if (path === "/calendar/workplaces") return places as T; if (path === "/calendar/templates") return [a, b] as T;
    if (path.startsWith("/calendar/earnings-calendar?")) {
      const params = new URLSearchParams(path.split("?")[1]), visible = records.filter(r => !params.get("workplaceId") || r.workplaceId === params.get("workplaceId"));
      return { records: visible, allRecords: records, archivedRecords: [], weeks: [], legacyWeeks: [], legacyDepositWeeks: [], summary: { workdays: 2, workMinutes: 720, baseTotal: 0, incentiveTotal: 6000, deductionTotal: 0, confirmedDailyPay: visible.length * 38410, legacyReviewCount: 0, legacyRecordedAmount: 0 } } satisfies EarningsMonth as T;
    }
    throw Error(path);
  };
  const root = createRoot(document.getElementById("root")!);
  const clickDate = async (date: string) => act(async () => document.querySelector<HTMLButtonElement>(`[data-calendar-date="${date}"]`)!.click());
  const close = async () => act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  try {
    await act(async () => root.render(<MoneyDataProvider><PanelContext.Provider value={{ setDirty: () => {} }}><MoneyCalendar section="coupang-work-calendar" accounts={[]} categories={[]} ready period={{ preset: "month", from: today, to: today }} select={() => {}} changeContext={() => true} /></PanelContext.Provider></MoneyDataProvider>));
    await clickDate(empty); assert.match(document.querySelector('[role="dialog"]')!.getAttribute("aria-label")!, /근무 편집/); assert.equal(document.querySelector<HTMLInputElement>('.mc-editor input[type="number"]')!.value, "65000"); await close();
    await clickDate(single); assert.equal(document.querySelector('.mc-date-list'), null); assert.match(document.querySelector('.mc-editor')!.textContent!, /근무 추가/);
    await act(async () => Array.from(document.querySelectorAll("button")).find(b => b.textContent === "＋ 근무 추가")!.click()); assert.equal(document.querySelector<HTMLInputElement>('.mc-editor input[type="number"]')!.value, "65000"); await close();
    await clickDate(today); assert.equal(document.querySelectorAll('.mc-date-list button').length, 2); assert.match(document.querySelector('.mc-date-list')!.textContent!, /카페/); await close();
    await act(async () => { const picker = document.querySelector<HTMLSelectElement>('.mc-toolbar label select')!; picker.value = "place-a"; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.ok(calls.some(p => p.includes('workplaceId=place-a')));
    await clickDate(today); assert.equal(document.querySelectorAll('.mc-date-list button').length, 2); assert.match(document.querySelector('.mc-date-list')!.textContent!, /현재 필터 제외/);
    await act(async () => document.querySelectorAll<HTMLButtonElement>('.mc-date-list button')[1].click()); assert.equal(document.querySelector<HTMLInputElement>('.mc-editor input[type="number"]')!.value, "38410");
  } finally { moneyApi.get = old; await act(async () => root.unmount()); dom.window.close(); }
});

test("P02/P08 manager protects unsaved selections and exposes workplace shared presets", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client"), { WorkplaceManager } = await import("./WorkplaceManager");
  const root = createRoot(document.getElementById("root")!); let confirmations = 0;
  dom.window.confirm = () => { confirmations++; return false; };
  const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('nav button')).find(b => b.textContent?.includes(text))!;
  try {
    await act(async () => root.render(<WorkplaceManager workplaces={places} templates={[a, b]} onSaved={() => {}} />));
    await act(async () => button("쿠팡 · 설정").click()); assert.match(document.querySelector('form')!.textContent!, /공유 금액 프리셋/);
    await act(async () => { const input = document.querySelector<HTMLInputElement>('form input')!; Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "초안 이름"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await act(async () => button("카페 · 설정").click()); assert.equal(confirmations, 1); assert.equal(document.querySelector<HTMLInputElement>('form input')!.value, "초안 이름");
    dom.window.confirm = () => true; await act(async () => button("↳ 주간").click()); assert.match(document.querySelector('form')!.textContent!, /기본 금액 프리셋/); assert.equal(document.querySelector('form .mc-payment'), null, "template reuses workplace presets rather than duplicating an editor");
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test("management focus recovery allows pointer focus into name and preset inputs but still rescues stranded focus", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client"), { MoneyCalendar } = await import("./MoneyCalendar");
  const get = moneyApi.get, today = kstDate();
  moneyApi.get = async <T,>(path: string) => {
    if (path === "/calendar/workplaces") return places as T;
    if (path === "/calendar/templates") return [a, b] as T;
    if (path.startsWith("/calendar/earnings-calendar?")) return { records: [], allRecords: [], archivedRecords: [], weeks: [], legacyWeeks: [], legacyDepositWeeks: [], summary: { workdays: 0, workMinutes: 0, baseTotal: 0, incentiveTotal: 0, deductionTotal: 0, confirmedDailyPay: 0, legacyReviewCount: 0, legacyRecordedAmount: 0 } } satisfies EarningsMonth as T;
    throw Error(path);
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<MoneyDataProvider><PanelContext.Provider value={{ setDirty: () => {} }}><MoneyCalendar section="coupang-work-calendar" accounts={[]} categories={[]} ready period={{ preset: "month", from: today, to: today }} select={() => {}} changeContext={() => true} /></PanelContext.Provider></MoneyDataProvider>));
    await act(async () => document.querySelector<HTMLButtonElement>('[data-calendar-templates]')!.click());
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>('nav button')).find(button => button.textContent === "쿠팡 · 설정 / 프리셋")!.click());
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!, inputs = Array.from(panel.querySelectorAll<HTMLInputElement>('form input:not([type="checkbox"])'));
    assert.equal(inputs.length, 3, "covers workplace name, preset name and preset amount");
    const focus = panel.focus; let recoveryCalls = 0;
    panel.focus = (...args) => { recoveryCalls++; focus.apply(panel, args); };
    const transition = async (relatedTarget: EventTarget | null) => {
      recoveryCalls = 0;
      // Chromium runs a microtask after focusout while activeElement is BODY,
      // before the pointer's intended target receives focus.
      Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
      try { await act(async () => panel.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true, relatedTarget }))); }
      finally { Reflect.deleteProperty(document, "activeElement"); }
      return recoveryCalls;
    };
    for (const input of inputs) {
      assert.equal(await transition(input), 0, "pointer focus must reach the chosen input");
      await act(async () => input.focus());
      assert.equal(document.activeElement, input);
    }
    assert.equal(await transition(document.querySelector('[data-calendar-templates]')), 0, "an explicit outside focus target also retains ownership");
    assert.equal(await transition(null), 1, "disabled/removed controls with no next target still recover focus");
    panel.focus = focus;
  } finally { moneyApi.get = get; Reflect.deleteProperty(document, "activeElement"); await act(async () => root.unmount()); dom.window.close(); }
});
