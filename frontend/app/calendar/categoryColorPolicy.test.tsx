import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calendarCategories, categoryAppearance, defaultColor, EMPTY_PREFERENCES, legacyColorImports, readPreferences, UNKNOWN_CATEGORY_COLOR, type CalendarCategory } from "./appearance";
import { CalendarRail } from "./CalendarRail";
import { TimeGrid } from "./TimeGrid";
import type { GridBlock } from "./gridTypes";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
Object.assign(globalThis,{React});

const server = (ids:{root:string;child:string}) => calendarCategories([
  {id:ids.root,name:"개발",parentId:null,sortOrder:0,isActive:true,isDefault:false,color:"#679aa7",colorCustomized:false},
  {id:ids.child,name:"Project Orbit",parentId:ids.root,sortOrder:0,isActive:true,isDefault:true,color:null,colorCustomized:false},
  {id:"other",name:"업무",parentId:null,sortOrder:1,isActive:true,isDefault:false,color:"#48a78a",colorCustomized:false},
],[]);

test("the persisted server color is the identity, independent of environment UUIDs, order and name", () => {
  const dev = server({root:"dev-root",child:"dev-child"}), prod = server({root:"prod-root",child:"prod-child"});
  assert.deepEqual(categoryAppearance("WORK","dev-child",dev), categoryAppearance("WORK","prod-child",prod));
  assert.deepEqual(categoryAppearance("WORK","dev-child",dev), {parent:"#679aa7",body:"#679aa7"});
  const reordered = [...dev].reverse().map(c => ({...c,sortOrder:10 - c.sortOrder}));
  const renamed = dev.map(c => c.id === "dev-root" ? {...c,name:"완전히 새 이름"} : c);
  assert.deepEqual(categoryAppearance("WORK","dev-child",reordered), categoryAppearance("WORK","dev-child",dev));
  assert.deepEqual(categoryAppearance("WORK","dev-root",renamed), categoryAppearance("WORK","dev-root",dev));
  assert.equal(categoryAppearance("WORK","other",dev).body, "#48a78a");
});

test("browser-local overrides never replace the server color; they only feed the one-time import", () => {
  const categories = server({root:"root",child:"child"});
  const stored = readPreferences(JSON.stringify({colors:{"WORK:root":"#ABCDEF","WORK:other":"#48a78a","WORK:deleted":"#111111"}}));
  assert.equal(categoryAppearance("WORK","root",categories).body, "#679aa7");
  assert.deepEqual(legacyColorImports(stored,categories).map(i => [i.category.id,i.color]), [["root","#abcdef"]]);
  assert.deepEqual(legacyColorImports(EMPTY_PREFERENCES,categories), []);
});

test("uncategorized and unknown rows resolve to fixed colors, never a UUID hash", () => {
  assert.deepEqual(categoryAppearance("WORK",null,[]), {parent:defaultColor("WORK:uncategorized"),body:defaultColor("WORK:uncategorized")});
  assert.equal(categoryAppearance("WORK","missing-uuid",[]).body, UNKNOWN_CATEGORY_COLOR);
});

test("rail swatch and Calendar block derive from the same persisted color", () => {
  const categories:CalendarCategory[] = server({root:"root",child:"child"}).map(c => c.id === "child" ? {...c,color:"#aabbcc"} : c);
  const router = {push:()=>{}} as unknown as React.ContextType<typeof AppRouterContext>;
  const rail = renderToStaticMarkup(<AppRouterContext.Provider value={router}><CalendarRail date={new Date(2026,8,9)} week categories={categories} prefs={EMPTY_PREFERENCES} onPreferences={()=>{}} onCategoryColor={()=>{}} onDate={()=>{}} stateVisible onState={()=>{}} onNavigate={()=>{}}/></AppRouterContext.Provider>);
  const block:GridBlock = {id:"b",domainType:"WORK",title:"Work",startAt:"2026-09-09T10:00:00",endAt:"2026-09-09T11:00:00",activityCategoryId:"child",lifeCategoryId:null,phaseId:null,memo:null,sourceType:"WORK_TIME_ENTRY"};
  const grid = renderToStaticMarkup(<TimeGrid days={[new Date(2026,8,9)]} blocks={[block]} colorMode="ACTIVITY" projects={[]} phases={[]} interactionMode="actual" onBlockClick={()=>{}} onBlockTimeChange={()=>{}} appearance={b => categoryAppearance(b.domainType,b.activityCategoryId,categories)}/>);
  assert.match(rail, /background-color:#aabbcc/);
  assert.match(rail, /background-color:#679aa7/);
  assert.match(grid, /border-color:#679aa7/);
  assert.match(grid, /color-mix\(in srgb, #aabbcc 48%, white\)/);
});
