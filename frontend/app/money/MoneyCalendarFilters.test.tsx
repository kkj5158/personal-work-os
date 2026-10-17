import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { registerHooks } from "node:module";
import type { Category, Account } from "../../lib/money/model";
registerHooks({ load(url, context, next) { if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true }; return next(url, context); } });

test("calendar category filter immediately composes multi/direct/uncategorized with account selection and resets", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} disconnect() {} } });
  const { createRoot } = await import("react-dom/client");
  const { MoneyCalendarFilters } = await import("./MoneyCalendarFilters");
  const categories = [{ id: "salary", name: "급여", kind: "INCOME", parentId: null }, { id: "base", name: "기본급", kind: "INCOME", parentId: "salary" }, { id: "bonus", name: "상여", kind: "INCOME", parentId: "salary" }] as Category[];
  const accounts = [{ id: "bank", displayName: "급여 통장", kind: "BANK", currency: "KRW", archived: false }] as Account[];
  let selected: string[] | null = null, accountIds: string[] | null = null;
  function Fixture() { const [cats, setCats] = useState<string[] | null>(null), [accs, setAccs] = useState<string[] | null>(null); selected = cats; accountIds = accs; return <MoneyCalendarFilters categories={categories} accounts={accounts} categoryIds={cats} accountIds={accs} onCategories={setCats} onAccounts={setAccs} onReset={() => { setCats(null); setAccs(null); }} />; }
  const root = createRoot(document.getElementById("root")!);
  const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(node => node.textContent?.includes(text))!;
  const check = (text: string) => Array.from(document.querySelectorAll("label")).find(node => node.textContent === text)!.querySelector<HTMLInputElement>("input")!;
  try {
    await act(async () => root.render(<Fixture />));
    assert.equal(selected, null);
    await act(async () => button("분류 선택").click());
    await act(async () => check("급여").click()); assert.deepEqual(selected, ["salary"]);
    await act(async () => check("상여").click()); assert.deepEqual(selected, ["direct:salary", "base"]);
    await act(async () => check("소분류 없음").click()); assert.deepEqual(selected, ["base"]);
    await act(async () => check("미분류").click()); assert.deepEqual(selected, ["base", "uncategorized"]);
    assert.equal(Array.from(document.querySelectorAll("button")).some(node => node.textContent === "필터 적용"), false);
    await act(async () => button("계좌 선택").click());
    await act(async () => button("전체 해제").click()); assert.deepEqual(accountIds, []);
    await act(async () => button("급여 통장").click()); assert.deepEqual(accountIds, ["bank"]); assert.deepEqual(selected, ["base", "uncategorized"]);
    await act(async () => button("초기화").click()); assert.equal(selected, null); assert.equal(accountIds, null);
    await act(async () => button("분류 선택").click());
    const search = document.querySelector<HTMLInputElement>('[aria-label="달력 분류 검색"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(search, "상여"); search.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.ok(check("상여"));
    assert.equal(Array.from(document.querySelectorAll("label")).some(node => node.textContent === "기본급"), false);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
