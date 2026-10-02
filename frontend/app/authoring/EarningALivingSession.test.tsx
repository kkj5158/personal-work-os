import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Draft, FieldRow, Program, Session } from "@/lib/authoring/types";

const id = "5a1c7e2b-9d34-4c1f-8b6a-2e7f0d1c3b4a", programKey = "earning-a-living";
const definition = JSON.parse(readFileSync(`../backend/src/main/resources/authoring/${programKey}/2026-10-02.json`, "utf8")) as Program;
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
  let server = { id, programKey, specVersion: definition.version, status: "IN_PROGRESS", currentSectionKey: "money-role", version: 0, answers: {}, report: null, sourceSessionId: null,
    startedAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", completedAt: null, definition } as unknown as Session;
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
    server = { ...server, status: "COMPLETED", version: version + 1, completedAt: "2026-10-02T01:00:00Z", report: { programKey, specVersion: definition.version, completedAt: "2026-10-02T01:00:00Z", sections: [] } } as Session;
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
const amounts = () => Array.from(document.querySelectorAll<HTMLInputElement>(".authoring-field-rows input"));
const heading = () => document.querySelector(".authoring-canvas h1")?.textContent;

test("The runner autosaves, keeps the three income levels and the two paths apart, resumes after a refresh and saves before completing", async () => {
  const { saves, calls, type, settle, click, refresh, cleanup } = await mount();
  try {
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-sections button")).map(b => b.querySelector("span")!.textContent), ["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "01 / 9");
    assert.equal(heading(), "돈이 내 삶에서 해주었으면 하는 일");
    assert.equal(document.querySelector(".authoring-question legend")?.textContent, definition.sections[0].questions[0].prompt);
    assert.equal(editors().length, 1);

    // Typing then moving on at once: the newest text and the new position are saved together.
    await type(editors()[0], "아직 잘 모르겠습니다.");
    await click("다음");
    assert.equal(heading(), "지금까지의 돈벌이에서 알게 된 것");
    await settle();
    assert.deepEqual(saves.at(-1), { answers: { moneyRole: "아직 잘 모르겠습니다." }, currentSectionKey: "learned", title: null, memo: null });
    await click("← 이전");
    assert.equal(editors()[0].value, "아직 잘 모르겠습니다.");

    // 04: only what is typed is stored; the other levels stay empty and nothing is calculated.
    await click("04");
    assert.equal(heading(), "나에게 어느 정도의 수입이 필요한가");
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-field-rows h3")).map(h => h.textContent), ["최소 유지", "자립과 안정", "선택의 폭"]);
    assert.equal(amounts().length, 3); assert.equal(editors().length, 6);
    await type(amounts()[0], "약 150~180만 원");
    await type(editors()[1], "확인 필요");
    await type(editors()[4], "배움과 휴식");
    assert.deepEqual(amounts().map(a => a.value), ["약 150~180만 원", "", ""], "an amount is never copied to another level");
    await settle();
    assert.deepEqual(saves.at(-1)!.answers.incomeNeeds, [{ id: "minimum", amount: "약 150~180만 원", check: "확인 필요" }, { id: "stability" }, { id: "choice", reason: "배움과 휴식" }]);
    assert.match(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /✓/);

    // 07: one main question and guide, two separate editors.
    await click("07");
    assert.equal(heading(), "지금 생활을 지탱할 일과 앞으로 키울 일");
    assert.equal(document.querySelector(".authoring-section-prompt")?.textContent, definition.sections[6].prompt);
    assert.match(document.querySelector(".authoring-section-description")?.textContent ?? "", /모든 돈벌이를 하나의 일로 해결할 필요는 없습니다\./);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-question legend")).map(l => l.textContent), ["현재 생활을 지탱할 소득", "앞으로 키워갈 경로"]);
    assert.equal(editors().length, 2);
    await type(editors()[1], "외주를 작게 시험해본다");
    await settle();
    assert.equal(saves.at(-1)!.answers.growth, "외주를 작게 시험해본다");
    assert.equal(saves.at(-1)!.answers.support, undefined, "the two paths never share text");
    assert.doesNotMatch(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /✓/);

    await refresh();
    assert.equal(heading(), "지금 생활을 지탱할 일과 앞으로 키울 일", "the session resumes on the stage it was left on");
    assert.deepEqual(editors().map(e => e.value), ["", "외주를 작게 시험해본다"]);
    await click("04");
    assert.deepEqual(amounts().map(a => a.value), ["약 150~180만 원", "", ""]);
    assert.deepEqual(editors().map(e => e.value), ["", "확인 필요", "", "", "배움과 휴식", ""]);
    // Clearing a field keeps the row; nothing is put in its place.
    await type(amounts()[0], "");
    await settle();
    assert.equal((saves.at(-1)!.answers.incomeNeeds as FieldRow[])[0].amount, "");

    // Close: three light fields; the last typing is saved before the session is completed.
    await click("09");
    assert.equal(heading(), "지금부터 해볼 것");
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-question legend")).map(l => l.textContent), ["지금의 수입을 안정시키기 위해 할 일", "앞으로의 가능성을 확인하기 위해 해볼 일", "다시 돌아볼 시점"]);
    assert.equal(document.querySelectorAll(".authoring-required").length, 0);
    await settle();
    await refresh("full");
    assert.match(document.body.textContent ?? "", /전체 내용 보기/);
    await click("세션 완료 검토");
    const dialog = document.querySelector("dialog")!;
    assert.deepEqual(Array.from(dialog.querySelectorAll("li")).map(li => li.textContent), definition.stoppingRules);
    assert.equal(dialog.querySelector(".authoring-error"), null, "unwritten optional fields do not block completion");
    const title = document.querySelector<HTMLInputElement>('input[aria-label="글 제목"]')!;
    await type(title, "돈 버는 방식 정리");
    const confirm = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => confirm.click());
    calls.length = 0;
    await act(async () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "세션 완료")!.click());
    assert.deepEqual(calls, ["save", "complete"], "the final save is committed before completion");
    assert.equal(saves.at(-1)!.title, "돈 버는 방식 정리");
    assert.equal(routes.at(-1), `/authoring/${programKey}/session/${id}/report`);
  } finally { await cleanup(); }
});
