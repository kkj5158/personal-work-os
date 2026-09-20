import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Autosave } from "../notes/autosave";
import { hasAnswer, scanSummary, sessionRoute, type Answer, type Program, type Session, type Draft } from "./types";
import { QuestionField } from "../../app/authoring/QuestionField";
import { ReportDocument } from "../../app/authoring/SessionDocument";
import { tabTarget, visitTab, EMPTY_TABS } from "../globalTabs";
import { draftDiffers } from "./drafts";

test("A local draft remains recoverable when another tab completes the server session", () => {
  const completed = {status:"COMPLETED",answers:{writing:"server snapshot"},currentSectionKey:"close",version:5} as unknown as Session;
  const local = {answers:{writing:"unsaved new writing"},currentSectionKey:"close",version:3};
  assert.equal(draftDiffers(local,completed),true);
  assert.equal(draftDiffers({...local,answers:completed.answers},completed),false);
  assert.equal(draftDiffers({...local,answers:completed.answers,currentSectionKey:"unload"},completed),true);
});

test("Authoring session routes share one tab across runner, full view and report; private input is excluded", () => {
  const s = { id: "b79b7a86-0e98-426b-8d06-b8e82ca09df5", programKey: "recovery" };
  const route = sessionRoute(s);
  assert.equal(tabTarget(`${route}/full?answers=private`)?.route, `${route}/full`);
  let tabs = visitTab(EMPTY_TABS, route, true);
  tabs = visitTab(tabs, `${route}/report`, true);
  assert.equal(tabs.tabs.length, 1);
  assert.equal(tabs.tabs[0].system, "AUTHORING");
  assert.equal(tabTarget("/authoring/past/session/fake"), null);
});

test("Serialized section navigation saves the freshest answers and version, and retries a retained failed draft", async () => {
  let version = 0, release!: () => void, fail = false;
  const calls: { version: number; draft: Draft }[] = [];
  const queue = new Autosave<Draft>(async draft => {
    calls.push({ version, draft });
    if (calls.length === 1) await new Promise<void>(resolve => { release = resolve; });
    if (fail) throw new Error("offline");
    version++;
  }, () => {}, 10000);
  queue.set({ answers: { writing: "first" }, currentSectionKey: "unload" });
  const first = queue.flush();
  queue.set({ answers: { writing: "latest 한글" }, currentSectionKey: "scan" });
  release(); await first;
  assert.deepEqual(calls.map(c => c.version), [0, 1]);
  assert.equal(calls[1].draft.answers.writing, "latest 한글");
  assert.equal(calls[1].draft.currentSectionKey, "scan");
  fail = true; queue.set({ answers: { writing: "offline input" }, currentSectionKey: "close" });
  await assert.rejects(queue.flush(), /offline/); assert.equal(queue.dirty(), true);
  fail = false; await queue.flush(); assert.equal(calls.at(-1)!.draft.answers.writing, "offline input");
  assert.equal(version, 3); assert.equal(queue.dirty(), false); queue.stop();
});

test("Score summaries ignore blanks, preserve stable ties, and never treat zero as a valid filled score", () => {
  const program = { sections: [{ sectionKey: "scan", questions: ["a", "b", "c", "d"].map(questionKey => ({ questionKey, prompt: questionKey, type: "SCORE" })) }] } as Program;
  const result = scanSummary(program, { a: { value: 1 }, b: { value: 1 }, c: { value: 9 }, d: { value: null } })!;
  assert.equal(result.count, 3); assert.equal(result.total, 4); assert.equal(result.spread, 8);
  assert.deepEqual(result.low.map(s => s.title), ["a", "b", "c"]);
  assert.equal(hasAnswer({ value: null }), false);
  assert.equal(hasAnswer({ value: 0 }), false);
  assert.equal(hasAnswer([{text: "unfinished", classification: ""}]), false);
});

test("Completed report renders stored snapshot summary and items even if raw answers differ", () => {
  const session = { definition: { title: "Recovery Authoring", sections: [] }, programKey: "recovery", specVersion: "old", answers: { writing: "newer raw" }, report: { completedAt: "2026-09-20T00:00:00Z", sections: [{ title: "Snapshot", items: [{ questionKey: "writing", prompt: "Original prompt", type: "FREE_TEXT", value: "frozen writing" }] }], scanSummary: { count: 2, average: 7.5, highest: [{ prompt: "saved high", value: 8 }], lowest: [{ prompt: "saved low", value: 7 }], spread: 1 } } } as unknown as Session;
  const html = renderToStaticMarkup(<ReportDocument session={session} />);
  assert.match(html, /7.5/); assert.match(html, /saved high/); assert.match(html, /frozen writing/); assert.doesNotMatch(html, /newer raw/);
});

test("Common renderer exposes native accessible selection, scores, and classification controls", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!); let answer: Answer = null;
  const render = (type: "MULTI_SELECT" | "SINGLE_SELECT" | "SCORE" | "CLASSIFICATION") => root.render(<QuestionField question={{ questionKey: "q", prompt: "Prompt", type, options: ["MUST", "LATER"], metadata: { timing: true } }} value={answer} answers={{}} change={value => { answer = value; }} />);
  try {
    await act(() => render("MULTI_SELECT")); await act(() => document.querySelector<HTMLInputElement>("input")!.click()); assert.deepEqual(answer, ["MUST"]);
    answer = null; await act(() => render("SINGLE_SELECT")); await act(() => document.querySelectorAll<HTMLInputElement>("input")[1].click()); assert.equal(answer, "LATER");
    answer = null; await act(() => render("SCORE")); await act(() => document.querySelectorAll<HTMLInputElement>("input")[6].click()); assert.deepEqual(answer, { value: 7 });
    answer = [{ text: "item", classification: "MUST", timing: "" }]; await act(() => render("CLASSIFICATION"));
    const timing = document.querySelector<HTMLSelectElement>('select[aria-label="항목 1 처리 시점"]')!;
    await act(() => { timing.value = "오늘"; timing.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal((answer as { timing: string }[])[0].timing, "오늘");
  } finally { await act(() => root.unmount()); dom.window.close(); }
});
