import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { ApiError } from "@/lib/api/client";
import { filterLoans, loanMetrics, parseLoanRate, type LoanFilters } from "@/lib/money/loans";
import { moneyApi } from "@/lib/money/model";
import { MoneyDataProvider, useMoneyCache } from "./MoneyDataProvider";
import type { Loan } from "./MoneyWebData";
import type { Selection } from "./MoneyWebViews";

const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: { load: (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown }) => void;
};
registerHooks({ load: (url, context, next) => url.endsWith(".css")
  ? { format: "module", source: "export {};", shortCircuit: true } : next(url, context) });

function row(id: string, changes: Partial<Loan> = {}): Loan {
  return {
    id, name: "대출 " + id, lender: "검증 기관", type: "PERSONAL", originalPrincipal: null,
    remainingPrincipal: 100, interestRate: null, monthlyPayment: null, paymentDay: null,
    nextDueDate: null, paymentAccountId: null, startDate: null, maturityDate: null, status: "ACTIVE",
    memo: null, version: 1, updatedAt: "2026-01-01T00:00:00Z", unresolvedAllocationCount: 0,
    latestConfirmedRepayment: null, ...changes,
  };
}
const filters: LoanFilters = { status: "all", search: "", lender: "", allocation: "all", sort: "high" };

test("combined filters and ordering use canonical utilization, including zero and unknown", () => {
  const loans = [
    row("A", { remainingPrincipal: 10, unresolvedAllocationCount: 1 }),
    row("B", { remainingPrincipal: 100, facilityLimit: 1000, usedPrincipal: 0 }),
    row("C", { remainingPrincipal: 100, facilityLimit: 750, usedPrincipal: null, unresolvedAllocationCount: undefined }),
    row("D", { remainingPrincipal: 2, status: "PAUSED", lender: "다른 기관" }),
  ];
  assert.deepEqual(filterLoans(loans, filters).map(loan => loan.id), ["A", "D", "B", "C"]);
  assert.deepEqual(filterLoans(loans, { ...filters, sort: "low" }).map(loan => loan.id), ["B", "D", "A", "C"]);
  assert.deepEqual(filterLoans(loans, { ...filters, status: "ACTIVE", search: " personal ", lender: "검증 기관", allocation: "pending" }).map(loan => loan.id), ["A"]);
  assert.deepEqual(filterLoans(loans, { ...filters, allocation: "clear" }).map(loan => loan.id), ["D", "B"]);
  assert.deepEqual(loanMetrics(loans), { outstanding: null, remaining: 2, active: 3, unresolved: null });
  assert.deepEqual(loanMetrics([loans[0], loans[1]]), { outstanding: 10, remaining: 1, active: 2, unresolved: 1 });
});

test("rate parser distinguishes pending invalid values, null, zero and four decimal places", () => {
  for (const bad of ["-1", "100.0001", "0.00001", "1e1", ".", "NaN"]) assert.equal(parseLoanRate(bad), undefined);
  assert.equal(parseLoanRate(""), null);
  assert.equal(parseLoanRate("0"), 0);
  assert.equal(parseLoanRate(".0234"), 0.0234);
  assert.equal(parseLoanRate("100.0000"), 100);
});

async function mount() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/money/loans" });
  Object.assign(globalThis, {
    React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const get = moneyApi.get, put = moneyApi.put;
  return { dom, root, cleanup: async () => {
    await act(() => root.unmount());
    moneyApi.get = get;
    moneyApi.put = put;
    dom.window.close();
  } };
}

function label<T extends HTMLElement>(value: string) {
  const found = [...document.querySelectorAll<T>("[aria-label]")].find(node => node.getAttribute("aria-label") === value);
  assert.ok(found, value);
  return found;
}

function button(text: string) {
  const found = [...document.querySelectorAll("button")].find(node => node.textContent === text);
  assert.ok(found, text);
  return found;
}

test("table selection, checkbox selection, columns and add action are independent", async () => {
  const { LoansView } = await import("./MoneyLoans");
  const { dom, root, cleanup } = await mount();
  moneyApi.get = async <T,>() => [row("A"), row("B", { originalPrincipal: 0, interestRate: 0 })] as T;
  const selected: Selection[] = [];
  function Fixture() {
    const [selection, select] = useState<Selection | null>(null);
    const clearSelection = () => select(null);
    return <LoansView accounts={[]} categories={[]} period={{ preset: "month", from: "2026-01-01", to: "2026-01-31" }}
      selection={selection} select={value => { selected.push(value); select(value); }} clearSelection={clearSelection}
      detail={null} onboarding={null} />;
  }
  try {
    await act(async () => root.render(<MoneyDataProvider><Fixture /></MoneyDataProvider>));
    assert.equal(document.querySelectorAll("thead th").length, 9);
    assert.match(document.querySelector("tbody")!.textContent!, /미등록.*0%.*0원/);
    const checkbox = label<HTMLInputElement>("대출 A 선택");
    await act(() => checkbox.click());
    assert.equal(selected.length, 0);
    assert.equal(label<HTMLInputElement>("표시된 대출 모두 선택").indeterminate, true);
    await act(() => label("대출 A 상세 열기").click());
    assert.equal(selected.length, 1);
    assert.equal(checkbox.checked, true);
    assert.equal(checkbox.closest("tr")!.dataset.selected, "true");
    const rate = [...document.querySelectorAll("details label")].find(node => node.textContent === "금리")!;
    await act(() => rate.querySelector("input")!.click());
    assert.equal(document.querySelectorAll("thead th").length, 8);
    await act(() => button("완료").click());
    assert.match(document.querySelector("tbody")!.textContent!, /조건에 맞는 대출이 없습니다/);
    await act(() => button("+ 대출 추가").click());
    assert.deepEqual(selected.at(-1), { kind: "loan", value: null });
    assert.equal(dom.window.document.querySelector("[aria-label='대출 표 스크롤']")?.getAttribute("tabindex"), "0");
  } finally { await cleanup(); }
});

test("loan table preserves authoritative status on failure and retries from the latest version", async () => {
  const { LoansView } = await import("./MoneyLoans");
  const { dom, root, cleanup } = await mount();
  let server = row("A");
  const saves: unknown[] = [];
  moneyApi.get = async <T,>() => [server] as T;
  moneyApi.put = async <T,>(path: string, body: unknown) => {
    saves.push({ path, body });
    if (saves.length === 1) {
      server = { ...server, version: 2 };
      throw new ApiError(409, "stale");
    }
    server = { ...server, status: "PAUSED", version: 3 };
    return server as T;
  };
  try {
    await act(async () => root.render(<MoneyDataProvider><LoansView accounts={[]} categories={[]}
      period={{ preset: "month", from: "2026-01-01", to: "2026-01-31" }} selection={null} select={() => {}} detail={null} onboarding={null} /></MoneyDataProvider>));
    await act(() => button("전체").click());
    const select = label<HTMLSelectElement>("대출 A 대출 상태");
    const pause = () => act(async () => { select.value = "PAUSED"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await pause();
    assert.equal(select.value, "ACTIVE");
    assert.match(document.querySelector("[role='alert']")!.textContent!, /최신 값/);
    await pause();
    assert.equal(select.value, "PAUSED");
    assert.deepEqual(saves, [1, 2].map(expectedVersion => ({ path: "/loans/A/status", body: { status: "PAUSED", expectedVersion } })));
  } finally { await cleanup(); }
});

test("table displays loading, request errors and retry with an empty response", async () => {
  const { LoansView } = await import("./MoneyLoans");
  const { root, cleanup } = await mount();
  let rejectRead!: (error: Error) => void;
  moneyApi.get = () => new Promise((_resolve, reject) => { rejectRead = reject; });
  function Fixture() {
    const cache = useMoneyCache();
    return <><button onClick={() => cache.invalidate()}>새로고침</button><LoansView accounts={[]} categories={[]}
      period={{ preset: "month", from: "2026-01-01", to: "2026-01-31" }} selection={null} select={() => {}} detail={null} onboarding={null} /></>;
  }
  try {
    await act(async () => root.render(<MoneyDataProvider><Fixture /></MoneyDataProvider>));
    assert.match(document.body.textContent!, /불러오는 중/);
    await act(async () => rejectRead(new Error("조회 오류")));
    assert.match(document.querySelector("[role='alert']")!.textContent!, /조회 오류/);
    moneyApi.get = async <T,>() => [] as T;
    await act(async () => button("새로고침").click());
    assert.match(document.querySelector("tbody")!.textContent!, /등록된 대출이 없습니다/);
  } finally { await cleanup(); }
});

test("detail tabs support keyboard navigation and rate changes wait for explicit save", async () => {
  const { LoanReadDetail } = await import("./MoneyReadDetails");
  const { dom, root, cleanup } = await mount();
  let server = row("A", { interestRate: 4 });
  const writes: unknown[] = [], reads: string[] = [];
  moneyApi.get = async <T,>(path: string) => {
    reads.push(path);
    return (path === "/loans" ? [server] : []) as T;
  };
  moneyApi.put = async <T,>(path: string, body: unknown) => {
    writes.push({ path, body });
    server = { ...server, interestRate: null, version: 2 };
    return server as T;
  };
  try {
    await act(async () => root.render(<MoneyDataProvider><LoanReadDetail loan={server} selection={{ kind: "loan", value: server }}
      accounts={[]} categories={[]} onClose={() => {}} onSaved={() => {}} select={() => {}} /></MoneyDataProvider>));
    const rate = document.querySelector<HTMLInputElement>("form input")!;
    assert.equal(rate.value, "4");
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(rate, "");
      rate.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(writes.length, 0);
    assert.equal(button("금리 수정 적용").disabled, false);
    await act(async () => button("금리 수정 적용").click());
    assert.deepEqual(writes, [{ path: "/loans/A/interest-rate", body: { interestRate: null, expectedVersion: 1 } }]);
    await act(async () => button("기본 정보").dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(button("상환 내역").getAttribute("aria-selected"), "true");
    assert.equal(document.activeElement, button("상환 내역"));
    assert.match(document.body.textContent!, /입금·상환 기록이 없습니다/);
    await act(async () => button("근거 · 연결").click());
    assert.match(document.body.textContent!, /연결된 입금·상환 거래 근거가 없습니다/);
    assert.ok(reads.includes("/loans/A/repayments"));
  } finally { await cleanup(); }
});
