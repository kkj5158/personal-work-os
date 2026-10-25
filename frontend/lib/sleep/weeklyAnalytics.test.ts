import {test} from "node:test";
import assert from "node:assert/strict";
import {weeklyAnalytics} from "./weeklyAnalytics";
import type {Session,Nap} from "./model";
const night:Session={id:"n",revision:1,bedtimeIntentAt:"2026-10-18T14:00:00Z",wakeAt:"2026-10-18T22:00:00Z",logicalWakeDate:"2026-10-19",expectedWakeDate:"2026-10-19",status:"CLOSED",excludedAt:null,intervalMinutes:480};
const nap:Nap={id:"p",revision:1,startAt:"2026-10-19T04:00:00Z",endAt:"2026-10-19T04:30:00Z",startTimezone:"Asia/Seoul",endTimezone:"Asia/Seoul",startOffsetMinutes:540,endOffsetMinutes:540,startLocalDate:"2026-10-19",intervalMinutes:30};
test("past week uses seven calendar days, null nights stay missing, multiple naps average per session",()=>{
 const s=weeklyAnalytics("2026-10-21",[night,{...night,id:"other",logicalWakeDate:"2026-10-20",intervalMinutes:420}],[nap,{...nap,id:"p2",intervalMinutes:20}],"2026-10-26T00:00:00Z");
 assert.equal(s.meanSleep,450);assert.equal(s.napFrequency,2/7);assert.equal(s.meanNap,25);assert.equal(s.days[2].sleep,null);assert.equal(s.days[0].nap,50);
 assert.deepEqual(s.days.map(d=>new Date(d.date).getUTCDay()),[1,2,3,4,5,6,0]);
});
test("current week uses elapsed KST dates inclusive of today, future week has no denominator",()=>{
 const now="2026-10-20T15:01:00Z"; // Wednesday in Seoul, Tuesday in UTC.
 const s=weeklyAnalytics("2026-10-24",[night],[nap],now);assert.equal(s.eligibleDays,3);assert.equal(s.napFrequency,1/3);assert.equal(s.days[3].future,true);
 const future=weeklyAnalytics("2026-10-27",[],[],now);assert.equal(future.eligibleDays,0);assert.equal(future.napFrequency,null);assert.equal(future.meanNap,null);
});
test("excluded, incomplete, unknown, invalid and future records never enter analytics, even when displayed",()=>{
 const records=[{...night,excludedAt:"now"},{...night,status:"INCOMPLETE"},{...night,wakeAt:null},{...night,intervalMinutes:0},{...night,intervalMinutes:NaN},{...night,wakeAt:night.bedtimeIntentAt},{...night,logicalWakeDate:"2026-10-25"}];
 const s=weeklyAnalytics("2026-10-21",records,[{...nap,intervalMinutes:0},{...nap,startLocalDate:"2026-10-25"}],"2026-10-21T00:00:00Z");
 assert.equal(s.meanSleep,null);assert.equal(s.meanNap,null);assert.equal(s.napFrequency,0);assert.ok(s.days.every(d=>d.sleep===null));
});
test("source-local attribution is preserved; long records aggregate once, Android estimates remain eligible",()=>{
 const s=weeklyAnalytics("2026-10-19",[{...night,bedtimeIntentAt:"2026-10-16T14:00:00Z",intervalMinutes:3360,bedtimeSource:"USAGE_AUTO",wakeSource:"USAGE_AUTO"}], [{...nap,startLocalDate:"2026-10-18"}],"2026-10-26T00:00:00Z");
 assert.equal(s.meanSleep,3360);assert.equal(s.days.filter(d=>d.sleep!==null).length,1);assert.equal(s.meanNap,null);
});
test("year boundary keeps Monday-Sunday and selected weeks never reuse another week's records",()=>{
 const s=weeklyAnalytics("2027-01-01",[night],[nap],"2027-01-02T12:00:00Z");assert.equal(s.from,"2026-12-28");assert.equal(s.to,"2027-01-03");assert.equal(s.meanSleep,null);assert.equal(s.eligibleDays,6);
});
