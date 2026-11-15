import test from "node:test";
import assert from "node:assert/strict";
import { estimatedSession, sleepSourceLabel, type Session } from "./model";
test("Google provenance stays distinguishable and contributes to estimated counts",()=>{
 const s:Session={id:"google",revision:1,bedtimeIntentAt:"2026-10-27T15:00:00Z",wakeAt:"2026-10-27T23:00:00Z",logicalWakeDate:"2026-10-28",expectedWakeDate:"2026-10-28",status:"CLOSED",excludedAt:null,intervalMinutes:480};
 assert.equal(estimatedSession(s),false);assert.equal(sleepSourceLabel(s),"직접 기록");
 const google={...s,bedtimeSource:"GOOGLE_SLEEP_API",wakeSource:"GOOGLE_SLEEP_API"};assert.equal(estimatedSession(google),true);assert.equal(sleepSourceLabel(google),"Google 추정");
 assert.equal(sleepSourceLabel({...s,wakeSource:"USAGE_AUTO"}),"휴대폰 사용 추정");
});

test("partial Google observation stays estimated and visible",()=>{const partial={bedtimeCertainty:"ESTIMATED",bedtimeSource:"GOOGLE_SLEEP_API",googleDetectionStatus:"GOOGLE_PARTIAL" as const};assert.equal(estimatedSession(partial as Session),true);assert.equal(sleepSourceLabel(partial as Session),"Google 추정 · 일부 관측 누락");});

test("fallback labels never impersonate Google and manual edit stays authoritative",()=>{const base={bedtimeCertainty:"ESTIMATED"} as Session;assert.match(sleepSourceLabel({...base,wakeSource:"SCHEDULE_PLACEHOLDER",provisional:true}),/시간표 임시.*평균 제외/);assert.equal(sleepSourceLabel({...base,wakeSource:"USAGE_ESTIMATE"}),"휴대폰 사용 추정");assert.equal(sleepSourceLabel({...base,wakeSource:"GOOGLE_SLEEP_API",manualProtected:true}),"직접 수정");});
