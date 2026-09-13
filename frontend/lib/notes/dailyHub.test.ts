import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { dailyHubUrl, includedWorkspaces } from "./dailyHub";
import { guardNoteHistory } from "./historyGuard";
import { tabTarget } from "../globalTabs";
import type { Workspace } from "./types";

test("Hub membership preserves global order independently of preference order and shell preserves date route", () => {
  const rows = ["C", "B", "A", "archived"].map((id, index) => ({ id, sortOrder: index, archivedAt: id === "archived" ? "2026-09-13" : null } as Workspace));
  assert.deepEqual(includedWorkspaces(rows, { includedWorkspaceIds: ["A", "C", "archived"], autoIncludeNewWorkspaces: false }).map(w => w.id), ["C", "A"]);
  const target = tabTarget(dailyHubUrl("2026-09-12"))!;
  assert.equal(target.route, "/notes?date=2026-09-12&module=DAILY_HUB");
  assert.equal(target.title, "데일리 허브");
});

test("Back/Forward waits for note saves and failed writes retain the current editor route", async () => {
  const dom = new JSDOM("", { url: `https://orbit.local${dailyHubUrl("2026-09-13")}` });
  Object.assign(globalThis, { window: dom.window, PopStateEvent: dom.window.PopStateEvent });
  let resolve!: () => void;
  let promise = new Promise<void>(done => { resolve = done; });
  let dirty = true, events = 0, error: unknown;
  const guard = guardNoteHistory(() => promise, () => dirty, e => { error = e; });
  const listener = () => { events++; };
  window.addEventListener("popstate", listener);
  try {
    window.history.pushState({ next: true }, "", dailyHubUrl("2026-09-12"));
    window.dispatchEvent(new PopStateEvent("popstate", { state: { next: true } }));
    assert.equal(events, 0);
    dirty = false; resolve(); await promise; await Promise.resolve();
    assert.equal(events, 1);
    assert.match(window.location.search, /2026-09-12/);
    dirty = true;
    promise = Promise.reject(new Error("save failed"));
    window.history.pushState(null, "", "/worklog");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await promise.catch(() => {}); await Promise.resolve();
    assert.equal(events, 1);
    assert.match(window.location.search, /2026-09-12/);
    assert.equal((error as Error).message, "save failed");
  } finally { guard.dispose(); window.removeEventListener("popstate", listener); dom.window.close(); }
});
