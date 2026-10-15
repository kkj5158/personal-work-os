import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { newWorkRecord, offTemplateId, type WorkTemplate } from "../../lib/money/calendar";

test("legacy conversion requires explicit components, updates daily result live and protects money on OFF transition", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { WorkRecordEditor } = await import("./MoneyCalendarEditors");
  const normal: WorkTemplate = { id: "normal", version: 1, name: "야간", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "", groupName: "", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본급 설정", amount: 65000, active: true }] };
  const off: WorkTemplate = { ...normal, id: offTemplateId, name: "🏠 휴무", builtIn: "OFF", durationMinutes: 0, startTime: null, endTime: null, presets: [] };
  const legacy = { ...newWorkRecord("2020-10-07", "2020-10-15", "legacy-stable", normal), version: 3, expectedAmount: 73123, payments: [{ id: "preserve", depositDate: "2020-10-08", amount: 60000 }] };
  const root = createRoot(document.getElementById("root")!), old = moneyApi.put, writes: Record<string, unknown>[] = [];
  moneyApi.put = async <T,>(path: string, body: unknown) => { assert.equal(path, "/calendar/earnings-records/legacy-stable"); writes.push(body as Record<string, unknown>); return { ...legacy, ...(body as object), wageModel: "CONFIRMED_V2", confirmedDailyPay: 178560, version: 4 } as T; };
  const input = (label: string) => Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find(node => node.querySelector("span")?.textContent === label)!.querySelector<HTMLInputElement>("input")!;
  const enter = async (label: string, amount: string) => { await act(async () => { const node = input(label); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(node, amount); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const select = async (index: number, value: string) => { await act(async () => { const node = document.querySelectorAll("select")[index]; node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); };
  const submit = async () => act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  try {
    await act(async () => root.render(<WorkRecordEditor value={legacy} templates={[normal, off]} onSaved={() => {}} onClose={() => {}} />));
    assert.equal(input("기본급 (원)").value, ""); assert.match(document.body.textContent!, /과거 금액 73,123원/); await submit(); assert.equal(writes.length, 0);
    await enter("기본급 (원)", "168560"); await enter("인센 (원)", "15000"); await enter("공제총액 (원)", "5000");
    assert.equal(document.querySelector("output")!.textContent, "178,560원");
    await enter("공제총액 (원)", "200000"); await submit(); assert.equal(writes.length, 0); assert.match(document.body.textContent!, /공제총액은 기본급과 인센의 합계를 넘을 수/);
    await enter("공제총액 (원)", "5000");
    let confirmations = 0; dom.window.confirm = () => { confirmations++; return false; }; await select(1, offTemplateId); assert.equal(document.querySelector("select")!.value, "COMPLETED"); assert.equal(input("기본급 (원)").value, "168560");
    dom.window.confirm = () => { confirmations++; return true; }; await select(1, offTemplateId); assert.equal(document.querySelector("select")!.value, "OFF"); assert.equal(document.querySelector("output"), null);
    await select(1, normal.id); assert.equal(input("기본급 (원)").value, "168560"); assert.equal(input("인센 (원)").value, "15000"); assert.equal(input("공제총액 (원)").value, "5000"); assert.equal(confirmations, 2);
    await submit(); assert.equal(writes.length, 1); assert.equal(writes[0].basePay, 168560); assert.equal(writes[0].dailyIncentive, 15000); assert.equal(writes[0].totalDeduction, 5000); assert.equal("expectedAmount" in writes[0], false); assert.equal("payments" in writes[0], false); assert.equal(legacy.expectedAmount, 73123); assert.equal(legacy.payments.length, 1);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
