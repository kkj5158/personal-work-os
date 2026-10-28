import test from "node:test";
import assert from "node:assert/strict";
import { estimatedSession, sleepSourceLabel, type Session } from "./model";
test("Google provenance stays distinguishable and contributes to estimated counts",()=>{
 const s:Session={id:"google",revision:1,bedtimeIntentAt:"2026-10-27T15:00:00Z",wakeAt:"2026-10-27T23:00:00Z",logicalWakeDate:"2026-10-28",expectedWakeDate:"2026-10-28",status:"CLOSED",excludedAt:null,intervalMinutes:480};
 assert.equal(estimatedSession(s),false);assert.equal(sleepSourceLabel(s),"직접 기록");
 const google={...s,bedtimeSource:"GOOGLE_SLEEP_API",wakeSource:"GOOGLE_SLEEP_API"};assert.equal(estimatedSession(google),true);assert.equal(sleepSourceLabel(google),"Google Sleep API 추정");
 assert.equal(sleepSourceLabel({...s,wakeSource:"USAGE_AUTO"}),"자동 추정");
});
