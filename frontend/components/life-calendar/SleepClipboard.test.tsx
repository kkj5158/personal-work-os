import {test} from "node:test";
import assert from "node:assert/strict";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {useSleepClipboard} from "./SleepClipboard";
import {draftOf,type Draft,type Session} from "@/lib/sleep/model";
const record:Session={id:"source",revision:3,bedtimeIntentAt:"2026-09-01T14:30:00Z",wakeAt:"2026-09-01T21:30:00Z",logicalWakeDate:"2026-09-02",expectedWakeDate:"2026-09-02",status:"CLOSED",excludedAt:null,intervalMinutes:420};
test("buttons/shortcuts retain snapshot across navigation, protect editor text, gate dirty/pending, isolate owners",async()=>{
 const dom=new JSDOM('<div id="root"></div><input id="native"/><textarea></textarea><div contenteditable="true"><span>text</span></div><div role="textbox">rich text</div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,React,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.querySelector('#root')!);let owner="A",disabled=false,dirty=false,selected:Draft|null=draftOf("main",record,"2026-09-02"),state:ReturnType<typeof useSleepClipboard>;const pasted:Draft[]=[],notices:string[]=[];
 function Harness(){state=useSleepClipboard({owner,draft:selected,disabled,dirty,paste:d=>pasted.push(d),notify:m=>notices.push(m)});return state.toolbar;}
 const render=()=>act(()=>root.render(<Harness/>));
 const key=async(k:string,target:Element|Document=document,meta=false,repeat=false)=>{const e=new dom.window.KeyboardEvent("keydown",{key:k,ctrlKey:!meta,metaKey:meta,bubbles:true,cancelable:true,repeat});await act(()=>target.dispatchEvent(e));return e;};
 try{
  await render();assert.equal((await key("c")).defaultPrevented,true);assert.ok(state!.controls.active);await key("v");assert.match(notices.at(-1)!,/먼저/);assert.equal(pasted.length,0);
  selected=null;await render();await act(()=>state!.controls.onTarget({date:"2026-09-10",minute:1410}));
  for(const selector of ["#native","textarea","[contenteditable] span",'[role="textbox"]'])assert.equal((await key("v",document.querySelector(selector)!)).defaultPrevented,false);
  await key("v",document,true);assert.equal(pasted.length,1);assert.equal(pasted[0].end.date,"2026-09-11");
  await key("v",document,false,true);assert.equal(pasted.length,1);
  disabled=true;await render();await key("v");assert.equal(pasted.length,1);
  disabled=false;dirty=true;await render();await key("v");assert.equal(pasted.length,1);assert.match(notices.at(-1)!,/저장하거나/);
  dirty=false;owner="B";await render();assert.equal(state!.controls.active,false);assert.equal((await key("v")).defaultPrevented,false);
 }finally{await act(()=>root.unmount());dom.window.close();}
});
