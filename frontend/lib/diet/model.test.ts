import {test} from "node:test";
import assert from "node:assert/strict";
import {average,challengeProgress,checklistStats,latestWeight,weekStart,monthEnd} from "./model";
import type {Challenge,DietData,ChecklistItem} from "./types";
const item=(id:string,startDate="2026-09-01"):ChecklistItem=>({id,title:id,importance:"CORE",keyPoint:"",sortOrder:0,weeklyReference:6,monthlyReference:24,active:true,startDate});
const data:DietData={days:[{date:"2026-09-01",morningWeight:100},{date:"2026-09-03",morningWeight:98},{date:"2026-09-20",morningWeight:80}],items:[item("a"),item("b","2026-09-03")],checks:[{itemId:"a",date:"2026-09-01",state:"SUCCESS",memo:""},{itemId:"a",date:"2026-09-02",state:"FAILURE",memo:""},{itemId:"b",date:"2026-09-03",state:"SUCCESS",memo:""}],goals:[],challenges:[],milestones:[],settings:{}};
const base:Challenge={id:"c",role:"CURRENT_FOCUS",homeSortOrder:0,title:"c",type:"CHECKLIST",status:"ACTIVE",startDate:"2026-09-01",endDate:"2026-09-30",color:"#000000",keyPoint:"",notes:[],sortOrder:0,startWeight:100,targetWeight:90,itemIds:["a","b"],goalMode:"RATE",includeMissing:true,currentValue:0,targetValue:80};
test("missing denominator includes only elapsed eligible dates, item start respected",()=>{const s=checklistStats(data,["a","b"],"2026-09-01","2026-09-30",true,"2026-09-03");assert.deepEqual(s,{success:2,failure:1,eligible:4,unrecorded:0,missing:1,rate:50});assert.ok(Math.abs(checklistStats(data,["a","b"],"2026-09-01","2026-09-30",false,"2026-09-03").rate!-200/3)<1e-9);assert.equal(checklistStats(data,["a"],"2026-10-01","2026-10-31",true,"2026-09-03").eligible,0);});
// Archive policy: a legacy item deactivated without an interval is archived after its last record, so its later
// untouched days are no longer "missing" (a: 9/1 S, 9/2 F, 9/3 archived → 2 of 3 eligible item-days succeed).
test("challenge snapshot survives importance/active changes",()=>{const updated={...data,items:data.items.map(i=>({...i,importance:"OPTIONAL" as const,active:false}))};assert.ok(Math.abs(challengeProgress(base,updated,"2026-09-03").current!-200/3)<1e-9);assert.equal(challengeProgress(base,{...data,items:data.items.map(i=>({...i,importance:"OPTIONAL" as const}))},"2026-09-03").current,50);assert.equal(challengeProgress({...base,goalMode:"COUNT",targetValue:4},updated,"2026-09-03").progress,50);});
test("weight ignores future rows and progress clamps when target exceeded",()=>{assert.equal(latestWeight(data.days,"2026-09-03"),98);const p=challengeProgress({...base,type:"WEIGHT"},data,"2026-09-03");assert.equal(p.lost,2);assert.equal(p.remaining,8);assert.equal(p.progress,20);assert.equal(challengeProgress({...base,type:"WEIGHT"},data,"2026-09-21").progress,100);});
test("averages exclude blank measurements, retain zero",()=>{assert.equal(average([null,undefined,0,10]),5);assert.equal(average([null]),null);});
test("Seoul date keys use Monday weeks and leap-month boundaries",()=>{assert.equal(weekStart("2026-09-13"),"2026-09-07");assert.equal(monthEnd("2028-02-15"),"2028-02-29");});

test("unrecorded is distinct from failure and missing even when missing is included",()=>{
 const records={...data,checks:[...data.checks,{itemId:"a",date:"2026-09-03",state:"UNRECORDED" as const,memo:"travel"}]};
 const stats=checklistStats(records,["a","b"],"2026-09-01","2026-09-03",true,"2026-09-03");
 assert.equal(stats.unrecorded,1);assert.equal(stats.failure,1);assert.equal(stats.missing,0);assert.equal(stats.eligible,4);assert.ok(Math.abs(stats.rate!-200/3)<1e-9);
 assert.equal(checklistStats({...records,items:records.items.map(i=>({...i,active:false}))},["a","b"],"2026-09-01","2026-09-03",false,"2026-09-03").rate,stats.rate);
 assert.equal(checklistStats(records,["a"],"2026-09-03","2026-09-03",true,"2026-09-03").rate,null);
});
