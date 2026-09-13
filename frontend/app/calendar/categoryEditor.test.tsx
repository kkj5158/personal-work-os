import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { CalendarEditor } from "./CalendarEditor";
import { hasValidEditorTiming, newEditor, validateEditor, type CalendarEditorValue } from "./editorModel";
import type { CalendarCategory } from "./appearance";

const categories:CalendarCategory[]=[
  {id:"work",domain:"WORK",name:"개발",parentId:null,isActive:true,sortOrder:0},
  {id:"backend",domain:"WORK",name:"백엔드",parentId:"work",isActive:true,sortOrder:0},
  {id:"inactive",domain:"WORK",name:"옛 분류",parentId:"work",isActive:false,sortOrder:1},
  {id:"other",domain:"WORK",name:"콘텐츠",parentId:null,isActive:true,sortOrder:1},
  {id:"other-child",domain:"WORK",name:"글쓰기",parentId:"other",isActive:true,sortOrder:0},
  {id:"empty",domain:"WORK",name:"단독",parentId:null,isActive:true,sortOrder:2},
  {id:"life",domain:"LIFE",name:"생활",parentId:null,isActive:true,sortOrder:0},
  {id:"clean",domain:"LIFE",name:"청소",parentId:"life",isActive:true,sortOrder:0},
];

for(const kind of ["plan","actual"] as const) test(`${kind} category boxes preserve root identity, reset child on parent/domain change and filter active domain siblings`,async()=>{
  const dom=new JSDOM("<div id='root'></div>");
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
  // jsdom lacks the obsolete input-event shims React probes when the input autofocuses.
  Object.assign(dom.window.HTMLInputElement.prototype,{attachEvent:()=>{},detachEvent:()=>{}});
  let value:CalendarEditorValue={...newEditor(kind,"2026-09-09",600,635),title:"Activity",categoryId:"backend"};
  const root=createRoot(document.getElementById("root")!);
  const render=()=>root.render(<CalendarEditor value={value} date={value.date} categories={categories} status="저장됨" error={null} guard={false} busy={false}
    onChange={patch=>{value={...value,...patch};render();}} onSave={()=>{}} onFlush={()=>{}} onDelete={()=>{}} onClose={()=>{}} onDiscard={()=>{}} onContinue={()=>{}}/>);
  const select=(label:string)=>document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  const options=(label:string)=>Array.from(select(label).options).map(o=>o.value);
  const change=async(label:string,id:string)=>{await act(()=>{select(label).value=id;select(label).dispatchEvent(new dom.window.Event("change",{bubbles:true}));});};
  try {
    await act(render);
    assert.equal(select("대분류").value,"work");assert.equal(select("중분류").value,"backend");
    assert.deepEqual(options("대분류"),["","work","other","empty"]);assert.deepEqual(options("중분류"),["","backend"]);
    await change("중분류","");assert.equal(value.categoryId,"work");assert.equal(validateEditor(value),null);
    await change("중분류","backend");await change("대분류","other");assert.equal(value.categoryId,"other");assert.equal(select("중분류").value,"");assert.deepEqual(options("중분류"),["","other-child"]);
    await change("대분류","empty");assert.equal(select("중분류").disabled,true);assert.equal(document.querySelectorAll(".cal-category-fields select").length,2);
    await change("대분류","");assert.equal(value.categoryId,null);assert.equal(select("중분류").disabled,true);
    await act(()=>{const domain=Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find(s=>Array.from(s.options).some(o=>o.value==="LIFE"))!;domain.value="LIFE";domain.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
    assert.equal(value.categoryId,null);assert.deepEqual(options("대분류"),["","life"]);
    await change("대분류","life");assert.equal(value.categoryId,"life");assert.deepEqual(options("중분류"),["","clean"]);
    await change("중분류","clean");assert.equal(value.categoryId,"clean");
    assert.equal(Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="저장"),false);
  }finally{await act(()=>root.unmount());dom.window.close();}
});

test("Actual validation rejects invalid date, fractional duration and incomplete pair before persistence",()=>{
  const base={...newEditor("actual","2026-09-09",600,635),title:"LIFE",domainType:"LIFE" as const};
  assert.equal(validateEditor(base),null);
  assert.equal(hasValidEditorTiming(base),true);
  assert.equal(hasValidEditorTiming({...base,end:""}),false);
  assert.equal(hasValidEditorTiming({...base,date:"2026-02-30"}),false);
  assert.equal(hasValidEditorTiming({...base,unscheduled:true}),false);
  assert.equal(hasValidEditorTiming({...base,end:"09:00"}),false);
  assert.match(validateEditor({...base,date:"2026-02-30"})!,/날짜/);
  assert.match(validateEditor({...base,unscheduled:true,duration:2.5})!,/정수/);
  assert.match(validateEditor({...base,end:""})!,/시간/);
  assert.equal(validateEditor({...base,unscheduled:true,duration:35}),null);
});
