import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import {apiClient} from "@/lib/api/client";
import {useCalendarWriteQueue,writeActualPlacement,type ActualRecord} from "./calendarWrites";
test("timing writes use saved source after draft discard and preserve unscheduled duration",async t=>{
  const saved:ActualRecord={id:"a",sourceType:"LIFE_TIME_ENTRY",date:"2020-01-06",categoryId:"root",title:"Saved title",durationMinutes:35,startTime:null,endTime:null,memo:"Saved memo",phaseId:null};
  const writes:Partial<ActualRecord>[]=[];
  t.mock.method(apiClient,"get",async()=>saved);
  t.mock.method(apiClient,"put",async(_path:string,value:Partial<ActualRecord>)=>{writes.push(value);return {...saved,...value};});
  await writeActualPlacement(saved.sourceType,saved.id,"2020-01-07","14:00","15:00",true);
  assert.equal(writes[0].title,"Saved title");assert.equal(writes[0].memo,"Saved memo");assert.equal(writes[0].categoryId,"root");
  assert.equal(writes[0].endTime,"14:35");assert.equal(writes[0].durationMinutes,35);
  await writeActualPlacement(saved.sourceType,saved.id,"2020-01-08",null,null);
  assert.equal(writes[1].startTime,null);assert.equal(writes[1].endTime,null);assert.equal(writes[1].durationMinutes,35);
});
test("navigation waits for pending direct writes before exposing another editor",async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  let queue!:ReturnType<typeof useCalendarWriteQueue>;
  function Probe(){queue=useCalendarWriteQueue();return null;}
  const root=createRoot(document.getElementById('root')!);await act(()=>root.render(<Probe/>));
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const events:string[]=[];
  const write=queue.run(async()=>{await gate;events.push('saved');});
  const navigation=queue.flush().then(()=>events.push('next editor'));
  await Promise.resolve();assert.deepEqual(events,[]);
  release();await write;await navigation;assert.deepEqual(events,['saved','next editor']);
  await act(()=>root.unmount());dom.window.close();
});
