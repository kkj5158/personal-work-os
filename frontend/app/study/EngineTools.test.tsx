import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {JSDOM} from "jsdom";
import {createRoot} from "react-dom/client";
import {createStudyPort} from "../../lib/study/port";
import type {EngineStatus} from "../../lib/study/engine";
import {EngineTools} from "./EngineTools";

test("engine mutation controls wait for the authenticated workspace, not just engine status",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/study'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const base=createStudyPort('demo');let ready=false,calls=0;
 const status:EngineStatus={engineEnabled:true,workerOnline:false,provider:'local_worker_pull',paidProvider:'disabled',pdf:'ready',version:'test',goals:{goal:'Self-authored QA',interests:'',weeklyTarget:{new:60,review:25,application:15}},jobs:[],workers:[],schedule:{enabled:false,time:'20:00',zone:'Asia/Seoul',nextRun:'2026-11-15T11:00:00Z'}};
 const port={...base,getSnapshot:()=>({...base.getSnapshot(),connection:{state:ready?'ready' as const:'loading' as const}}),engine:{status:async()=>status,action:async()=>{calls++;return {};},search:async()=>[]}};
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>{root.render(<EngineTools port={port} area="coach"/>);});
  const button=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='7일 워커 연결 파일 발급')!;
  assert.equal(button().disabled,true);await act(()=>button().click());assert.equal(calls,0);
  ready=true;await act(()=>root.render(<EngineTools port={port} area="coach"/>));
  assert.equal(button().disabled,false);await act(async()=>button().click());assert.equal(calls,1);
 }finally{await act(()=>root.unmount());dom.window.close();}
});
