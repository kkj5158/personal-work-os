import type {PlanDay,Project,Phase,WorkTask} from '../api/workflow';
import {mondayOf} from './store';
export type Range={start:string;end:string};
export type TimelineMode='move'|'start'|'end';
const DAY=86400000;
export const dayNumber=(date:string)=>Date.parse(`${date}T00:00:00Z`)/DAY;
export const addDays=(date:string,days:number)=>new Date((dayNumber(date)+days)*DAY).toISOString().slice(0,10);
export const daysBetween=(start:string,end:string)=>dayNumber(end)-dayNumber(start);
export function monthDates(month:string){const first=`${month}-01`;const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return Array.from({length:count},(_,i)=>addDays(first,i));}
export function changeRange(range:Range,mode:TimelineMode,delta:number):Range{
 const days=Math.round(delta);
 if(mode==='move')return {start:addDays(range.start,days),end:addDays(range.end,days)};
 if(mode==='start')return {start:dayNumber(addDays(range.start,days))>dayNumber(range.end)?range.end:addDays(range.start,days),end:range.end};
 return {start:range.start,end:dayNumber(addDays(range.end,days))<dayNumber(range.start)?range.start:addDays(range.end,days)};
}
const colors:Record<string,string>={blue:'#5b8bd3',green:'#5b9a76',purple:'#9678c5',orange:'#d9a158',red:'#ca6c77',slate:'#8491a4',teal:'#4c9a9a',pink:'#c57aab'};
export function projectColor(color:string){return /^#[0-9a-f]{6}$/i.test(color)?color:colors[color]??colors.blue;}
export const NEUTRAL_COLOR=colors.slate;

/*
 * S09 Timeline: one projection/editor over the canonical data at several resolutions.
 *   Year    = Project planned ranges across 12 months
 *   Quarter = Project + Phase planned ranges across 13 weeks
 *   Month   = Project spans + Task plan-day markers + semantic deadline markers
 *   Week    = the Batch 3 weekday board (S05), Today = Workpad — not re-implemented here.
 * Each editable mark writes only the entity it represents; a parent move never cascades to children.
 */
export type TimelineView='year'|'quarter'|'month';
export const TIMELINE_VIEW_LABELS:Record<TimelineView,string>={year:'연간',quarter:'분기',month:'월간'};

/** Period keys: year '2026', quarter '2026-Q3', month '2026-09'. */
export function periodOf(view:TimelineView,date:string):string{
 const year=date.slice(0,4),month=Number(date.slice(5,7));
 return view==='year'?year:view==='quarter'?`${year}-Q${Math.floor((month-1)/3)+1}`:date.slice(0,7);
}
/** The first day of a period, used to keep the same moment when switching resolution. */
export function periodAnchor(period:string):string{
 if(/^\d{4}$/.test(period))return `${period}-01-01`;
 const quarter=/^(\d{4})-Q([1-4])$/.exec(period);
 if(quarter)return `${quarter[1]}-${String((Number(quarter[2])-1)*3+1).padStart(2,'0')}-01`;
 return `${period.slice(0,7)}-01`;
}
export function isPeriod(view:TimelineView,value:string|null):value is string{
 if(!value)return false;
 return view==='year'?/^\d{4}$/.test(value):view==='quarter'?/^\d{4}-Q[1-4]$/.test(value):/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
export function shiftPeriod(view:TimelineView,period:string,delta:number):string{
 const anchor=periodAnchor(period),year=Number(anchor.slice(0,4)),month=Number(anchor.slice(5,7))-1;
 const months=view==='year'?12:view==='quarter'?3:1,total=year*12+month+delta*months;
 return periodOf(view,`${Math.floor(total/12)}-${String(total%12+1).padStart(2,'0')}-01`);
}
export function periodLabel(view:TimelineView,period:string):string{
 const anchor=periodAnchor(period);
 if(view==='year')return `${period}년`;
 if(view==='quarter')return `${anchor.slice(0,4)}년 ${period.slice(-1)}분기`;
 return `${anchor.slice(0,4)}년 ${Number(anchor.slice(5,7))}월`;
}

/** The visible window of a Year / Quarter period. A quarter is exactly 13 weeks from the Monday on/before its first day. */
export function periodWindow(view:'year'|'quarter',period:string):Range{
 if(view==='year')return {start:`${period}-01-01`,end:`${period}-12-31`};
 const start=mondayOf(periodAnchor(period));
 return {start,end:addDays(start,13*7-1)};
}
/** Header columns: 12 months for a year, 13 week starts (Mondays) for a quarter. Each has its day span in the window. */
export function periodColumns(view:'year'|'quarter',period:string):{key:string;label:string;start:string;days:number}[]{
 const window=periodWindow(view,period);
 if(view==='quarter')return Array.from({length:13},(_,index)=>{const start=addDays(window.start,index*7);return {key:start,label:`${Number(start.slice(5,7))}.${Number(start.slice(8))}`,start,days:7};});
 return Array.from({length:12},(_,index)=>{const key=`${period}-${String(index+1).padStart(2,'0')}`;return {key,label:`${index+1}월`,start:`${key}-01`,days:monthDates(key).length};});
}
/** Position of a range inside a window in days, or null when it does not overlap. Offsets are clipped to the window. */
export function placeRange(range:{start?:string|null;end?:string|null}|null,window:Range):{offset:number;length:number;clippedStart:boolean;clippedEnd:boolean}|null{
 if(!range?.start||!range.end||range.end<window.start||range.start>window.end)return null;
 const start=range.start<window.start?window.start:range.start,end=range.end>window.end?window.end:range.end;
 return {offset:daysBetween(window.start,start),length:daysBetween(start,end)+1,clippedStart:range.start<window.start,clippedEnd:range.end>window.end};
}

export type RangeRow={kind:'project'|'phase';id:string;projectId:string;title:string;color:string;status:string;start:string|null;end:string|null;depth:number;done:boolean;hasChildren:boolean};
/**
 * Year rows = Projects; Quarter rows = Projects with their Phases. Archived Projects are left out of active
 * planning views. Phases are optional categories, listed in their manual order — never a sequential gate.
 */
export function rangeRows(projects:Project[],phases:Phase[],options:{includePhases:boolean;projectFilter?:string[];collapsed?:ReadonlySet<string>}):RangeRow[]{
 const rows:RangeRow[]=[],filter=options.projectFilter??[];
 const ordered=<T extends {order:number;id:string}>(items:T[])=>[...items].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
 for(const project of ordered(projects.filter(item=>!item.archivedAt&&(!filter.length||filter.includes(item.id))))){
  const color=projectColor(project.color),children=options.includePhases?ordered(phases.filter(phase=>phase.projectId===project.id)):[];
  rows.push({kind:'project',id:project.id,projectId:project.id,title:project.title,color,status:project.status,start:project.startDate,end:project.endDate,depth:0,done:project.status==='DONE',hasChildren:children.length>0});
  if(options.collapsed?.has(project.id))continue;
  for(const phase of children)rows.push({kind:'phase',id:phase.id,projectId:project.id,title:phase.title,color,status:phase.status,start:phase.startDate,end:phase.endDate,depth:1,done:phase.status==='DONE',hasChildren:false});
 }
 return rows;
}

/** Monday-start weeks covering a month (Mon–Sun, matching This Week). Days outside the month are included for a full grid. */
export function monthWeeks(month:string):string[][]{
 const dates=monthDates(month),first=mondayOf(dates[0]),last=dates.at(-1)!,weeks:string[][]=[];
 for(let start=first;start<=last;start=addDays(start,7))weeks.push(Array.from({length:7},(_,index)=>addDays(start,index)));
 return weeks;
}

/** Display filters: 계획 Task / 실제 마감 / Project 기간. Empty = 전체. There is no "잠정 일정" layer. */
export type TimelineLayer='PLAN'|'DEADLINE'|'PROJECT';
export const TIMELINE_LAYER_LABELS:Record<TimelineLayer,string>={PLAN:'계획 Task',DEADLINE:'실제 마감',PROJECT:'Project 기간'};
export const showsLayer=(layers:TimelineLayer[],layer:TimelineLayer)=>!layers.length||layers.includes(layer);
export const UNASSIGNED='unassigned';
const inProjectFilter=(projectId:string|null,filter:string[])=>!filter.length||filter.includes(projectId??UNASSIGNED);

export type PlanMarker={task:WorkTask;date:string;order:number};
export type DeadlineMarker={task:WorkTask;date:string};
/**
 * Month markers inside [start,end]. Plan markers come from plan days (one per placement of the same canonical
 * Task); deadline markers come from the semantic deadlineDate only — legacy start/due dates are never a deadline.
 */
export function monthMarkers(range:Range,tasks:WorkTask[],planDays:PlanDay[],options:{layers?:TimelineLayer[];projectFilter?:string[]}={}){
 const layers=options.layers??[],filter=options.projectFilter??[];
 const active=new Map(tasks.filter(task=>!task.archivedAt&&inProjectFilter(task.projectId,filter)).map(task=>[task.id,task]));
 const plans=new Map<string,PlanMarker[]>(),deadlines=new Map<string,DeadlineMarker[]>();
 const push=<T,>(map:Map<string,T[]>,date:string,value:T)=>{const list=map.get(date);if(list)list.push(value);else map.set(date,[value]);};
 if(showsLayer(layers,'PLAN'))for(const day of planDays){const task=active.get(day.taskId);if(task&&day.date>=range.start&&day.date<=range.end)push(plans,day.date,{task,date:day.date,order:day.order});}
 if(showsLayer(layers,'DEADLINE'))for(const task of active.values())if(task.deadlineDate&&task.deadlineDate>=range.start&&task.deadlineDate<=range.end)push(deadlines,task.deadlineDate,{task,date:task.deadlineDate});
 for(const list of plans.values())list.sort((a,b)=>a.order-b.order||a.task.id.localeCompare(b.task.id));
 return {plans,deadlines};
}

export type WeekSpan={project:Project;color:string;startColumn:number;endColumn:number;clippedStart:boolean;clippedEnd:boolean};
/** Project period spans laid over each Monday-start week row of the month grid (columns 0–6). */
export function weekProjectSpans(week:string[],projects:Project[],projectFilter:string[]=[]):WeekSpan[]{
 const window={start:week[0],end:week[6]};
 return [...projects].filter(project=>!project.archivedAt&&inProjectFilter(project.id,projectFilter)).sort((a,b)=>a.order-b.order).flatMap(project=>{
  const placed=placeRange({start:project.startDate,end:project.endDate},window);
  return placed?[{project,color:projectColor(project.color),startColumn:placed.offset,endColumn:placed.offset+placed.length-1,clippedStart:placed.clippedStart,clippedEnd:placed.clippedEnd}]:[];
 });
}

/** Active, unfinished Tasks with neither a plan day nor a semantic deadline: reachable below the grid, never lost. */
export function undatedTasks(tasks:WorkTask[],planDays:PlanDay[],projectFilter:string[]=[]):WorkTask[]{
 const planned=new Set(planDays.map(day=>day.taskId));
 return tasks.filter(task=>!task.archivedAt&&task.status!=='DONE'&&!planned.has(task.id)&&!task.deadlineDate&&inProjectFilter(task.projectId,projectFilter)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

/**
 * Undo for a plan-day move. A plain move is reversed by moving back. A move that merged into an existing
 * placement on the target date cannot be reversed by moving (that would take the pre-existing placement away):
 * it is reversed by re-adding the source placement.
 */
export type PlanUndo={taskId:string;kind:'move';from:string;to:string}|{taskId:string;kind:'add';date:string};
export function planMoveUndo(taskId:string,from:string,to:string,merged:boolean):PlanUndo{
 return merged?{taskId,kind:'add',date:from}:{taskId,kind:'move',from:to,to:from};
}
