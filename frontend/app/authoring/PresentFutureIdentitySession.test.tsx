import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Draft, Identity, Program, Session } from "@/lib/authoring/types";

const id = "0d2f6c1e-5b1a-4f0e-9a57-3c2b1a0f9e8d", programKey = "present-future-identity";
const definition = JSON.parse(readFileSync(`../backend/src/main/resources/authoring/${programKey}/2026-10-01.json`, "utf8")) as Program;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} } as unknown as AppRouterInstance;

/** A stand-in server: saves persist, so a remount behaves like a page refresh. */
async function mount() {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringSession } = await import("./AuthoringSession");
  let server = { id, programKey, specVersion: definition.version, status: "IN_PROGRESS", currentSectionKey: "present", version: 0, answers: {}, report: null, sourceSessionId: null,
    startedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", completedAt: null, definition } as unknown as Session;
  const originals = { ...authoringApi }, saves: Draft[] = [], control = { fail: false };
  authoringApi.get = async () => structuredClone(server);
  authoringApi.save = async (_id, version, draft) => {
    if (control.fail) throw new Error("offline");
    assert.equal(version, server.version, "each save carries the latest version");
    saves.push(structuredClone(draft));
    server = { ...server, ...structuredClone(draft), version: version + 1 } as Session;
    return server;
  };
  let root = createRoot(document.getElementById("root")!);
  const render = () => act(async () => root.render(<AppRouterContext.Provider value={router}><AuthoringSession programKey={programKey} sessionId={id} mode="runner" /></AppRouterContext.Provider>));
  await render();
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
    const proto = el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  const click = (label: string) => act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.startsWith(label))!.click());
  const refresh = async () => { await act(() => root.unmount()); sessionStorage.clear(); root = createRoot(document.getElementById("root")!); await render(); };
  const cleanup = async () => { await act(() => root.unmount()); Object.assign(authoringApi, originals); dom.window.close(); };
  return { saves, control, type, settle, click, refresh, cleanup };
}
const editors = () => Array.from(document.querySelectorAll<HTMLTextAreaElement>(".authoring-questions textarea"));
const heading = () => document.querySelector(".authoring-canvas h1")?.textContent;

test("The runner saves typing before moving on, keeps the five identities apart and restores everything after a refresh", async () => {
  const { saves, control, type, settle, click, refresh, cleanup } = await mount();
  try {
    const nav = Array.from(document.querySelectorAll(".authoring-sections button")).map(b => b.querySelector("span")!.textContent);
    assert.deepEqual(nav, ["01", "02", "03", "04-1", "04-2", "04-3", "04-4", "04-5", "05-A", "05-B", "05-C", "06-A", "06-B", "06-C", "07"]);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-sections-part")).map(p => p.textContent), ["정체성별 깊은 서술", "다섯 모습을 한 사람의 삶으로", "지금부터 실제로 살아볼 변화"]);
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "01 / 07");
    assert.equal(editors().length, 1);

    // Typing then moving on at once: the newest text and the new position are saved together.
    await type(editors()[0], "저녁 산책 장면");
    await click("다음");
    assert.equal(heading(), "현재를 지탱하는 반복");
    await settle();
    assert.deepEqual(saves.at(-1), { answers: { present: "저녁 산책 장면" }, currentSectionKey: "sustain", title: null, memo: null });
    await click("← 이전");
    assert.equal(editors()[0].value, "저녁 산책 장면");

    await click("03");
    const names = Array.from(document.querySelectorAll<HTMLInputElement>(".authoring-identities input"));
    assert.equal(names.length, 10);
    await type(names[0], "돌보는 사람"); await type(names[1], "몸과 주변을 돌보는 삶"); await type(names[2], "만드는 사람");
    await click("04-1");
    assert.equal(heading(), "정체성 1");
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "04-1 / 07 · 정체성별 깊은 서술");
    assert.equal(document.querySelector<HTMLInputElement>(".authoring-identity-bar input")!.value, "돌보는 사람");
    assert.match(document.querySelector(".authoring-identity-bar")!.textContent ?? "", /몸과 주변을 돌보는 삶/);
    assert.equal(editors().length, 4);
    await type(editors()[0], "첫째 묘사"); await type(editors()[1], "첫째 노력");
    await click("다음");
    assert.equal(document.querySelector<HTMLInputElement>(".authoring-identity-bar input")!.value, "만드는 사람");
    assert.deepEqual(editors().map(e => e.value), ["", "", "", ""], "the next identity does not inherit writing");
    await type(editors()[2], "둘째 전략"); await type(editors()[3], "둘째 조정");
    await click("← 이전");
    assert.deepEqual(editors().map(e => e.value), ["첫째 묘사", "첫째 노력", "", ""]);
    await settle();
    const stored = saves.at(-1)!.answers.identities as Identity[];
    assert.deepEqual(stored.map(x => x.id), ["identity-1", "identity-2", "identity-3", "identity-4", "identity-5"]);
    assert.deepEqual([stored[0].description, stored[0].effort, stored[0].strategy, stored[1].strategy, stored[1].adjustment, stored[1].description], ["첫째 묘사", "첫째 노력", undefined, "둘째 전략", "둘째 조정", undefined]);
    assert.deepEqual(Object.keys(saves.at(-1)!.answers).sort(), ["identities", "present"], "virtual stages save through the one identities answer");
    assert.match(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /정체성 1 · 돌보는 사람/);

    // A failed save keeps the text on screen, says so, and the retry sends it.
    control.fail = true;
    await type(editors()[2], "첫째 전략 — 저장 실패 중에 쓴 글");
    await settle();
    assert.match(document.querySelector(".authoring-save-state")?.textContent ?? "", /저장 실패 · 입력 유지됨/);
    assert.equal(editors()[2].value, "첫째 전략 — 저장 실패 중에 쓴 글");
    control.fail = false;
    await click("저장 다시 시도");
    await settle();
    assert.equal((saves.at(-1)!.answers.identities as Identity[])[0].strategy, "첫째 전략 — 저장 실패 중에 쓴 글");

    await refresh();
    assert.equal(heading(), "정체성 1", "the session resumes on the stage it was left on");
    assert.deepEqual(editors().map(e => e.value), ["첫째 묘사", "첫째 노력", "첫째 전략 — 저장 실패 중에 쓴 글", ""]);
    await click("07");
    assert.equal(editors().length, 1);
    await type(editors()[0], "마지막 글");
    await click("전체 내용 검토");
    await settle();
    assert.equal(saves.at(-1)!.answers.finalWriting, "마지막 글");
  } finally { await cleanup(); }
});
