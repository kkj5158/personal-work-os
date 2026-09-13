import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { activeDayStart, snapCreate, snapMove, snapResize } from "./overview";
import { newEditor, validateEditor } from "./editorModel";
import { observedRange } from "./statePolicy";
import { readPreferences, recentColor, EMPTY_PREFERENCES } from "./appearance";
import { TimeGrid } from "./TimeGrid";
import { CalendarEditor } from "./CalendarEditor";
import { ReflectionMetrics } from "./ReflectionMetrics";
import { ReflectionTimeline } from "./ReflectionTimeline";
import type { ReflectionSnapshotDto } from "@/lib/api/types";
Object.assign(globalThis,{React});
test("5m data stays exact; 15m gestures preserve offsets and boundaries",()=>{
  assert.equal(snapCreate(608),615);assert.equal(snapMove(605,15,90),620);
  assert.equal(snapMove(605,-15,90),590);assert.equal(snapMove(5,-30,90),5);
  assert.equal(snapResize(695,15,605),710);
  assert.equal(validateEditor({...newEditor("actual","2026-09-10",605,695),title:"Work",categoryId:"work-category"}),null);
  assert.match(validateEditor({...newEditor("actual","2026-09-10",606,695),title:"Work",categoryId:"work-category"})!,/5분/);
});
test("State needs observed range and state type, description is optional",()=>{
  assert.equal(validateEditor(newEditor("state","2020-01-01",600,605)),null);
  assert.match(validateEditor(newEditor("state","2099-01-01",600,605))!,/미래/);
  assert.equal(observedRange("2026-09-10","10:05",new Date("2026-09-10T01:04:00Z")),false);
  const html=renderToStaticMarkup(<CalendarEditor value={newEditor("state","2020-01-01",600,605)} date="2020-01-01" categories={[]} status="" error={null} guard={false} busy={false} onChange={()=>{}} onSave={()=>{}} onFlush={()=>{}} onDelete={()=>{}} onClose={()=>{}} onDiscard={()=>{}} onContinue={()=>{}}/>);
  assert.ok(!html.includes('aria-label="제목"'));assert.ok(html.includes('한줄 설명'));assert.ok(html.includes('안정'));assert.ok(html.includes('step="300"'));
});
test("mode defaults and independent State persist with bounded recent colors",()=>{
  assert.equal(readPreferences(null).mode,"actual");assert.equal(readPreferences('{"mode":"bad"}').mode,"actual");
  const prefs=readPreferences('{"mode":"plan","stateVisible":true}');assert.equal(prefs.mode,"plan");assert.equal(prefs.stateVisible,true);
  assert.deepEqual(recentColor(["#abcdef","#123456"],"#ABCDEF"),["#abcdef","#123456"]);
  assert.equal(recentColor(Array.from({length:12},(_,i)=>`#0000${String(i).padStart(2,"0")}`),"#ffffff").length,8);
});
test("active day ignores long overnight blocks; week overview shows all 7 exact columns",()=>{
  assert.equal(activeDayStart([{start:0,end:480},{start:540,end:600}]),480);
  assert.equal(activeDayStart([{start:0,end:1380}]),420);
  const block={id:"five",title:"정밀",domainType:"WORK" as const,startAt:"2026-09-07T10:05:00",endAt:"2026-09-07T11:35:00",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null};
  const doc=new JSDOM(renderToStaticMarkup(<TimeGrid days={Array.from({length:7},(_,i)=>new Date(2026,8,7+i))} blocks={[block]} interactionMode="actual" colorMode="ACTIVITY" phases={[]} projects={[]} onBlockClick={()=>{}} onBlockTimeChange={()=>{}} overview/>)).window.document;
  assert.equal(doc.querySelectorAll('[data-calendar-date]').length,7);
  assert.equal(doc.querySelector<HTMLElement>('[data-calendar-block]')!.style.top,`${605*.55}px`);
  assert.ok(!doc.body.innerHTML.includes('692px'));assert.equal(doc.querySelector('[aria-label="종료 시간 조절"]'),null);
});
const snapshot:ReflectionSnapshotDto={date:"2026-09-10",generatedAt:"2026-09-10T20:00:00",plannedBlocks:[],actualBlocks:[{sourceId:"1",startTime:"10:05:00",endTime:"11:35:00",durationMinutes:90,label:"<script>bad</script>",categoryId:null,categoryLabel:null,semanticType:"WORK"}],stateBlocks:[{startTime:"10:00",endTime:"11:00",stateGroup:"STABLE",label:""}],workSummary:{plannedMinutes:0,actualMinutes:90},lifeSummary:{plannedMinutes:0,actualMinutes:0},checklistSummary:{completed:0,total:0}};
test("Reflection without plan hides difference; structured snapshot escapes text",()=>{
  const metrics=renderToStaticMarkup(<ReflectionMetrics snapshot={snapshot}/>);assert.ok(metrics.includes('계획 없음'));assert.ok(!metrics.includes('실제 − 계획'));assert.ok(metrics.includes('안정'));
  const timeline=renderToStaticMarkup(<ReflectionTimeline snapshot={snapshot} categories={[]} prefs={EMPTY_PREFERENCES}/>);assert.ok(!timeline.includes('<script>'));assert.ok(timeline.includes('&lt;script&gt;'));assert.ok(timeline.includes('STATE'));assert.ok(timeline.includes('data-reflection-axis'));
});
