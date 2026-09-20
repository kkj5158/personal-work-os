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

test("Planning domain changes clear category without adopting Actual source identity", async t => {
  const paths:string[]=[];
  t.mock.method(apiClient,"put",async(path:string)=>{paths.push(path);return {id:"plan"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("plan","2026-09-09",600,635),id:"plan",title:"Plan",categoryId:"work-root"}));
  await act(()=>h.editor.change({domainType:"LIFE",sourceType:"LIFE_TIME_ENTRY"}));
  assert.equal(h.editor.value?.categoryId,null);assert.equal(h.editor.value?.sourceType,undefined);
  await act(async()=>{assert.equal(await h.editor.save(),true);});
  assert.equal(h.editor.value?.sourceType,undefined);assert.equal(h.editor.value?.domainType,"LIFE");
  await act(()=>h.editor.change({categoryId:"life-root"}));
  await act(()=>h.editor.change({domainType:"WORK"}));
  assert.equal(h.editor.value?.categoryId,null);assert.equal(h.editor.value?.sourceType,undefined);
  await act(async()=>{assert.equal(await h.editor.save(),true);});
  assert.deepEqual(paths,["/api/planned-blocks/plan","/api/planned-blocks/plan"]);
});

test("Actual creates when domain minimum is valid and drains edits without duplicate POST",async t=>{
  let release!:(value:{id:string})=>void;const gate=new Promise<{id:string}>(r=>{release=r;});
  const posts:{path:string;data:unknown}[]=[],puts:{path:string;data:unknown}[]=[];
  t.mock.method(apiClient,"post",async(path:string,data:unknown)=>{posts.push({path,data});return gate;});
  t.mock.method(apiClient,"put",async(path:string,data:unknown)=>{puts.push({path,data});return {id:"actual-1"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign(newEditor("actual","2026-09-09",605,640)));
  await act(()=>h.editor.change({title:"Work"}));assert.equal(posts.length,0);
  await act(()=>{h.editor.change({categoryId:"root"});h.editor.change({title:"revised",memo:"latest"});});
  let flush!:Promise<boolean>;await act(()=>{flush=h.editor.save();});assert.equal(posts.length,1);
  await act(async()=>{release({id:"actual-1"});assert.equal(await flush,true);});
  assert.equal(posts[0].path,"/api/calendar/actual/WORK_TIME_ENTRY");assert.equal(puts.length,1);
  assert.equal(puts[0].path,"/api/calendar/actual/WORK_TIME_ENTRY/actual-1");assert.equal((puts[0].data as {memo:string}).memo,"latest");
  assert.equal(h.editor.value?.dirty,false);assert.equal(h.editor.status,"저장됨");
});
test("healthy LIFE autosave flushes pending create without category or navigation warning",async t=>{
  let release!:(value:{id:string})=>void;const gate=new Promise<{id:string}>(r=>{release=r;});const posts:string[]=[];
  t.mock.method(apiClient,"post",async(path:string)=>{posts.push(path);return gate;});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),domainType:"LIFE",sourceType:"LIFE_TIME_ENTRY"}));
  await act(()=>h.editor.change({title:"Life"}));let left=false,leave!:Promise<void>;
  await act(()=>{leave=h.editor.leave(()=>{left=true;});});assert.equal(left,false);assert.equal(h.editor.guard,false);
  await act(async()=>{release({id:"life"});await leave;});assert.equal(left,true);assert.equal(h.editor.guard,false);
  assert.deepEqual(posts,["/api/calendar/actual/LIFE_TIME_ENTRY"]);
});
test("Actual updates debounce; half-pair stays local, guards leave and flushes when complete",async t=>{
  const puts:unknown[]=[];t.mock.method(apiClient,"put",async(_p:string,data:unknown)=>{puts.push(data);return {id:"actual"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),id:"actual",title:"A",categoryId:"root"}));
  await act(()=>{h.editor.change({memo:"one"});h.editor.change({memo:"two"});});assert.equal(puts.length,0);
  await act(async()=>{await new Promise(r=>setTimeout(r,600));});assert.equal(puts.length,1);assert.equal((puts[0] as {memo:string}).memo,"two");
  await act(()=>h.editor.change({end:""}));await act(async()=>{await new Promise(r=>setTimeout(r,600));assert.equal(await h.editor.save(),false);});
  assert.equal(puts.length,1);assert.equal(h.editor.status,"입력 중");assert.equal(h.editor.error,null);
  let left=false;await act(async()=>{await h.editor.leave(()=>{left=true;});});assert.equal(left,false);assert.equal(h.editor.guard,true);
  await act(()=>{h.editor.continueEditing();h.editor.change({end:"10:40"});});
  await act(async()=>{await h.editor.leave(()=>{left=true;});});assert.equal(left,true);assert.equal(puts.length,2);
});
test("failed Actual save retains input and overlap feedback; leave guards without retry spam",async t=>{
  let attempts=0,fail=true;t.mock.method(apiClient,"put",async()=>{attempts++;if(fail)throw new Error("14:30–15:00 기존 WORK 기록과 겹칩니다.");return {id:"actual"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),id:"actual",title:"A",categoryId:"root"}));
  await act(()=>h.editor.change({title:"retained"}));await act(async()=>{assert.equal(await h.editor.save(),false);});
  assert.equal(h.editor.status,"저장 실패");assert.match(h.editor.error!,/겹칩니다/);
  await act(async()=>{await h.editor.leave(()=>assert.fail("must not navigate"));});assert.equal(h.editor.guard,true);assert.equal(attempts,1);assert.equal(h.editor.value?.title,"retained");
  fail=false;await act(()=>h.editor.continueEditing());await act(async()=>{assert.equal(await h.editor.save(true),true);});
  assert.equal(attempts,2);assert.equal(h.editor.value?.dirty,false);assert.equal(h.editor.error,null);
});
test("invalid edit during first Actual request retains the new ID without invalid PUT",async t=>{
  let release!:(value:{id:string})=>void;const gate=new Promise<{id:string}>(r=>{release=r;});const puts:unknown[]=[];
  t.mock.method(apiClient,"post",async()=>gate);t.mock.method(apiClient,"put",async(_p:string,data:unknown)=>{puts.push(data);return {id:"life"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),domainType:"LIFE"}));
  await act(()=>{h.editor.change({title:"LIFE"});h.editor.change({end:""});});
  await act(async()=>{release({id:"life"});await h.editor.save();});
  assert.equal(h.editor.value?.id,"life");assert.equal(h.editor.value?.end,"");assert.equal(h.editor.value?.dirty,true);assert.equal(puts.length,0);
  await act(async()=>{await h.editor.leave(()=>assert.fail("must not navigate"));});assert.equal(h.editor.guard,true);
});
test("empty draft leaves without warning and domain change clears category before LIFE create",async t=>{
  const posts:unknown[]=[];t.mock.method(apiClient,"post",async(_p:string,data:unknown)=>{posts.push(data);return {id:"life"};});
  const h=await mountEditor();t.after(h.close);await act(()=>h.editor.assign(newEditor("actual","2026-09-09",600,635)));
  let left=false;await act(async()=>{await h.editor.leave(()=>{left=true;});});assert.equal(left,true);assert.equal(h.editor.guard,false);assert.equal(posts.length,0);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),categoryId:"old-work"}));
  await act(()=>h.editor.change({domainType:"LIFE"}));assert.equal(h.editor.value?.categoryId,null);assert.equal(h.editor.value?.sourceType,"LIFE_TIME_ENTRY");
  await act(async()=>{h.editor.change({title:"LIFE"});await h.editor.save();});assert.equal(posts.length,1);assert.equal((posts[0] as {categoryId:null}).categoryId,null);
  await act(()=>h.editor.change({domainType:"WORK",sourceType:"WORK_TIME_ENTRY"}));assert.equal(h.editor.value?.domainType,"LIFE");
});

test("timing-only unfinished new draft is guarded and scheduled edits retain exact duration when unscheduled",async t=>{
  const bodies:unknown[]=[];t.mock.method(apiClient,"put",async(_path:string,data:unknown)=>{bodies.push(data);return {id:"actual"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign(newEditor("actual","2026-09-09",600,635)));
  let left=false;await act(()=>h.editor.change({end:""}));await act(async()=>{await h.editor.leave(()=>{left=true;});});
  assert.equal(left,false);assert.equal(h.editor.guard,true);
  await act(()=>h.editor.discard());
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),id:"actual",title:"A",categoryId:"root"}));
  await act(()=>{h.editor.change({end:"11:05"});h.editor.change({unscheduled:true});});
  await act(async()=>{await h.editor.save();});
  assert.equal((bodies[0] as {durationMinutes:number}).durationMinutes,65);
  assert.equal((bodies[0] as {startTime:null}).startTime,null);
});

test("deleting an Actual with unfinished time keeps existing source identity and skips invalid save",async t=>{
  const paths:string[]=[];t.mock.method(apiClient,"put",async()=>assert.fail("invalid draft must not save"));
  t.mock.method(apiClient,"post",async(path:string)=>{paths.push(path);return {undoToken:"undo"};});
  const h=await mountEditor();t.after(h.close);
  await act(()=>h.editor.assign({...newEditor("actual","2026-09-09",600,635),id:"actual",title:"A",categoryId:"root"}));
  await act(()=>h.editor.change({end:""}));await act(async()=>{await h.editor.remove();});
  assert.deepEqual(paths,["/api/calendar/clipboard/delete"]);assert.equal(h.editor.value,null);
});
test("State autosaves default selection and future date edits with optional description",async t=>{
 const paths:string[]=[];t.mock.method(apiClient,"post",async(path:string)=>{paths.push(path);return {id:"state"};});t.mock.method(apiClient,"put",async(path:string)=>{paths.push(path);return {id:"state"};});
 const h=await mountEditor();t.after(h.close);
 await act(async()=>h.editor.select(newEditor("state","2099-01-01",600,635)));
 assert.equal(paths.length,1);assert.equal(h.editor.value?.id,"state");
 await act(()=>h.editor.change({date:"2099-01-02",stateGroup:"LOW"}));
 await act(async()=>{assert.equal(await h.editor.save(),true);});assert.equal(paths.length,2);assert.equal(h.editor.value?.dirty,false);
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
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CalendarPreferences } from "./appearance";
test("category tree child, parent and system toggles propagate and expose indeterminate state", async () => {
  const dom = new JSDOM("<div id='rail'></div>");
  Object.assign(globalThis, {React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(dom.window.document.getElementById("rail")!);
  let prefs:CalendarPreferences={...EMPTY_PREFERENCES,hidden:{},colors:{}};
  const router={push:()=>{}} as unknown as React.ContextType<typeof AppRouterContext>;
  const render = () => root.render(React.createElement(AppRouterContext.Provider,{value:router},React.createElement(CalendarRail,{date:new Date(2026,8,9),week:true,categories,prefs,
    onPreferences:next=>{prefs=next;render();},onDate:()=>{},stateVisible:true,onState:()=>{},onNavigate:()=>{}})));
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
    assert.equal(checkbox("LIFE CODE").checked,true);
  } finally { await act(()=>root.unmount());dom.window.close(); }
});
