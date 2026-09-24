import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authoringApi } from "@/lib/api/authoring";
import type { Program, SessionSummary } from "@/lib/authoring/types";
import { tabTarget } from "@/lib/globalTabs";

const programs = [["quick-motivation", "QUICK", "Quick Motivation Writing"], ["recovery", "CORE", "Recovery Authoring"], ["responsibility", "TOPIC", "자립과 책임 글쓰기"]]
  .map(([programKey, group, title]) => ({ programKey, group, title, description: "" })) as Program[];
const session = (id: string, programKey: string, status: string, updatedAt: string) =>
  ({ id, programKey, status, updatedAt, completedAt: status === "COMPLETED" ? updatedAt : null }) as SessionSummary;

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
const rows = () => Array.from(document.querySelectorAll(".authoring-session-row")).map(r => r.querySelector("strong")!.textContent);
async function change(el: HTMLInputElement | HTMLSelectElement, value: string, win: JSDOM["window"]) {
  const select = el instanceof win.HTMLSelectElement;
  const proto = select ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new win.Event(select ? "change" : "input", { bubbles: true })); });
}

test("Library lists every session with group and status, and filters, searches and sorts them", async () => {
  const { dom, routes, cleanup } = await mount([
    session("a", "recovery", "IN_PROGRESS", "2026-09-20T01:00:00Z"),
    session("b", "responsibility", "COMPLETED", "2026-09-23T01:00:00Z"),
    session("c", "quick-motivation", "COMPLETED", "2026-09-21T01:00:00Z"),
  ]);
  try {
    assert.equal(document.querySelector("h1")?.textContent, "Library");
    assert.deepEqual(rows(), ["자립과 책임 글쓰기", "Quick Motivation Writing", "Recovery Authoring"]);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-group-label")).map(l => l.textContent), ["Topic Authoring", "Quick Writing", "Core Authoring"]);
    const sidebar = Array.from(document.querySelectorAll<HTMLButtonElement>("nav button")).map(b => [b.getAttribute("aria-label"), b.getAttribute("aria-current")]);
    assert.deepEqual(sidebar.filter(([label]) => label === "Home" || label === "Library"), [["Home", null], ["Library", "page"]]);
    const status = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".authoring-segmented button")).find(b => b.textContent === label)!;
    await act(async () => status("작성 중").click());
    assert.deepEqual(rows(), ["Recovery Authoring"]);
    await act(async () => status("완료").click());
    assert.deepEqual(rows(), ["자립과 책임 글쓰기", "Quick Motivation Writing"]);
    await act(async () => status("전체").click());
    const program = document.querySelector<HTMLSelectElement>('select[aria-label="프로그램 필터"]')!;
    assert.deepEqual(Array.from(program.options).map(o => o.textContent), ["프로그램 전체", ...programs.map(p => p.title)]);
    await change(program, "recovery", dom.window);
    assert.deepEqual(rows(), ["Recovery Authoring"]);
    await change(program, "", dom.window);
    const search = () => document.querySelector<HTMLInputElement>('input[type="search"]')!;
    await change(search(), "자립", dom.window);
    assert.deepEqual(rows(), ["자립과 책임 글쓰기"]);
    await change(search(), "없는 이름", dom.window);
    assert.equal(document.querySelector(".authoring-library-none")?.textContent, "조건에 맞는 작성 기록이 없습니다.");
    await change(search(), "", dom.window);
    await change(document.querySelector<HTMLSelectElement>('select[aria-label="정렬"]')!, "oldest", dom.window);
    assert.deepEqual(rows(), ["Recovery Authoring", "Quick Motivation Writing", "자립과 책임 글쓰기"]);
    const buttons = (i: number) => Array.from(document.querySelectorAll(".authoring-session-row")[i].querySelectorAll("button")).map(b => b.textContent);
    assert.deepEqual(buttons(0), ["이어쓰기 →"]);
    assert.deepEqual(buttons(2), ["내용 보기", "Report 보기 →"]);
    for (const [row, index] of [[0, 0], [2, 0], [2, 1]]) {
      await act(async () => document.querySelectorAll(".authoring-session-row")[row].querySelectorAll("button")[index].click());
    }
    assert.deepEqual(routes, ["/authoring/recovery/session/a", "/authoring/responsibility/session/b/full", "/authoring/responsibility/session/b/report"]);
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
