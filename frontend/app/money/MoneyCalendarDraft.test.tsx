import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import * as nodeModule from "node:module";
import { moneyApi } from "../../lib/money/model";
import { addDays, calendarDates, kstDate, monday, sunday, newWorkRecord, type CalendarWeek, type EarningsWeek, type EarningsMonth, type WorkTemplate } from "../../lib/money/calendar";
import { MoneyDataProvider, useMoneyCache } from "./MoneyDataProvider";
import { PanelContext } from "./MoneyPanel";
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { load: (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown }) => unknown };
registerHooks({ load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true }; return next(url, context); } });

test("same-date background creation cannot replace an open new work draft or its save identity", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), cancelAnimationFrame: clearTimeout, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.scrollTo = () => {};
  const { createRoot } = await import("react-dom/client"), { MoneyCalendar } = await import("./MoneyCalendar");
  const today = kstDate(), template: WorkTemplate = { id: "template", workplaceId: "legacy", workplaceName: "쿠팡", version: 1, name: "주간", durationMinutes: 240, startTime: "09:00", endTime: "13:00", overnight: false, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본", amount: 65000, active: true }] };
  const serverRecord = { basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000, wageModel: "CONFIRMED_V2", ...newWorkRecord(today, today, "other-session-record", template), version: 1, templateName: "다른 서버 템플릿", presetName: "다른 서버 프리셋", memo: "다른 세션에서 생성" };
  const adjacentDate = calendarDates(today.slice(0, 7), "sunday").find(date => !date.startsWith(today.slice(0, 7)));
  const adjacentRecord = adjacentDate ? { ...newWorkRecord(adjacentDate, today, "adjacent-stable", template), version: 3, memo: "월 경계 근무" } : null;
  const week: EarningsWeek = { start: sunday(today), end: addDays(sunday(today), 6), version: 0, baseTotal: 0, incentiveTotal: 0, deductionTotal: 0, dailyTotal: 0, finalPay: 0, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, workEntries: [], legacyReviewCount: 0, dailyFingerprint: "initial" };
  const legacy: CalendarWeek = { completedWorkdays: 1, completedMinutes: 240, outstandingAmount: 0, needsReview: false, publicHolidayAllowance: 0, incentive: 0, ...week, start: monday(today), end: addDays(monday(today), 6), version: 2, totalPay: 12345, basePay: 12345, allowancesConfirmed: true, payments: [{ id: "legacy-deposit", depositDate: today, workDate: addDays(today, -7), amount: 12345 }] };
  const offDate = addDays(today, -1), cancelledDate = addDays(today, -2);
  const nonWorking = [{ ...newWorkRecord(offDate, today, "off", template), status: "OFF" as const, version: 1, expectedAmount: 65000 }, { ...newWorkRecord(cancelledDate, today, "cancelled", template), status: "CANCELLED" as const, version: 1, expectedAmount: 65000 }];
  const empty: EarningsMonth = { records: [...(adjacentRecord ? [adjacentRecord] : []), ...nonWorking], archivedRecords: [], weeks: [week], legacyWeeks: [legacy], legacyDepositWeeks: [], summary: { workdays: 0, workMinutes: 0, confirmedDailyPay: 0, baseTotal: 0, incentiveTotal: 0, deductionTotal: 0, legacyReviewCount: 1, legacyRecordedAmount: 65000 } };
  const oldGet = moneyApi.get, oldPut = moneyApi.put, calls: { path: string; body: { expectedVersion: number; payments?: unknown[] } }[] = [];
  let refreshing = false, templatesRefreshing = false, resolveRefresh: (value: EarningsMonth) => void = () => {}, resolveTemplateRefresh: (value: WorkTemplate[]) => void = () => {};
  moneyApi.get = async <T,>(path: string) => { if (path === "/calendar/workplaces") return [{ id: "legacy", name: "쿠팡", active: true, version: 1, presets: template.presets }] as T; if (path === "/calendar/templates") return templatesRefreshing ? await new Promise<WorkTemplate[]>(resolve => { resolveTemplateRefresh = resolve; }) as T : [template] as T; if (path.startsWith("/calendar/earnings-weeks/" + week.start)) return week as T; if (path.startsWith("/calendar/earnings-calendar?")) return refreshing ? await new Promise<EarningsMonth>(resolve => { resolveRefresh = resolve; }) as T : empty as T; throw new Error("Unexpected request " + path); };
  moneyApi.put = async <T,>(path: string, body: unknown): Promise<T> => { calls.push({ path, body: body as { expectedVersion: number; payments?: unknown[] } }); throw new Error("이 날짜에 다른 근무 기록이 있습니다."); };
  function CalendarFixture() { const cache = useMoneyCache(); return <><button onClick={() => { refreshing = true; cache.invalidate(key => key.startsWith("/calendar/earnings-calendar?")); }}>refresh fixture</button><MoneyCalendar section="coupang-work-calendar" accounts={[]} categories={[]} ready period={{ preset: "month", from: today, to: today }} select={() => {}} changeContext={() => true} /></>; }
  const root = createRoot(document.getElementById("root")!);
  const findButton = (text: string) => { const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes(text)); assert.ok(button, text); return button; };
  try {
    await act(async () => root.render(<MoneyDataProvider><PanelContext.Provider value={{ setDirty: () => {} }}><CalendarFixture /></PanelContext.Provider></MoneyDataProvider>));
    assert.deepEqual(Array.from(document.querySelectorAll(".mc-weekday")).slice(0, 7).map(node => node.textContent), ["일", "월", "화", "수", "목", "금", "토"]);
    for (const [date, label] of [[offDate, "🏠 휴무"], [cancelledDate, "취소"]]) { const cell = document.querySelector(`[data-calendar-date="${date}"]`); if (cell) { assert.match(cell.textContent!, new RegExp(label)); assert.doesNotMatch(cell.textContent!, /급여|확인 필요|65,000|0h/); } }
    assert.match(document.querySelector(".mc-legacy")!.textContent!, /이전 주급·입금 정산 이력.*읽기 전용/); assert.match(document.querySelector(".mc-legacy")!.textContent!, /12,345원/); assert.match(document.body.textContent!, /일급 확인 대상 1건.*65,000원/);
    for (const details of document.querySelectorAll(".mc-week-details")) { assert.equal(details.children.length, 4); assert.deepEqual(Array.from(details.children).map(row => row.querySelector("span")!.textContent), ["확정 일급 합계", "+ 특근수당", "+ 주휴수당", "인센 합계 (포함 내역)"]); assert.doesNotMatch(details.textContent!, /최종|주급 총액/); } assert.equal(document.querySelector(".mc-legacy input"), null);
    if (adjacentDate) {
      const monthLabel = document.querySelector(".mc-month h2")!.textContent;
      const filter = document.querySelector<HTMLSelectElement>(".mc-toolbar label:last-child select")!;
      await act(async () => { filter.value = "OFF"; filter.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
      const day = document.querySelector<HTMLButtonElement>(`[data-calendar-date="${adjacentDate}"]`)!; assert.equal(day.disabled, false); assert.doesNotMatch(day.textContent!, /주간/);
      await act(async () => { day.focus(); day.click(); });
      assert.match(document.querySelector(".mc-editor")!.textContent!, new RegExp(adjacentDate)); assert.equal(document.querySelector(".mc-month h2")!.textContent, monthLabel, "adjacent work dates do not navigate to another month");
      assert.equal(document.querySelector<HTMLTextAreaElement>(".mc-editor textarea")!.value, "월 경계 근무");
      await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      await act(async () => { filter.value = "ALL"; filter.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    }
    await act(async () => { findButton("＋ 근무 기록").click(); });
    await act(async () => { const status = document.querySelector<HTMLSelectElement>(".mc-editor select")!; status.value = "SCHEDULED"; status.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    const draftForm = document.querySelector(".mc-editor")!; assert.equal(draftForm.querySelectorAll(".mc-payment").length, 0);
    await act(async () => { const pay = Array.from(draftForm.querySelectorAll<HTMLLabelElement>("label")).find(label => label.querySelector("span")?.textContent === "확정 일급 (원)")!.querySelector("input")!; Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(pay, "65000"); pay.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    const stableGrid = document.querySelector(".mc-grid"), stableSummary = document.querySelector(".mc-summary")!.textContent, scroller = document.querySelector<HTMLElement>(".mc-scroll")!; scroller.scrollLeft = 137;
    await act(async () => { findButton("refresh fixture").click(); });
    assert.equal(document.querySelector(".mc-grid") === stableGrid, true, "revalidation preserves calendar DOM"); assert.equal(document.querySelector(".mc-summary")!.textContent, stableSummary); assert.equal(scroller.scrollLeft, 137);
    assert.equal(document.querySelector(".mc-editor"), draftForm, "loading retains the mounted editor");
    await act(async () => { resolveRefresh({ ...empty, records: [serverRecord] }); });
    assert.equal(document.querySelector(".mc-editor"), draftForm, "a new server ID cannot change the open editor identity");
    assert.equal(draftForm.querySelector<HTMLSelectElement>("select")!.value, "SCHEDULED", "the unsaved work status remains");
    assert.doesNotMatch(draftForm.textContent!, /다른 서버 템플릿|다른 서버 프리셋/, "background rows cannot replace the opened snapshot");
    await act(async () => { draftForm.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 1); assert.notEqual(calls[0].path, "/calendar/earnings-records/other-session-record"); assert.equal(calls[0].body.expectedVersion, 0); assert.equal("payments" in calls[0].body, false);
    assert.match(document.body.textContent!, /다른 근무 기록.*초안은 유지/);
    await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    const day = document.querySelector<HTMLButtonElement>(`[data-calendar-date="${today}"]`)!;
    assert.equal(document.activeElement, day, "closing the new editor returns focus to its selected calendar day");
    await act(async () => { day.focus(); day.click(); });
    await act(async () => { findButton("refresh fixture").click(); });
    assert.equal(day.isConnected, true, "background loading preserves the original opener node");
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
      assert.equal(weekOpener.isConnected, true, source + " opener remains during refresh");
      await act(async () => { resolveRefresh({ ...empty, records: [serverRecord] }); });
      await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, document.querySelector(selector), "Escape restores the replacement " + source + " opener for the same week");
    }
    let resolveSave: (value: unknown) => void = () => {};
    moneyApi.put = async <T,>() => await new Promise<unknown>(resolve => { resolveSave = resolve; }) as T;
    await act(async () => { const opener = document.querySelector<HTMLButtonElement>(`[data-calendar-date="${today}"]`)!; opener.focus(); opener.click(); });
    const savingForm = document.querySelector<HTMLFormElement>(".mc-editor")!, saveButton = savingForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await act(async () => { saveButton.focus(); savingForm.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(saveButton.disabled, true, "the real pending save disables its focused submit control");
    const otherModal = document.createElement("dialog"); otherModal.open = true; document.body.append(otherModal);
    const savingFields = savingForm.querySelector("fieldset")!;
    const strandFocusAtBody = () => { document.body.tabIndex = -1; document.body.focus(); };
    await act(async () => { strandFocusAtBody(); savingFields.setAttribute("aria-disabled", "true"); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(document.activeElement === document.body, true, "calendar recovery preserves another open modal");
    otherModal.remove();
    await act(async () => { savingFields.setAttribute("aria-disabled", "false"); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(document.activeElement === document.querySelector('[role="dialog"]'), true, "disabled save focus loss recovers to the active calendar dialog");
    const explicitFocus = findButton("refresh fixture");
    await act(async () => { explicitFocus.focus(); savingFields.setAttribute("aria-disabled", "true"); await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(document.activeElement === explicitFocus, true, "recovery does not override explicit focus outside the calendar dialog");
    await act(async () => { strandFocusAtBody(); resolveSave({ ...serverRecord, version: 2 }); });
    await act(async () => { resolveRefresh({ ...empty, records: [{ ...serverRecord, version: 2 }] }); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(document.activeElement === document.querySelector('[role="dialog"]'), true, "save completion and ready refresh recover stranded BODY focus");
    await act(async () => { document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(document.querySelector('[role="dialog"]'), null, "Escape from recovered focus closes the saved work dialog");
    assert.equal(document.activeElement, document.querySelector(`[data-calendar-date="${today}"]`));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    globalThis.requestAnimationFrame = () => 0; // A background browser tab never paints these frames.
    for (const editorKind of ["weekly", "template"]) {
      moneyApi.put = async <T,>() => await new Promise<unknown>(resolve => { resolveSave = resolve; }) as T;
      await act(async () => { const opener = editorKind === "weekly" ? document.querySelector<HTMLButtonElement>(`[data-calendar-week="${week.start}"][data-week-source="table"]`)! : findButton("근무지/템플릿"); opener.focus(); opener.click(); });
      if (editorKind === "template") await act(async () => findButton("↳ 주간").click());
      const form = document.querySelector<HTMLFormElement>(".mc-editor")!, submit = findButton(editorKind === "weekly" ? "수당 내역 저장" : "템플릿 저장");
      await act(async () => { submit.focus(); form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
      assert.equal(submit.disabled, true, editorKind + " save is pending with submit disabled");
      templatesRefreshing = editorKind === "template";
      await act(async () => { strandFocusAtBody(); resolveSave(editorKind === "weekly" ? { ...week, version: 1, allowancesConfirmed: true, basePay: 0 } : { ...template, version: 2 }); });
      if (editorKind === "template") {
        const templateOpener = document.querySelector<HTMLButtonElement>("[data-calendar-templates]")!;
        assert.equal(templateOpener.disabled, true, "template reload temporarily disables the original opener");
        assert.equal(document.activeElement === document.querySelector('[role="dialog"]'), true);
        await act(async () => { document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
        assert.equal(document.querySelector('[role="dialog"]'), null, "Escape closes before the template reload finishes");
        await act(async () => { resolveTemplateRefresh([{ ...template, version: 2 }]); resolveRefresh({ ...empty, records: [{ ...serverRecord, version: 2 }] }); });
        assert.equal(templateOpener.disabled, false);
        assert.equal(document.activeElement === templateOpener, true, "focus returns to the template opener once it is re-enabled");
        continue;
      }
      await act(async () => { resolveRefresh({ ...empty, records: [{ ...serverRecord, version: 2 }] }); });
      assert.equal(document.visibilityState, "hidden");
      assert.equal(document.activeElement === document.querySelector('[role="dialog"]'), true, editorKind + " recovers BODY focus without any animation frame");
      await act(async () => { document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      assert.equal(document.querySelector('[role="dialog"]'), null, editorKind + " Escape works in a hidden tab after async save and refresh");
    }
  } finally { moneyApi.get = oldGet; moneyApi.put = oldPut; await act(async () => root.unmount()); }
});
