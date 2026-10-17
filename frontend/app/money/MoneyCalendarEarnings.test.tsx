import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { newWorkRecord, offTemplateId, type WorkTemplate } from "../../lib/money/calendar";

test("legacy confirmation requires direct pay, incentives stay included and OFF transitions preserve drafts", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { WorkRecordEditor } = await import("./MoneyCalendarEditors");
  const normal: WorkTemplate = { id: "normal", version: 1, name: "야간", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본급 설정", amount: 65000, active: true }] };
  const off: WorkTemplate = { ...normal, id: offTemplateId, name: "🏠 휴무", builtIn: "OFF", durationMinutes: 0, startTime: null, endTime: null, presets: [] };
  const legacy = { ...newWorkRecord("2020-10-07", "2020-10-15", "legacy-stable", normal), version: 3, expectedAmount: 73123, payments: [{ id: "preserve", depositDate: "2020-10-08", amount: 60000 }] };
  const root = createRoot(document.getElementById("root")!), old = moneyApi.put, writes: Record<string, unknown>[] = [];
  moneyApi.put = async <T,>(path: string, body: unknown) => { assert.equal(path, "/calendar/earnings-records/legacy-stable"); writes.push(body as Record<string, unknown>); return { ...legacy, ...(body as object), wageModel: "CONFIRMED_DIRECT_V3", version: 4 } as T; };
  const input = (label: string) => Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find(node => node.querySelector("span")?.textContent === label)!.querySelector<HTMLInputElement>("input")!;
  const enter = async (label: string, amount: string) => { await act(async () => { const node = input(label); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(node, amount); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const select = async (index: number, value: string) => { await act(async () => { const node = document.querySelectorAll("select")[index]; node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); };
  const submit = async () => act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  try {
    await act(async () => root.render(<WorkRecordEditor value={legacy} templates={[normal, off]} onSaved={() => {}} onClose={() => {}} />));
    assert.equal(input("확정 일급 (원)").value, ""); assert.match(document.body.textContent!, /과거 금액 73,123원/); await submit(); assert.equal(writes.length, 0);
    await select(2, "preset"); assert.equal(input("확정 일급 (원)").value, "", "historical base preset never confirms pay");
    await enter("확정 일급 (원)", "38410"); await enter("인센티브 (포함 금액)", "2000");
    assert.equal(input("확정 일급 (원)").value, "38410"); assert.doesNotMatch(document.body.textContent!, /공제총액 \(원\)|기본급 \(원\)/);
    await enter("인센티브 (포함 금액)", "38411"); await submit(); assert.equal(writes.length, 0); assert.match(document.body.textContent!, /인센티브는 확정 일급을 넘을 수/);
    await enter("인센티브 (포함 금액)", "2000");
    let confirmations = 0; dom.window.confirm = () => { confirmations++; return false; }; await select(1, offTemplateId); assert.equal(document.querySelector("select")!.value, "COMPLETED"); assert.equal(input("확정 일급 (원)").value, "38410");
    dom.window.confirm = () => { confirmations++; return true; }; await select(1, offTemplateId); assert.equal(document.querySelector("select")!.value, "OFF"); assert.equal(document.querySelector("output"), null);
    assert.doesNotMatch(document.body.textContent!, /과거 금액|확인 필요/);
    await select(1, normal.id); assert.equal(input("확정 일급 (원)").value, "38410"); assert.equal(input("인센티브 (포함 금액)").value, "2000"); assert.equal(confirmations, 2);
    await submit(); assert.equal(writes.length, 1); assert.equal(writes[0].confirmedDailyPay, 38410); assert.equal(writes[0].dailyIncentive, 2000); for (const key of ["basePay", "totalDeduction", "expectedAmount", "payments"]) assert.equal(key in writes[0], false); assert.equal(legacy.expectedAmount, 73123); assert.equal(legacy.payments.length, 1);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
