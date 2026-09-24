import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ChecklistGrid } from "./ChecklistGrid";
import { useChecklistMutations } from "./useChecklistMutations";
import { cellKey, type CellChange, type ChecklistState } from "@/lib/checklist-core/types";

const dates = ["2026-09-12", "2026-09-13", "2026-09-14"].map(date => ({ date }));
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); });

function Harness({ writes, initial }: { writes: CellChange[][]; initial: Record<string, ChecklistState> }) {
  const [base, setBase] = useState(new Map(Object.entries(initial)));
  const baseState = useCallback((row: string, date: string) => base.get(cellKey(row, date)) ?? "UNTOUCHED", [base]);
  const mutations = useChecklistMutations({
    baseState,
    persist: async changes => { writes.push(changes); },
    commit: changes => setBase(previous => { const next = new Map(previous); for (const c of changes) next.set(cellKey(c.rowId, c.date), c.state); return next; }),
  });
  return <ChecklistGrid label="grid" today="2026-09-14" mutations={mutations} dates={dates}
    availability={(row, date) => (row === "c" && date === "2026-09-12" ? "INACTIVE" : "EDITABLE")}
    groups={[{ id: "g", label: "REN / 식사", rows: [{ id: "a", label: "A", icon: "utensils" }, { id: "b", label: "B" }, { id: "c", label: "C" }] }]} />;
}

test("full-cell click, drag multi-select + shared bulk bar, date-level NOT_RECORDED with conflict confirm, undo", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const writes: CellChange[][] = [];
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<Harness writes={writes} initial={{ [cellKey("b", "2026-09-13")]: "FAILURE" }} />));
  const cell = (row: string, date: string) => document.querySelector<HTMLButtonElement>(`[data-cell][data-row="${["a", "b", "c"].indexOf(row)}"][data-col="${dates.findIndex(d => d.date === date)}"]`)!;
  const pointer = (type: string, target: EventTarget, buttons = 1) => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, button: 0, buttons }));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(text))!;

  // No legacy per-cell state-button group: each cell is exactly one button.
  assert.equal(document.querySelectorAll("td button").length, 9);
  assert.equal(document.querySelectorAll('td input[type="checkbox"]').length, 0);

  // Single click → SUCCESS immediately (optimistic), persisted as one change.
  await act(async () => { pointer("pointerdown", cell("a", "2026-09-12")); pointer("pointerup", dom.window, 0); });
  assert.equal(cell("a", "2026-09-12").dataset.state, "SUCCESS");
  await flush();
  assert.deepEqual(writes.at(-1), [{ rowId: "a", date: "2026-09-12", state: "SUCCESS" }]);
  // Clicking a SUCCESS cell clears it; inactive cells ignore clicks.
  await act(async () => { pointer("pointerdown", cell("a", "2026-09-12")); pointer("pointerup", dom.window, 0); });
  assert.equal(cell("a", "2026-09-12").dataset.state, "UNTOUCHED");
  await act(async () => { pointer("pointerdown", cell("c", "2026-09-12")); pointer("pointerup", dom.window, 0); });
  assert.equal(cell("c", "2026-09-12").dataset.state, "UNTOUCHED");
  await flush();

  // Drag a rectangle a..c × 12..13 — the inactive cell is skipped.
  await act(async () => { pointer("pointerdown", cell("a", "2026-09-12")); pointer("pointerover", cell("c", "2026-09-13")); pointer("pointerup", dom.window, 0); });
  assert.equal(document.querySelectorAll("[data-cell][data-selected]").length, 5);
  assert.ok(document.querySelector('[role="toolbar"][aria-label="선택한 칸 일괄 처리"]'));
  const before = writes.length;
  await act(() => button("실패").click());
  await flush();
  assert.equal(writes.length, before + 1, "bulk action is ONE logical write");
  assert.equal(writes.at(-1)!.length, 4, "the already-FAILURE cell is not rewritten");
  assert.ok(writes.at(-1)!.every(c => c.state === "FAILURE"));
  assert.ok(document.body.textContent?.includes("5개 칸 실패"));
  await act(() => button("실행 취소").click());
  await flush();
  assert.equal(cell("b", "2026-09-13").dataset.state, "FAILURE");
  assert.equal(cell("a", "2026-09-12").dataset.state, "UNTOUCHED");
  await act(() => { document.querySelector<HTMLElement>("[data-cell]")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });

  // Date-level NOT_RECORDED: meaningful results require confirmation; "빈 칸만" keeps them.
  await act(async () => { pointer("pointerdown", cell("a", "2026-09-13")); pointer("pointerup", dom.window, 0); });
  await flush();
  await act(() => document.querySelector<HTMLButtonElement>('button[aria-label="2026-09-13 날짜 작업"]')!.click());
  await act(() => button("이 날짜 전체 기록 못함").click());
  assert.ok(document.querySelector('[role="alertdialog"]'), "conflict confirmation shown");
  assert.ok(document.body.textContent?.includes("2개"));
  await act(() => button("빈 칸만").click());
  await flush();
  assert.equal(cell("c", "2026-09-13").dataset.state, "NOT_RECORDED");
  assert.equal(cell("a", "2026-09-13").dataset.state, "SUCCESS");
  assert.equal(cell("b", "2026-09-13").dataset.state, "FAILURE", "NOT_RECORDED never silently overwrites a FAILURE");

  // Keyboard: 2 = FAILURE on the focused cell.
  await act(() => { cell("a", "2026-09-14").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "2", bubbles: true })); });
  assert.equal(cell("a", "2026-09-14").dataset.state, "FAILURE");
  await flush();
  await act(() => root.unmount());
  dom.window.close();
});
