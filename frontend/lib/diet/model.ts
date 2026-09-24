import type { ArchivePeriod, Challenge, ChecklistItem, DailyRecord, DietData, WeightGoal } from "./types";
import { isActiveOn } from "@/lib/checklist-core/stats";
export const today = () => new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul"}).format(new Date());
export function addDays(date:string,n:number) { const d=new Date(date+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
export function weekStart(date:string) {return addDays(date,-((new Date(date+"T00:00:00Z").getUTCDay()+6)%7));}
export const monthStart=(date:string)=>date.slice(0,7)+"-01";
export function monthEnd(date:string) {const d=new Date(date+"T00:00:00Z");return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);}
export function daysBetween(start:string,end:string) { const result:string[]=[]; for(let d=start;d<=end;d=addDays(d,1))result.push(d); return result; }
export function latestWeight(days:DailyRecord[],end=today()) {return [...days].filter(d=>d.date<=end&&d.morningWeight!=null).sort((a,b)=>b.date.localeCompare(a.date))[0]?.morningWeight??null;}
export function goalFor(data:DietData,kind:WeightGoal["kind"]) { const goals=data.goals.filter(g=>g.kind===kind).sort((a,b)=>a.targetDate.localeCompare(b.targetDate)||a.id.localeCompare(b.id)); return goals.find(g=>g.targetDate>=today())??goals.at(-1); }
export const percent=(current:number,start:number,target:number)=>start===target?(current<=target?100:0):Math.max(0,Math.min(100,(start-current)/(start-target)*100));
/**
 * Shared archive semantics: an item is live from its start date except inside
 * archive intervals. A legacy item archived before intervals existed is live
 * until the day after its last check.
 */
export function dietActiveOn(item:ChecklistItem,date:string,periods:readonly ArchivePeriod[],checks:DietData["checks"]) {
  const own=periods.filter(p=>p.itemId===item.id);
  let archivedOn:string|null=null;
  if(!item.active&&!own.some(p=>p.restoredOn==null)){const last=checks.filter(c=>c.itemId===item.id&&c.state!=="MISSING").map(c=>c.date).sort().at(-1);archivedOn=last?addDays(last,1):item.startDate;}
  return isActiveOn(date,item.startDate,own,archivedOn);
}
export function checklistStats(data:DietData,ids:string[],start:string,end:string,includeMissing=true,asOf=today()) {
  const until=end<asOf?end:asOf;
  const selected=data.items.filter(i=>ids.includes(i.id));
  let eligible=0,success=0,failure=0,unrecorded=0;
  // Archived intervals are neither failures nor missing data; recorded days always count.
  const recorded=new Set(data.checks.filter(c=>c.state!=="MISSING").map(c=>`${c.itemId}/${c.date}`));
  for(const item of selected){const since=item.startDate>start?item.startDate:start; eligible+=daysBetween(since,until).filter(d=>recorded.has(`${item.id}/${d}`)||dietActiveOn(item,d,data.archivePeriods??[],data.checks)).length;
    for(const check of data.checks){if(check.itemId!==item.id||check.date<since||check.date>until)continue;if(check.state==="SUCCESS")success++;if(check.state==="FAILURE")failure++;if(check.state==="UNRECORDED")unrecorded++;}}
  const denominator=includeMissing?eligible-unrecorded:success+failure;
  return {success,failure,eligible,unrecorded,missing:eligible-success-failure-unrecorded,rate:denominator?success/denominator*100:null};
}
export function challengeProgress(challenge:Challenge,data:DietData,asOf=today()) {
  const stats=checklistStats(data,challenge.itemIds,challenge.startDate,challenge.endDate,challenge.includeMissing,asOf);
  const current=challenge.type==="WEIGHT"?latestWeight(data.days,asOf):challenge.type==="CHECKLIST"?(challenge.goalMode==="RATE"?stats.rate:stats.success):challenge.currentValue;
  const target=challenge.type==="WEIGHT"?challenge.targetWeight:challenge.targetValue;
  const lost=challenge.type==="WEIGHT"&&current!=null&&challenge.startWeight!=null?challenge.startWeight-current:null;
  const remaining=current!=null&&target!=null?challenge.type==="WEIGHT"?current-target:target-current:null;
  const progress=current==null||target==null?null:challenge.type==="WEIGHT"?(challenge.startWeight==null?null:percent(current,challenge.startWeight,target)):target>0?Math.max(0,Math.min(100,current/target*100)):null;
  return {current,target,progress,lost,remaining,rate:stats.rate,success:stats.success,eligible:stats.eligible};
}
export function average(values:(number|null|undefined)[]) { const valid=values.filter((v):v is number=>v!=null);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null; }
export const display=(n:number|null|undefined,digits=1)=>n==null?"—":n.toLocaleString("ko-KR",{maximumFractionDigits:digits});
