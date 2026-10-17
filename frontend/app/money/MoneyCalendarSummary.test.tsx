import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { MoneyCalendarSummary, type MoneyCalendarSummaryProps } from "./MoneyCalendarSummary";

const props: MoneyCalendarSummaryProps = { month: "2026-10", filterContext: "분류 1개 · 계좌 1개", income: true, total: 150000, categories: [{ id: "salary", name: "급여", color: "#218b79", version: 1, archived: false, kind: "INCOME" }, { id: "bonus", parentId: "salary", name: "성과급", color: "", version: 1, archived: false, kind: "INCOME" }], composition: [{ categoryId: "salary", counterpartyText: "회사 A", amount: 100000, count: 1 }, { categoryId: "bonus", counterpartyText: "회사 B", amount: 50000, count: 2 }] };

test("one accessible source donut and complete category ranking react to focus, selection and filters", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<MoneyCalendarSummary {...props} />));
    assert.equal(document.querySelectorAll("svg").length, 1);
    assert.equal(document.querySelectorAll("tbody tr").length, 1, "sources do not duplicate the category ranking");
    assert.match(document.querySelector("tbody")!.textContent!, /급여[\s\S]*150,000[\s\S]*100.0%[\s\S]*3건/);
    assert.match(document.querySelector(".mc-breakdown-center")!.textContent!, /2026년 10월[\s\S]*150,000[\s\S]*분류 1개 · 계좌 1개/);
    const segments = document.querySelectorAll<SVGCircleElement>('svg [role="button"]');
    assert.equal(segments.length, 2);
    assert.match(segments[0].getAttribute("aria-label")!, /회사 A[\s\S]*100,000[\s\S]*66.7%[\s\S]*1건/);
    await act(async () => segments[0].focus());
    assert.match(document.querySelector(".mc-breakdown-focus")!.textContent!, /회사 A[\s\S]*66.7%[\s\S]*1건/);
    await act(async () => segments[0].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(segments[0].getAttribute("aria-pressed"), "true");
    const details = document.querySelector("tbody details")!;
    assert.match(details.textContent!, /소분류 없음[\s\S]*회사 A[\s\S]*성과급[\s\S]*회사 B/);
    await act(async () => root.render(<MoneyCalendarSummary {...props} total={50000} composition={[props.composition[1]]} filterContext="성과급 · 회사 B" />));
    assert.match(document.querySelector(".mc-breakdown-center")!.textContent!, /50,000[\s\S]*성과급 · 회사 B/);
    assert.equal(document.querySelectorAll('svg [role="button"]').length, 1);
    assert.match(document.querySelector("tbody")!.textContent!, /50,000[\s\S]*100.0%[\s\S]*2건/);
    assert.doesNotMatch(document.querySelector("tbody")!.textContent!, /회사 A/);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test("signed net, empty and mixed-currency states preserve facts and suppress misleading charts", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<MoneyCalendarSummary {...props} income={false} total={-100} composition={[{ categoryId: null, counterpartyText: null, amount: -100, count: 1 }]} />));
    assert.equal(document.querySelectorAll('svg [role="button"]').length, 0);
    assert.match(document.querySelector("tbody")!.textContent!, /미분류[\s\S]*-100[\s\S]*—[\s\S]*1건/);
    assert.match(document.querySelector('[role="note"]')!.textContent!, /음수/);
    await act(async () => root.render(<MoneyCalendarSummary {...props} total={0} composition={[]} />));
    assert.equal(document.querySelectorAll('svg [role="button"]').length, 0);
    assert.match(document.querySelector("section")!.textContent!, /표시할 구성 내역이 없습니다/);
    assert.doesNotMatch(document.querySelector("section")!.textContent!, /NaN|Infinity/);
    await act(async () => root.render(<MoneyCalendarSummary {...props} total={null} analyticsUnavailable />));
    assert.equal(document.querySelectorAll("svg, table").length, 0);
    assert.match(document.querySelector("section")!.textContent!, /여러 통화/);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
