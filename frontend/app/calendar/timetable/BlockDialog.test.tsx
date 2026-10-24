import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {BlockDialog,type BlockDraft} from "./BlockDialog";
import type {TimetableBlock} from "@/lib/api/timetables";

test("existing dialog edits persisted weekdays, preserves failed input, retries once and cancels without writes",async()=>{
 const dom=new JSDOM("<div id='root'></div>",{url:"https://pos.local/calendar?tab=timetable"});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const members:TimetableBlock[]=[1,2,3,4,5].map(weekday=>({id:`b${weekday}`,timetableId:"t",title:"알바",weekday,startMinute:540,durationMinutes:540,memo:"원래 메모",color:null,version:0,deletedAt:null,creationGroupId:"g"}));
 const draft:BlockDraft={timetableId:"t",key:"attempt",block:members[2],original:members[2],members};
 const calls:{days:number[];key:string}[]=[];let closed=0,release:()=>void=()=>{};
 const root=createRoot(document.getElementById("root")!);
 const submit=()=>document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));
 const render=(current:BlockDraft)=>root.render(<BlockDialog key={current.key} draft={current} defaultColor={null} recent={[]} onRecent={()=>{}} onSave={async(_block,days,key)=>{calls.push({days,key});await new Promise<void>(resolve=>{release=resolve;});throw Error("동시 편집 충돌");}} onDelete={async()=>{}} onDuplicate={()=>{}} onClose={()=>{closed++;}}/>);
 try{
  await act(()=>render(draft));
  const boxes=()=>Array.from(document.querySelectorAll<HTMLInputElement>('.tt-days input'));
  assert.deepEqual(boxes().filter(b=>b.checked).map((_,i)=>i+1),[1,2,3,4,5]);assert.ok(document.body.textContent?.includes("함께 만든 블록 5개 수정"));
  await act(()=>boxes()[4].click());await act(()=>boxes()[5].click());
  await act(()=>{submit();submit();});assert.equal(calls.length,1);assert.deepEqual(calls[0].days,[1,2,3,4,6]);assert.ok(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled);
  await act(()=>release());assert.equal(document.querySelector('[role="alert"]')?.textContent,"동시 편집 충돌");assert.equal(boxes()[4].checked,false);assert.equal(boxes()[5].checked,true);assert.equal(document.querySelector<HTMLInputElement>('input[maxlength="200"]')?.value,"알바");
  await act(()=>submit());assert.equal(calls[1].key,calls[0].key);await act(()=>release());
  await act(()=>boxes()[6].click());await act(()=>submit());assert.notEqual(calls[2].key,calls[0].key);await act(()=>release());
  await act(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==="취소")!.click());assert.equal(closed,1);assert.equal(calls.length,3);
  await act(()=>render({...draft,key:"legacy",members:undefined,original:{...members[2],creationGroupId:null}}));assert.equal(document.querySelectorAll('.tt-days input[type="radio"]').length,7);assert.equal(boxes().filter(b=>b.checked).length,1);
 }finally{await act(()=>root.unmount());dom.window.close();}
});
