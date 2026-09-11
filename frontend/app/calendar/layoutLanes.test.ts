import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutDayLanes } from "./layoutLanes";
import { hasActualConflict } from "./TimeGrid";
import type { GridBlock } from "./gridTypes";
const block = (id: string, start: string, end: string, sourceType?: GridBlock["sourceType"]): GridBlock => ({ id, title: id,
  startAt: `2026-09-09T${start}:00`, endAt: `2026-09-09T${end}:00`, domainType: "WORK", activityCategoryId: null,
  lifeCategoryId: null, phaseId: null, memo: null, sourceType });
test("isolated events retain full width after an overlapping cluster", () => {
  const result = layoutDayLanes([block("a", "09:00", "10:00"), block("b", "09:30", "11:00"), block("c", "13:00", "14:00"), block("d", "14:00", "15:00")]);
  assert.deepEqual(result.map(x => [x.block.id, x.laneIndex, x.laneCount]), [["a", 0, 2], ["b", 1, 2], ["c", 0, 1], ["d", 0, 1]]);
});
test("transitive overlap reuses lanes at maximum concurrency", () => {
  const result = layoutDayLanes([block("a", "09:00", "10:00"), block("b", "09:30", "10:30"), block("c", "10:00", "11:00")]);
  assert.deepEqual(result.map(x => [x.laneIndex, x.laneCount]), [[0, 2], [1, 2], [0, 2]]);
});
test("Actual conflict checks hidden LIFE records but allows touching endpoints", () => {
  const hidden = block("hidden-life", "09:00", "10:00", "LIFE_TIME_ENTRY");
  assert.equal(hasActualConflict(undefined, new Date(2026, 8, 9, 9, 30), new Date(2026, 8, 9, 10, 30), [hidden]), true);
  assert.equal(hasActualConflict(undefined, new Date(2026, 8, 9, 10), new Date(2026, 8, 9, 11), [hidden]), false);
});
test("move excludes only the same source record and handles cross-day dates", () => {
  const moving = block("same-id", "09:00", "10:00", "WORK_TIME_ENTRY");
  const other = block("same-id", "11:00", "12:00", "LIFE_TIME_ENTRY");
  assert.equal(hasActualConflict(moving, new Date(2026, 8, 9, 9), new Date(2026, 8, 9, 10), [moving]), false);
  assert.equal(hasActualConflict(moving, new Date(2026, 8, 9, 11), new Date(2026, 8, 9, 12), [moving, other]), true);
  assert.equal(hasActualConflict(moving, new Date(2026, 8, 10, 11), new Date(2026, 8, 10, 12), [moving, other]), false);
});

test("events ending at midnight still overlap the late evening interval", () => {
  const midnight = { ...block("night", "23:00", "00:00"), endAt: "2026-09-10T00:00:00" };
  const slots = layoutDayLanes([midnight, block("late", "23:30", "23:45")]);
  assert.deepEqual(slots.map(x => x.laneCount), [2, 2]);
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeGrid } from "./TimeGrid";
Object.assign(globalThis, { React });
test("State visibility and event count preserve date geometry and activity inset", () => {
  const base = { days: [new Date(2026, 8, 9)], blocks: [block("a", "09:00", "10:00")], colorMode: "ACTIVITY" as const,
    phases: [], projects: [], interactionMode: "plan" as const, onBlockClick: () => {}, onBlockTimeChange: () => {} };
  const off = renderToStaticMarkup(React.createElement(TimeGrid, base));
  const on = renderToStaticMarkup(React.createElement(TimeGrid, { ...base, showWeekStateStrip: true,
    blocks: [...base.blocks, block("b", "13:00", "14:00")], selectedId: "a", draft: block("draft", "16:00", "16:30") }));
  assert.ok(off.includes("48px repeat(1, minmax(0px, 1fr))"));
  assert.ok(on.includes("48px repeat(1, minmax(0px, 1fr))"));
  assert.ok(off.includes("left:calc(14px + 0 * (100% - 18px) / 1)"));
  assert.ok(on.includes("left:calc(14px + 0 * (100% - 18px) / 1)"));
  assert.ok(on.includes('data-calendar-block="draft"'));
  assert.ok(on.includes('data-selected="true"'));
});

import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
test("direct click creates 30 minutes in either mode; Actual conflict rejects release", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  dom.window.HTMLElement.prototype.setPointerCapture = () => {};
  const root = createRoot(dom.window.document.getElementById("root")!);
  const created: number[][] = [];
  let rejected = 0;
  const props = { days: [new Date(2026, 8, 9)], blocks: [], colorMode: "ACTIVITY" as const,
    phases: [], projects: [], onBlockClick: () => {}, onBlockTimeChange: () => {},
    onCreateRequest: (_: Date, start: number, end: number) => { created.push([start, end]); }, onInvalidDrop: () => { rejected++; } };
  const pointer = async (element: Element, name: string, y: number) => {
    const event = new dom.window.Event(name, { bubbles: true });
    Object.assign(event, { button: 0, pointerId: 1, clientX: 80, clientY: y });
    await act(() => { element.dispatchEvent(event); });
  };
  for (const interactionMode of ["plan", "actual"] as const) {
    await act(() => root.render(React.createElement(TimeGrid, { ...props, interactionMode })));
    const col = dom.window.document.querySelector('[data-calendar-date]')!;
    await pointer(col, "pointerdown", 540);
    await pointer(col, "pointerup", 540);
  }
  assert.deepEqual(created, [[540, 570], [540, 570]]);
  await act(() => root.render(React.createElement(TimeGrid, { ...props, interactionMode: "actual", conflictBlocks: [block("hidden", "09:00", "10:00")] })));
  const col = dom.window.document.querySelector('[data-calendar-date]')!;
  await pointer(col, "pointerdown", 540);
  await pointer(col, "pointerup", 540);
  assert.equal(rejected, 1);
  assert.equal(created.length, 2);
  await act(() => root.unmount());
  dom.window.close();
});
