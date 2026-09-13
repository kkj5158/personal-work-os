import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { WorkspaceOrderModal } from "./WorkspaceOrderModal";
import { notesApi } from "@/lib/api/notes";
import type { Workspace } from "@/lib/notes/types";

test("workspace order drafts list active workspaces, cancel is silent and save persists once without changing selection", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/notes" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const rows: Workspace[] = ["A", "B", "archived"].map((id, i) => ({ id, name: id, icon: "notebook", description: "", modules: [], sortOrder: i, archivedAt: i === 2 ? "2026-09-13" : null }));
  const calls: string[][] = [];
  const original = notesApi.reorderWorkspaces;
  notesApi.reorderWorkspaces = async ids => { calls.push(ids); return rows; };
  let closed = 0;
  let saved: Workspace[] | null = null;
  const root = createRoot(document.getElementById("root")!);
  const render = (key: number) => root.render(<WorkspaceOrderModal key={key} workspaces={rows} selectedId="B" onClose={() => closed++} onSaved={value => { saved = value; }}/>);
  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === label)!;
  try {
    await act(() => render(1));
    assert.deepEqual(Array.from(document.querySelectorAll(".workspace-order-name")).map(n => n.textContent), ["A", "B"]);
    assert.equal(document.querySelector(".workspace-order-row small")?.parentElement?.textContent, "📓B선택됨");
    await act(() => button("취소").click());
    assert.equal(closed, 1); assert.deepEqual(calls, []);
    await act(() => render(2));
    await act(async () => { button("저장").click(); });
    assert.deepEqual(calls, [["A", "B"]]); assert.equal(saved, rows); assert.equal(closed, 2);
    notesApi.reorderWorkspaces = async () => { throw new Error("저장 실패"); };
    await act(() => render(3));
    await act(async () => { button("저장").click(); });
    assert.equal(document.querySelector('[role="alert"]')?.textContent, "저장 실패");
    assert.equal(closed, 2);
  } finally { notesApi.reorderWorkspaces = original; await act(() => root.unmount()); dom.window.close(); }
});
