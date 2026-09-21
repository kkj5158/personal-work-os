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
  const programs=["recovery","reality","grounded-future"].map(programKey=>({programKey,title:programKey,description:""})) as Program[];
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
