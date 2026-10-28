import { test } from "node:test";
import assert from "node:assert/strict";
import { copySleepRecord, pasteSleepDraft } from "./clipboard";
import { actionBody, draftOf, resolve, type Session, type Nap } from "./model";
import { sleepEvents, segments, instant, addDay } from "../life-calendar/model";
const night: Session = { id: "source", revision: 12, bedtimeIntentAt: "2026-10-26T14:30:00Z", wakeAt: "2026-10-26T21:30:00Z", bedtimeSource: "USAGE_AUTO", wakeSource: "USAGE_AUTO", bedtimeCertainty: "ESTIMATED", wakeCertainty: "ESTIMATED", logicalWakeDate: "2026-10-27", expectedWakeDate: "2026-10-27", status: "CLOSED", excludedAt: null, intervalMinutes: 420, sleepScore: 84, sleepNote: "휴식" };
const store = new Map<string,string>();
Object.defineProperty(globalThis, "localStorage", { configurable:true, value: { getItem: (k:string)=>store.get(k)??null, setItem: (k:string,v:string)=>store.set(k,v) } });
test("overnight clone gets a fresh identity, exact duration and manual-only whitelisted fields", () => {
  const before = structuredClone(night), snapshot = copySleepRecord(draftOf("main",night,"2026-10-27"));
  const clone = pasteSleepDraft(snapshot,{date:"2026-10-28",minute:23*60+30});
  assert.notEqual(clone.id,night.id); assert.equal(clone.original,null);
  assert.equal(resolve(clone.start)?.at,"2026-10-28T14:30:00.000Z");
  assert.equal(resolve(clone.end)?.at,"2026-10-28T21:30:00.000Z");
  assert.equal(clone.end.date,"2026-10-29"); assert.deepEqual(night,before);
  const now=Date.now; Date.now=()=>Date.parse("2026-10-30T00:00:00Z");
  try {
    const body=actionBody(clone,"Asia/Seoul"),payload=body.payload as {fields:Record<string,unknown>;fieldCertainties:Record<string,string>};
    assert.equal(body.expectedRevision,0); assert.equal(body.actionType,"CORRECT_SESSION");assert.equal(body.entryPoint,"HISTORY_EDIT");
    assert.equal(payload.fields.sleepScore,84);assert.equal(payload.fields.sleepNote,"휴식");assert.deepEqual(payload.fieldCertainties,{bedtimeIntentAt:"RECALLED",wakeAt:"RECALLED"});
    assert.ok(!JSON.stringify(body).includes("USAGE_AUTO"));assert.ok(!JSON.stringify(snapshot).includes("source"));
  }finally{Date.now=now;}
});
test("nap remains a nap across weeks, retains seconds and uses the existing create action",()=>{
 const nap:Nap={id:"nap-source",revision:7,startAt:"2026-09-01T04:00:37Z",endAt:"2026-09-01T04:30:49Z",startTimezone:"Asia/Seoul",endTimezone:"Asia/Seoul",startOffsetMinutes:540,endOffsetMinutes:540,startLocalDate:"2026-09-01",intervalMinutes:30.2};
 const buffer=copySleepRecord(draftOf("nap",nap,nap.startLocalDate));
 const clone=pasteSleepDraft(buffer,{date:"2026-09-09",minute:14*60});
 assert.equal(clone.kind,"nap");assert.equal(resolve(clone.start)?.at,"2026-09-09T05:00:00.000Z");assert.equal(resolve(clone.end)?.at,"2026-09-09T05:30:12.000Z");
 assert.equal(actionBody(clone,"Asia/Seoul").actionType,"CREATE_NAP");
 const sameClock=pasteSleepDraft(buffer,{date:"2026-09-15"});assert.equal(resolve(sameClock.start)?.at,"2026-09-15T04:00:37.000Z");assert.equal(resolve(sameClock.end)?.at,"2026-09-15T04:30:49.000Z");
 assert.notEqual(pasteSleepDraft(buffer,{date:"2026-09-15"}).id,sameClock.id);
});
test("incomplete and unsaved records cannot masquerade as complete copies; future and long interval gates remain",()=>{
 assert.throws(()=>copySleepRecord(draftOf("main",null,"2026-09-01")),/저장된/);
 assert.throws(()=>copySleepRecord(draftOf("main",{...night,wakeAt:null},"2026-09-01")),/시작과 종료/);
 const clone=pasteSleepDraft(copySleepRecord(draftOf("main",night,"2026-10-27")),{date:"2099-01-01"});assert.throws(()=>actionBody(clone,"Asia/Seoul"),/미래/);
 assert.throws(()=>pasteSleepDraft(copySleepRecord(draftOf("main",night,"2026-10-27")),{date:"2026-02-30"}));
});
test("pasted night renders in the next wake-date column of the 18–18 grid",()=>{
 const clone=pasteSleepDraft(copySleepRecord(draftOf("main",night,"2026-10-27")),{date:"2026-10-28",minute:1410});
 const saved={...night,id:clone.id,bedtimeIntentAt:resolve(clone.start)!.at,wakeAt:resolve(clone.end)!.at,logicalWakeDate:clone.end.date,expectedWakeDate:clone.end.date};
 const events=sleepEvents([saved],[]),rows=segments(events,instant(addDay("2026-10-29",-1),18),26);
 assert.equal(rows.length,1);assert.equal(rows[0].top,5.5*26);assert.equal(rows[0].actualHeight,7*26);
 assert.equal(segments(events,instant(addDay("2026-10-28",-1),18),26).length,0);
});
