import assert from "node:assert/strict";
import {test} from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {JSDOM} from "jsdom";
import Record from "./Record";
import type {CheckChange,DietStore,Importance} from "@/lib/diet/types";
import {addDays,checklistStats,today} from "@/lib/diet/model";

const flush=()=>act(async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));});

test("independent filters, shared checklist grid, numeric records untouched, archive and restore",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost",pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const noop=async()=>{};const batches:CheckChange[][]=[];const deleted:string[]=[];const restored:string[]=[];const days:unknown[]=[];
 const items=(["CORE","SECONDARY","OPTIONAL"] as Importance[]).map((importance,i)=>({id:String(i),title:`item-${importance}`,importance,keyPoint:"",sortOrder:i,weeklyReference:null,monthlyReference:null,active:true,startDate:today()}));
 const store:DietStore={data:{days:[],checks:[],goals:[],milestones:[],challenges:[],settings:{},items:[...items,{...items[0],id:"9",title:"archived-item",active:false}],archivePeriods:[{itemId:"9",archivedOn:today(),restoredOn:null}]},busy:false,error:"",save:noop,remove:async(_,id)=>{deleted.push(id);},restore:async id=>{restored.push(id);},saveDay:async day=>{days.push(day);},saveCheck:noop,saveChecks:async changes=>{batches.push(changes);},saveSettings:noop,reorder:noop,reorderHome:noop};
 const root=createRoot(document.getElementById("root")!);
 const button=(label:string)=>{const b=document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)??[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label);assert.ok(b,label);return b;};
 await act(()=>root.render(<Record store={store}/>));
 // Numeric and checklist filters stay independent.
 await act(()=>button("수치 OPTIONAL").click());
 assert.equal(button("수치 OPTIONAL").getAttribute("aria-pressed"),"false");
 assert.equal(button("체크리스트 OPTIONAL").getAttribute("aria-pressed"),"true");
 await act(()=>button("체크리스트 SECONDARY").click());
 const checklist=document.querySelector('section[aria-label="체크리스트 기록"]')!;
 assert.ok(!checklist.textContent?.includes("item-SECONDARY"));
 assert.ok(!checklist.textContent?.includes("archived-item"),"archived items leave the active grid");
 const numeric=document.querySelector('section[aria-label="수치 기록"]')!;
 assert.ok(numeric.textContent?.includes("공복 시간"));assert.ok(!numeric.textContent?.includes("허리둘레"));
 // Shared grid: one full-cell button per cell, no legacy ✓/×/기록 못함 group, no per-cell checkboxes.
 assert.ok(checklist.querySelector('table[aria-label="DIET 체크리스트 기록"]'));
 assert.equal(checklist.querySelectorAll('td input[type="checkbox"]').length,0);
 assert.equal([...checklist.querySelectorAll("td button")].filter(b=>b.textContent==="기록 못함").length,0);
 const cell=checklist.querySelector<HTMLButtonElement>(`[data-cell][aria-label^="${today()} item-CORE"]`)!;
 await act(async()=>{cell.dispatchEvent(new dom.window.MouseEvent("pointerdown",{bubbles:true,button:0,buttons:1}));dom.window.dispatchEvent(new dom.window.MouseEvent("pointerup",{bubbles:true}));});
 await flush();
 assert.deepEqual(batches.at(-1),[{date:today(),itemId:"0",state:"SUCCESS"}],"one atomic batch through the shared write path");
 // Future cells are not editable.
 const future=checklist.querySelector<HTMLButtonElement>(`[data-cell][aria-label^="${addDays(today(),1)} item-CORE"]`);
 if(future)assert.equal(future.dataset.availability,"FUTURE");
 // Numeric input still saves through its own path.
 assert.equal(days.length,0);
 // Delete = archive (confirmation explains preserved history); archived items can be restored.
 await act(()=>button("항목 관리").click());await act(()=>button("item-CORE 삭제").click());
 assert.equal(deleted.length,0);assert.ok(document.body.textContent?.includes("기존 기록과 통계는 보존"));
 await act(async()=>{button("보관(삭제) 확인").click();await new Promise(resolve=>setImmediate(resolve));});assert.deepEqual(deleted,["0"]);
 await act(()=>button("항목 관리").click());
 await act(async()=>{button("archived-item 복원").click();await new Promise(resolve=>setImmediate(resolve));});assert.deepEqual(restored,["9"]);
 await act(()=>root.unmount());dom.window.close();
});

test("archived intervals are excluded from DIET checklist statistics; NOT_RECORDED leaves the denominator",()=>{
 const item={id:"i",title:"x",importance:"CORE" as const,keyPoint:"",sortOrder:0,weeklyReference:null,monthlyReference:null,active:true,startDate:"2026-09-01"};
 const data={days:[],goals:[],milestones:[],challenges:[],settings:{},items:[item],archivePeriods:[{itemId:"i",archivedOn:"2026-09-03",restoredOn:"2026-09-06"}],
  checks:[{date:"2026-09-01",itemId:"i",state:"SUCCESS" as const,memo:""},{date:"2026-09-02",itemId:"i",state:"UNRECORDED" as const,memo:""},{date:"2026-09-06",itemId:"i",state:"FAILURE" as const,memo:""}]};
 const stats=checklistStats(data,["i"],"2026-09-01","2026-09-07",true,"2026-09-07");
 assert.equal(stats.eligible,4);// 7 days − 3 archived days
 assert.equal(stats.unrecorded,1);assert.equal(stats.failure,1);assert.equal(stats.missing,1);
 assert.equal(stats.rate,(1/3)*100);
});
