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
  ({ id, programKey, status, updatedAt, completedAt: status === "COMPLETED" ? updatedAt : null, ...(title ? { title } : {}), ...(memo ? { memo } : {}) }) as SessionSummary;

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
/** The visible tree: [group heading, [program heading, [row titles]]]. */
const tree = () => Array.from(document.querySelectorAll(".authoring-library-group")).map(g => [g.querySelector("h2")!.textContent,
  Array.from(g.querySelectorAll(".authoring-library-program")).map(p => [p.querySelector("h3")!.textContent, Array.from(p.querySelectorAll(".authoring-session-row strong")).map(s => s.textContent)])]);
async function change(el: HTMLInputElement | HTMLSelectElement, value: string, win: JSDOM["window"]) {
  const select = el instanceof win.HTMLSelectElement;
  const proto = select ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new win.Event(select ? "change" : "input", { bubbles: true })); });
}

test("Library browses group → program → session and searches titles, memos and program names", async () => {
  const { dom, routes, cleanup } = await mount([
    session("a", "recovery", "COMPLETED", "2026-09-24T01:00:00Z", "다시 생활 리듬이 무너진 이유 정리", "9월 야간근무 이후 생활패턴 확인"),
    session("b", "recovery", "COMPLETED", "2026-09-10T01:00:00Z"),
    session("c", "grounded-future", "IN_PROGRESS", "2026-09-22T01:00:00Z", "올해 이후의 방향 다시 정리"),
    session("d", "responsibility", "IN_PROGRESS", "2026-09-23T01:00:00Z"),
  ]);
  try {
    assert.equal(document.querySelector('select[aria-label="프로그램 필터"]'), null);
    assert.deepEqual(tree(), [
      ["핵심 글쓰기 · 3개 기록", [["삶의 중심 되찾기 · 2개", ["다시 생활 리듬이 무너진 이유 정리", "삶의 중심 되찾기"]], ["앞으로의 삶 설계하기 · 1개", ["올해 이후의 방향 다시 정리"]]]],
      ["주제 글쓰기 · 1개 기록", [["자립하는 삶, 책임지는 삶 · 1개", ["자립하는 삶, 책임지는 삶"]]]],
    ]);
    assert.doesNotMatch(document.body.textContent ?? "", /null|undefined|제목 없음|빠른 글쓰기/);
    assert.equal(document.querySelector(".authoring-session-memo")?.textContent, "9월 야간근무 이후 생활패턴 확인");
    const sidebar = Array.from(document.querySelectorAll<HTMLButtonElement>("nav button")).map(b => [b.getAttribute("aria-label"), b.getAttribute("aria-current")]);
    assert.deepEqual(sidebar.filter(([label]) => label === "Home" || label === "Library"), [["Home", null], ["Library", "page"]]);

    const status = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".authoring-segmented button")).find(b => b.textContent === label)!;
    await act(async () => status("작성 중").click());
    assert.deepEqual(tree().map(([group]) => group), ["핵심 글쓰기 · 1개 기록", "주제 글쓰기 · 1개 기록"]);
    await act(async () => status("전체").click());

    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    for (const [text, expected] of [["리듬", ["다시 생활 리듬이 무너진 이유 정리"]], ["야간근무", ["다시 생활 리듬이 무너진 이유 정리"]], ["자립하는", ["자립하는 삶, 책임지는 삶"]], ["설계", ["올해 이후의 방향 다시 정리"]]] as const) {
      await change(search, text, dom.window);
      assert.deepEqual(tree().flatMap(([, branches]) => (branches as [string, string[]][]).flatMap(([, rows]) => rows)), expected, text);
    }
    await change(search, "없는 기록", dom.window);
    assert.equal(document.querySelector(".authoring-library-none")?.textContent, "조건에 맞는 작성 기록이 없습니다.");
    await change(search, "", dom.window);

    await change(document.querySelector<HTMLSelectElement>('select[aria-label="정렬"]')!, "oldest", dom.window);
    assert.deepEqual(tree()[0][1][0], ["삶의 중심 되찾기 · 2개", ["삶의 중심 되찾기", "다시 생활 리듬이 무너진 이유 정리"]]);

    const rowButtons = (title: string) => Array.from(document.querySelectorAll(".authoring-session-row")).find(r => r.querySelector("strong")!.textContent === title)!.querySelectorAll("button");
    assert.deepEqual(Array.from(rowButtons("올해 이후의 방향 다시 정리")).map(b => b.textContent), ["이어쓰기 →"]);
    await act(async () => rowButtons("올해 이후의 방향 다시 정리")[0].click());
    await act(async () => rowButtons("다시 생활 리듬이 무너진 이유 정리")[0].click());
    await act(async () => rowButtons("다시 생활 리듬이 무너진 이유 정리")[1].click());
    assert.deepEqual(routes, ["/authoring/grounded-future/session/c", "/authoring/recovery/session/a/full", "/authoring/recovery/session/a/report"]);
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
