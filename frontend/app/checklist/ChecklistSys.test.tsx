import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ItemDrawer } from "./ItemDrawer";
import Archived from "./Archived";
import type { ChecklistSysStore } from "./store";
import type { Catalog } from "@/lib/checklist-sys/api";
import { CHECKLIST_ICONS } from "@/components/checklist-core/icons";

const catalog: Catalog = {
  identities: [{ id: "ren", name: "REN", description: "", color: "#6cc68b", sortOrder: 0 }],
  areas: [{ id: "diet", identityId: "ren", name: "가벼움 / 다이어트", description: "", color: "#6cc68b", sortOrder: 0 }],
  items: [{ id: "old", areaId: "diet", name: "야식 먹지 않기", description: "", importance: "CORE", icon: "moon", sortOrder: 0, startDate: "2026-09-01", archivedOn: "2026-09-16", lastRecordOn: "2026-09-10" }],
  archivePeriods: [{ itemId: "old", archivedOn: "2026-09-16", restoredOn: null }],
};

test("create drawer (importance + broad icon set) and archived restore keep the same item id", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const requests: { method: string; url: string; body: unknown }[] = [];
  Object.assign(globalThis, {
    React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string, init: RequestInit) => { requests.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : null }); return new Response(null, { status: 204 }); },
  });
  const restored: string[] = [];
  const store = {
    catalog, busy: false,
    mutate: async (operation: () => Promise<unknown>) => { await operation(); },
    restoreItem: async (item: { id: string }) => { restored.push(item.id); },
  } as unknown as ChecklistSysStore;
  assert.ok(CHECKLIST_ICONS.length >= 100, "icon choice is broader than the mockup examples");

  const root = createRoot(document.getElementById("root")!);
  let closed = false;
  await act(() => root.render(<ItemDrawer store={store} initialAreaId="diet" onClose={() => { closed = true; }} />));
  const text = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label || b.getAttribute("aria-label") === label)!;
  const name = document.querySelector<HTMLInputElement>('input[placeholder="예: 매일 식단 기록"]')!;
  await act(() => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!; setter.call(name, "물 2L 이상 마시기"); name.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  await act(() => text("OPTIONAL").click());
  await act(() => text("물 아이콘").click());
  assert.ok(!document.body.textContent?.includes("Morning"), "no time-of-day settings");
  await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(resolve => setImmediate(resolve)); });
  const save = requests.find(r => r.method === "PUT" && r.url.includes("/api/checklist-sys/items/"));
  assert.ok(save, "item saved");
  assert.equal((save!.body as { importance: string }).importance, "OPTIONAL");
  assert.equal((save!.body as { icon: string }).icon, "glass-water");
  assert.equal((save!.body as { areaId: string }).areaId, "diet");
  assert.ok(closed);

  await act(() => root.render(<Archived store={store} navigate={() => {}} />));
  assert.ok(document.body.textContent?.includes("야식 먹지 않기"));
  assert.ok(document.body.textContent?.includes("09.10"), "last record shown — history kept");
  await act(async () => { text("야식 먹지 않기 복원").click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.deepEqual(restored, ["old"], "restore uses the same item id");
  await act(() => root.unmount());
  dom.window.close();
});
