import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useVisualGroups, type VisualGroupApi } from "./useVisualGroups";
import { moveVisualGroup, type CalendarVisualGroup } from "./visualGroups";
import type { CalendarToast } from "./useCalendarEditor";

test("group autosave holds invalid drafts, flushes before gestures/navigation, and preserves identity through Undo", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let saved: CalendarVisualGroup | null = null, writes = 0, fail = false, navigated = 0;
  let pauseUpdate: Promise<void> | null = null;
  const notices: CalendarToast[] = [];
  const api: VisualGroupApi = {
    listVisualGroups: async () => saved ? [saved] : [],
    createVisualGroup: async input => { writes++; saved = { ...input, id: "group-1" }; return saved; },
    updateVisualGroup: async (id, input) => { writes++; if (pauseUpdate) await pauseUpdate; if (fail) throw new Error("연결 실패"); saved = { ...input, id }; return saved; },
    deleteVisualGroup: async id => { assert.equal(id, "group-1"); return { undoToken: "restore-1" }; },
    undoVisualGroup: async token => { assert.equal(token, "restore-1"); return saved!; },
  };
  let model!: ReturnType<typeof useVisualGroups>;
  function Probe() { const state = useVisualGroups("2026-09-14", "2026-09-20", toast => notices.push(toast), api); useEffect(() => { model = state; }); return null; }
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<Probe/>));
  await act(async () => model.create("2026-09-14", 545, 605));
  assert.equal(writes, 0);
  await act(async () => model.change({ title: "첫 그룹" }));
  assert.equal(writes, 1); assert.equal(model.value?.id, "group-1"); assert.equal(model.status, "저장됨");
  await act(async () => { model.change({ endTime: null }); assert.equal(await model.flush(), false); });
  assert.equal(writes, 1, "invalid half-pair never reaches server");
  await act(async () => model.leave(() => navigated++));
  assert.equal(model.guard, true); assert.equal(navigated, 0);
  await act(async () => { model.continueEditing(); model.change({ endTime: "10:35", title: "수정한 제목" }); await model.commitMutation("group-1", latest => moveVisualGroup(latest, 1, 15)); });
  assert.equal(model.value?.title, "수정한 제목"); assert.equal(model.value?.startDate, "2026-09-15");
  assert.equal(model.value?.startTime, "09:20"); assert.equal(model.value?.endTime, "10:50");
  let releaseUpdate!: () => void;
  pauseUpdate = new Promise<void>(resolve => { releaseUpdate = resolve; });
  let gesture!: Promise<boolean>;
  await act(async () => { gesture = model.commitMutation("group-1", latest => moveVisualGroup(latest, 1, 15)); });
  await act(async () => model.change({ title: "저장 중 바꾼 제목" }));
  await act(async () => { releaseUpdate(); await gesture; pauseUpdate = null; await model.flush(); });
  assert.equal(model.value?.title, "저장 중 바꾼 제목");
  assert.equal(model.value?.startDate, "2026-09-16"); assert.equal(model.value?.startTime, "09:35");
  await act(async () => model.leave(() => navigated++));
  assert.equal(navigated, 1); assert.equal(model.guard, false);
  await act(async () => model.select(saved!));
  fail = true;
  await act(async () => { model.change({ title: "실패해도 남는 제목" }); await model.leave(() => navigated++); });
  assert.equal(model.status, "저장 실패"); assert.equal(model.guard, true); assert.equal(navigated, 1);
  assert.equal(model.value?.title, "실패해도 남는 제목");
  fail = false;
  await act(async () => model.retry());
  assert.equal(navigated, 2); assert.equal(model.guard, false);
  await act(async () => model.select(saved!));
  await act(async () => model.remove());
  assert.equal(model.groups.length, 0); assert.equal(model.value, null);
  await act(async () => notices.at(-1)!.undo!());
  assert.equal(model.groups.length, 1); assert.equal(model.groups[0].id, "group-1");
  const prior = model.groups[0]; fail = true;
  await act(async () => { assert.equal(await model.commitMutation(prior.id, latest => moveVisualGroup(latest, 3, 15)), false); });
  assert.deepEqual(model.groups[0], prior, "failed gesture rolls back presentation group only");
  await act(async () => root.unmount()); dom.window.close();
});
