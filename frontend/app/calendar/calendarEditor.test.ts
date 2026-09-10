import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { apiClient } from "@/lib/api/client";
import { useCalendarEditor } from "./useCalendarEditor";
import { newEditor } from "./editorModel";
import { categoryAppearance, categoryVisible, EMPTY_PREFERENCES, type CalendarCategory } from "./appearance";

async function mountEditor() {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let editor!: ReturnType<typeof useCalendarEditor>;
  const refresh = async () => {};
  const notify = () => {};
  function Probe() { editor = useCalendarEditor(refresh, notify); return null; }
  const root = createRoot(dom.window.document.getElementById("root")!);
  await act(() => root.render(React.createElement(Probe)));
  return { get editor() { return editor; }, close: async () => { await act(() => root.unmount()); dom.window.close(); } };
}

test("first title creates once and drains rapid edits before concurrent blur/save resolves", async t => {
  let release!: (value: {id: string}) => void;
  const gate = new Promise<{id: string}>(resolve => { release = resolve; });
  const posts: unknown[] = [], puts: unknown[] = [];
  t.mock.method(apiClient, "post", async (_: string, data: unknown) => { posts.push(data); return gate; });
  t.mock.method(apiClient, "put", async (_: string, data: unknown) => { puts.push(data); return { id: "plan-1" }; });
  const harness = await mountEditor();
  t.after(harness.close);
  await act(() => harness.editor.assign(newEditor("plan", "2026-09-09", 540, 570)));
  let blur!: Promise<boolean>, save!: Promise<boolean>;
  await act(() => {
    harness.editor.change({title: "A"});
    harness.editor.change({title: "AB"});
    harness.editor.change({title: "ABC", memo: "retained"});
    blur = harness.editor.save(); save = harness.editor.save();
  });
  assert.equal(posts.length, 1);
  await act(async () => { release({ id: "plan-1" }); assert.equal(await blur, true); assert.equal(await save, true); });
  assert.equal(posts.length, 1);
  assert.equal(puts.length, 1);
  assert.equal((puts[0] as {title:string}).title, "ABC");
  assert.equal(harness.editor.value?.id, "plan-1");
  assert.equal(harness.editor.value?.memo, "retained");
  assert.equal(harness.editor.value?.dirty, false);
});

test("failed Planning save retains dirty input and prevents selection/navigation", async t => {
  t.mock.method(apiClient, "put", async () => { throw new Error("server unavailable"); });
  const harness = await mountEditor();
  t.after(harness.close);
  await act(() => harness.editor.assign({...newEditor("plan", "2026-09-09", 540, 570), id:"existing", title:"original"}));
  await act(() => harness.editor.change({title:"new input"}));
  await act(async () => { assert.equal(await harness.editor.save(), false); });
  let left = false;
  await act(async () => { await harness.editor.leave(() => { left = true; }); });
  assert.equal(left, false);
  assert.equal(harness.editor.value?.title, "new input");
  assert.equal(harness.editor.value?.dirty, true);
  assert.equal(harness.editor.error, "server unavailable");
});

test("Actual draft never persists from typing/blur; leave is guarded and explicit save commits", async t => {
  const paths: string[] = [];
  t.mock.method(apiClient, "post", async (path:string) => { paths.push(path); return {id:"actual-1"}; });
  const harness = await mountEditor();
  t.after(harness.close);
  await act(() => harness.editor.assign(newEditor("actual", "2026-09-09", 540, 570)));
  await act(() => harness.editor.change({title:"Actual", categoryId:"category"}));
  await act(async () => { await harness.editor.save(); });
  assert.deepEqual(paths, []);
  let left = false;
  await act(async () => { await harness.editor.leave(() => { left = true; }); });
  assert.equal(left, false); assert.equal(harness.editor.guard, true);
  await act(() => harness.editor.continueEditing());
  assert.equal(harness.editor.value?.title, "Actual");
  await act(async () => { assert.equal(await harness.editor.save(true), true); });
  assert.deepEqual(paths, ["/api/calendar/actual/WORK_TIME_ENTRY"]);
  assert.equal(harness.editor.value?.dirty, false);
  await act(async () => { await harness.editor.leave(() => { left = true; }); });
  assert.equal(left, true);
});

const categories: CalendarCategory[] = [
  {id:"parent",domain:"WORK",name:"Parent",parentId:null,isActive:true,sortOrder:0},
  {id:"child",domain:"WORK",name:"Child",parentId:"parent",isActive:true,sortOrder:1},
  {id:"inactive",domain:"WORK",name:"Inactive",parentId:"parent",isActive:false,sortOrder:2},
];
test("child appearance inherits live parent color without persisting derived child color", () => {
  const preferences = {...EMPTY_PREFERENCES, colors:{"WORK:parent":"#112233"}};
  assert.deepEqual(categoryAppearance("WORK","child",categories,preferences), {parent:"#112233",body:"#112233"});
  assert.deepEqual(Object.keys(preferences.colors), ["WORK:parent"]);
  assert.deepEqual(categoryAppearance("WORK","child",categories,{...preferences,colors:{...preferences.colors,"WORK:child":"#abcdef"}}), {parent:"#112233",body:"#abcdef"});
  assert.ok(categoryAppearance("WORK","parent",categories,EMPTY_PREFERENCES).parent);
});
test("visibility hides inactive categories and selected descendants while preserving other domains", () => {
  assert.equal(categoryVisible("WORK","inactive",categories,EMPTY_PREFERENCES), false);
  assert.equal(categoryVisible("WORK","inactive",categories,{...EMPTY_PREFERENCES,showInactive:true}), true);
  const prefs={...EMPTY_PREFERENCES,hidden:{"WORK:parent":true,"WORK:child":true,"WORK:inactive":true}};
  assert.equal(categoryVisible("WORK","child",categories,prefs), false);
  assert.equal(categoryVisible("LIFE","child",categories,prefs), true);
  const inactiveParent=categories.map(c => c.id === "parent" ? {...c,isActive:false} : c);
  assert.equal(categoryVisible("WORK","child",inactiveParent,EMPTY_PREFERENCES), false);
});

import { CalendarRail } from "./CalendarRail";
import type { CalendarPreferences } from "./appearance";
test("category tree child, parent and system toggles propagate and expose indeterminate state", async () => {
  const dom = new JSDOM("<div id='rail'></div>");
  Object.assign(globalThis, {React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(dom.window.document.getElementById("rail")!);
  let prefs:CalendarPreferences={...EMPTY_PREFERENCES,hidden:{},colors:{}};
  const render = () => root.render(React.createElement(CalendarRail,{date:new Date(2026,8,9),week:true,categories,prefs,
    onPreferences:next=>{prefs=next;render();},onDate:()=>{},stateVisible:true,onState:()=>{},onNavigate:()=>{}}));
  await act(render);
  const checkbox=(label:string) => [...dom.window.document.querySelectorAll("label")].find(node=>node.textContent===label)!.querySelector("input")!;
  try {
    await act(()=>checkbox("Child").click());
    assert.equal(prefs.hidden["WORK:child"],true);
    assert.equal(checkbox("Parent").indeterminate,true);
    assert.equal(checkbox("WORK OS").indeterminate,true);
    await act(()=>checkbox("Parent").click());
    assert.equal(prefs.hidden["WORK:child"],false);
    assert.equal(checkbox("Parent").checked,true);
    await act(()=>checkbox("Parent").click());
    assert.equal(prefs.hidden["WORK:child"],true);
    assert.equal(prefs.hidden["WORK:inactive"],true);
    await act(()=>checkbox("WORK OS").click());
    await act(()=>checkbox("WORK OS").click());
    assert.equal(prefs.hidden["WORK:uncategorized"],true);
    assert.equal(categoryVisible("WORK","child",categories,prefs),false);
    assert.equal(checkbox("LIFE OS").checked,true);
  } finally { await act(()=>root.unmount());dom.window.close(); }
});
