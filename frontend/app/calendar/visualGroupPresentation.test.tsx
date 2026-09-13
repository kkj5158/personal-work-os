import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { VisualGroupLayer, VisualGroupPeriodBands } from "./VisualGroupLayer";
import { visualGroupBands, visualGroupHeader, visualGroupRuns } from "./visualGroupPresentation";
import { newVisualGroup } from "./visualGroups";
import { TimeGrid } from "./TimeGrid";
import { EMPTY_PREFERENCES, groupsVisible } from "./appearance";

Object.assign(globalThis, { React });
const dates = Array.from({ length: 7 }, (_, i) => `2026-09-${14+i}`);
const group = { ...newVisualGroup(dates[0], 900, 1080), id: "same-entity", title: "스터디카페 근무", endDate: dates[6], weekdays: [1,2,3,4,5] };

test("Week merges Mon–Fri and splits Mon / Wed–Thu / Sat without bridging OFF dates", () => {
  const runs = visualGroupRuns([group], dates);
  assert.deepEqual(runs.map(r=>[r.first,r.last]), [[0,4]]);
  assert.equal(visualGroupHeader(runs[0],dates), "스터디카페 근무 · 월–금 · 15:00–18:00");
  const sparse = {...group,weekdays:[1,3,4,6]};
  assert.deepEqual(visualGroupRuns([sparse],dates).map(r=>[r.first,r.last,r.slice.group.id]), [[0,0,group.id],[2,3,group.id],[5,5,group.id]]);
  assert.deepEqual(visualGroupBands([sparse],dates).map(r=>[r.first,r.last]), [[0,0],[2,3],[5,5]]);
  const doc = new JSDOM(renderToStaticMarkup(<VisualGroupLayer groups={[group]} dates={dates} scale={1} onSelect={()=>{}} />)).window.document;
  assert.equal(doc.querySelectorAll('[data-visual-group]').length,1);
  assert.equal(doc.querySelector('[data-group-last-date]')?.getAttribute('data-group-last-date'),dates[4]);
});

test("Day renders only active slices; ALL_DAY is represented by a clipped period band", () => {
  assert.equal(visualGroupRuns([group],[dates[0]]).length,1);
  assert.equal(visualGroupRuns([group],[dates[5]]).length,0);
  const allDay = {...group,timeRule:"ALL_DAY" as const,startDate:"2026-09-01",endDate:dates[2]};
  const bands=visualGroupBands([allDay],dates);
  assert.deepEqual(bands.map(b=>[b.first,b.last,b.slice.group.id]),[[0,2,group.id]]);
  const doc=new JSDOM(renderToStaticMarkup(<><VisualGroupPeriodBands groups={[allDay]} dates={dates} scale={1} onSelect={()=>{}}/><VisualGroupLayer groups={[allDay]} dates={dates} scale={1} onSelect={()=>{}}/></>)).window.document;
  assert.equal(doc.querySelectorAll('[data-group-band]').length,1);
  assert.equal(doc.querySelectorAll('[data-visual-group]').length,0);
});

test("all run headers and frames select the same original entity; handles are selection-only", async () => {
  const dom=new JSDOM("<div id='root'></div>");
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);
  const sparse={...group,weekdays:[1,3,4,6]}, selected:string[]=[];
  const props={groups:[sparse],dates,scale:1,onSelect:(g:typeof group)=>{assert.equal(g,sparse);selected.push(g.id);},onPointerDown:()=>{}};
  await act(()=>root.render(<VisualGroupLayer {...props}/>));
  assert.equal(document.querySelectorAll('.cal-group-edge').length,0);
  for(const button of document.querySelectorAll<HTMLButtonElement>('.cal-group-drag,.cal-group-frame.left')) await act(()=>button.click());
  assert.deepEqual(selected,Array(6).fill(group.id));
  await act(()=>root.render(<VisualGroupLayer {...props} selectedId={group.id}/>));
  assert.equal(document.querySelectorAll('.cal-group-edge').length,6);
  await act(()=>root.unmount());dom.window.close();
});

test("group containers leave Activity styles and mode defaults unchanged", () => {
  const block={id:"activity",title:"Activity",domainType:"WORK" as const,startAt:`${dates[0]}T15:30:00`,endAt:`${dates[0]}T16:30:00`,activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null};
  const props={days:dates.map(d=>new Date(`${d}T00:00:00`)),blocks:[block],colorMode:"ACTIVITY" as const,phases:[],projects:[],interactionMode:"plan" as const,onBlockClick:()=>{},onBlockTimeChange:()=>{}};
  const plain=new JSDOM(renderToStaticMarkup(<TimeGrid {...props}/>)).window.document;
  const decorated=new JSDOM(renderToStaticMarkup(<TimeGrid {...props} visualGroups={[group]}/>)).window.document;
  assert.equal(plain.querySelector('[data-calendar-block]')?.getAttribute('style'),decorated.querySelector('[data-calendar-block]')?.getAttribute('style'));
  assert.deepEqual(["plan","actual","compare"].map(m=>groupsVisible(EMPTY_PREFERENCES,m as "plan"|"actual"|"compare")),[true,true,false]);
});
