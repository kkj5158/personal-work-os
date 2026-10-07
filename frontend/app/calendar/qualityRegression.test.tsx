import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {apiClient,ApiError} from "@/lib/api/client";
import {newEditor} from "./editorModel";
import {useCalendarEditor} from "./useCalendarEditor";
import {calendarToday,calendarTodayDate,calendarNowMinute} from "./actualPolicy";
import {restoredCalendarMode} from "./workspacePolicy";
import {readPreferences} from "./appearance";
import {actualConflict,scheduledPlacement} from "./actualDrag";
import type {GridBlock} from "./gridTypes";

test("lost creation response replays one operation, drains later edits, and a new draft has a new identity",async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const creations=new Map<string,string>(),posts:{key:string;body:unknown}[]=[],updates:unknown[]=[];
  let loseResponse=true;
  t.mock.method(apiClient,"post",async(path:string,body:unknown,headers:Record<string,string>)=>{
    if(path === "/api/calendar/state")return {kind:"PLAN",id:"converted-plan"};
    const key=headers["Idempotency-Key"];posts.push({key,body});
    if(!creations.has(key))creations.set(key,`actual-${creations.size+1}`);
    if(loseResponse){loseResponse=false;throw new Error("response lost after commit");}
    return {id:creations.get(key)};
  });
  t.mock.method(apiClient,"put",async(_path:string,body:unknown)=>{updates.push(body);return {id:"actual-1"};});
  let editor!:ReturnType<typeof useCalendarEditor>;
  function Probe(){editor=useCalendarEditor(async()=>{},()=>{});return null;}
  const root=createRoot(document.getElementById('root')!);
  t.after(async()=>{await act(()=>root.unmount());dom.window.close();});
  await act(()=>root.render(<Probe/>));
  const draft={...newEditor("actual","2020-01-06",600,630),domainType:"LIFE" as const};
  await act(async()=>{editor.select(draft);});
  assert.equal(posts.length,0);assert.equal(editor.value?.id,null);
  await act(async()=>{editor.change({title:"Intentional"});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(creations.size,1);assert.equal(editor.value?.id,null);
  // The failed creation remains the same operation even after local input changes.
  await act(async()=>{editor.change({memo:"Later edit"});await editor.save(true);});
  assert.equal(creations.size,1);assert.equal(posts[0].key,posts[1].key);
  assert.equal(editor.value?.id,"actual-1");assert.equal((updates.at(-1) as {memo:string}).memo,"Later edit");
  await act(async()=>{await editor.leave(()=>{});editor.select({...draft,key:crypto.randomUUID()});});
  loseResponse=true;
  await act(async()=>{editor.change({title:"Intentional"});await editor.save(true);});
  assert.equal(creations.size,2);assert.notEqual(posts[0].key,posts.at(-1)?.key);
  await act(async()=>{await editor.changeState("plan");});
  assert.equal(creations.size,2);assert.equal(editor.value?.id,"converted-plan");assert.equal(editor.value?.kind,"plan");
});

test("Seoul date and current minute do not depend on the browser timezone; query overrides persisted mode",()=>{
  const instant=new Date("2026-10-05T16:10:00Z");
  assert.equal(calendarToday(instant),"2026-10-06");assert.equal(calendarTodayDate(instant).getDate(),6);assert.equal(calendarNowMinute(instant),70);
  const prefs=readPreferences('{"mode":"actual"}');
  assert.equal(restoredCalendarMode(null,prefs),"actual");assert.equal(restoredCalendarMode("plan",prefs),"plan");assert.equal(restoredCalendarMode("compare",prefs),"review");
});

test("a received creation validation rejection still allows correcting the new draft's domain",async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const paths:string[]=[];
  t.mock.method(apiClient,"post",async(path:string)=>{paths.push(path);if(path.endsWith("WORK_TIME_ENTRY"))throw new ApiError(400,"WorkRecord required");return {id:"life"};});
  let editor!:ReturnType<typeof useCalendarEditor>;
  function Probe(){editor=useCalendarEditor(async()=>{},()=>{});return null;}
  const root=createRoot(document.getElementById('root')!);t.after(async()=>{await act(()=>root.unmount());dom.window.close();});
  await act(()=>root.render(<Probe/>));await act(async()=>editor.select(newEditor("actual","2020-01-06",600,630)));
  await act(async()=>{editor.change({title:"Draft",categoryId:"work"});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(editor.value?.id,null);
  await act(async()=>{editor.change({domainType:"LIFE"});await editor.save(true);});
  assert.deepEqual(paths,["/api/calendar/actual/WORK_TIME_ENTRY","/api/calendar/actual/LIFE_TIME_ENTRY"]);assert.equal(editor.value?.id,"life");
});

test("23:59 is schedulable but next-day crossing is not, and exact duplicates only exempt overlap",()=>{
  const block:GridBlock={id:"one",sourceType:"LIFE_TIME_ENTRY",title:"Same",domainType:"LIFE",startAt:"2020-01-06T23:00:00",endAt:"2020-01-06T23:59:00",durationMinutes:59,activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null};
  const item={...block,sourceType:"LIFE_TIME_ENTRY" as const,date:"2020-01-06",sourceId:block.id,durationMinutes:59};
  assert.deepEqual(scheduledPlacement(item,1380),{start:1380,end:1439});assert.equal(scheduledPlacement({...item,durationMinutes:60},1380),null);
  const second={...block,id:"two"};
  assert.equal(actualConflict(block,new Date(block.startAt),new Date(block.endAt),[second]),undefined);
  assert.equal(actualConflict({...block,endAt:"2020-01-06T23:30:00",durationMinutes:30},new Date(block.startAt),new Date(block.endAt),[second]),undefined);
  assert.equal(actualConflict({...block,memo:"  "},new Date(block.startAt),new Date(block.endAt),[second]),undefined);
  assert.equal(actualConflict(block,new Date(block.startAt),new Date(block.endAt),[{...second,title:"Different"}])?.id,"two");
});
