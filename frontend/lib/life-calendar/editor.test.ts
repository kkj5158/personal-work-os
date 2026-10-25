import {test} from "node:test";
import assert from "node:assert/strict";
import {timeToPosition,positionToTime,editDelta,selectedInterval,creationDraft,draftCalendarEvent} from "./editor";
import {previewDraft,sleepEvents,shiftInterval,segments,instant} from "./model";
import {actionBody,draftOf,type Session} from "../sleep/model";
const storage=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}});
test("forward and inverse clocks agree at evening, midnight, morning and nap transitions",()=>{
 for(const h of [26,64])for(const minute of [0,5,59,60,359,360,361,780,1080,1140,1439,1440])assert.ok(Math.abs(positionToTime(timeToPosition(minute,h),h)-minute)<1e-9);
 assert.equal(editDelta(13,26),30);assert.equal(editDelta(-13,26),-30);
 const p=selectedInterval("2026-10-20",300,780,true);assert.equal(p.start,"2026-10-19T14:00:00.000Z");assert.equal(p.end,"2026-10-19T22:00:00.000Z");
 const nap=selectedInterval("2026-10-20",1150,1180,true);assert.equal(nap.start,"2026-10-20T04:15:00.000Z");assert.equal(nap.end,"2026-10-20T04:45:00.000Z");
});
test("empty selection clamps boundaries and supports reverse selection without non-positive intervals",()=>{
 for(const [a,b] of [[1440,1440],[-9,0],[600,400],[1430,1500]]){const p=selectedInterval("2026-10-20",a,b,true);assert.ok(Date.parse(p.end)>Date.parse(p.start));assert.ok(Date.parse(p.start)>=Date.parse(instant("2026-10-19",18)));assert.ok(Date.parse(p.end)<=Date.parse(instant("2026-10-20",18)));}
});
test("quick adds are unsaved editable drafts, keep classification and endpoint dates",()=>{
 const d=creationDraft("main","2026-10-20"),n=creationDraft("nap","2026-10-20");assert.equal(d.original,null);assert.equal(d.start.date,"2026-10-19");assert.equal(d.end.date,"2026-10-20");assert.equal(n.start.time,"13:00");assert.equal(n.end.time,"13:30");
 const event=draftCalendarEvent(n)!;assert.equal(event.source,"nap");assert.equal(event.state,"저장 전");assert.equal(actionBody(n,"Asia/Seoul").actionType,"CREATE_NAP");
 const moved=shiftInterval(event,10,1,"move"),draft=previewDraft(n,moved.start,moved.end);assert.equal(draft.original,null);assert.equal(draft.id,n.id);assert.equal(draft.kind,"nap");assert.equal(draft.start.date,"2026-10-21");
});
test("repeated endpoint preview retains score, memo, revision and untouched automatic facts",()=>{
 const s:Session={id:"source",revision:9,bedtimeIntentAt:"2026-10-19T14:00:42Z",wakeAt:"2026-10-19T22:00:12Z",bedtimeTimezone:"Asia/Seoul",wakeTimezone:"Asia/Seoul",bedtimeSource:"USAGE_AUTO",logicalWakeDate:"2026-10-20",expectedWakeDate:"2026-10-20",status:"CLOSED",excludedAt:null,intervalMinutes:479.5};
 const d={...draftOf("main",s,"2026-10-20"),sleepScore:"82",sleepNote:"유지할 메모"},p=shiftInterval(sleepEvents([s],[])[0],5,0,"end"),once=previewDraft(d,p.start,p.end),twice=previewDraft(once,p.start,"2026-10-19T22:10:12Z"),body=actionBody(twice,"Asia/Seoul");
 assert.equal(body.expectedRevision,9);assert.equal(twice.original,s);const restored=previewDraft(twice,s.bedtimeIntentAt!,s.wakeAt!);assert.equal(restored.end.exactAt,s.wakeAt);assert.equal(restored.end.time,"07:00");assert.equal(twice.sleepNote,d.sleepNote);assert.equal(twice.sleepScore,"82");assert.deepEqual((body.payload as {fields:unknown}).fields,{wakeAt:"2026-10-19T22:10:12Z",sleepScore:82,sleepNote:d.sleepNote});
 const r=segments(sleepEvents([s],[]),instant("2026-10-19",18),26)[0];assert.ok(Math.abs(r.top-timeToPosition(300.7,26))<1e-8);
});
