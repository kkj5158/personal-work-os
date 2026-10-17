import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { newWorkRecord, type WorkRecord, type WorkTemplate } from "../../lib/money/calendar";

test("A02–A11/A19: null schedules, explicit presets, input-only receipt ON, sticky manual OFF and conflict drafts", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client"), { WorkRecordEditor } = await import("./MoneyCalendarEditors");
  const root = createRoot(document.getElementById("root")!);
  const template: WorkTemplate = { id: "template", version: 3, name: "주간", durationMinutes: 240, startTime: "09:00", endTime: "13:00", overnight: false, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "default", presets: [{ id: "default", name: "기본", amount: 42140, active: true }, { id: "alternative", name: "다른 예상", amount: 38410, active: true }] };
  const other = { ...template, id: "other", defaultPresetId: "other-default", presets: [{ id: "other-default", name: "다른 근무", amount: 84280, active: true }] };
  const originalPut = moneyApi.put, calls: Record<string, unknown>[] = [];
  let failure = "", session = 0;
  moneyApi.put = async <T,>(_path: string, body: unknown) => { const request = body as Record<string, unknown>; calls.push(request); if (failure) throw new Error(failure); return { ...current, ...request, version: Number(request.expectedVersion) + 1, wageModel: "CONFIRMED_DIRECT_V3", receiptConfirmation: { confirmed: request.receiptConfirmed ?? current.receiptConfirmation?.confirmed ?? false, amount: request.receiptConfirmed ? request.confirmedDailyPay : 0, revision: 1 } } as T; };
  let current: WorkRecord;
  const render = async (record: WorkRecord, catalog = [template, other]) => { current = record; await act(async () => root.render(<WorkRecordEditor key={++session} value={record} templates={catalog} onSaved={() => {}} onClose={() => {}} />)); };
  const field = (name: string) => Array.from(document.querySelectorAll("label")).find(label => label.querySelector("span")?.textContent === name)!.querySelector<HTMLInputElement>("input")!;
  const enter = async (name: string, value: string) => { await act(async () => { const input = field(name); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const receipt = () => document.querySelector<HTMLInputElement>('[role="switch"]')!;
  const submit = async () => act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  const select = async (label: string, value: string) => act(async () => { const picker = Array.from(document.querySelectorAll("label")).find(node => node.querySelector("span")?.textContent === label)!.querySelector("select")!; picker.value = value; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  try {
    await render(newWorkRecord("2099-10-20", "2026-10-17", "schedule", template));
    assert.equal(field("확정 일급 (원)").required, false); assert.equal(receipt().checked, false);
    await submit(); assert.equal(calls.at(-1)!.confirmedDailyPay, null); assert.equal(calls.at(-1)!.receiptConfirmed, null); assert.equal(calls.at(-1)!.selectedTemplateVersion, 3); assert.equal(calls.at(-1)!.reselectPreset, true);
    await select("예상 일급 프리셋", "alternative"); await submit(); assert.equal(calls.at(-1)!.presetId, "alternative"); assert.equal(calls.at(-1)!.reselectPreset, true);
    await select("근무 템플릿", "other"); await submit(); assert.equal(calls.at(-1)!.presetId, "other-default");
    const prior = { ...newWorkRecord("2020-10-07", "2026-10-17", "completed", template), version: 4, confirmedDailyPay: 38410, dailyIncentive: 2000, wageModel: "CONFIRMED_DIRECT_V3" };
    await render(prior); assert.equal(receipt().checked, false, "loading an existing wage is never evidence of receipt");
    await submit(); assert.equal(calls.at(-1)!.receiptConfirmed, null); assert.equal(calls.at(-1)!.reselectPreset, false);
    await enter("확정 일급 (원)", "38411"); assert.equal(receipt().checked, true, "positive completed wage input selects ON before Save");
    await act(async () => receipt().click()); assert.equal(receipt().checked, false);
    await enter("확정 일급 (원)", "38410"); assert.equal(receipt().checked, false, "manual OFF wins over subsequent wage input");
    await select("예상 일급 프리셋", "alternative"); assert.equal(receipt().checked, false, "reselection cannot undo manual OFF");
    failure = "프리셋 버전이 변경되었습니다. 다시 선택하세요."; await submit(); assert.equal(calls.at(-1)!.receiptConfirmed, false); assert.equal(field("확정 일급 (원)").value, "38410"); assert.equal(receipt().checked, false); assert.match(document.body.textContent!, /초안은 유지/);
    failure = ""; await submit(); assert.equal(calls.at(-1)!.receiptConfirmed, false);
    await enter("확정 일급 (원)", "40000"); assert.equal(receipt().checked, false, "manual OFF survives successful Save in this edit session");
    await act(async () => receipt().click()); assert.equal(receipt().checked, true); await submit(); assert.equal(calls.at(-1)!.receiptConfirmed, true);
    await render(prior); await enter("확정 일급 (원)", "38410"); // A new explicit value change is needed from the stored value.
    await enter("확정 일급 (원)", "39000"); assert.equal(receipt().checked, true);
    await enter("확정 일급 (원)", ""); assert.equal(receipt().checked, true, "blanking wage keeps an invalid ON visible for correction");
    const count = calls.length; await submit(); assert.equal(calls.length, count); assert.match(document.body.textContent!, /양수 확정 일급/);
    await enter("인센티브 (포함 금액)", "0"); await enter("확정 일급 (원)", "0"); await submit(); assert.equal(calls.length, count, "zero cannot confirm receipt");
    await act(async () => receipt().click()); await submit(); assert.equal(calls.at(-1)!.confirmedDailyPay, 0); assert.equal(calls.at(-1)!.receiptConfirmed, false);
    await render({ ...prior, status: "SCHEDULED" }); await enter("확정 일급 (원)", "40000"); assert.equal(receipt().checked, false); assert.equal(receipt().disabled, true); await submit(); assert.equal(calls.at(-1)!.status, "SCHEDULED"); assert.equal(calls.at(-1)!.receiptConfirmed, null);
    await select("근무 상태", "COMPLETED"); assert.equal(receipt().checked, false, "status changes do not reinterpret already stored/input wages as received");
    await render({ ...prior, receiptConfirmation: { confirmed: true, amount: 38410, revision: 2 } }); assert.equal(receipt().checked, true); await enter("확정 일급 (원)", "40000"); assert.match(document.body.textContent!, /확인 금액도 함께 정정/); await submit(); assert.equal(calls.at(-1)!.receiptConfirmed, true); assert.equal(calls.at(-1)!.confirmedDailyPay, 40000);
    await render({ ...prior, wageModel: "CONFIRMED_V2", confirmedDailyPay: 1000, dailyIncentive: 2000 }); await submit(); assert.equal(calls.at(-1)!.confirmedDailyPay, 1000, "unchanged V2 exception remains editable"); assert.equal(calls.at(-1)!.dailyIncentive, 2000);
    await render(newWorkRecord("2099-10-21", "2026-10-17", "stale-new", template));
    failure = "선택한 프리셋 버전이 변경되었습니다."; await submit(); assert.equal(calls.at(-1)!.selectedTemplateVersion, 3);
    const refreshed = { ...template, version: 4, presets: template.presets.map(preset => ({ ...preset, amount: preset.amount + 100 })) };
    await act(async () => root.render(<WorkRecordEditor key={session} value={current} templates={[refreshed, other]} onSaved={() => {}} onClose={() => {}} />));
    await submit(); assert.equal(calls.at(-1)!.selectedTemplateVersion, 3, "catalog refresh alone cannot mutate a draft selection");
    await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent === "선택 프리셋 다시 적용")!.click());
    failure = ""; await submit(); assert.equal(calls.at(-1)!.selectedTemplateVersion, 4, "same-ID preset explicitly reapplies refreshed version"); assert.equal(calls.at(-1)!.reselectPreset, true); assert.equal(calls.at(-1)!.confirmedDailyPay, null);
    assert.equal(document.querySelector('input[type="date"]'), null); assert.doesNotMatch(document.body.textContent!, /입금일|부분입금|추가 입금|잔여 금액/);
    for (const request of calls) { assert.equal("payments" in request, false); assert.equal("depositDate" in request, false); assert.equal("saveAsPresetName" in request, false); assert.equal("expectedAmount" in request, false); assert.equal(request.contractVersion, 4); }
  } finally { moneyApi.put = originalPut; await act(async () => root.unmount()); dom.window.close(); }
});
