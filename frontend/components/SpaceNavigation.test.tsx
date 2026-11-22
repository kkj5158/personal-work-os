import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { GlobalTabsProvider, useShellNavigationGuard } from "./GlobalTabs";
import { SpaceDefaultsProvider } from "./SpaceDefaults";
import { SharedSidebar } from "./Sidebar";
import { INITIAL_SPACE_DEFAULTS, SPACE_STORAGE_KEY, SPACES, WORK_GROUPS, type SpaceDefaults } from "../lib/spaceNavigation";
import { ApiError, apiClient } from "../lib/api/client";
import { duplicateTab, EMPTY_TABS, TAB_STORAGE_KEY, toggleTabPin, visitTab } from "../lib/globalTabs";

async function setup(route: string, guarded = false, strict = false, settings = false) {
  const dom = new JSDOM("<div id='root'></div>", { url: `https://orbit.local${route}`, pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  let continuation: (() => void) | null = null;
  let guardCalls = 0;
  const destinations: string[] = [];
  function Body() {
    useShellNavigationGuard(proceed => { guardCalls++; if (guarded) continuation = proceed; else proceed(); });
    return <><p data-testid="original-page">Existing real page</p><textarea defaultValue="unsaved draft"/></>;
  }
  let saved = visitTab(EMPTY_TABS, "/notes?workspace=legacy&note=one", true);
  saved = toggleTabPin(saved, saved.activeTabId!);
  saved = duplicateTab(saved, saved.activeTabId!);
  localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(saved));
  if (strict) window.sessionStorage.setItem(SPACE_STORAGE_KEY, JSON.stringify({ version: 1, spaces: { knowledge: "/blog", life: "/checklist/progress?area=two" }, systems: { BLOG: "/blog", "CHECKLIST SYS": "/checklist/progress?area=two" } }));
  const router = { push: (href: string) => destinations.push(href), prefetch: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  const render = async (next: string, sidebar = false) => {
    dom.window.history.replaceState(null, "", next);
    const shell = <GlobalTabsProvider>{sidebar && <SharedSidebar system="WORK OS" groups={[]}/>}<Body/></GlobalTabsProvider>;
    const tree = <AppRouterContext.Provider value={router}><PathnameContext.Provider value={next.split("?")[0]}><SearchParamsContext.Provider value={new URLSearchParams(next.split("?")[1])}>{settings ? <SpaceDefaultsProvider>{shell}</SpaceDefaultsProvider> : shell}</SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>;
    await act(() => root.render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree));
  };
  await render(route);
  return { dom, destinations, render, guardCalls: () => guardCalls, proceed: async () => { assert.ok(continuation); await act(() => continuation!()); continuation = null; }, cleanup: async () => { await act(() => root.unmount()); dom.window.close(); } };
}
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(row => row.getAttribute("aria-label") === label)!;
const click = async (label: string) => act(() => button(label).click());
const key = async (target: Element, value: string) => act(() => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));

test("system dropdown: active state, focus, arrows, Home/End, Escape, outside interaction, Tab and touch click", async () => {
  const app = await setup("/notes");
  const trigger = button("KNOWLEDGE & LOG 시스템 전환");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  await key(trigger, "ArrowDown");
  assert.equal(document.activeElement?.textContent, "NOTE SYS");
  await key(document.activeElement!, "ArrowDown"); assert.equal(document.activeElement?.textContent, "Blog · LOG");
  await key(document.activeElement!, "Home"); assert.equal(document.activeElement?.textContent, "NOTE SYS");
  await key(document.activeElement!, "End"); assert.equal(document.activeElement?.textContent, "네이버 블로그");
  await key(document.activeElement!, "Escape"); assert.equal(document.querySelector('[role="menu"]'), null); assert.equal(document.activeElement, trigger);
  await click("KNOWLEDGE & LOG 시스템 전환");
  assert.deepEqual(Array.from(document.querySelectorAll('[role="menuitemradio"]')).map(row => [row.textContent, row.getAttribute("aria-checked")]), [["NOTE SYS", "true"], ["Blog · LOG", "false"], ["네이버 블로그", "false"]]);
  await act(() => document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
  assert.equal(document.querySelector('[role="menu"]'), null);
  await click("KNOWLEDGE & LOG 시스템 전환");
  await act(() => button("POS 전체 홈").focus());
  assert.equal(document.querySelector('[role="menu"]'), null, "Tab/outside focus closes menu");
  await click("KNOWLEDGE & LOG 시스템 전환");
  await act(() => document.querySelector<HTMLAnchorElement>('[href="/blog"][role="menuitemradio"]')!.click());
  assert.deepEqual(app.destinations, ["/blog"]);
  assert.ok(document.querySelector('[data-testid="original-page"]'));
  await app.cleanup();
});
test("Space choices restore the default system's page and Finance has no system dropdown", async () => {
  const app = await setup("/notes?workspace=one&module=GRAPH");
  for (const route of ["/blog", "/checklist/progress?identity=one&area=two", "/money/accounts"]) await app.render(route);
  assert.equal(document.querySelector(".pos-single-system")?.textContent, "MONEY SYS");
  assert.equal(document.querySelector(".pos-system-select"), null);
  assert.equal(document.querySelector<HTMLElement>(".orbit-tab-bar")!.hidden, true);
  await click("Space 전환");
  const choices = Array.from(document.querySelectorAll<HTMLAnchorElement>('[role="menuitemradio"]'));
  assert.deepEqual(choices.map(row => row.textContent?.replace(/지식과.*|학습.*|생활.*|금융.*|Plan.*/g, "").trim()), SPACES.map(row => row.name));
  assert.deepEqual(choices.map(row => row.getAttribute("href")), ["/workflow/week", "/notes?module=GRAPH&workspace=one", "/study", "/life/categories", "/money/accounts"]);
  await act(() => choices[1].click()); assert.equal(app.destinations.at(-1), "/notes?module=GRAPH&workspace=one");
  await app.render("/blog"); await click("KNOWLEDGE & LOG 시스템 전환");
  assert.equal(document.querySelector('[role="menuitemradio"][href^="/notes"]')?.getAttribute("href"), "/notes?module=GRAPH&workspace=one");
  await app.cleanup();
});
test("WORK renders exact grouped canonical navigation, every menu item navigates, archived route reveals on return", async () => {
  const app = await setup("/workflow/week");
  await app.render("/workflow/week", true);
  assert.deepEqual(Array.from(document.querySelectorAll('.app-sidebar nav h2')).map(row => row.textContent), WORK_GROUPS.map(row => row.section));
  assert.equal(document.querySelectorAll('.app-sidebar [aria-label="CHECKLIST SYS"]').length, 0);
  for (const group of WORK_GROUPS) for (const item of group.items) {
    await act(() => document.querySelector<HTMLButtonElement>(`.app-sidebar button[aria-label="${item.label}"]`)!.click());
    assert.equal(app.destinations.at(-1), item.href);
  }
  await app.render("/workflow/today", true);
  assert.equal(button("Workpad").getAttribute("aria-current"), "page");
  assert.equal(document.querySelector('.app-nav-group-toggle')?.getAttribute("aria-expanded"), "true");
  await app.cleanup();
});
test("POS home exposes exactly five Spaces and closes with native dialog cancel without changing the page", async () => {
  const app = await setup("/checklist/manage");
  await click("POS 전체 홈");
  const dialog = document.querySelector<HTMLDialogElement>(".pos-space-home")!;
  assert.ok(dialog.open);
  assert.deepEqual(Array.from(dialog.querySelectorAll("nav a strong")).map(row => row.textContent), SPACES.map(row => row.name));
  await act(() => dialog.dispatchEvent(new window.Event("cancel", { bubbles: true, cancelable: true })));
  assert.equal(document.querySelector(".pos-space-home"), null);
  assert.deepEqual(app.destinations, []);
  assert.equal(document.querySelector("textarea")!.value, "unsaved draft");
  await app.cleanup();
});
test("selecting the current system/Space closes its menu without another save or route transition", async () => {
  const app = await setup("/notes?workspace=one", true);
  await click("KNOWLEDGE & LOG 시스템 전환");
  await act(() => document.querySelector<HTMLAnchorElement>('[role="menuitemradio"][aria-checked="true"]')!.click());
  await click("Space 전환");
  await act(() => document.querySelector<HTMLAnchorElement>('[role="menuitemradio"][aria-checked="true"]')!.click());
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.deepEqual(app.destinations, []); assert.equal(app.guardCalls(), 0);
  assert.equal(document.querySelector("textarea")!.value, "unsaved draft");
  await app.cleanup();
});
test("reload in Strict Mode preserves other Spaces' saved pages across repeated route observation", async () => {
  const app = await setup("/money", false, true);
  await app.render("/money/accounts");
  await click("Space 전환");
  const choices = Array.from(document.querySelectorAll<HTMLAnchorElement>('[role="menuitemradio"]'));
  assert.equal(choices[1].getAttribute("href"), "/notes");
  assert.equal(choices[3].getAttribute("href"), "/life/categories");
  const stored = JSON.parse(window.sessionStorage.getItem(SPACE_STORAGE_KEY)!);
  assert.equal(stored.systems["CHECKLIST SYS"], "/checklist/progress?area=two");
  assert.equal(stored.spaces.finance, "/money/accounts");
  await app.cleanup();
});

const textButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(row => row.textContent === label)!;
const tap = (label: string) => act(() => textButton(label).click());
const select = (space: string) => Array.from(document.querySelectorAll<HTMLSelectElement>(".pos-space-defaults select"))
  .find(field => field.getAttribute("aria-label") === `${space} 기본 시스템`)!;
const change = (space: string, value: string) => act(() => {
  const field = select(space);
  field.value = value;
  field.dispatchEvent(new window.Event("change", { bubbles: true }));
});
const openSettings = async () => { await click("POS 전체 홈"); await tap("기본 Space 설정"); };

test("Space defaults are loaded once in StrictMode, gate initial entry and apply on every Space surface", async ctx => {
  const calls: string[] = [];
  let finish: (body: unknown) => void = () => {};
  ctx.mock.method(apiClient, "scoped", (_owner: string, path: string) => {
    calls.push(path);
    return new Promise(resolve => { finish = resolve; });
  });
  const app = await setup("/workflow/week", false, true, true);
  assert.deepEqual(calls, ["/api/pos/preferences/space-defaults"]);
  assert.equal(document.querySelector('.pos-space-rail [aria-label="LIFE"]')?.getAttribute("aria-disabled"), "true");
  await click("Space 전환");
  assert.equal(document.querySelector('[role="menuitemradio"]')?.getAttribute("href"), null);
  assert.deepEqual(app.destinations, []);
  await act(() => finish({ revision: 4, defaults: { ...INITIAL_SPACE_DEFAULTS, work: "Calendar", life: "CHECKLIST SYS" } }));
  await act(() => document.querySelector<HTMLAnchorElement>('[role="menuitemradio"][aria-checked="true"]')!.click());
  assert.equal(app.destinations.at(-1), "/calendar");
  await act(() => document.querySelector<HTMLAnchorElement>('.pos-space-rail [aria-label="LIFE"]')!.click());
  await click("POS 전체 홈");
  assert.equal(document.querySelector<HTMLAnchorElement>('.pos-space-home nav a[href^="/checklist"]')?.textContent, "LIFE생활 · 건강 · 수행 체크리스트");
  await act(() => document.querySelector<HTMLAnchorElement>('.pos-space-home nav a[href^="/checklist"]')!.click());
  await click("Space 전환");
  await act(() => document.querySelector<HTMLAnchorElement>('[role="menuitemradio"][href^="/checklist"]')!.click());
  await click("새 탭으로 열기");
  await tap("LIFE 새 탭으로 열기");
  assert.deepEqual(app.destinations, ["/calendar", ...Array(4).fill("/checklist/progress?area=two")]);
  await app.cleanup();
});

test("settings save is confirmed, retry preserves the draft and reset only changes the draft until Save", async ctx => {
  let persisted = { revision: 2, defaults: { ...INITIAL_SPACE_DEFAULTS, knowledge: "BLOG" } as SpaceDefaults };
  let fail = true;
  let writes = 0;
  ctx.mock.method(apiClient, "scoped", async (_owner: string, _path: string, method: string, body: typeof persisted) => {
    if (method !== "PUT") return persisted;
    writes++;
    if (fail) throw new ApiError(503, "Unavailable");
    persisted = { defaults: body.defaults, revision: body.revision + 1 };
    return persisted;
  });
  const app = await setup("/money/loans", false, false, true);
  await openSettings();
  assert.equal(document.querySelectorAll(".pos-space-defaults select").length, 5);
  assert.deepEqual(Array.from(select("WORK").options, row => [row.value, row.text]), [["WORK FLOW", "WORK FLOW"], ["WORK OS", "WORK OS"], ["Calendar", "Calendar"]]);
  assert.equal(select("FINANCE").disabled, true);
  assert.equal(select("FINANCE").value, "MONEY SYS");
  assert.equal(select("KNOWLEDGE & LOG").value, "BLOG");
  await change("LIFE", "CHECKLIST SYS");
  await tap("설정 저장");
  assert.match(document.querySelector('.pos-space-defaults [role="alert"]')!.textContent!, /저장하지 못했습니다/);
  assert.equal(persisted.defaults.life, "LIFE CODE");
  assert.equal(select("LIFE").value, "CHECKLIST SYS");
  fail = false;
  await tap("저장 다시 시도");
  assert.equal(persisted.defaults.life, "CHECKLIST SYS");
  assert.match(document.querySelector('.pos-space-defaults [role="status"]')!.textContent!, /저장했습니다/);
  await tap("기본값으로 초기화");
  assert.equal(select("LIFE").value, "LIFE CODE");
  assert.equal(writes, 2);
  assert.equal(persisted.defaults.knowledge, "BLOG");
  await tap("← Space 홈으로 돌아가기");
  assert.equal(document.activeElement, textButton("기본 Space 설정"));
  await tap("기본 Space 설정");
  assert.equal(select("LIFE").value, "CHECKLIST SYS");
  await tap("기본값으로 초기화");
  await tap("설정 저장");
  assert.deepEqual(persisted.defaults, INITIAL_SPACE_DEFAULTS);
  assert.equal(writes, 3);
  assert.deepEqual(app.destinations, []);
  await app.cleanup();
  const reloaded = await setup("/money/loans", false, false, true);
  await openSettings();
  assert.equal(select("KNOWLEDGE & LOG").value, "NOTE SYS");
  assert.equal(window.location.pathname, "/money/loans");
  await reloaded.cleanup();
});

test("a failed read can retry and a concurrent save rebases only edited Spaces after explicit reload", async ctx => {
  let getCount = 0;
  let firstPut = true;
  ctx.mock.method(apiClient, "scoped", async (_owner: string, _path: string, method: string, body: { revision: number; defaults: SpaceDefaults }) => {
    if (method !== "PUT") {
      if (++getCount === 1) throw new Error("offline");
      return getCount === 2 ? { revision: 1, defaults: INITIAL_SPACE_DEFAULTS }
        : { revision: 2, defaults: { ...INITIAL_SPACE_DEFAULTS, knowledge: "BLOG" } };
    }
    if (firstPut) { firstPut = false; throw new ApiError(409, "Stale"); }
    assert.equal(body.revision, 2);
    assert.equal(body.defaults.knowledge, "BLOG");
    assert.equal(body.defaults.work, "WORK OS");
    return { ...body, revision: 3 };
  });
  const app = await setup("/calendar?view=week", false, false, true);
  await openSettings();
  assert.match(document.querySelector('.pos-space-defaults [role="alert"]')!.textContent!, /불러오지 못했습니다/);
  await tap("다시 불러오기");
  await change("WORK", "WORK OS");
  await tap("설정 저장");
  assert.match(document.querySelector('.pos-space-defaults [role="alert"]')!.textContent!, /다른 세션/);
  await tap("최신 설정 불러오기");
  assert.equal(select("WORK").value, "WORK OS");
  assert.equal(select("KNOWLEDGE & LOG").value, "BLOG");
  await tap("설정 저장");
  assert.match(document.querySelector('.pos-space-defaults [role="status"]')!.textContent!, /저장했습니다/);
  assert.deepEqual(app.destinations, []);
  await app.cleanup();
});
for (const route of ["/notes?workspace=one", "/calendar?date=2026-11-15&view=week", "/diet/note?workspace=health", "/money/accounts"]) test(`${route}: Space navigation waits for leave guard, retains draft, legacy pins and duplicates, records only accepted routes`, async () => {
  const app = await setup(route, true);
  const before = window.sessionStorage.getItem(TAB_STORAGE_KEY), recent = window.sessionStorage.getItem(SPACE_STORAGE_KEY);
  await click("Space 전환");
  const choice = document.querySelector<HTMLAnchorElement>('[role="menuitemradio"][href="/study"]')!;
  await act(() => choice.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
  assert.deepEqual(app.destinations, []);
  assert.equal(window.sessionStorage.getItem(TAB_STORAGE_KEY), before);
  assert.equal(window.sessionStorage.getItem(SPACE_STORAGE_KEY), recent);
  assert.equal(document.querySelector("textarea")!.value, "unsaved draft");
  await app.proceed(); assert.deepEqual(app.destinations, ["/study"]);
  assert.equal(window.sessionStorage.getItem(SPACE_STORAGE_KEY), recent, "recent route changes only after route observation");
  await app.render("/study");
  assert.equal(JSON.parse(window.sessionStorage.getItem(SPACE_STORAGE_KEY)!).spaces.growth, "/study");
  const tabs = JSON.parse(window.sessionStorage.getItem(TAB_STORAGE_KEY)!);
  assert.equal(tabs.tabs[0].pinned, true); assert.equal(tabs.tabs[0].route, tabs.tabs[1].route); assert.notEqual(tabs.tabs[0].tabId, tabs.tabs[1].tabId);
  await click("저장된 전역 탭"); assert.equal(document.querySelector<HTMLElement>(".orbit-tab-bar")!.hidden, false);
  await app.cleanup();
});
