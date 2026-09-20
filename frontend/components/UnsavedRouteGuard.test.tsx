import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { GlobalTabsProvider, useGlobalTabs } from "./GlobalTabs";
import { UnsavedRouteGuard } from "./UnsavedRouteGuard";

test("cross-system unsaved guard keeps editors mounted on cancel and navigates only after discard", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/worklog" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const destinations: string[] = [];
  function Editor() { const shell = useGlobalTabs(); return <><UnsavedRouteGuard dirty/><textarea defaultValue="draft retained"/><button onClick={() => shell?.navigate("/notes")}>Switch</button></>; }
  const router = { push: (href: string) => destinations.push(href) } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === text)!.click());
  await act(() => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/worklog"><SearchParamsContext.Provider value={new URLSearchParams()}><GlobalTabsProvider><Editor/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const editor = document.querySelector('textarea');
  await click("Switch"); assert.deepEqual(destinations, []); assert.ok(document.querySelector('dialog[open]'));
  await click("계속 편집"); assert.equal(document.querySelector('textarea'), editor); assert.equal(editor!.value, "draft retained"); assert.deepEqual(destinations, []);
  const unload = new dom.window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
  await click("Switch"); await click("변경사항 버리고 이동"); assert.deepEqual(destinations, ["/notes"]);
  await act(() => root.unmount()); dom.window.close();
});
