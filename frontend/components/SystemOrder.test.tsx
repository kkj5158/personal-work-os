import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { SystemOrderProvider, useSystemOrder } from "./SystemOrder";
import { RouteStateProvider, useRouteState } from "./RouteState";

test("order autosave serializes drags, retains failed writes for retry and reloads/reset independently of route", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/notes" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const original = globalThis.fetch;
  let stored = ["notes", "work"], fail = false;
  const writes: string[][] = [];
  const resolvers: (() => void)[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") {
      const ids = JSON.parse(init.body as string).systemIds as string[];
      writes.push(ids);
      await new Promise<void>(resolve => resolvers.push(resolve));
      if (fail) return new Response("failed", { status: 500 });
      stored = ids;
    }
    return new Response(JSON.stringify({ systemIds: stored }));
  };
  let state!: NonNullable<ReturnType<typeof useSystemOrder>>;
  function Probe() { state = useSystemOrder()!; return <span>{state.order.join(",")}</span>; }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(() => root.render(<PathnameContext.Provider value="/notes"><SystemOrderProvider><Probe/></SystemOrderProvider></PathnameContext.Provider>));
    assert.equal(state.loaded, true); assert.equal(state.order[0], "notes");
    await act(() => state.save(["diet", "notes", "work"]));
    await act(() => state.save(["calendar", "notes", "work"]));
    assert.equal(writes.length, 1);
    await act(() => resolvers.shift()!());
    assert.equal(writes.length, 2);
    fail = true;
    await act(() => resolvers.shift()!());
    assert.ok(state.error); assert.equal(state.order[0], "calendar");
    fail = false;
    await act(() => state.retry());
    await act(() => resolvers.shift()!());
    assert.deepEqual(stored, ["calendar", "notes", "work"]);
    assert.equal(state.error, "");
    await act(() => state.save([]));
    await act(() => resolvers.shift()!());
    assert.deepEqual(stored, []); assert.equal(state.order[0], "work");
    assert.equal(dom.window.location.pathname, "/notes");
    await act(() => root.render(<PathnameContext.Provider value="/calendar"><SystemOrderProvider key="reload"><Probe/></SystemOrderProvider></PathnameContext.Provider>));
    assert.equal(state.order[0], "work");
  } finally { await act(() => root.unmount()); globalThis.fetch = original; dom.window.close(); }
});

test("opted-in view state survives page unmount without retaining the page tree", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/worklog" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let change!: (value: string) => void;
  function Page() { const [value, set] = useRouteState("test:date", "2026-09-20"); change = set; return <span>{value}</span>; }
  const root = createRoot(document.getElementById("root")!);
  const render = (visible: boolean) => root.render(<PathnameContext.Provider value="/worklog"><RouteStateProvider>{visible ? <Page/> : <p>another page</p>}</RouteStateProvider></PathnameContext.Provider>);
  await act(() => render(true));
  await act(() => change("2026-09-12"));
  await act(() => render(false)); assert.equal(document.querySelector("span"), null);
  await act(() => render(true)); assert.equal(document.querySelector("span")!.textContent, "2026-09-12");
  await act(() => root.unmount()); dom.window.close();
});
