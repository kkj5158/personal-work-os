import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { moneyApi } from "../../lib/money/model";
import { applyTemplate, newWorkRecord, offTemplateId, type EarningsWeek, type WorkRecord, type WorkTemplate } from "../../lib/money/calendar";
import { PanelContext } from "./MoneyPanel";
import { WorkRecordEditor, TemplateEditor, WeeklyForm } from "./MoneyCalendarEditors";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.confirm = () => true;
  const root = createRoot(document.getElementById("root")!);
  return { root, dom };
}
const template: WorkTemplate = { id: "template", version: 3, name: "야간 2조", durationMinutes: 240, startTime: "22:00", endTime: "02:00", overnight: true, breakMinutes: 0, active: true, shiftDescription: "야간", groupName: "2조", defaultPresetId: "preset", presets: [{ id: "preset", name: "기본", amount: 65000, active: true }] };
const offTemplate: WorkTemplate = { ...template, id: offTemplateId, version: 0, builtIn: "OFF", name: "🏠 휴무", durationMinutes: 0, startTime: null, endTime: null, overnight: false, defaultPresetId: "00000000-0000-4000-8000-000000000005", presets: [{ id: "00000000-0000-4000-8000-000000000005", name: "휴무", amount: 0, active: true }] };
function button(text: string) { const node = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes(text)); assert.ok(node, `button ${text}`); return node; }
test("work editor omits legacy payment rows from writes and retains receivable draft after failure", async () => {
  const { root, dom } = setup(), calls: unknown[] = [], old = moneyApi.put;
  const record = { basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000, wageModel: "CONFIRMED_V2", ...newWorkRecord("2020-10-07", "2020-10-15", "work-stable", template), version: 7, payments: [{ id: "payment-stable-1", depositDate: "2020-10-10", amount: 20000 }, { id: "payment-stable-2", depositDate: "2020-10-13", amount: 45000 }] };
  let fail = true;
  moneyApi.put = async <T,>(path: string, body: unknown) => { calls.push({ path, body }); if (fail) throw new Error("연결 실패"); return { ...record, version: 8 } as T; };
  try {
    await act(async () => root.render(<PanelContext.Provider value={{ setDirty: () => {} }}><WorkRecordEditor value={record} templates={[template]} onSaved={() => {}} onClose={() => {}} /></PanelContext.Provider>));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.match(document.body.textContent!, /연결 실패.*초안은 유지/);
    assert.equal(document.querySelectorAll(".mc-payment").length, 0);
    fail = false; await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
    const body = (calls[0] as { body: WorkRecord & { expectedVersion: number } }).body;
    assert.equal(body.expectedVersion, 7); assert.equal(body.durationMinutes, 240); assert.equal("payments" in body, false); assert.equal("expectedAmount" in body, false); assert.equal(body.confirmedDailyPay, 65000); assert.equal(body.basePay, null); assert.doesNotMatch(document.body.textContent!, /실제 입금 내역|입금 추가|잔여 예상/);
    assert.match(document.body.textContent!, /근무 기록을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
test("weekly editor adds only special/rest allowances to confirmed daily components", async () => {
  const { root } = setup();
  const week: EarningsWeek = { start: "2026-10-04", end: "2026-10-10", version: 1, baseTotal: 42520, incentiveTotal: 2000, deductionTotal: 4110, dailyTotal: 38410 + 74560, finalPay: 137970, specialWorkAllowance: 10000, weeklyHolidayAllowance: 15000, workEntries: [], legacyReviewCount: 2, dailyFingerprint: "fingerprint" };
  try {
    await act(async () => root.render(<WeeklyForm initial={week} onClose={() => {}} onSaved={() => {}} />));
    const text = document.body.textContent!; assert.ok(text.indexOf("주급 총액") < text.indexOf("확정 일급 합계")); assert.ok(text.indexOf("확정 일급 합계") < text.indexOf("주간 추가 수당"));
    assert.match(text, /137,970원/); assert.match(text, /112,970원/); assert.match(text, /인센 합계 \(포함 내역\) 2,000원/); assert.match(text, /과거 기록 2건/); assert.equal(document.querySelectorAll('input[type="number"]').length, 2); assert.doesNotMatch(text, /기본급 총합|공제액 총합|공휴일수당|인센티브\(인센\)/); assert.equal(button("수당 내역 저장").disabled, false);
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
test("weekly save guards the complete daily fingerprint and sends only two add-ons", async () => {
  const { root, dom } = setup(), old = moneyApi.put, calls: unknown[] = [];
  const week: EarningsWeek = { start: "2026-10-04", end: "2026-10-10", version: 4, baseTotal: 371700, incentiveTotal: 0, deductionTotal: 0, dailyTotal: 371700, finalPay: 371700, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, workEntries: [], legacyReviewCount: 0, dailyFingerprint: "observed-day-versions" };
  moneyApi.put = async <T,>(_path: string, body: unknown) => { calls.push(body); return { ...week, version: 5, allowancesConfirmed: true } as T; };
  try {
    await act(async () => root.render(<WeeklyForm initial={week} onClose={() => {}} onSaved={() => {}} />));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(calls[0], { expectedVersion: 4, expectedDailyFingerprint: "observed-day-versions", specialWorkAllowance: 0, weeklyHolidayAllowance: 0 });
    assert.match(document.body.textContent!, /수당 내역을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
test("late work, template and weekly save responses cannot clear a replacement editor's dirty state", async () => {
  for (const kind of ["work", "template", "week"] as const) {
    const { root, dom } = setup(), old = moneyApi.put;
    const work = { basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000, wageModel: "CONFIRMED_V2", ...newWorkRecord("2020-10-07", "2020-10-15", "work-a", template), version: 1 };
    const week: EarningsWeek = { start: "2026-10-04", end: "2026-10-10", version: 1, baseTotal: 100, incentiveTotal: 0, deductionTotal: 0, dailyTotal: 100, finalPay: 100, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, workEntries: [], legacyReviewCount: 0, dailyFingerprint: "a" };
    let resolveSave: (value: unknown) => void = () => {}, dirty = true, oldSaved = 0;
    const setDirty = (value: boolean) => { dirty = value; };
    moneyApi.put = async <T,>() => await new Promise<unknown>(resolve => { resolveSave = resolve; }) as T;
    const renderEditor = (id: "a" | "b") => <PanelContext.Provider value={{ setDirty }}>{kind === "work" ? <WorkRecordEditor key={id} value={{ ...work, id: "work-" + id, memo: id === "b" ? "새 근무 초안" : "" }} templates={[template]} onClose={() => {}} onSaved={() => { if (id === "a") oldSaved++; }} /> : kind === "template" ? <TemplateEditor key={id} initial={{ ...template, id: "template-" + id, name: id === "b" ? "새 템플릿 초안" : template.name }} onSaved={() => { if (id === "a") oldSaved++; }} /> : <WeeklyForm key={id} initial={{ ...week, baseTotal: id === "b" ? 200 : 100 }} onClose={() => {}} onSaved={() => { if (id === "a") oldSaved++; }} />}</PanelContext.Provider>;
    try {
      await act(async () => root.render(renderEditor("a")));
      await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
      await act(async () => root.render(renderEditor("b")));
      setDirty(true); // The new active editor has an unsaved draft.
      const replacement = document.querySelector(".mc-editor");
      await act(async () => { resolveSave(kind === "work" ? { ...work, version: 2 } : kind === "template" ? { ...template, version: 4 } : { ...week, version: 2 }); });
      assert.equal(dirty, true, kind + " must not clear the replacement guard"); assert.equal(oldSaved, 0, kind + " must not call stale parent callbacks"); assert.equal(document.querySelector(".mc-editor"), replacement);
    } finally { moneyApi.put = old; await act(async () => root.unmount()); }
  }
});
test("OFF picker and status transitions zero hidden work/pay fields while preserving legacy deposit facts", async () => {
  const { root, dom } = setup(), old = moneyApi.put, requests: Record<string, unknown>[] = [];
  const record = { basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000, wageModel: "CONFIRMED_V2", ...newWorkRecord("2020-10-07", "2020-10-15", "off-transition", template), version: 7, payments: [{ id: "legacy", depositDate: "2020-10-08", amount: 65000 }] };
  moneyApi.put = async <T,>(_path: string, body: unknown) => { requests.push(body as Record<string, unknown>); return { ...record, ...(body as object), version: 7 + requests.length } as T; };
  try {
    await act(async () => root.render(<WorkRecordEditor value={record} templates={[template, offTemplate]} onClose={() => {}} onSaved={() => {}} />));
    const select = (index: number, value: string) => { const node = document.querySelectorAll("select")[index]; node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); };
    await act(async () => select(1, offTemplateId));
    assert.equal(document.querySelectorAll<HTMLInputElement>('input[type="time"]').length, 0); assert.equal(document.querySelectorAll('input[type="number"]').length, 0); assert.equal(document.querySelector("select")!.value, "OFF"); assert.match(document.body.textContent!, /휴무 · 실근무 0분 · 확정 일당 0원/);
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    for (const key of ["durationMinutes", "breakMinutes", "confirmedDailyPay", "dailyIncentive"]) assert.equal(requests[0][key], 0); assert.equal(requests[0].templateId, null); assert.equal(requests[0].presetId, null); assert.equal(requests[0].startTime, null); assert.equal(requests[0].endTime, null); assert.equal("payments" in requests[0], false); assert.equal(record.payments.length, 1);
    await act(async () => select(1, template.id));
    assert.equal(document.querySelector("select")!.value, "COMPLETED"); assert.equal(document.querySelector<HTMLInputElement>('input[type="time"]')!.value, "22:00"); assert.equal(Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find(label => label.querySelector("span")?.textContent === "확정 일급 (원)")!.querySelector<HTMLInputElement>("input")!.value, "65000");
    await act(async () => select(0, "CANCELLED")); assert.equal(document.querySelectorAll('input[type="time"]').length, 0);
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(requests[1].status, "CANCELLED"); assert.equal(requests[1].confirmedDailyPay, 0); assert.equal(requests[1].durationMinutes, 0); assert.equal("payments" in requests[1], false);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
test("saved OFF removal uses a versioned soft archive and immutable built-in template has no editing form", async () => {
  const { root } = setup(), old = moneyApi.post, requests: unknown[] = [];
  const record = { ...applyTemplate(newWorkRecord("2020-10-07", "2020-10-15", "off-stable"), offTemplate), version: 4 };
  let removed = 0;
  moneyApi.post = async <T,>(path: string, body: unknown) => { requests.push({ path, body }); return { ...record, version: 5, removed: true } as T; };
  try {
    await act(async () => root.render(<WorkRecordEditor value={record} templates={[template, offTemplate]} onClose={() => {}} onSaved={() => {}} onRemoved={() => removed++} />));
    await act(async () => button("휴무 기록 삭제").click()); assert.deepEqual(requests, [{ path: "/calendar/work-records/off-stable/remove-off", body: { expectedVersion: 4 } }]); assert.equal(removed, 1);
    await act(async () => root.render(<TemplateEditor initial={offTemplate} onSaved={() => { throw new Error("built-in must never save"); }} />));
    assert.equal(document.querySelector("form"), null); assert.equal(document.querySelector("input"), null); assert.match(document.body.textContent!, /기본 제공 템플릿 · 읽기 전용/);
  } finally { moneyApi.post = old; await act(async () => root.unmount()); }
});

test("historical preset belongs only to the original working template, never OFF or a different template", async () => {
  const second = { ...template, id: "template-b", name: "주간", defaultPresetId: "preset-b", presets: [{ id: "preset-b", name: "주간 일급", amount: 72000, active: true }] };
  for (const startsOff of [false, true]) {
    const { root, dom } = setup();
    const working = { basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000, wageModel: "CONFIRMED_V2", ...newWorkRecord("2020-10-07", "2020-10-15", "snapshot", template), version: 4 };
    const record = startsOff ? applyTemplate(working, offTemplate) : working;
    try {
      await act(async () => root.render(<WorkRecordEditor value={record} templates={[template, second, offTemplate]} onClose={() => {}} onSaved={() => {}} />));
      assert.equal(!!document.querySelector('option[value="snapshot"]'), !startsOff);
      await act(async () => { const picker = document.querySelectorAll("select")[1]; picker.value = second.id; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
      assert.equal(document.querySelector('option[value="snapshot"]'), null);
      assert.equal(document.querySelectorAll("select")[2].value, "preset-b");
      assert.equal(Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find(label => label.querySelector("span")?.textContent === "확정 일급 (원)")!.querySelector<HTMLInputElement>("input")!.value, "72000", "P07 deliberate template change applies its preset amount");
      await act(async () => { const picker = document.querySelectorAll("select")[1]; picker.value = template.id; picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
      assert.equal(!!document.querySelector('option[value="snapshot"]'), !startsOff);
    } finally { await act(async () => root.unmount()); }
  }
});

test("verified zero legacy OFF remains editable without hidden monetary validation", async () => {
  const { root, dom } = setup(), old = moneyApi.put, requests: Record<string, unknown>[] = [];
  const off = { ...applyTemplate(newWorkRecord("2020-10-07", "2020-10-15", "legacy-off"), offTemplate), version: 3 };
  moneyApi.put = async <T,>(_path: string, body: unknown) => { requests.push(body as Record<string, unknown>); return { ...off, ...(body as object), version: 4, wageModel: "CONFIRMED_V2" } as T; };
  try {
    await act(async () => root.render(<WorkRecordEditor value={off} templates={[template, offTemplate]} onSaved={() => {}} onClose={() => {}} />));
    assert.equal(document.querySelector('input[type="number"]'), null);
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(requests.length, 1); for (const key of ["confirmedDailyPay", "dailyIncentive"]) assert.equal(requests[0][key], 0);
    assert.match(document.body.textContent!, /근무 기록을 저장했습니다/);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});

test("historical preset clone shows its preserved reference even after catalog amount changes", async () => {
  const { root } = setup();
  const record = { ...newWorkRecord("2020-10-07", "2020-10-15", "historic-reference", template), version: 2, wageModel: "CONFIRMED_V2", basePay: 65000, dailyIncentive: 0, totalDeduction: 0, confirmedDailyPay: 65000 };
  const updated = { ...template, presets: template.presets.map(preset => ({ ...preset, amount: 66000 })) };
  try {
    await act(async () => root.render(<WorkRecordEditor value={record} templates={[updated]} onSaved={() => {}} onClose={() => {}} />));
    assert.equal(document.querySelectorAll("select")[2].value, "snapshot");
    assert.ok(document.querySelector('option[value="preset"]'), "active same-ID preset remains available for explicit reselection");
    assert.match(document.querySelector('option[value="snapshot"]')!.textContent!, /65,000원/); assert.equal(document.querySelector('input[name="save-as-preset"]'), null);
    assert.match(document.body.textContent!, /66,000원/, "catalog choice shows current amount while saved snapshot stays selected");
  } finally { await act(async () => root.unmount()); }
});

test("weekly derived total can exceed one daily input limit while both weekly inputs remain valid", async () => {
  const { root, dom } = setup(), old = moneyApi.put; let writes = 0;
  const week: EarningsWeek = { start: "2026-10-04", end: "2026-10-10", version: 0, baseTotal: 6999999999993, incentiveTotal: 0, deductionTotal: 0, dailyTotal: 6999999999993, finalPay: 6999999999993, specialWorkAllowance: 0, weeklyHolidayAllowance: 0, workEntries: [], legacyReviewCount: 0, dailyFingerprint: "seven-valid-daily-values" };
  moneyApi.put = async <T,>() => { writes++; return { ...week, version: 1 } as T; };
  try {
    await act(async () => root.render(<WeeklyForm initial={week} onClose={() => {}} onSaved={() => {}} />)); assert.equal(button("수당 내역 저장").disabled, false);
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }))); assert.equal(writes, 1);
  } finally { moneyApi.put = old; await act(async () => root.unmount()); }
});
