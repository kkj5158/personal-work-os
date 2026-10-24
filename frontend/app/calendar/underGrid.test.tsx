import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeGrid, type UnscheduledPlan } from "./TimeGrid";
const unscheduled:UnscheduledPlan={id:"legacy",title:"과거 계획",date:"2026-10-19",startAt:null,endAt:null,domainType:"LIFE",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:"보존"};
test("default Calendar host hides old lanes and displays date-owned footer without deleting projection input",()=>{
 const records=[unscheduled];
 const html=renderToStaticMarkup(<TimeGrid days={[new Date(2026,9,19)]} blocks={[]} colorMode="ACTIVITY" phases={[]} projects={[]} interactionMode="plan" onBlockClick={()=>{}} onBlockTimeChange={()=>{}} unscheduledPlans={records} unscheduledItems={[]} showUnscheduled={false} footer={<section aria-label="하루 회고">0/100 🙂</section>}/>);
 assert.ok(html.includes("하루 회고"));assert.ok(html.includes("0/100"));assert.ok(!html.includes("data-unscheduled-date"));assert.ok(!html.includes("data-unscheduled-plan"));assert.ok(!html.includes("Actual 시간 미지정"));assert.deepEqual(records,[unscheduled]);
});
