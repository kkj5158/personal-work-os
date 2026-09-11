import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { TimeGrid } from "./TimeGrid";
import { actualWorkingRanges, calendarDateLabel } from "./calendarContext";
import { SystemSwitcher } from "../../components/SystemSwitcher";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

Object.assign(globalThis, { React });
const base = { blocks: [], interactionMode: "actual" as const, colorMode: "ACTIVITY" as const, phases: [], projects: [], onBlockClick: () => {}, onBlockTimeChange: () => {} };

test("attendance uses exact completed clocks and never falls back to a full day", () => {
  const records = [
    { date: "2026-09-11", status: "WORK" as const, clockInAt: "2026-09-11T09:15:00", clockOutAt: "2026-09-11T17:45:00", basicWorkMinutes: 450 },
    { date: "2026-09-12", status: "WORK" as const, clockInAt: "2026-09-12T09:00:00", clockOutAt: null, basicWorkMinutes: null },
  ];
  const workingRanges = actualWorkingRanges(records);
  assert.equal(workingRanges.length, 1);
  const html = renderToStaticMarkup(<TimeGrid {...base} days={records.map(r => new Date(`${r.date}T00:00:00`))}
    workingRanges={workingRanges} attendanceContext={records.map(r => ({date:r.date,plannedStatus:"WORK",plannedNetWorkMinutes:480}))} />);
  const document = new JSDOM(html).window.document;
  const shading = document.querySelector<HTMLElement>('[data-working-range]')!;
  assert.equal(shading.style.top, "555px");
  assert.equal(shading.style.height, "510px");
  assert.equal(document.querySelectorAll('[data-working-range]').length, 1);
  assert.equal(document.querySelector('[data-attendance-context]'), null);
});

test("now overlays only today's column and uses the same minute in Day and Week", () => {
  const now = new Date(2026, 8, 11, 10, 37);
  for (const days of [[now], Array.from({length:7},(_,i)=>new Date(2026,8,7+i))]) {
    const document = new JSDOM(renderToStaticMarkup(<TimeGrid {...base} days={days} now={now} />)).window.document;
    const line = document.querySelector<HTMLElement>('[data-current-time]')!;
    assert.equal(line.dataset.currentTime, "2026-09-11");
    assert.equal(line.style.top, "637px");
    assert.equal(document.querySelectorAll('[data-current-time]').length, 1);
    assert.equal(document.querySelector('[data-current-time-label]')?.textContent, "10:37");
  }
  const past = renderToStaticMarkup(<TimeGrid {...base} days={[new Date(2026,8,1)]} now={now} />);
  assert.ok(!past.includes('data-current-time'));
});

test("toolbar dates use Korean weekday and unambiguous year boundaries", () => {
  assert.equal(calendarDateLabel([new Date(2026,8,11)]), "2026년 9월 11일 금요일");
  assert.equal(calendarDateLabel([new Date(2026,8,7),new Date(2026,8,13)]), "2026년 9월 7일 - 9월 13일");
  assert.equal(calendarDateLabel([new Date(2026,11,28),new Date(2027,0,3)]), "2026년 12월 28일 - 2027년 1월 3일");
});

test("every shell shows the same ordered systems with current state and direct navigation", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(dom.window.document.getElementById('root')!);
  for (const system of ["WORK OS","NOTE SYS","Calendar"] as const) {
    const destinations:string[]=[];
    const router={push:(href:string)=>{destinations.push(`router:${href}`);}} as unknown as React.ContextType<typeof AppRouterContext>;
    await act(()=>root.render(<AppRouterContext.Provider value={router}><SystemSwitcher system={system} navigate={href=>{destinations.push(href);}} /></AppRouterContext.Provider>));
    await act(()=>dom.window.document.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
    const rows=Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.app-system-menu button'));
    assert.deepEqual(rows.map(row=>row.textContent),["WORK OS","NOTE SYS","Calendar"]);
    assert.equal(rows.find(row=>row.hasAttribute('aria-current'))?.textContent,system);
    assert.ok(rows.every(row=>row.querySelector('svg')));
    const target=system === "Calendar" ? 0 : 2;
    await act(()=>rows[target].click());
    assert.deepEqual(destinations,[target === 0 ? "/worklog" : "/calendar"]);
  }
  await act(()=>root.unmount()); dom.window.close();
});
