import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { ChecklistDayList } from "./ChecklistDayList";
import {
  useChecklistMutations,
  type ChecklistMutations,
} from "./useChecklistMutations";
import type { ChecklistState } from "@/lib/checklist-core/types";
test("single-day presentation retains canonical four states, keyboard, Undo, retry and failed navigation gate", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    React,
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let mutations: ChecklistMutations,
    fail = false;
  const writes: ChecklistState[] = [];
  function Harness() {
    const [base, setBase] = useState<ChecklistState>("UNTOUCHED");
    mutations = useChecklistMutations({
      baseState: () => base,
      persist: async (changes) => {
        if (fail) throw Error("synthetic offline");
        writes.push(changes[0].state);
      },
      commit: (changes) => setBase(changes[0].state),
    });
    return (
      <ChecklistDayList
        title="근무 체크리스트"
        date="2026-10-24"
        today="2026-10-24"
        groups={[
          {
            id: "g",
            label: "",
            rows: [
              { id: "one", label: "기록", meta: "업무 / CORE" },
              { id: "off", label: "보관됨" },
            ],
          },
        ]}
        mutations={mutations}
        availability={(id) => (id === "one" ? "EDITABLE" : "INACTIVE")}
      />
    );
  }
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<Harness />));
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
    });
  const cell = document.querySelector<HTMLElement>(
    '[data-cell][data-row="0"]',
  )!;
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 0);
  assert.equal(document.querySelectorAll("tr.ckc-row").length, 2);
  for (const [key, state] of [
    ["1", "SUCCESS"],
    ["2", "FAILURE"],
    ["3", "NOT_RECORDED"],
    ["0", "UNTOUCHED"],
  ] as const) {
    await act(() =>
      cell.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key, bubbles: true }),
      ),
    );
    await flush();
    assert.equal(cell.dataset.state, state);
  }
  await act(() =>
    cell.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "1", bubbles: true }),
    ),
  );
  await flush();
  await act(() => mutations!.runUndo());
  await flush();
  assert.equal(cell.dataset.state, "UNTOUCHED");
  fail = true;
  await act(() =>
    cell.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "2", bubbles: true }),
    ),
  );
  await flush();
  assert.equal(cell.dataset.state, "UNTOUCHED");
  await assert.rejects(() => mutations!.flush(), /synthetic offline/);
  fail = false;
  await act(() => mutations!.retry());
  await flush();
  await mutations!.flush();
  assert.equal(cell.dataset.state, "FAILURE");
  assert.equal(writes.at(-1), "FAILURE");
  const inactive = document.querySelector<HTMLElement>(
    '[data-cell][data-row="1"]',
  )!;
  assert.equal(inactive.getAttribute("aria-disabled"), "true");
  assert.equal(
    document.querySelector<HTMLSelectElement>(
      'select[aria-label="보관됨 상태"]',
    )!.disabled,
    true,
  );
  await act(() => root.unmount());
  dom.window.close();
});
