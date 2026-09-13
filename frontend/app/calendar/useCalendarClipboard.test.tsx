import { test } from "node:test";
import assert from "node:assert/strict";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {apiClient} from "@/lib/api/client";
import {useCalendarClipboard} from "./useCalendarClipboard";
import type {CalendarToast} from "./useCalendarEditor";
import type {ClipboardItem} from "./clipboard";

test("keyboard workflow, editor safety, atomic failure, exclusion, duplicate, delete/Undo and Esc",async()=>{
  const dom=new JSDOM('<div id="root"></div><input id="text"/>',{url:"http://localhost"});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,IS_REACT_ACT_ENVIRONMENT:true});
  const original=apiClient.post;const calls:{path:string;body:unknown}[]=[];let reject=false;let toast:CalendarToast|undefined;
  const item:ClipboardItem={kind:"PLAN",plan:{title:"Plan",domainType:"WORK",startAt:"2026-10-05T09:05:00",endAt:"2026-10-05T09:40:00",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null}};
  apiClient.post=async<T,>(path:string,body:unknown):Promise<T>=>{
    calls.push({path,body});
    if(path.endsWith("snapshot"))return [item,item] as T;
    if(path.endsWith("delete"))return {undoToken:"undo"} as T;
    if(path.includes("undo/"))return [{kind:"PLAN",id:"restored"}] as T;
    if(path.endsWith("paste"))return reject ? {committed:false,results:[{index:0,created:null,error:"overlap"},{index:1,created:null,error:null}]} as T : {committed:true,results:[{index:0,created:{kind:"PLAN",id:"new"},error:null}]} as T;
    throw new Error(path);
  };
  let state:ReturnType<typeof useCalendarClipboard>;
  function Harness(){state=useCalendarClipboard({leave:async action=>action(),run:async action=>action(),refresh:async()=>{},notify:t=>{toast=t;},disabled:false});return <div>{state.selection.length}</div>;}
  const root=createRoot(document.getElementById("root")!);
  const key=async(key:string,command=false,target:Element|Document=document)=>{
    const event=new dom.window.KeyboardEvent("keydown",{key,ctrlKey:command,bubbles:true,cancelable:true});
    await act(async()=>{target.dispatchEvent(event);await new Promise(resolve=>setTimeout(resolve,0));});return event;
  };
  try {
    await act(async()=>root.render(<Harness/>));
    await act(async()=>{state.select({kind:"PLAN",id:"a"});state.select({kind:"PLAN",id:"b"},true);});
    assert.equal((await key("c",true)).defaultPrevented,true);assert.equal(state!.selection.length,2);assert.equal(state!.clipboard?.items.length,2);
    const before=calls.length;assert.equal((await key("v",true,document.querySelector("input")!)).defaultPrevented,false);assert.equal(calls.length,before);
    await key("v",true);assert.match(toast!.message,/날짜\/시간/);assert.equal(calls.length,before);
    await act(async()=>state.setTarget({date:"2026-10-07",minute:840}));reject=true;await key("v",true);
    assert.equal(state!.selection[0].id,"a");assert.ok(state!.failure);assert.ok(state!.clipboard);
    reject=false;await act(async()=>{state.exclude();await new Promise(resolve=>setTimeout(resolve,0));});assert.equal(state!.selection[0].id,"new");assert.equal((calls.at(-1)!.body as {excludeConflicts:boolean}).excludeConflicts,true);
    await key("d",true);assert.equal(state!.selection[0].id,"new");assert.equal((calls.at(-1)!.body as {items:ClipboardItem[]}).items[0].kind,"PLAN");
    await key("Delete");assert.equal(state!.selection.length,0);assert.ok(toast!.undo);
    await act(async()=>toast!.undo!());assert.equal(state!.selection[0].id,"restored");
    await key("Escape");assert.equal(state!.selection.length,0);assert.ok(state!.clipboard);
  } finally {apiClient.post=original;await act(async()=>root.unmount());dom.window.close();}
});
