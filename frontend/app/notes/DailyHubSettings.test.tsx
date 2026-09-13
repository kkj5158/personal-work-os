import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { DailyHubSettings } from "./DailyHubSettings";
import { notesApi } from "@/lib/api/notes";
import type { DailyHubSettings as Preferences } from "@/lib/notes/dailyHub";
import type { Workspace } from "@/lib/notes/types";

test("Hub settings save inclusion independently, flush before removing an editor, and retain failed drafts", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/notes" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const workspaces = ["A", "B"].map(id => ({ id, name: id, icon: "notebook", archivedAt: null } as Workspace));
  const initial: Preferences = { includedWorkspaceIds: ["A", "B"], autoIncludeNewWorkspaces: false };
  const original = notesApi.saveDailyHubSettings;
  const calls: string[] = [];
  let saved: Preferences | null = null, closed = 0, fail = false;
  notesApi.saveDailyHubSettings = async value => { calls.push("save"); return value; };
  const root = createRoot(document.getElementById("root")!);
  const render = () => root.render(<DailyHubSettings workspaces={workspaces} initial={initial} close={() => closed++} saved={value => { saved = value; }} flush={async () => { calls.push("flush"); if (fail) throw new Error("pending editor failed"); }}/>);
  try {
    await act(render);
    const boxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    assert.equal(boxes[2].checked, false);
    await act(() => boxes[1].click());
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(calls, ["flush", "save"]);
    assert.deepEqual(saved, { includedWorkspaceIds: ["A"], autoIncludeNewWorkspaces: false });
    assert.equal(closed, 1);
    fail = true;
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('[role="alert"]')?.textContent, "pending editor failed");
    assert.deepEqual(calls, ["flush", "save", "flush"]);
    assert.equal(closed, 1);
  } finally { notesApi.saveDailyHubSettings = original; await act(() => root.unmount()); dom.window.close(); }
});
