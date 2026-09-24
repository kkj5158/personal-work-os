import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import AuthoringHome from "./AuthoringHome";
import { authoringApi } from "@/lib/api/authoring";
import type { Program, Session, SessionSummary } from "@/lib/authoring/types";

test("Home isolates one action: no form submit, competing create, resume or navigation", async () => {
  const dom = new JSDOM("<div id='root'></div>", {url:"https://orbit.local/authoring"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("root")!);
  const originals={...authoringApi}, calls:string[]=[], routes:string[]=[];
  let release!:(session:Session)=>void, submissions=0, parentActions=0;
  const programs=["recovery","reality","grounded-future"].map(programKey=>({programKey,group:"CORE",title:programKey,description:""})) as Program[];
  authoringApi.programs=async()=>programs;
  authoringApi.sessions=async()=>[];
  authoringApi.create=async(key)=>{calls.push(key);return new Promise(resolve=>{release=resolve;});};
  const router={push:(path:string)=>routes.push(path),prefetch:async()=>{}} as unknown as AppRouterInstance;
  const screen=()=> <AppRouterContext.Provider value={router}><form onSubmit={e=>{e.preventDefault();submissions++;}} onClick={()=>parentActions++}><AuthoringHome /></form></AppRouterContext.Provider>;
  try {
    await act(async()=>root.render(screen()));
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".authoring-program button"));
    await act(()=>{buttons[0].click();buttons[1].click();buttons[0].click();});
    assert.deepEqual(calls,["recovery"]);assert.equal(submissions,0);assert.equal(parentActions,0);
    await act(async()=>release({id:"new",programKey:"recovery"} as Session));
    assert.deepEqual(routes,["/authoring/recovery/session/new"]);
    await act(()=>buttons[1].click());assert.equal(calls.length,1);
    await act(()=>root.render(null));
    authoringApi.sessions=async()=>[{id:"old",programKey:"recovery",status:"IN_PROGRESS",updatedAt:"2026-09-21T00:00:00Z"}] as SessionSummary[];
    await act(async()=>root.render(screen()));
    const resume=document.querySelector<HTMLButtonElement>(".authoring-program button")!;
    await act(()=>{resume.click();resume.click();});
    assert.equal(calls.length,1);assert.deepEqual(routes,["/authoring/recovery/session/new","/authoring/recovery/session/old"]);
  } finally {await act(()=>root.unmount());Object.assign(authoringApi,originals);dom.window.close();}
});

test("Every new-start action keeps old sessions and source-dialog double clicks create once", async () => {
  const dom=new JSDOM("<div id='root'></div>",{url:"https://orbit.local/authoring"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
  const root=createRoot(document.getElementById("root")!), originals={...authoringApi};
  const keys=["quick-motivation","recovery","reality","grounded-future","past","review","sexual-pattern","responsibility"];
  const calls:{key:string;source?:string}[]=[], routes:string[]=[];
  authoringApi.programs=async()=>keys.map(programKey=>({programKey,group:programKey==="quick-motivation"?"QUICK":["sexual-pattern","responsibility"].includes(programKey)?"TOPIC":"CORE",title:programKey,description:""})) as Program[];
  const sessions=[...keys.map(programKey=>({id:`old-${programKey}`,programKey,status:"IN_PROGRESS",updatedAt:"2026-09-21T00:00:00Z"})),{id:"reference",programKey:"reality",status:"COMPLETED",updatedAt:"2026-09-20T00:00:00Z",completedAt:"2026-09-20T00:00:00Z"}] as SessionSummary[];
  authoringApi.sessions=async()=>structuredClone(sessions);
  authoringApi.create=async(key,source)=>{calls.push({key,source});return {id:`new-${key}`,programKey:key} as Session;};
  const router={push:(path:string)=>routes.push(path),prefetch:async()=>{}} as unknown as AppRouterInstance;
  try{
    for(const key of keys){
      await act(async()=>root.render(<AppRouterContext.Provider value={router}><AuthoringHome key={key}/></AppRouterContext.Provider>));
      const card=document.querySelector(`article.${key}`)!;
      const button=Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='새로 시작')!;
      await act(async()=>{button.click();button.click();});
      if(key==='review'||key==='grounded-future'){
        const start=Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(b=>b.textContent==='시작하기')!;
        await act(async()=>{start.click();start.click();});
      }
      assert.equal(calls.filter(c=>c.key===key).length,1);
      assert.equal(routes.at(-1),`/authoring/${key}/session/new-${key}`);
    }
    assert.equal(calls.find(c=>c.key==='review')?.source,'reference');
    assert.equal(calls.find(c=>c.key==='grounded-future')?.source,'reference');
    assert.equal(sessions.filter(s=>s.status==='IN_PROGRESS').length,8);
  }finally{await act(()=>root.unmount());Object.assign(authoringApi,originals);dom.window.close();}
});

test("Home groups programs as Quick, Core and Topic from definition metadata and keeps a short recent list", async () => {
  const dom=new JSDOM("<div id='root'></div>",{url:"https://orbit.local/authoring"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById("root")!), originals={...authoringApi}, routes:string[]=[];
  const defs:[string,string][]=[["quick-motivation","QUICK"],["recovery","CORE"],["reality","CORE"],["grounded-future","CORE"],["past","CORE"],["review","CORE"],["sexual-pattern","TOPIC"],["responsibility","TOPIC"]];
  authoringApi.programs=async()=>defs.map(([programKey,group])=>({programKey,group,title:`title-${programKey}`,description:""})) as Program[];
  authoringApi.sessions=async()=>Array.from({length:7},(_,i)=>({id:`s${i}`,programKey:"recovery",status:i%2?"COMPLETED":"IN_PROGRESS",updatedAt:`2026-09-2${i}T00:00:00Z`,completedAt:i%2?`2026-09-2${i}T00:00:00Z`:null,...(i===0?{title:"다시 생활 리듬",memo:"memo"}:{})})) as SessionSummary[];
  const router={push:(path:string)=>routes.push(path),prefetch:async()=>{}} as unknown as AppRouterInstance;
  try{
    await act(async()=>root.render(<AppRouterContext.Provider value={router}><AuthoringHome/></AppRouterContext.Provider>));
    const groups=Array.from(document.querySelectorAll<HTMLElement>(".authoring-program-group")).map(g=>[g.getAttribute("aria-label"),Array.from(g.querySelectorAll("article")).map(a=>a.className.replace("authoring-program ",""))]);
    assert.deepEqual(groups,[["빠른 글쓰기",["quick-motivation"]],["핵심 글쓰기",["recovery","reality","grounded-future","past","review"]],["주제 글쓰기",["sexual-pattern","responsibility"]]]);
    assert.deepEqual(Array.from(document.querySelectorAll(".authoring-program-group")).map(g=>g.getAttribute("data-group")),["QUICK","CORE","TOPIC"]);
    assert.equal(document.body.textContent?.includes("Deep Authoring"),false);
    assert.match(document.querySelector(".authoring-program-group p")?.textContent??"",/5~10분/);
    assert.equal(document.querySelectorAll(".authoring-recent .authoring-session-row").length,5);
    const first=document.querySelector(".authoring-recent .authoring-session-row")!;
    assert.equal(first.querySelector("strong")?.textContent,"다시 생활 리듬");
    assert.match(first.querySelector("span")?.textContent??"",/^title-recovery · 작성 중 · /);
    assert.equal(document.querySelectorAll(".authoring-recent .authoring-session-row")[1].querySelector("strong")?.textContent,"title-recovery");
    assert.doesNotMatch(document.querySelector(".authoring-recent")?.textContent??"",/null|undefined/);
    const all=Array.from(document.querySelectorAll<HTMLButtonElement>(".authoring-recent button")).find(b=>b.textContent==="전체 기록 보기 →")!;
    await act(async()=>all.click());
    assert.deepEqual(routes,["/authoring/library"]);
  }finally{await act(()=>root.unmount());Object.assign(authoringApi,originals);dom.window.close();}
});
