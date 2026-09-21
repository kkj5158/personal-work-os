import { test } from "node:test";
import assert from "node:assert/strict";
import { goalTrajectory, weightAnalytics } from "./weightAnalytics";
import type { DietData, WeightGoal } from "./types";
const goal:WeightGoal={id:"w",kind:"WEEKLY",targetDate:"2026-09-11",targetWeight:90,baselineDate:"2026-09-01",baselineWeight:100,core:"",memoItems:[]};
const data:DietData={days:[],items:[],checks:[],challenges:[],milestones:[],goals:[goal],settings:{}};
test("goal connects fixed baseline and target with date-based interpolation, without extrapolation",()=>{
 assert.deepEqual(goalTrajectory(goal,["2026-08-31","2026-09-01","2026-09-03","2026-09-06","2026-09-11","2026-09-12"]),[null,100,98,95,90,null]);
});
test("actual weight additions and edits cannot move a goal trajectory",()=>{
 const before=weightAnalytics(data,"2026-09-01","2026-09-11").series.filter(s=>s.targetTrend);
 for(const morningWeight of [120,70]) assert.deepEqual(weightAnalytics({...data,days:[{date:"2026-09-06",morningWeight}]},"2026-09-01","2026-09-11").series.filter(s=>s.targetTrend),before);
});
test("day week month and clipped ranges sample the same reference plan",()=>{
 for(const [start,end] of [["2026-09-06","2026-09-06"],["2026-09-03","2026-09-09"],["2026-09-01","2026-09-30"]]){
  const chart=weightAnalytics(data,start,end);const series=chart.series.find(s=>s.name.startsWith("주 목표 계획"))!;
  assert.equal(series.values[chart.dates.indexOf("2026-09-06")],95);
 }
});
test("invalid or missing baselines skip trajectories safely while keeping reference levels",()=>{
 for(const invalid of [{...goal,baselineDate:null},{...goal,baselineDate:"bad-date"},{...goal,baselineDate:"2026-02-30"},{...goal,baselineWeight:null},{...goal,baselineWeight:NaN},{...goal,baselineDate:goal.targetDate},{...goal,baselineDate:"2026-10-01"}]){
  assert.equal(goalTrajectory(invalid,["2026-09-06"]),null);
  const chart=weightAnalytics({...data,goals:[invalid]});assert.equal(chart.series.filter(s=>s.name.includes("계획")).length,0);assert.equal(chart.lines.length,1);
 }
});
test("multiple goals retain separate baseline pairs and respect existing visibility settings",()=>{
 const second={...goal,id:"m",kind:"MONTHLY" as const,baselineDate:"2026-09-03",baselineWeight:80,targetWeight:72};
 const chart=weightAnalytics({...data,goals:[goal,second]},"2026-09-01","2026-09-11");
 const series=chart.series.filter(s=>s.name.includes("계획"));assert.equal(series.length,2);assert.equal(series[0].values[2],98);assert.equal(series[1].values[2],80);
 assert.equal(weightAnalytics({...data,settings:{hiddenGoalLines:["WEEKLY"]}}).series.filter(s=>s.name.includes("계획")).length,0);
});
