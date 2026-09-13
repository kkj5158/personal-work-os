import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { copyCalendarItems,pasteCandidates,selectCalendarItem,isCalendarTextTarget,type ClipboardItem,type CalendarRef } from "./clipboard";
import { newVisualGroup } from "./visualGroups";
const plan=(start:string,end:string):ClipboardItem=>({kind:"PLAN",plan:{title:"Plan",domainType:"WORK",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:"memo",startAt:start,endAt:end}});
test("selection adds/removes by source identity, normal click replaces, clearing is empty",()=>{
  const a:CalendarRef={kind:"PLAN",id:"one"},b:CalendarRef={kind:"ACTUAL",sourceType:"LIFE_TIME_ENTRY",id:"one"};
  let selected=selectCalendarItem([],a);selected=selectCalendarItem(selected,b,true);assert.equal(selected.length,2);
  assert.deepEqual(selectCalendarItem(selected,a,true),[b]);assert.deepEqual(selectCalendarItem(selected,a),[a]);
});
test("three Planning blocks preserve exact gaps, five-minute offsets and cross-day timing",()=>{
  const source=[plan("2026-09-14T09:05:00","2026-09-14T09:40:00"),plan("2026-09-14T10:30:00","2026-09-14T11:00:00"),plan("2026-09-15T13:00:00","2026-09-15T14:00:00")];
  const clip=copyCalendarItems(source),result=pasteCandidates(clip,{date:"2026-09-17",minute:900});
  assert.deepEqual(result.map(i=>i.kind==="PLAN" && [i.plan.startAt,i.plan.endAt]),[["2026-09-17T15:00:00","2026-09-17T15:35:00"],["2026-09-17T16:25:00","2026-09-17T16:55:00"],["2026-09-18T18:55:00","2026-09-18T19:55:00"]]);
  assert.equal(pasteCandidates(clip,{date:"2026-09-17"})[0].kind,"PLAN");assert.equal(source[0].kind==="PLAN" && source[0].plan.startAt,"2026-09-14T09:05:00");
});
test("group date span, weekday pattern, overrides and continuous duration shift without membership",()=>{
  const group={...newVisualGroup("2026-09-14",545,610),title:"Group",endDate:"2026-09-18",weekdays:[1,3,4]};
  const shifted=pasteCandidates(copyCalendarItems([{kind:"GROUP",group}]),{date:"2026-09-15",minute:840})[0];
  assert.equal(shifted.kind,"GROUP");if(shifted.kind!=="GROUP")return;
  assert.deepEqual(shifted.group.weekdays,[2,4,5]);assert.equal(shifted.group.endDate,"2026-09-19");assert.equal(shifted.group.startTime,"14:00");assert.equal(shifted.group.endTime,"15:05");assert.equal("id" in shifted.group,false);
  const per={...group,timeRule:"PER_DAY" as const,startTime:null,endTime:null,days:[{date:"2026-09-14",enabled:true,startTime:"09:05",endTime:"10:10"}]};
  const p=pasteCandidates(copyCalendarItems([{kind:"GROUP",group:per}]),{date:"2026-09-16"})[0];assert.equal(p.kind==="GROUP" && p.group.days[0].date,"2026-09-16");
  const continuous={...group,timeRule:"CONTINUOUS" as const,startTime:"23:05",endTime:"06:10"};
  const c=pasteCandidates(copyCalendarItems([{kind:"GROUP",group:continuous}]),{date:"2026-09-16",minute:15})[0];assert.equal(c.kind==="GROUP" && c.group.endDate,"2026-09-19");
});
test("Actual keeps source type, duration and unscheduled shape; midnight crossing remains invalid",()=>{
  const actual:ClipboardItem={kind:"ACTUAL",sourceType:"SUPPLEMENTAL_WORK_ENTRY",actual:{title:"Work",date:"2026-09-14",categoryId:"category",phaseId:null,memo:"memo",durationMinutes:35,startTime:"09:05",endTime:"09:40"}};
  const result=pasteCandidates(copyCalendarItems([actual]),{date:"2026-09-15",minute:1425})[0];assert.equal(result.kind==="ACTUAL" && result.actual.endTime,"00:20");
  const unscheduled={...actual,actual:{...actual.actual,startTime:null,endTime:null}};
  const u=pasteCandidates(copyCalendarItems([unscheduled]),{date:"2026-09-16",minute:600})[0];assert.equal(u.kind==="ACTUAL" && u.actual.startTime,null);assert.equal(u.kind==="ACTUAL" && u.actual.durationMinutes,35);
});
test("native/editor text targets are excluded from shortcuts",()=>{
  const dom=new JSDOM('<input/><textarea></textarea><select></select><div contenteditable="true"><span>text</span></div><button>Calendar</button>');
  Object.assign(globalThis,{Element:dom.window.Element});
  for(const selector of ["input","textarea","select","span"])assert.equal(isCalendarTextTarget(dom.window.document.querySelector(selector)),true);
  assert.equal(isCalendarTextTarget(dom.window.document.querySelector("button")),false);dom.window.close();
});
