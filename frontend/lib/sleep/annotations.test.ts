import { test } from "node:test";
import assert from "node:assert/strict";
import { actionBody, annotationFields, annotationsChanged, draftOf, estimatedSession, type Session } from "./model";
Object.defineProperty(globalThis,"localStorage",{value:{getItem:()=>"web-device",setItem:()=>{}},configurable:true});
const session:Session={id:"night",revision:8,bedtimeIntentAt:"2026-10-11T14:00:37Z",wakeAt:"2026-10-11T22:00:12Z",bedtimeTimezone:"Asia/Seoul",wakeTimezone:"Asia/Seoul",expectedWakeDate:"2026-10-12",logicalWakeDate:"2026-10-12",status:"CLOSED",excludedAt:null,intervalMinutes:480};
test("subjective 0,72,100 and clear remain independent from untouched endpoints",()=>{
 for(const score of ["0","72","100"]){const d={...draftOf("main",session,"2026-10-12"),sleepScore:score,sleepNote:"쉬고 일어남"};assert.equal(annotationsChanged(d),true);const request=actionBody(d,"Asia/Seoul");assert.equal(request.protocolVersion,2);assert.equal(request.actionType,"ANNOTATE_SESSION");assert.deepEqual((request.payload as {fields:object}).fields,{sleepScore:Number(score),sleepNote:"쉬고 일어남"});assert.equal(request.expectedRevision,8);}
 const d={...draftOf("main",{...session,sleepScore:72,sleepNote:"note"},"2026-10-12"),sleepScore:"",sleepNote:""};assert.deepEqual(annotationFields(d),{sleepScore:null,sleepNote:null});
});
test("invalid fractional, negative, out of bounds score and multiline/long note are rejected",()=>{
 for(const score of ["-1","101","72.5","NaN"]){assert.throws(()=>annotationFields({...draftOf("main",session,"2026-10-12"),sleepScore:score}),/0–100/);}
 for(const note of ["a\nb","a".repeat(101)])assert.throws(()=>annotationFields({...draftOf("main",session,"2026-10-12"),sleepNote:note}),/한 줄/);
});
test("time correction sends changed endpoint and score only; unset values are never fabricated",()=>{
 const d=draftOf("main",session,"2026-10-12");assert.equal(annotationsChanged(d),false);assert.deepEqual(annotationFields(d),{});d.end.time="07:20";d.end.offset="";d.sleepScore="0";
 const request=actionBody(d,"Asia/Seoul"),fields=(request.payload as {fields:Record<string,unknown>}).fields;assert.equal(request.actionType,"CORRECT_SESSION");assert.deepEqual(Object.keys(fields),["wakeAt","sleepScore"]);assert.equal(fields.sleepScore,0);assert.equal(session.bedtimeIntentAt,"2026-10-11T14:00:37Z");
});
test("nap annotations stay out of scope and estimated provenance is explicit",()=>{
 const nap=draftOf("nap",null,"2026-10-12");assert.deepEqual(annotationFields({...nap,sleepScore:"72",sleepNote:"not main"}),{});assert.equal(estimatedSession(session),false);assert.equal(estimatedSession({...session,wakeSource:"USAGE_AUTO"}),true);assert.equal(estimatedSession({...session,wakeCertainty:"ESTIMATED"}),true);
});
