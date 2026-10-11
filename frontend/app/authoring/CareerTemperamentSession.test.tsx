import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Draft, Program, Session } from "@/lib/authoring/types";

const id = "7c3e9a10-4b2d-4e6f-9a81-5d0c2b7e1f36", programKey = "career-temperament";
const definition = JSON.parse(readFileSync(`../backend/src/main/resources/authoring/${programKey}/2026-10-11.json`, "utf8")) as Program;
const routes: string[] = [];
const router = { back() {}, forward() {}, refresh() {}, push(path: string) { routes.push(path); }, replace() {}, prefetch: async () => {} } as unknown as AppRouterInstance;

/** A stand-in server: saves persist, so a remount behaves like a page refresh. */
async function mount() {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringSession } = await import("./AuthoringSession");
  let server = { id, programKey, specVersion: definition.version, status: "IN_PROGRESS", currentSectionKey: "work-self", version: 0, answers: {}, report: null, sourceSessionId: null,
    startedAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z", completedAt: null, definition } as unknown as Session;
  const originals = { ...authoringApi }, saves: Draft[] = [], calls: string[] = [];
  authoringApi.get = async () => structuredClone(server);
  authoringApi.save = async (_id, version, draft) => {
    assert.equal(version, server.version, "each save carries the latest version");
    calls.push("save"); saves.push(structuredClone(draft));
    server = { ...server, ...structuredClone(draft), version: version + 1 } as Session;
    return server;
  };
  authoringApi.complete = async (_id, version) => {
    assert.equal(version, server.version, "completion carries the version of the final save");
    calls.push("complete");
    server = { ...server, status: "COMPLETED", version: version + 1, completedAt: "2026-10-11T01:00:00Z", report: { programKey, specVersion: definition.version, completedAt: "2026-10-11T01:00:00Z", sections: [] } } as Session;
    return structuredClone(server);
  };
  let root = createRoot(document.getElementById("root")!), mode: "runner" | "full" = "runner";
  const render = () => act(async () => root.render(<AppRouterContext.Provider value={router}><AuthoringSession programKey={programKey} sessionId={id} mode={mode} /></AppRouterContext.Provider>));
  await render();
  const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
    const proto = el instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  const click = (label: string) => act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.startsWith(label))!.click());
  const refresh = async (next: "runner" | "full" = "runner") => { await act(() => root.unmount()); sessionStorage.clear(); mode = next; root = createRoot(document.getElementById("root")!); await render(); };
  const cleanup = async () => { await act(() => root.unmount()); Object.assign(authoringApi, originals); dom.window.close(); };
  return { saves, calls, type, settle, click, refresh, cleanup };
}
const editors = () => Array.from(document.querySelectorAll<HTMLTextAreaElement>(".authoring-questions textarea"));
const heading = () => document.querySelector(".authoring-canvas h1")?.textContent;
const legends = () => Array.from(document.querySelectorAll(".authoring-question legend")).map(l => l.textContent);

test("The runner shows the program guidance, saves each stage on its own, resumes after a refresh and completes with the close left empty", async () => {
  const { saves, calls, type, settle, click, refresh, cleanup } = await mount();
  try {
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-sections button")).map(b => b.querySelector("span")!.textContent), ["01", "02", "03", "04", "05", "06", "07"]);
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "01 / 7");
    assert.equal(heading(), "일하고 배울 때 드러나는 나");
    assert.deepEqual(legends(), [definition.sections[0].questions[0].prompt]);
    assert.equal(editors().length, 1);
    // The program guidance opens from the first stage and carries the health wording unchanged.
    const guidance = document.querySelector("details.authoring-source")!;
    assert.equal(guidance.querySelector("summary")?.textContent, "프로그램 안내");
    assert.equal(guidance.querySelector("p")?.textContent, definition.guidance);

    // Typing then moving on at once: the newest text and the new position are saved together.
    await type(editors()[0], "회의 뒤에는 혼자 정리할 시간이 필요했다.");
    await click("다음");
    assert.equal(heading(), "내가 깊어질 수 있는 것");
    assert.equal(document.querySelector("details.authoring-source"), null, "the guidance belongs to the first stage only");
    await settle();
    assert.deepEqual(saves.at(-1), { answers: { workSelf: "회의 뒤에는 혼자 정리할 시간이 필요했다." }, currentSectionKey: "strengths", title: null, memo: null });

    // 03: one editor; the fixed notice sits under the guide and declining to write is an answer like any other.
    await click("03");
    assert.equal(heading(), "나를 흔드는 것과 지켜야 할 조건");
    assert.equal(editors().length, 1);
    assert.match(document.querySelector(".authoring-question .authoring-help")?.textContent ?? "", /이 기록은 진단이나 치료 판단에 쓰이지 않습니다\. 약이나 치료 계획은 이 글만으로 바꾸지 마세요\. 쓰는 것이 버겁게 느껴지면 멈추고 다른 날 이어가도 됩니다\.$/);
    await type(editors()[0], "지금은 쓰지 않겠습니다");
    await settle();
    assert.deepEqual(saves.at(-1)!.answers, { workSelf: "회의 뒤에는 혼자 정리할 시간이 필요했다.", conditions: "지금은 쓰지 않겠습니다" }, "stages never share or overwrite each other");
    assert.match(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /✓/);

    await refresh();
    assert.equal(heading(), "나를 흔드는 것과 지켜야 할 조건", "the session resumes on the stage it was left on");
    assert.equal(editors()[0].value, "지금은 쓰지 않겠습니다");
    await click("01");
    assert.equal(editors()[0].value, "회의 뒤에는 혼자 정리할 시간이 필요했다.");
    await click("02");
    assert.equal(editors()[0].value, "", "an unwritten stage stays empty");

    // Close: three light optional fields; one written value does not fill the others.
    await click("07");
    assert.equal(heading(), "다음 걸음과 다시 볼 시점");
    assert.deepEqual(legends(), ["가장 먼저 해볼 일", "다시 볼 시점", "선택 앞에서 나에게 물을 질문"]);
    assert.equal(document.querySelectorAll(".authoring-required").length, 0);
    await type(editors()[2], "이 일은 내가 지킬 조건 안에 있는가?");
    await settle();
    assert.equal(saves.at(-1)!.answers["close.question"], "이 일은 내가 지킬 조건 안에 있는가?");
    assert.equal(saves.at(-1)!.answers["close.firstStep"], undefined);
    assert.equal(saves.at(-1)!.answers["close.reviewAt"], undefined);
    await type(editors()[2], "");
    await settle();

    await refresh("full");
    assert.match(document.body.textContent ?? "", /전체 내용 보기/);
    assert.match(document.body.textContent ?? "", /06\. 실력을 쌓아가는 방식/);
    await click("세션 완료 검토");
    const dialog = document.querySelector("dialog")!;
    assert.deepEqual(Array.from(dialog.querySelectorAll("li")).map(li => li.textContent), definition.stoppingRules);
    assert.equal(dialog.querySelector(".authoring-error"), null, "unwritten stages and close fields do not block completion");
    const title = document.querySelector<HTMLInputElement>('input[aria-label="글 제목"]')!;
    await type(title, "일하는 나 정리");
    const confirm = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => confirm.click());
    calls.length = 0;
    await act(async () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "세션 완료")!.click());
    assert.deepEqual(calls, ["save", "complete"], "the final save is committed before completion");
    assert.equal(saves.at(-1)!.title, "일하는 나 정리");
    assert.equal(routes.at(-1), `/authoring/${programKey}/session/${id}/report`);
  } finally { await cleanup(); }
});
