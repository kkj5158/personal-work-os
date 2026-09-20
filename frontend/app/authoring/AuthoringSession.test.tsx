import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import AuthoringSession from "./AuthoringSession";
import { authoringApi } from "@/lib/api/authoring";
import type { Session } from "@/lib/authoring/types";

const id = "b79b7a86-0e98-426b-8d06-b8e82ca09df5";
const initial = {id,programKey:"recovery",specVersion:"test",status:"IN_PROGRESS",currentSectionKey:"arrival",version:0,answers:{},report:null,sourceSessionId:null,startedAt:"2026-09-20T00:00:00Z",updatedAt:"2026-09-20T00:00:00Z",completedAt:null,definition:{programKey:"recovery",version:"test",title:"Recovery",description:"",sourceUrl:"",sections:[{sectionKey:"arrival",title:"ARRIVAL",questions:[{questionKey:"choice",type:"SINGLE_SELECT",prompt:"Choice",options:["A","B"]}]}],stoppingRules:[],completionKeys:[],reportSections:[]}} as Session;
const router = {back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}} as unknown as AppRouterInstance;
function environment() {
  const dom = new JSDOM("<div id='root'></div>", {url:"https://orbit.local/authoring"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function(){this.setAttribute("open","");};
  dom.window.HTMLDialogElement.prototype.close = function(){this.removeAttribute("open");};
  return dom;
}
const screen = () => <AppRouterContext.Provider value={router}><AuthoringSession programKey="recovery" sessionId={id} mode="runner" /></AppRouterContext.Provider>;

test("Reload after completion elsewhere preserves and exposes the tab's unsaved draft", async () => {
  const dom = environment(), root = createRoot(document.getElementById("root")!);
  const original = authoringApi.get;
  sessionStorage.setItem(`authoring.draft.${id}`,JSON.stringify({answers:{choice:"B"},currentSectionKey:"arrival",version:0}));
  authoringApi.get = async()=>({...initial,status:"COMPLETED",version:2,answers:{choice:"A"}});
  try {
    await act(async()=>{root.render(screen());});
    assert.match(document.body.textContent ?? "",/미저장 입력 다운로드/);
    assert.equal(JSON.parse(sessionStorage.getItem(`authoring.draft.${id}`)!).answers.choice,"B");
    assert.equal(document.querySelector('dialog .authoring-answer')?.textContent,"B");
  } finally {await act(()=>root.unmount());authoringApi.get=original;dom.window.close();}
});

test("A late save from an unmounted runner cannot overwrite or clear a newer retained draft", async () => {
  const dom=environment(), root=createRoot(document.getElementById("root")!);
  const originalGet=authoringApi.get, originalSave=authoringApi.save;
  let resolveOld!:(value:Session)=>void, count=0;
  authoringApi.get=async()=>structuredClone(initial);
  authoringApi.save=async(_id,_version,draft)=>{
    count++;
    if(count===1)return new Promise<Session>(resolve=>{resolveOld=resolve;});
    return {...initial,...draft,version:2};
  };
  try {
    await act(async()=>root.render(screen()));
    await act(()=>document.querySelector<HTMLInputElement>('input[type=radio]')!.click());
    await act(()=>root.render(null)); // Browser Back: unmount initiates best-effort flush.
    assert.equal(count,1);
    await act(async()=>root.render(screen()));
    await act(()=>document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click());
    await act(async()=>{resolveOld({...initial,answers:{choice:"A"},version:1});});
    assert.equal(JSON.parse(sessionStorage.getItem(`authoring.draft.${id}`)!).answers.choice,"B");
  } finally {await act(()=>root.unmount());authoringApi.get=originalGet;authoringApi.save=originalSave;dom.window.close();}
});
