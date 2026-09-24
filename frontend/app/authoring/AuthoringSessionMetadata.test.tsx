import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Draft, Session } from "@/lib/authoring/types";

const id = "c6a1e2c4-4a4e-4d4c-9d0e-6f7f8a9b0c1d";
const definition = { programKey: "recovery", version: "test", group: "CORE", title: "Recovery Authoring", description: "", sourceUrl: "",
  sections: [{ sectionKey: "arrival", title: "ARRIVAL", questions: [{ questionKey: "writing", type: "FREE_TEXT", prompt: "Write" }] }],
  stoppingRules: [], completionKeys: [], reportSections: [] };
// A legacy payload: no title, memo or programTitle keys at all.
const legacy = { id, programKey: "recovery", specVersion: "test", status: "IN_PROGRESS", currentSectionKey: "arrival", version: 3, answers: { writing: "원문" },
  report: null, sourceSessionId: null, startedAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", completedAt: null, definition } as unknown as Session;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} } as unknown as AppRouterInstance;

async function mount(session: Session, mode: "runner" | "report") {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringSession } = await import("./AuthoringSession");
  const originals = { ...authoringApi }, saves: Draft[] = [], metadata: { title: string | null; memo: string | null }[] = [];
  authoringApi.get = async () => structuredClone(session);
  authoringApi.save = async (_id, version, draft) => { saves.push(structuredClone(draft)); return { ...session, ...draft, version: version + 1 } as Session; };
  authoringApi.saveMetadata = async (_id, version, meta) => { metadata.push(meta); return { ...session, ...meta, version: version + 1 } as Session; };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}><AuthoringSession programKey="recovery" sessionId={id} mode={mode} /></AppRouterContext.Provider>));
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
    const proto = el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  const cleanup = async () => { await act(() => root.unmount()); Object.assign(authoringApi, originals); dom.window.close(); };
  return { saves, metadata, type, settle, cleanup };
}

test("Title and memo autosave with the in-progress draft without becoming answers", async () => {
  const { saves, metadata, type, settle, cleanup } = await mount({ ...legacy, programTitle: "삶의 중심 되찾기" }, "runner");
  try {
    const text = document.body.textContent ?? "";
    assert.doesNotMatch(text, /null|undefined|제목 없음/);
    assert.match(document.querySelector(".authoring-toolbar strong")?.textContent ?? "", /삶의 중심 되찾기/);
    const title = document.querySelector<HTMLInputElement>('input[aria-label="글 제목"]')!;
    assert.equal(title.value, "");
    assert.equal(document.querySelector('textarea[aria-label="메모"]'), null);
    await type(title, "다시 생활 리듬이 무너진 이유 정리");
    await act(async () => document.querySelector<HTMLButtonElement>(".authoring-meta-toggle")!.click());
    await type(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="메모"]')!, "9월 야간근무 이후\n생활패턴 확인");
    await settle();
    const last = saves.at(-1)!;
    assert.equal(last.title, "다시 생활 리듬이 무너진 이유 정리");
    assert.equal(last.memo, "9월 야간근무 이후\n생활패턴 확인");
    assert.deepEqual(last.answers, { writing: "원문" });
    assert.equal(metadata.length, 0);
    const stored = JSON.parse(sessionStorage.getItem(`authoring.draft.${id}`) ?? "null");
    assert.ok(stored === null || stored.title === "다시 생활 리듬이 무너진 이유 정리");
  } finally { await cleanup(); }
});

test("A completed session saves only its title and memo and keeps the report view", async () => {
  const report = { programKey: "recovery", specVersion: "test", completedAt: "2026-09-21T00:00:00Z", sections: [] };
  const completed = { ...legacy, status: "COMPLETED", completedAt: "2026-09-21T00:00:00Z", report, title: "이전 제목", memo: null, programTitle: "삶의 중심 되찾기" } as unknown as Session;
  const { saves, metadata, type, settle, cleanup } = await mount(completed, "report");
  try {
    assert.equal(document.querySelector(".authoring-canvas h1")?.textContent, "삶의 중심 되찾기 Report");
    const title = document.querySelector<HTMLInputElement>('input[aria-label="글 제목"]')!;
    assert.equal(title.value, "이전 제목");
    await type(title, "완료 후 바꾼 제목");
    await settle();
    assert.deepEqual(metadata, [{ title: "완료 후 바꾼 제목", memo: null }]);
    assert.equal(saves.length, 0);
    assert.equal(sessionStorage.getItem(`authoring.draft.${id}`), null);
    assert.equal(document.querySelector(".authoring-canvas h1")?.textContent, "삶의 중심 되찾기 Report");
  } finally { await cleanup(); }
});
