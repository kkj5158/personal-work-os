import assert from 'node:assert/strict';
import {test} from 'node:test';
import {changeRange,monthDates,monthMarkers,monthWeeks,periodColumns,periodOf,periodWindow,placeRange,planMoveUndo,rangeRows,shiftPeriod,undatedTasks,weekProjectSpans} from './timeline';
import type {PlanDay,Project,Phase,WorkTask} from '../api/workflow';

const project=(id:string,patch:Partial<Project>={}):Project=>({id,title:id,status:'ACTIVE',startDate:null,endDate:null,color:'#4477aa',memo:null,order:0,...patch});
const phase=(id:string,projectId:string,patch:Partial<Phase>={}):Phase=>({id,projectId,title:id,status:'TODO',startDate:null,endDate:null,memo:null,order:0,...patch});
const task=(id:string,patch:Partial<WorkTask>={}):WorkTask=>({id,title:id,status:'TODO',projectId:'p',phaseId:null,priority:'NORMAL',startDate:null,dueDate:null,memo:null,order:0,deadlineDate:null,...patch});

test('day snapping keeps leap days and month boundaries',()=>{
 assert.equal(monthDates('2028-02').length,29);assert.equal(monthDates('2026-09').length,30);
 const range={start:'2026-09-29',end:'2026-10-03'};
 assert.deepEqual(changeRange(range,'move',1.7),{start:'2026-10-01',end:'2026-10-05'});
 assert.deepEqual(changeRange(range,'start',-2),{start:'2026-09-27',end:range.end});
 assert.deepEqual(changeRange(range,'end',3),{start:range.start,end:'2026-10-06'});
 assert.deepEqual(changeRange(range,'start',100),{start:range.end,end:range.end});
 assert.deepEqual(changeRange(range,'end',-100),{start:range.start,end:range.start});
});

test('periods: year = 12 months, quarter = exactly 13 Monday weeks, month grid = Monday-start weeks',()=>{
 assert.equal(periodOf('year','2026-09-27'),'2026');assert.equal(periodOf('quarter','2026-09-27'),'2026-Q3');assert.equal(periodOf('month','2026-09-27'),'2026-09');
 assert.equal(shiftPeriod('quarter','2026-Q4',1),'2027-Q1');assert.equal(shiftPeriod('month','2026-01',-1),'2025-12');assert.equal(shiftPeriod('year','2026',1),'2027');
 const year=periodColumns('year','2026');assert.equal(year.length,12);assert.equal(year.reduce((sum,column)=>sum+column.days,0),365);
 const quarter=periodWindow('quarter','2026-Q3');assert.equal(quarter.start,'2026-06-29','Monday on/before Jul 1');assert.equal(quarter.end,'2026-09-27');
 assert.equal(periodColumns('quarter','2026-Q3').length,13);
 const weeks=monthWeeks('2026-09');assert.equal(weeks[0][0],'2026-08-31');assert.ok(weeks.every(week=>week.length===7));assert.equal(weeks.at(-1)![6],'2026-10-04');
 assert.deepEqual(placeRange({start:'2026-12-20',end:'2027-01-10'},periodWindow('year','2026')),{offset:353,length:12,clippedStart:false,clippedEnd:true});
 assert.equal(placeRange({start:null,end:null},periodWindow('year','2026')),null);
});

test('Year shows Project ranges only; Quarter adds Phases; archived Projects and the Project filter are respected',()=>{
 const projects=[project('p',{startDate:'2026-02-01',endDate:'2026-05-31',order:1}),project('q',{order:0}),project('gone',{archivedAt:'2026-09-01T00:00:00Z'})];
 const phases=[phase('b','p',{order:1,startDate:'2026-03-01',endDate:'2026-03-20'}),phase('a','p',{order:0})];
 const year=rangeRows(projects,phases,{includePhases:false});
 assert.deepEqual(year.map(row=>`${row.kind}:${row.id}`),['project:q','project:p']);
 assert.equal(year[1].start,'2026-02-01');
 const quarter=rangeRows(projects,phases,{includePhases:true});
 assert.deepEqual(quarter.map(row=>row.id),['q','p','a','b'],'Phases follow manual order, never a sequential gate');
 assert.deepEqual(rangeRows(projects,phases,{includePhases:true,projectFilter:['p'],collapsed:new Set(['p'])}).map(row=>row.id),['p']);
});

test('Month markers: plan days per placement, deadlines from deadlineDate only, filters and archive',()=>{
 const tasks=[
  task('multi',{deadlineDate:'2026-09-18'}),
  task('legacy',{startDate:'2026-09-02',dueDate:'2026-09-09'}), // legacy range only: never a deadline or plan marker
  task('free',{projectId:null,deadlineDate:'2026-09-22'}),
  task('archived',{archivedAt:'2026-09-01T00:00:00Z',deadlineDate:'2026-09-10'}),
 ];
 const planDays:PlanDay[]=[{taskId:'multi',date:'2026-09-03',order:1},{taskId:'multi',date:'2026-09-05',order:0},{taskId:'archived',date:'2026-09-04',order:0},{taskId:'free',date:'2026-11-01',order:0}];
 const range={start:'2026-08-31',end:'2026-10-04'};
 const all=monthMarkers(range,tasks,planDays);
 assert.deepEqual([...all.plans.keys()].sort(),['2026-09-03','2026-09-05'],'same Task on two days = two placements, one identity');
 assert.deepEqual([...all.deadlines.entries()].map(([date,list])=>`${date}:${list[0].task.id}`).sort(),['2026-09-18:multi','2026-09-22:free']);
 assert.equal([...all.deadlines.values()].flat().some(marker=>marker.task.id==='legacy'),false,'legacy due_date is not a deadline');
 const plansOnly=monthMarkers(range,tasks,planDays,{layers:['PLAN']});assert.equal(plansOnly.deadlines.size,0);assert.equal(plansOnly.plans.size,2);
 const deadlinesOnly=monthMarkers(range,tasks,planDays,{layers:['DEADLINE']});assert.equal(deadlinesOnly.plans.size,0);assert.equal(deadlinesOnly.deadlines.size,2);
 const unassigned=monthMarkers(range,tasks,planDays,{projectFilter:['unassigned']});assert.equal(unassigned.plans.size,0);assert.deepEqual([...unassigned.deadlines.keys()],['2026-09-22']);
});

test('Month Project spans per week and the undated list (no plan day, no deadline)',()=>{
 const week=['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];
 const spans=weekProjectSpans(week,[project('p',{startDate:'2026-09-01',endDate:'2026-09-09'}),project('later',{startDate:'2026-10-01',endDate:'2026-10-09'})]);
 assert.deepEqual(spans.map(span=>[span.project.id,span.startColumn,span.endColumn,span.clippedStart,span.clippedEnd]),[['p',0,2,true,false]]);
 assert.equal(weekProjectSpans(week,[project('p',{startDate:'2026-09-01',endDate:'2026-09-09'})],['unassigned']).length,0);
 const undated=undatedTasks([task('none'),task('planned'),task('deadline',{deadlineDate:'2026-09-30'}),task('done',{status:'DONE'}),task('legacyOnly',{startDate:'2026-09-01',dueDate:'2026-09-02'})],[{taskId:'planned',date:'2026-09-10',order:0}]);
 assert.deepEqual(undated.map(item=>item.id),['legacyOnly','none'],'legacy range does not count as dated');
});

test('plan-move undo reverses a plain move, and re-adds the source after a merge (never removes the existing placement)',()=>{
 assert.deepEqual(planMoveUndo('t','2026-09-03','2026-09-05',false),{taskId:'t',kind:'move',from:'2026-09-05',to:'2026-09-03'});
 assert.deepEqual(planMoveUndo('t','2026-09-03','2026-09-05',true),{taskId:'t',kind:'add',date:'2026-09-03'});
});
