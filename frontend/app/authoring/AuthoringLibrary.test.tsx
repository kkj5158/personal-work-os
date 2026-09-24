import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import { programEmoji, type Program, type SessionSummary } from "@/lib/authoring/types";
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

async function mount(sessions: SessionSummary[], list: Program[] = programs) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/authoring/library" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  // react-dom decides native input-event support on first import, so load it after the DOM exists.
  const { createRoot } = await import("react-dom/client");
  const { default: AuthoringLibrary } = await import("./AuthoringLibrary");
  const root = createRoot(document.getElementById("root")!), originals = { ...authoringApi }, routes: string[] = [];
  authoringApi.programs = async () => list;
  authoringApi.sessions = async () => sessions;
  const router = { push: (path: string) => routes.push(path), prefetch: async () => {} } as unknown as AppRouterInstance;
  await act(async () => root.render(<AppRouterContext.Provider value={router}><AuthoringLibrary /></AppRouterContext.Provider>));
  const cleanup = async () => { await act(() => root.unmount()); Object.assign(authoringApi, originals); dom.window.close(); };
  return { dom, routes, cleanup };
}
const text = (el: Element | null) => el?.textContent ?? "";
/** [shelf title, shelf meta, [[program title, program meta, [row headings]]], empty note]. */
const shelves = () => Array.from(document.querySelectorAll(".authoring-shelf")).map(shelf => [text(shelf.querySelector("h2")), text(shelf.querySelector(".authoring-shelf-meta")),
  Array.from(shelf.querySelectorAll(".authoring-program-block")).map(block => [text(block.querySelector("h3")), text(block.querySelector("header p")),
    Array.from(block.querySelectorAll(".authoring-session-row strong")).map(text)]), text(shelf.querySelector(".authoring-shelf-empty p"))]);
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
        ["삶의 중심 되찾기", "기록 4개 · 최근 수정 2026.09.24", ["다시 생활 리듬이 무너진 이유 정리", "2026.09.10 작성", "2026.09.05 작성"]],
        ["앞으로의 삶 설계하기", "기록 1개 · 최근 수정 2026.09.22", ["올해 이후의 방향 다시 정리"]]], ""],
      ["주제 글쓰기", "1개 프로그램 · 1개 기록", [["자립하는 삶, 책임지는 삶", "기록 1개 · 최근 수정 2026.09.23", ["2026.09.23 작성"]]], ""],
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

/** The nine current programs in registry (INDEX) order. */
const nine = ([["quick-motivation", "QUICK", "다시 시작하기"], ["recovery", "CORE", "삶의 중심 되찾기"], ["reality", "CORE", "지금의 삶 들여다보기"],
  ["present-life", "CORE", "지금의 삶을 누리기"], ["grounded-future", "CORE", "앞으로의 삶 설계하기"], ["past", "CORE", "나를 만든 시간들"], ["review", "CORE", "변화와 방향 돌아보기"],
  ["sexual-pattern", "TOPIC", "성중독과 삶의 회복 - 자유롭고 온전하게 살아가기"], ["responsibility", "TOPIC", "자립하는 삶, 책임지는 삶"]] as const)
  .map(([programKey, group, title]) => ({ programKey, group, title, description: "" })) as Program[];
const cards = () => Array.from(document.querySelectorAll(".authoring-shelf")).map(shelf => [text(shelf.querySelector("h2")),
  Array.from(shelf.querySelectorAll(".authoring-program-block")).map(block => `${text(block.querySelector(".authoring-cue"))} ${text(block.querySelector("h3"))}`)]);

test("Library groups all nine programs by INDEX order with one emoji cue each", async () => {
  const all = nine.map((p, i) => session(`s${i}`, p.programKey, i % 2 ? "COMPLETED" : "IN_PROGRESS", `2026-09-${String(10 + i).padStart(2, "0")}T01:00:00Z`));
  const { cleanup } = await mount(all, nine);
  try {
    assert.deepEqual(cards(), [
      ["빠른 글쓰기", ["⚡ 다시 시작하기"]],
      ["핵심 글쓰기", ["❤️ 삶의 중심 되찾기", "🔎 지금의 삶 들여다보기", "🌿 지금의 삶을 누리기", "🗺️ 앞으로의 삶 설계하기", "🕰️ 나를 만든 시간들", "🧭 변화와 방향 돌아보기"]],
      ["주제 글쓰기", ["🛡️ 성중독과 삶의 회복 - 자유롭고 온전하게 살아가기", "🏗️ 자립하는 삶, 책임지는 삶"]],
    ]);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-shelf-header .authoring-cue")).map(text), ["⚡", "🧭", "🎯"]);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-shelf-meta")).map(text), ["1개 프로그램 · 1개 기록", "6개 프로그램 · 6개 기록", "2개 프로그램 · 2개 기록"]);
    // Cues are decorative: hidden from assistive tech, the program name stays the accessible name.
    for (const cue of Array.from(document.querySelectorAll(".authoring-cue"))) assert.equal(cue.getAttribute("aria-hidden"), "true");
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-program-block")).map(b => b.getAttribute("aria-label")), nine.map(p => p.title));
    assert.deepEqual(Object.keys(programEmoji).sort(), nine.map(p => p.programKey).sort());
  } finally { await cleanup(); }
});

test("Summary strip counts the whole library at runtime and rows carry text status badges", async () => {
  const { dom, cleanup } = await mount(data);
  try {
    const summary = () => Array.from(document.querySelectorAll(".authoring-library-summary > div")).map(item => `${text(item.querySelector("dt"))} ${text(item.querySelector("dd"))}`);
    const expected = ["📝전체 기록 6개", "✏️작성 중 3개", "✅완료 3개", "📚기록이 있는 프로그램 3개"];
    assert.deepEqual(summary(), expected);
    assert.equal(text(document.querySelector(".authoring-library-result")), "");
    const row = (heading: string) => Array.from(document.querySelectorAll(".authoring-session-row")).find(r => text(r.querySelector("strong")) === heading)!;
    assert.equal(text(row("올해 이후의 방향 다시 정리").querySelector(".authoring-status-badge")), "작성 중");
    assert.equal(text(row("2026.09.10 작성").querySelector(".authoring-status-badge")), "완료");
    assert.doesNotMatch(text(row("2026.09.10 작성").querySelector(".authoring-session-text > span")), /완료|작성 중/);

    await change(document.querySelector<HTMLInputElement>('input[type="search"]')!, "리듬", dom.window);
    assert.deepEqual(summary(), expected);
    assert.equal(text(document.querySelector(".authoring-library-result")), "조건에 맞는 기록 1개");
  } finally { await cleanup(); }
});

test("An empty category shows one compact state, and shelves collapse", async () => {
  const { routes, cleanup } = await mount(data);
  try {
    assert.equal(document.querySelectorAll(".authoring-shelf-empty").length, 1);
    const quick = document.querySelector('.authoring-shelf[data-group="QUICK"]')!;
    assert.equal(quick.querySelectorAll(".authoring-program-block").length, 0);
    await act(async () => quick.querySelector<HTMLButtonElement>(".authoring-shelf-empty button")!.click());
    assert.deepEqual(routes, ["/authoring"]);

    const core = document.querySelector('.authoring-shelf[data-group="CORE"]')!, toggle = core.querySelector<HTMLButtonElement>(".authoring-shelf-toggle")!;
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(core.querySelectorAll(".authoring-program-block").length, 0);
    assert.equal(text(core.querySelector(".authoring-shelf-meta")), "2개 프로그램 · 5개 기록");
    await act(async () => toggle.click());
    assert.equal(core.querySelectorAll(".authoring-program-block").length, 2);
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
