import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { apiClient } from "../../lib/api/client";
import type { ReflectionEntryDto } from "../../lib/api/types";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};

test("seven aligned cells expose a top-layer accessible editor, independent score and five clearable moods", async t => {
  const { DailyReflection } = await import("./DailyReflection");
  const dom = new JSDOM('<div id="root"></div>', { url: "https://orbit.local/calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  // React's legacy input-event detection runs before this test installs DOM.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const rows = new Map<string, ReflectionEntryDto>();
  const writes: unknown[] = [];
  let offline = false;
  t.mock.method(apiClient, "scoped", async (_owner: string, path: string, method = "GET", body?: unknown) => {
    const date = path.split("/")[3];
    const row = rows.get(date) ?? { id: date, date, title: "A day", dayScore: 0, moodLevel: null, memo: "memo", content: "NOTE", version: 0, snapshot: null, status: "EDITING", workOsRoute: "/calendar" };
    if (method === "PUT") { if (offline) throw new Error("offline"); writes.push(body); const next = { ...row, ...body as object, version: row.version + 1 }; rows.set(date, next); return next; }
    rows.set(date, row); return row;
  });
  const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${String(i + 2).padStart(2,"0")}`);
  let flush: () => Promise<void> = async () => {};
  const register = (callback: () => Promise<void>) => { flush = callback; return () => {}; };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => { root.render(<DailyReflection dates={dates} view="week" register={register} />); });
    assert.equal(document.querySelectorAll(".daily-reflection__summary").length, 7);
    assert.equal(document.querySelector<HTMLElement>(".daily-reflections__cells")!.style.gridTemplateColumns, "repeat(7, minmax(0, 1fr))");
    assert.match(document.querySelector(".daily-reflection__metrics")!.textContent!, /0\/100/);
    await act(async () => { document.querySelector<HTMLButtonElement>(".daily-reflection__summary")!.click(); });
    assert.equal(document.querySelector<HTMLDialogElement>("dialog")!.open, true);
    assert.equal(document.querySelectorAll('[aria-label="오늘의 기분"] button[aria-pressed]').length, 5);
    assert.ok(document.querySelector(".daily-reflection__score-mood input"));
    assert.ok(document.querySelector(".daily-reflection__score-mood [aria-label='오늘의 기분']"));
    const leakedKeys: string[] = [];
    const globalShortcut = (event: KeyboardEvent) => { leakedKeys.push(event.key); };
    document.addEventListener("keydown", globalShortcut);
    await act(async () => {
      const emoji = document.querySelector<HTMLButtonElement>('[aria-label="매우 좋음"]')!;
      for (const key of ["Delete", "Backspace", "d"]) emoji.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, ctrlKey: key === "d", bubbles: true }));
    });
    document.removeEventListener("keydown", globalShortcut);
    assert.deepEqual(leakedKeys, [], "modal buttons must not invoke Calendar delete/duplicate/escape shortcuts");
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="매우 좋음"]')!.click(); await flush(); });
    assert.equal(document.querySelector('[aria-label="매우 좋음"]')!.getAttribute("aria-pressed"), "true");
    assert.equal(rows.get(dates[0])!.moodLevel, 5); assert.equal(rows.get(dates[0])!.dayScore, 0);
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="기분 선택 지우기"]')!.click(); await flush(); });
    assert.equal(rows.get(dates[0])!.moodLevel, null); assert.equal(rows.get(dates[0])!.dayScore, 0);
    assert.equal(writes.length, 2);
    offline = true;
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="매우 나쁨"]')!.click(); await assert.rejects(flush(), /offline/); });
    assert.match(document.querySelector('dialog [role="alert"]')!.textContent!, /offline/);
    const retry = document.querySelector<HTMLButtonElement>('dialog [role="alert"] button')!;
    assert.equal(retry.textContent, "다시 시도");
    offline = false;
    await act(async () => { retry.click(); await flush(); });
    assert.equal(rows.get(dates[0])!.moodLevel, 1);
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="매우 좋음"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector("dialog"), null);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test("inline input uses the canonical owner/date session and keeps NOTE content and completion intact",async t=>{
 const {DailyReflection}=await import("./DailyReflection");
 const dom=new JSDOM('<div id="root"></div>',{url:"https://orbit.local/calendar"});Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 let row:ReflectionEntryDto={id:"inline",date:"2026-11-16",title:"하루 제목",dayScore:0,moodLevel:1,memo:"별도 메모",content:"NOTE preserved",version:0,snapshot:null,status:"COMPLETED",workOsRoute:"/calendar"};
 t.mock.method(apiClient,"scoped",async(_owner:string,_path:string,method="GET",body?:unknown)=>{if(method==="PUT")row={...row,...body as object,version:row.version+1};return row;});
 let flush:()=>Promise<void>=async()=>{};const root=createRoot(document.getElementById("root")!);
 try{await act(async()=>{root.render(<DailyReflection inline dates={[row.date]} view="day" register={fn=>{flush=fn;return()=>{};}}/>);});assert.equal(document.querySelector("dialog"),null);assert.equal(document.querySelectorAll('[aria-label="하루 한줄 요약"]').length,1);assert.equal(document.querySelectorAll('textarea[aria-label="메모"]').length,1);assert.equal(document.querySelector<HTMLInputElement>('[aria-label="하루 점수"]')!.value,"0");await act(async()=>{document.querySelectorAll<HTMLButtonElement>('[aria-label="감정 상태"] button[aria-pressed]')[3]!.click();await flush();});assert.equal(row.moodLevel,4);assert.equal(row.dayScore,0);assert.equal(row.content,"NOTE preserved");assert.equal(row.memo,"별도 메모");assert.equal(row.status,"COMPLETED");}finally{await act(async()=>root.unmount());dom.window.close();}
});
