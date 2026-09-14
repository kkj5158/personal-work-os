import type {Project,Phase,WorkTask} from '../api/workflow';
export type Range={start:string;end:string};
export type TimelineMode='move'|'start'|'end';
export type TimelineRow={kind:'project'|'phase'|'task';id:string;title:string;depth:number;color:string;status:string;start:string|null;end:string|null;entity:Project|Phase|WorkTask;hasChildren:boolean};
const DAY=86400000;
export const dayNumber=(date:string)=>Date.parse(`${date}T00:00:00Z`)/DAY;
export const addDays=(date:string,days:number)=>new Date((dayNumber(date)+days)*DAY).toISOString().slice(0,10);
export function monthDates(month:string){const first=`${month}-01`;const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return Array.from({length:count},(_,i)=>addDays(first,i));}
export function changeRange(range:Range,mode:TimelineMode,delta:number):Range{
 const days=Math.round(delta);
 if(mode==='move')return {start:addDays(range.start,days),end:addDays(range.end,days)};
 if(mode==='start')return {start:dayNumber(addDays(range.start,days))>dayNumber(range.end)?range.end:addDays(range.start,days),end:range.end};
 return {start:range.start,end:dayNumber(addDays(range.end,days))<dayNumber(range.start)?range.start:addDays(range.end,days)};
}
const colors:Record<string,string>={blue:'#5b8bd3',green:'#5b9a76',purple:'#9678c5',orange:'#d9a158',red:'#ca6c77',slate:'#8491a4',teal:'#4c9a9a',pink:'#c57aab'};
export function projectColor(color:string){return /^#[0-9a-f]{6}$/i.test(color)?color:colors[color]??colors.blue;}
export function timelineRows(projects:Project[],phases:Phase[],tasks:WorkTask[],collapsed:Set<string>):TimelineRow[]{
 const rows:TimelineRow[]=[];const ordered=<T extends {order:number}>(items:T[])=>[...items].sort((a,b)=>a.order-b.order);
 const taskRow=(task:WorkTask,color:string,depth:number)=>rows.push({kind:'task',id:task.id,title:task.title,depth,color,status:task.status,start:task.startDate,end:task.dueDate,entity:task,hasChildren:false});
 for(const project of ordered(projects)){
  const color=projectColor(project.color),projectPhases=ordered(phases.filter(p=>p.projectId===project.id)),projectTasks=ordered(tasks.filter(t=>t.projectId===project.id));
  rows.push({kind:'project',id:project.id,title:project.title,depth:0,color,status:project.status,start:project.startDate,end:project.endDate,entity:project,hasChildren:projectPhases.length+projectTasks.length>0});
  if(collapsed.has(project.id))continue;
  for(const phase of projectPhases){const phaseTasks=projectTasks.filter(t=>t.phaseId===phase.id);rows.push({kind:'phase',id:phase.id,title:phase.title,depth:1,color,status:phase.status,start:phase.startDate,end:phase.endDate,entity:phase,hasChildren:phaseTasks.length>0});if(!collapsed.has(phase.id))phaseTasks.forEach(t=>taskRow(t,color,2));}
  projectTasks.filter(t=>!t.phaseId).forEach(t=>taskRow(t,color,1));
 }
 ordered(tasks.filter(t=>!t.projectId)).forEach(t=>taskRow(t,colors.slate,0));return rows;
}
