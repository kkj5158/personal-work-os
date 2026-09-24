import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Program, SessionSummary } from "@/lib/authoring/types";
import { tabTarget } from "@/lib/globalTabs";

const programs = [["quick-motivation", "QUICK", "다시 시작하기"], ["recovery", "CORE", "삶의 중심 되찾기"], ["grounded-future", "CORE", "앞으로의 삶 설계하기"], ["responsibility", "TOPIC", "자립하는 삶, 책임지는 삶"]]
  .map(([programKey, group, title]) => ({ programKey, group, title, description: "" })) as Program[];
const session = (id: string, programKey: string, status: string, updatedAt: string, title?: string, memo?: string) =>
  ({ id, programKey, status, startedAt: updatedAt, updatedAt, completedAt: status === "COMPLETED" ? updatedAt : null, ...(title ? { title } : {}), ...(memo ? { memo } : {}) }) as SessionSummary;
const data = [
  session("a", "recovery", "COMPLETED", "2026-09-24T01:00:00Z", "다시 생활 리듬이 무너진 이유 정리", "9월 야간근무 이후 생활패턴 확인"),
  session("b", "recovery", "COMPLETED", "2026-09-10T01:00:00Z"),
  session("e", "recovery", "IN_PROGRESS", "2026-09-05T01:00:00Z"),
  session("f", "recovery", "COMPLETED", "2026-09-01T01:00:00Z"),
  session("c", "grounded-future", "IN_PROGRESS", "2026-09-22T01:00:00Z", "올해 이후의 방향 다시 정리"),
  session("d", "responsibility", "IN_PROGRESS", "2026-09-23T01:00:00Z"),
];

async function mount(sessions: SessionSummary[]) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring/library" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringLibrary } = await import("./AuthoringLibrary");
  const root = createRoot(document.getElementById("root")!), originals = { ...authoringApi }, routes: string[] = [];
  authoringApi.programs = async () => programs;
  authoringApi.sessions = async () => sessions;
  const router = { push: (path: string) => routes.push(path), prefetch: async () => {} } as unknown as AppRouterInstance;
  await act(async () => root.render(<AppRouterContext.Provider value={router}><AuthoringLibrary /></AppRouterContext.Provider>));
  const cleanup = async () => { await act(() => root.unmount()); Object.assign(authoringApi, originals); dom.window.close(); };
  return { dom, routes, cleanup };
}
const text = (el: Element | null) => el?.textContent ?? "";
/** [shelf title, shelf meta, [[program title, program meta, [row headings]]], empty note]. */
const shelves = () => Array.from(document.querySelectorAll(".authoring-shelf")).map(shelf => [text(shelf.querySelector("h2")), text(shelf.querySelector(".authoring-shelf-header p")),
  Array.from(shelf.querySelectorAll(".authoring-program-block")).map(block => [text(block.querySelector("h3")), text(block.querySelector("header p")),
    Array.from(block.querySelectorAll(".authoring-session-row strong")).map(text)]), text(shelf.querySelector(".authoring-shelf-empty"))]);
async function change(el: HTMLInputElement | HTMLSelectElement, value: string, win: JSDOM["window"]) {
  const select = el instanceof win.HTMLSelectElement;
  const proto = select ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new win.Event(select ? "change" : "input", { bubbles: true })); });
}

test("Library shows three shelves with program blocks and date fallbacks instead of repeated program names", async () => {
  const { cleanup } = await mount(data);
  try {
    assert.equal(document.querySelector('select[aria-label="프로그램 필터"]'), null);
    assert.deepEqual(shelves(), [
      ["빠른 글쓰기", "0개 프로그램 · 0개 기록", [], "아직 작성한 기록이 없습니다."],
      ["핵심 글쓰기", "2개 프로그램 · 5개 기록", [
        ["삶의 중심 되찾기", "4개 기록 · 최근 수정 2026.09.24", ["다시 생활 리듬이 무너진 이유 정리", "2026.09.10 작성", "2026.09.05 작성"]],
        ["앞으로의 삶 설계하기", "1개 기록 · 최근 수정 2026.09.22", ["올해 이후의 방향 다시 정리"]]], ""],
      ["주제 글쓰기", "1개 프로그램 · 1개 기록", [["자립하는 삶, 책임지는 삶", "1개 기록 · 최근 수정 2026.09.23", ["2026.09.23 작성"]]], ""],
    ]);
    const rows = Array.from(document.querySelectorAll(".authoring-program-block .authoring-session-row strong")).map(text);
    for (const program of programs) assert.equal(rows.includes(program.title), false, `row repeats ${program.title}`);
    assert.doesNotMatch(text(document.querySelector("main")), /null|undefined|제목 없음/);
    assert.equal(text(document.querySelector(".authoring-session-memo")), "9월 야간근무 이후 생활패턴 확인");

    const more = document.querySelector<HTMLButtonElement>(".authoring-more")!;
    assert.equal(text(more), "기록 1개 더 보기");
    await act(async () => more.click());
    assert.deepEqual(shelves()[1][2][0][2], ["다시 생활 리듬이 무너진 이유 정리", "2026.09.10 작성", "2026.09.05 작성", "2026.09.01 작성"]);
    assert.equal(text(document.querySelector(".authoring-more")), "접기");
  } finally { await cleanup(); }
});

test("Status, search and sort keep group → program → session and hide empty shelves", async () => {
  const { dom, routes, cleanup } = await mount(data);
  try {
    const status = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".authoring-segmented button")).find(b => text(b) === label)!;
    await act(async () => status("작성 중").click());
    assert.deepEqual(shelves().map(s => [s[0], s[1]]), [["핵심 글쓰기", "2개 프로그램 · 2개 기록"], ["주제 글쓰기", "1개 프로그램 · 1개 기록"]]);
    await act(async () => status("전체").click());

    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    for (const [query, expected] of [["리듬", [["핵심 글쓰기", [["삶의 중심 되찾기", ["다시 생활 리듬이 무너진 이유 정리"]]]]]],
      ["야간근무", [["핵심 글쓰기", [["삶의 중심 되찾기", ["다시 생활 리듬이 무너진 이유 정리"]]]]]],
      ["자립하는", [["주제 글쓰기", [["자립하는 삶, 책임지는 삶", ["2026.09.23 작성"]]]]]]] as const) {
      await change(search, query, dom.window);
      assert.deepEqual(shelves().map(([shelf, , blocks]) => [shelf, (blocks as [string, string, string[]][]).map(([program, , rows]) => [program, rows])]), expected, query);
    }
    await change(search, "없는 기록", dom.window);
    assert.equal(document.querySelectorAll(".authoring-shelf").length, 0);
    assert.equal(text(document.querySelector(".authoring-library-none")), "조건에 맞는 작성 기록이 없습니다.");
    await change(search, "", dom.window);
    assert.equal(document.querySelectorAll(".authoring-shelf").length, 3);

    await change(document.querySelector<HTMLSelectElement>('select[aria-label="정렬"]')!, "oldest", dom.window);
    assert.deepEqual(shelves()[1][2][0][2], ["2026.09.01 작성", "2026.09.05 작성", "2026.09.10 작성"]);

    const row = (heading: string) => Array.from(document.querySelectorAll(".authoring-session-row")).find(r => text(r.querySelector("strong")) === heading)!;
    assert.deepEqual(Array.from(row("올해 이후의 방향 다시 정리").querySelectorAll("button")).map(text), ["이어쓰기 →"]);
    assert.deepEqual(Array.from(row("2026.09.10 작성").querySelectorAll("button")).map(text), ["내용 보기", "Report 보기 →"]);
    await act(async () => row("올해 이후의 방향 다시 정리").querySelector("button")!.click());
    await act(async () => row("2026.09.10 작성").querySelectorAll("button")[0].click());
    await act(async () => row("2026.09.10 작성").querySelectorAll("button")[1].click());
    assert.deepEqual(routes, ["/authoring/grounded-future/session/c", "/authoring/recovery/session/b/full", "/authoring/recovery/session/b/report"]);
  } finally { await cleanup(); }
});

test("Library explains an empty history and links back to Home", async () => {
  const { routes, cleanup } = await mount([]);
  try {
    assert.match(document.body.textContent ?? "", /아직 작성한 글이 없습니다\.Home에서 Authoring을 시작하면 이곳에 기록이 쌓입니다\./);
    const start = Array.from(document.querySelectorAll<HTMLButtonElement>("main button")).find(b => b.textContent === "Authoring 시작하기")!;
    await act(async () => start.click());
    assert.deepEqual(routes, ["/authoring"]);
    assert.equal(document.querySelector(".authoring-library-filters"), null);
  } finally { await cleanup(); }
});

test("Library is an AUTHORING tab with its own identity", () => {
  assert.deepEqual(tabTarget("/authoring/library"), { system: "AUTHORING", route: "/authoring/library", title: "AUTHORING · Library", contextKey: "/authoring/library" });
  assert.notEqual(tabTarget("/authoring")?.contextKey, tabTarget("/authoring/library")?.contextKey);
});
