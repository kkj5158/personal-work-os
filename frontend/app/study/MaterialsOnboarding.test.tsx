import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { createStudyPort } from "../../lib/study/port";
import { MaterialsOnboarding } from "./MaterialsOnboarding";

test("file-first onboarding prefills title, requires explicit rights and ignores double submit", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/study" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const base = createStudyPort("demo"); let saves = 0; let release: (() => void) | undefined;
  const port = { ...base, mode: "server" as const, capabilities: { storage: "connected" as const, materialMaxBytes: 1048576, handwrittenMaxFiles: 5, handwrittenMaxBytes: 1048576 },
    getSnapshot: () => ({ ...base.getSnapshot(), connection: { state: "ready" as const } }),
    updateSource: async () => { saves++; await new Promise<void>(resolve => { release = resolve; }); },
    uploadFile: async () => { throw new Error("synthetic upload failed"); },
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(() => root.render(<MaterialsOnboarding port={port} done={() => {}} close={() => {}} />));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new dom.window.File(["%PDF-self"], "My learning.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(() => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
    assert.equal(document.querySelector<HTMLInputElement>('input[maxlength="1000"]')!.value, "My learning");
    const rights = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    assert.equal(rights.checked, false);
    const submit = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "교재 등록")!;
    assert.equal(submit.disabled, true); await act(() => rights.click()); assert.equal(submit.disabled, false);
    await act(() => { submit.click(); submit.click(); }); assert.equal(saves, 1);
    await act(async () => { release?.(); });
    assert.match(document.querySelector('[role="status"]')!.textContent!, /같은 자료에 업로드/);
  } finally { await act(() => root.unmount()); dom.window.close(); }
});
