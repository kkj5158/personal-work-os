import "./testDom";
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import Journal from "./Journal";
import Classification from "./Classification";
import LegacyItems from "./manage/items/page";
import LegacyArchived from "./archived/page";
import { useChecklistSysStore, type ChecklistSysStore } from "./store";
import type { Catalog } from "@/lib/checklist-sys/api";
import { CHECKLIST_ICONS } from "@/components/checklist-core/icons";
import { seoulToday } from "@/lib/checklist-core/dates";

const REN = "#6cc68b", KAFKA = "#9b7fe6";
const seed = (): Catalog => ({
  identities: [
    { id: "ren", name: "REN", description: "몸", color: REN, sortOrder: 0 },
    { id: "kafka", name: "KAFKA", description: "", color: KAFKA, sortOrder: 1 },
  ],
  areas: [
    { id: "diet", identityId: "ren", name: "가벼움 / 다이어트", description: "", color: "#e9b64f", sortOrder: 0 },
    { id: "sleep", identityId: "ren", name: "수면", description: "", color: REN, sortOrder: 1 },
    { id: "work", identityId: "kafka", name: "Work", description: "", color: KAFKA, sortOrder: 0 },
  ],
  items: [
    { id: "water", areaId: "diet", name: "물 2L", description: "", importance: "CORE", icon: "glass-water", sortOrder: 0, startDate: "2026-09-01", archivedOn: null, lastRecordOn: null },
    { id: "snack", areaId: "diet", name: "야식 금지", description: "", importance: "CORE", icon: "moon", sortOrder: 1, startDate: "2026-09-01", archivedOn: null, lastRecordOn: null },
    { id: "log", areaId: "work", name: "업무 일지", description: "", importance: "CORE", icon: "notebook-pen", sortOrder: 0, startDate: "2026-09-01", archivedOn: null, lastRecordOn: null },
    { id: "old", areaId: "diet", name: "옛 습관", description: "", importance: "CORE", icon: "star", sortOrder: 2, startDate: "2026-09-01", archivedOn: "2026-09-16", lastRecordOn: "2026-09-10" },
  ],
  archivePeriods: [{ itemId: "old", archivedOn: "2026-09-16", restoredOn: null }],
});

type Request = { method: string; path: string; body: Record<string, unknown> | null };

/** Minimal fake of /api/checklist-sys: persists into `db`, records every request, can fail the next matching write. */
function fakeBackend(db: Catalog) {
  const requests: Request[] = [];
  let failNext: RegExp | null = null;
  const fetch = async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname.replace("/api/checklist-sys", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, path, body });
    if (method !== "GET" && failNext?.test(`${method} ${path}`)) {
      failNext = null;
      return new Response(JSON.stringify({ message: "서버 저장 실패" }), { status: 400 });
    }
    if (method === "GET") return new Response(JSON.stringify(path === "" ? structuredClone(db) : []), { status: 200 });
    let m: RegExpMatchArray | null;
    if (method === "PUT" && (m = path.match(/^\/identities\/([^/]+)$/)) && m[1] !== "order") {
      const i = db.identities.find(x => x.id === m![1]);
      if (i) Object.assign(i, { name: body.name, description: body.description, color: body.color }); else db.identities.push(body);
    } else if (method === "PUT" && (m = path.match(/^\/areas\/([^/]+)$/)) && m[1] !== "order") {
      const a = db.areas.find(x => x.id === m![1]);
      if (a) Object.assign(a, body); else db.areas.push(body);
    } else if (method === "PUT" && (m = path.match(/^\/items\/([^/]+)$/)) && m[1] !== "order") {
      const i = db.items.find(x => x.id === m![1]);
      if (i) Object.assign(i, body); else db.items.push({ ...body, archivedOn: null });
    } else if (method === "POST" && (m = path.match(/^\/items\/(.+)\/restore$/))) {
      db.items.find(x => x.id === m![1])!.archivedOn = null;
      db.archivePeriods.forEach(p => { if (p.itemId === m![1]) p.restoredOn = "2026-09-26"; });
    }
    return new Response(null, { status: 204 });
  };
  return { requests, fetch, failNextWrite: (pattern: RegExp) => { failNext = pattern; } };
}

async function setup(render: (store: ChecklistSysStore) => React.ReactNode) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  const db = seed();
  const backend = fakeBackend(db);
  Object.assign(globalThis, {
    React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true, fetch: backend.fetch,
  });
  let store!: ChecklistSysStore;
  function App() { store = useChecklistSysStore(); return <>{store.loading ? null : render(store)}</>; }
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<App />));
  await flush();
  const setter = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(() => {
    const proto = el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const select = (el: HTMLSelectElement, value: string) => act(() => { el.value = value; el.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  const done = async () => { await act(() => root.unmount()); dom.window.close(); };
  return { dom, db, backend, store: () => store, setter, select, button, done };
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); });
const wait = (ms: number) => act(() => new Promise(resolve => setTimeout(resolve, ms)));
const writes = (requests: Request[]) => requests.filter(r => r.method !== "GET");

test("Journal: item name/icon opens the docked panel (not a modal), grid stays; icons use the owning Identity color", async () => {
  const t = await setup(store => <Journal store={store} scope={{ identityId: null, areaId: null }} onClearScope={() => {}} navigate={() => {}} />);
  const grid = document.querySelector('table[aria-label="체크리스트 Journal"]');
  assert.ok(grid, "grid renders");
  const icons = [...document.querySelectorAll<HTMLElement>(".ckc-rowicon")];
  assert.equal(icons.length, 3, "active items only");
  const color = (label: string) => document.querySelector<HTMLElement>(`button[aria-label="${label} 편집"] .ckc-rowicon`)!.style.color;
  assert.equal(color("물 2L"), color("야식 금지"), "different icon shapes, same Identity → same color");
  assert.notEqual(color("물 2L"), color("업무 일지"), "different Identity → different color");
  assert.ok(document.querySelectorAll(".ckc-rowdrag").length === 3, "each row has its own reorder handle");

  await act(() => t.button("물 2L 편집")!.click());
  const panel = document.querySelector("aside.cks-panel");
  assert.ok(panel, "panel open");
  assert.equal(document.querySelector('[aria-modal="true"]'), null, "no modal");
  assert.ok(document.querySelector('table[aria-label="체크리스트 Journal"]'), "Journal grid still visible");
  assert.equal(writes(t.backend.requests).length, 0, "opening the editor never records a result");
  assert.equal(document.querySelector<HTMLInputElement>('input[placeholder="예: 매일 식단 기록"]')!.value, "물 2L");

  // A date cell still records, independently of the panel.
  const cell = document.querySelector<HTMLElement>(`button[aria-label^="${seoulToday()} 물 2L"]`)!;
  await act(() => { cell.dispatchEvent(new t.dom.window.PointerEvent("pointerdown", { bubbles: true, button: 0 })); t.dom.window.dispatchEvent(new t.dom.window.PointerEvent("pointerup", { bubbles: true })); });
  await flush();
  const record = writes(t.backend.requests).find(r => r.path === "/records");
  assert.deepEqual(record?.body, { changes: [{ itemId: "water", date: seoulToday(), state: "SUCCESS" }] });
  await t.done();
});

test("item panel: edits autosave in place, failures keep the draft for retry, Journal reflects saves without reload", async () => {
  const t = await setup(store => <Journal store={store} scope={{ identityId: null, areaId: null }} onClearScope={() => {}} navigate={() => {}} />);
  await act(() => t.button("물 2L 편집")!.click());
  const name = document.querySelector<HTMLInputElement>('input[placeholder="예: 매일 식단 기록"]')!;
  t.backend.failNextWrite(/PUT \/items\/water/);
  await t.setter(name, "물 2.5L");
  await wait(600); await flush();
  assert.match(document.querySelector(".cks-save-error")?.textContent ?? "", /서버 저장 실패/, "error shown in context");
  assert.equal(name.value, "물 2.5L", "failed edit is kept");
  assert.ok(document.querySelector("aside.cks-panel"), "panel stays open on failure");
  await act(() => t.button("다시 시도")!.click());
  await flush();
  assert.equal(t.db.items.find(i => i.id === "water")!.name, "물 2.5L", "retry persisted");
  assert.ok(t.button("물 2.5L 편집"), "Journal row updated in place");
  assert.equal(t.backend.requests.filter(r => r.method === "GET" && r.path === "").length, 1, "no catalog reload for an item edit");
  assert.equal(document.querySelector(".cks-save")?.textContent, "저장됨");
  await t.done();
});

test("add item uses the same panel in create mode, then continues as edit of the same new id", async () => {
  const t = await setup(store => <Journal store={store} scope={{ identityId: "ren", areaId: "diet" }} onClearScope={() => {}} navigate={() => {}} />);
  assert.ok(CHECKLIST_ICONS.length >= 100, "icon choice is broad");
  await act(() => t.button("체크리스트 추가")!.click());
  assert.ok(document.querySelector("aside.cks-panel"), "create mode is the same docked panel");
  assert.ok(!document.body.textContent?.includes("Morning"), "no time-of-day settings");
  await t.setter(document.querySelector<HTMLInputElement>('input[placeholder="예: 매일 식단 기록"]')!, "채소 먹기");
  await act(() => t.button("OPTIONAL")!.click());
  await act(() => t.button("물 아이콘")!.click());
  await act(async () => { t.button("항목 추가")!.click(); });
  await flush();
  const save = writes(t.backend.requests).find(r => r.method === "PUT" && r.path.startsWith("/items/"))!;
  assert.equal(save.body!.importance, "OPTIONAL");
  assert.equal(save.body!.icon, "glass-water");
  assert.equal(save.body!.areaId, "diet");
  assert.ok(t.button("채소 먹기 편집"), "new row appears in the Journal immediately");
  assert.equal(document.querySelector("#cks-panel-title")?.textContent, "체크리스트 항목", "panel switched to edit mode");
  assert.equal(t.store().catalog.items.find(i => i.name === "채소 먹기")!.id, save.path.split("/")[2]);
  await t.done();
});

test("archived items are reached from Journal and restore keeps the same item id and history", async () => {
  const t = await setup(store => <Journal store={store} scope={{ identityId: null, areaId: null }} onClearScope={() => {}} navigate={() => {}} initialArchived />);
  assert.ok(document.body.textContent?.includes("09.10"), "last record shown — history kept");
  await act(() => t.button("옛 습관 보관 항목 열기")!.click());
  assert.ok(document.querySelector(".cks-panel-note")?.textContent?.includes("보관된 항목"));
  await act(async () => { t.button("복원")!.click(); });
  await flush();
  assert.ok(writes(t.backend.requests).some(r => r.method === "POST" && r.path === "/items/old/restore"), "restore targets the same id");
  assert.ok(!writes(t.backend.requests).some(r => r.method === "PUT" && r.path.startsWith("/items/")), "no clone is created");
  assert.ok(t.button("옛 습관 편집"), "restored item is back in the Journal grid");
  await t.done();
});

test("Identity edit (regression): name/description/color persist, lists update immediately, color propagates, failure keeps edits", async () => {
  const t = await setup(store => <><Classification store={store} navigate={() => {}} /><Journal store={store} scope={{ identityId: null, areaId: null }} onClearScope={() => {}} navigate={() => {}} /></>);
  assert.equal(document.querySelector('[aria-modal="true"]'), null, "no modal editor");
  const form = document.querySelector<HTMLFormElement>('form[aria-label="REN Identity 편집"]')!;
  const [name, description] = [...form.querySelectorAll<HTMLInputElement>("input")];
  t.backend.failNextWrite(/PUT \/identities\/ren/);
  await t.setter(name, "REN 2");
  await wait(550); await flush();
  assert.match(form.querySelector(".cks-save-error")?.textContent ?? "", /서버 저장 실패/, "failure is visible");
  assert.equal(name.value, "REN 2", "failed edit is not discarded");
  await t.setter(description, "몸과 식사");
  await act(() => (form.querySelector('button[aria-label="색상 #4c7ef0"]') as HTMLButtonElement).click());
  await wait(550); await flush();
  assert.deepEqual(t.db.identities.find(i => i.id === "ren"), { id: "ren", name: "REN 2", description: "몸과 식사", color: "#4c7ef0", sortOrder: 0 }, "persisted");
  assert.equal(form.querySelector(".cks-save")?.textContent, "저장됨");
  const listed = document.querySelector('.cks-identity-card button[aria-pressed="true"]')!;
  assert.ok(listed.textContent?.includes("REN 2") && listed.textContent.includes("몸과 식사"), "Identity list reflects the save immediately");
  assert.equal(document.querySelector<HTMLElement>('button[aria-label="물 2L 편집"] .ckc-rowicon')!.style.color, "rgb(76, 126, 240)", "item icons follow the new Identity color");
  const areaDots = [...document.querySelectorAll<HTMLElement>(".cks-area-row .cks-dot")].map(d => d.style.background);
  assert.ok(areaDots.length === 2 && areaDots.every(c => c === "rgb(76, 126, 240)"), "Area cues follow the Identity color");
  // Reload: a fresh store reads the persisted values.
  await act(() => t.store().reloadCatalog());
  assert.equal(t.store().catalog.identities.find(i => i.id === "ren")!.name, "REN 2");
  await t.done();
});

test("ordering: items reorder within one Area, Identities and Areas within their own level, all optimistic", async () => {
  const t = await setup(() => null);
  const store = t.store;
  await act(() => store().reorder("items", "diet", ["snack", "water"]));
  await act(() => store().reorder("identities", null, ["kafka", "ren"]));
  await act(() => store().reorder("areas", "ren", ["sleep", "diet"]));
  const put = writes(t.backend.requests);
  assert.deepEqual(put.map(r => [r.path, r.body]), [
    ["/items/order", { parentId: "diet", ids: ["snack", "water"] }],
    ["/identities/order", { parentId: null, ids: ["kafka", "ren"] }],
    ["/areas/order", { parentId: "ren", ids: ["sleep", "diet"] }],
  ]);
  const order = <T extends { id: string; sortOrder: number }>(rows: T[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map(r => r.id);
  assert.deepEqual(order(store().catalog.items.filter(i => i.areaId === "diet")), ["snack", "water", "old"], "archived sibling keeps its slot");
  assert.deepEqual(order(store().catalog.identities), ["kafka", "ren"]);
  assert.deepEqual(order(store().catalog.areas.filter(a => a.identityId === "ren")), ["sleep", "diet"]);
  assert.equal(store().catalog.areas.find(a => a.id === "work")!.identityId, "kafka", "ownership never changes by reorder");

  t.backend.failNextWrite(/PUT \/items\/order/);
  await act(() => store().reorder("items", "diet", ["water", "snack"]));
  assert.deepEqual(order(store().catalog.items.filter(i => i.areaId === "diet")), ["snack", "water", "old"], "failed reorder reverts");
  assert.match(store().error, /서버 저장 실패/);
  await t.done();
});

test("legacy standalone item-management / archive routes redirect into Journal", () => {
  const target = (page: () => unknown) => { try { page(); } catch (e) { return String((e as { digest?: string }).digest).split(";")[2]; } return null; };
  assert.equal(target(LegacyItems), "/checklist");
  assert.equal(target(LegacyArchived), "/checklist?archived=1");
});
