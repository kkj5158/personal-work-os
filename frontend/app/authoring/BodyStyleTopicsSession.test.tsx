import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Draft, Program, Session } from "@/lib/authoring/types";

const id = "7c2e9a41-3b5d-4f60-9a1e-6d8b2c4f0e13";
const load = (programKey: string) => JSON.parse(readFileSync(`../backend/src/main/resources/authoring/${programKey}/2026-10-11.json`, "utf8")) as Program;
const routes: string[] = [];
const router = { back() {}, forward() {}, refresh() {}, push(path: string) { routes.push(path); }, replace() {}, prefetch: async () => {} } as unknown as AppRouterInstance;

/** A stand-in server: saves persist, so a remount behaves like a page refresh. */
async function mount(definition: Program) {
  const programKey = definition.programKey;
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringSession } = await import("./AuthoringSession");
  let server = { id, programKey, specVersion: definition.version, status: "IN_PROGRESS", currentSectionKey: definition.sections[0].sectionKey, version: 0, answers: {}, report: null, sourceSessionId: null,
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
const notes = () => Array.from(document.querySelectorAll(".authoring-section-note")).map(n => n.textContent);
const stages = () => Array.from(document.querySelectorAll(".authoring-sections button")).map(b => b.querySelector("span")!.textContent);

test("가벼운 몸, 자유로운 스타일 shows its notice only below stage 06, autosaves, resumes after a refresh and completes with empty stages", async () => {
  const definition = load("light-body-free-style");
  const { saves, calls, type, settle, click, refresh, cleanup } = await mount(definition);
  try {
    assert.deepEqual(stages(), ["01", "02", "03", "04", "05", "06", "07"]);
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "01 / 7");
    assert.equal(heading(), "가벼운 몸을 원하는 마음");
    const guidance = document.querySelector("details.authoring-source")!;
    assert.equal(guidance.querySelector("summary")?.textContent, "프로그램 안내");
    assert.equal(guidance.querySelector("p")?.textContent, definition.guidance);
    assert.equal(guidance.hasAttribute("open"), false, "the guidance starts collapsed");
    assert.equal(document.querySelector(".authoring-question legend")?.textContent, definition.sections[0].questions[0].prompt);
    assert.equal(editors().length, 1);
    assert.deepEqual(notes(), []);

    // Typing then moving on at once: the newest text and the new position are saved together.
    await type(editors()[0], "입고 싶은 옷을 입고 싶다.");
    await click("다음");
    assert.equal(heading(), "내가 원하는 몸의 모습");
    assert.equal(document.querySelector("details.authoring-source"), null, "the guidance belongs to the first stage");
    await settle();
    assert.deepEqual(saves.at(-1), { answers: { desire: "입고 싶은 옷을 입고 싶다." }, currentSectionKey: "body-image", title: null, memo: null });

    // The notice sits after the editor on stage 06 and on no other stage.
    for (const [label, section] of definition.sections.map((s, i) => [String(i + 1).padStart(2, "0"), s] as const)) {
      await click(label);
      assert.equal(heading(), section.title);
      assert.deepEqual(notes(), section.sectionKey === "sustain" ? [definition.sections[5].note] : [], label);
    }
    await click("06");
    const note = document.querySelector(".authoring-section-note")!;
    assert.equal(note.previousElementSibling, document.querySelector(".authoring-questions"), "the notice follows the questions");
    assert.equal(note.querySelector("textarea, input"), null);
    await click("05");
    assert.equal(editors()[0].rows, 24, "the ordinary day uses the long editor");
    await type(editors()[0], "아침에 옷장 앞에 선다.\n\n셔츠를 넣어 입는다.");
    await settle();
    assert.match(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /✓/);

    await refresh();
    assert.equal(heading(), "원하는 몸과 스타일로 보내는 하루", "the session resumes on the stage it was left on");
    assert.equal(editors()[0].value, "아침에 옷장 앞에 선다.\n\n셔츠를 넣어 입는다.");

    // Close is the numbered last stage with two light optional fields.
    await click("07");
    assert.equal(heading(), "지금부터 누려볼 것");
    assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, "07 / 7");
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-question legend")).map(l => l.textContent), ["지금 시도해볼 스타일", "먼저 다듬어볼 생활"]);
    assert.deepEqual(editors().map(e => e.rows), [3, 3]);
    assert.equal(document.querySelectorAll(".authoring-required").length, 0);
    assert.doesNotMatch(document.querySelector(".authoring-sections button[aria-current]")!.textContent ?? "", /✓/);
    await settle();

    // Full view keeps every stage, shows what is unwritten, and never repeats the Runner notice.
    await refresh("full");
    assert.match(document.body.textContent ?? "", /전체 내용 보기/);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-document > section h2")).map(h => h.textContent), definition.sections.map((s, i) => `${String(i + 1).padStart(2, "0")}. ${s.title}`));
    assert.equal(document.querySelectorAll(".authoring-document .authoring-empty").length, 6, "six of the eight fields are unwritten");
    assert.match(document.querySelector(".authoring-document .authoring-empty")?.textContent ?? "", /아직 작성하지 않음/);
    assert.deepEqual(notes(), []);
    assert.equal(document.body.textContent?.includes(definition.sections[5].note!), false);

    await click("세션 완료 검토");
    const dialog = document.querySelector("dialog")!;
    assert.deepEqual(Array.from(dialog.querySelectorAll("li")).map(li => li.textContent), definition.stoppingRules);
    assert.equal(dialog.querySelector(".authoring-error"), null, "unwritten stages do not block completion");
    const confirm = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => confirm.click());
    calls.length = 0;
    await act(async () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "세션 완료")!.click());
    assert.deepEqual(calls, ["complete"]);
    assert.equal(routes.at(-1), `/authoring/light-body-free-style/session/${id}/report`);
  } finally { await cleanup(); }
});

for (const [programKey, last, close] of [["ren-daily-training", "06", "이번 주의 REN"], ["desired-physique", "06", "다시 돌아볼 때"]] as const) {
  test(`${programKey} runs as six numbered stages with its guidance on the first stage and no notice anywhere`, async () => {
    const definition = load(programKey);
    const { saves, type, settle, click, refresh, cleanup } = await mount(definition);
    try {
      assert.deepEqual(stages(), ["01", "02", "03", "04", "05", "06"]);
      assert.equal(heading(), definition.sections[0].title);
      const guidance = document.querySelector("details.authoring-source p")!.textContent!;
      assert.equal(guidance, definition.guidance);
      if (programKey === "ren-daily-training") assert.ok(guidance.startsWith("육체야말로 인간의 신전이다.\n\n"), "the motto is the first guidance paragraph");
      for (const [index, section] of definition.sections.entries()) {
        await click(String(index + 1).padStart(2, "0"));
        assert.equal(heading(), section.title);
        assert.deepEqual(notes(), []);
        assert.equal(editors().length, 1);
        assert.equal(document.querySelector(".authoring-help")?.textContent, section.questions[0].helperText);
      }
      assert.equal(heading(), close);
      assert.equal(document.querySelector(".authoring-eyebrow")?.textContent, `${last} / 6`);
      assert.equal(editors()[0].rows, 3);
      await click("03");
      await type(editors()[0], "서두르지 않는다.");
      await click("다음");
      await settle();
      assert.deepEqual(saves.at(-1), { answers: { [definition.sections[2].questions[0].questionKey]: "서두르지 않는다." }, currentSectionKey: definition.sections[3].sectionKey, title: null, memo: null });
      await refresh();
      assert.equal(heading(), definition.sections[3].title);
      await click("← 이전");
      assert.equal(editors()[0].value, "서두르지 않는다.");
    } finally { await cleanup(); }
  });
}
