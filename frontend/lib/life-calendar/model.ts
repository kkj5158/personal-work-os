import { endpoint, localParts, type Draft, type Nap, type Session } from "../sleep/model";

export type Source = "sleep" | "nap" | "workout" | "calendar";
export type Mode = "day" | "week" | "month";
export type Workout = { id: string; kind: string; revision: number; date: string; name?: string; startedAt?: string|null; finishedAt?: string|null; deletedAt?: string|null; purged?: boolean; exercises: unknown[]; [key:string]: unknown };
export type CalendarBlock = { id?:string; sourceId?:string; sourceType?:string; title?:string; label?:string; date?:string; startAt:string|null; endAt:string|null; [key:string]:unknown };
export type CalendarRange = { planBlocks:CalendarBlock[]; actualBlocks:CalendarBlock[]; stateBlocks:CalendarBlock[]; unscheduledActual?:CalendarBlock[]; unscheduledPlans?:CalendarBlock[] };
export type Event = { key:string; source:Source; id:string; start:string|null; end:string|null; attribution:string; title:string; state:string; mutable:boolean; revision:number|null; href:string|null; original:Session|Nap|Workout|CalendarBlock };
export const addDay=(date:string,days:number)=>new Date(Date.parse(date+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
export const instant=(date:string,hour=0)=>new Date(Date.parse(date+"T00:00:00+09:00")+hour*3600000).toISOString();
export function monthShift(date:string,delta:number){const d=new Date(date+"T12:00:00Z");d.setUTCMonth(d.getUTCMonth()+delta,1);return d.toISOString().slice(0,10);}
export function daysFor(date:string,mode:Mode){if(mode==="day")return [date];if(mode==="week")return Array.from({length:7},(_,i)=>addDay(date,i-6));const first=date.slice(0,7)+"-01",start=addDay(first,-new Date(first+"T12:00:00Z").getUTCDay());return Array.from({length:42},(_,i)=>addDay(start,i));}
export function rangeFor(date:string,mode:Mode,sleepOnly:boolean){const days=daysFor(date,mode),from=days[0],to=days.at(-1)!;return {days,from,to,start:instant(sleepOnly&&mode==="week"?addDay(from,-1):from,sleepOnly&&mode==="week"?18:0),end:instant(sleepOnly&&mode==="week"?to:addDay(to,1),sleepOnly&&mode==="week"?18:0)};}
const clock=(value:string)=>localParts(value,"Asia/Seoul");
export function timeLabel(value:string|null){if(!value)return "미기록";const p=clock(value);return `${p.date.slice(5)} ${p.time}`;}
export function sleepEvents(sessions:Session[],naps:Nap[]):Event[]{return [...sessions.map(s=>({key:`sleep:${s.id}`,source:"sleep" as const,id:s.id,start:s.bedtimeIntentAt,end:s.wakeAt,attribution:s.logicalWakeDate??s.expectedWakeDate,title:"야간 수면",state:s.status,mutable:true,revision:s.revision,href:`/life/sleep?date=${s.logicalWakeDate??s.expectedWakeDate}&view=day`,original:s})),...naps.map(n=>({key:`nap:${n.id}`,source:"nap" as const,id:n.id,start:n.startAt,end:n.endAt,attribution:n.startLocalDate,title:"낮잠",state:"CLOSED",mutable:true,revision:n.revision,href:`/life/sleep?date=${n.startLocalDate}&view=day&kind=nap`,original:n}))];}
export function workoutEvents(documents:Workout[]):Event[]{return documents.filter(w=>w.kind==="SESSION"&&!w.deletedAt&&!w.purged).map(w=>({key:`workout:${w.id}`,source:"workout",id:w.id,start:w.startedAt??null,end:w.finishedAt??null,attribution:w.date,title:w.name||"운동",state:w.finishedAt?"완료":w.startedAt?"진행 중":"계획 · 시각 미지정",mutable:!!(w.startedAt&&w.finishedAt),revision:w.revision,href:null,original:w}));}
// Calendar SYS's existing naive date/time wire is explicitly Asia/Seoul, never the browser zone.
export function calendarEvents(range:CalendarRange):Event[]{return ([['PLAN',range.planBlocks],['ACTUAL',range.actualBlocks],['STATE',range.stateBlocks],['UNSCHEDULED_PLAN',range.unscheduledPlans??[]],['UNSCHEDULED_ACTUAL',range.unscheduledActual??[]]] as const).flatMap(([type,rows])=>rows.map(r=>{
 const id=r.sourceId??r.id!;const canonicalInstant=(value:string|null|undefined)=>value?new Date(/Z$|[+-]\d\d:\d\d$/.test(value)?value:value+"+09:00").toISOString():null;
 const start=canonicalInstant(r.startAt),end=canonicalInstant(r.endAt),attribution=r.date??(start?clock(start).date:"");
 return {key:`calendar:${type}:${r.sourceType??type}:${id}`,source:"calendar" as const,id,start,end,attribution,title:r.title??r.label??"상태",state:type==="PLAN"?"계획":type==="ACTUAL"?"실행":type==="STATE"?"상태":type==="UNSCHEDULED_PLAN"?"계획 · 시각 미지정":"실행 · 시각 미지정",mutable:false,revision:null,href:attribution?`/calendar?date=${attribution}&view=day&mode=all`:"/calendar",original:r};
 }));}
export type Segment = { event:Event; top:number; actualHeight:number; height:number; lane:number; lanes:number; continuesBefore:boolean; continuesAfter:boolean };
export function segments(events:Event[],start:string,hourHeight:number):Segment[]{const begin=Date.parse(start),finish=begin+86400000,scale=hourHeight/3600000;const rows:Segment[]=[];
 for(const event of events){const a=event.start?Date.parse(event.start):null,b=event.end?Date.parse(event.end):null;if(a===null&&b===null)continue;
  const point=a===null||b===null,s=a??b!,e=b??a!;
  if(point?(s<begin||s>=finish):!(s<finish&&e>begin))continue;
  const top=Math.max(0,s-begin)*scale,actualHeight=point?0:(Math.min(finish,e)-Math.max(begin,s))*scale;
  const height=event.source==="workout"?Math.max(96,actualHeight):event.source==="calendar"?30:Math.max(22,actualHeight);
  rows.push({event,top,actualHeight,height,lane:0,lanes:1,continuesBefore:s<begin,continuesAfter:!point&&e>finish});
 }
 // Reserve separate secondary lanes; use presentation extents (96px workouts), not just occupied time.
 for(const secondary of [false,true]){const group=rows.filter(r=>(r.event.source==="calendar")===secondary).sort((a,b)=>a.top-b.top||a.event.key.localeCompare(b.event.key));let component:Segment[]=[];const ends:number[]=[];
  const complete=()=>{const count=Math.max(1,ends.length);component.forEach(r=>r.lanes=count);component=[];ends.length=0;};
  for(const row of group){if(component.length&&ends.every(end=>end<=row.top))complete();let lane=ends.findIndex(end=>end<=row.top);if(lane<0)lane=ends.length;row.lane=lane;ends[lane]=row.top+row.height;component.push(row);}complete();
 }
 return rows;
}
export function shiftInterval(event:Event,minutes:number,days:number,edge:"move"|"start"|"end"){if(!event.mutable||!event.start||!event.end)throw Error("완료된 원본 기록만 시간 편집할 수 있습니다.");const delta=minutes*60000+(edge==="move"?days*86400000:0);const start=new Date(Date.parse(event.start)+(edge==="end"?0:delta)).toISOString(),end=new Date(Date.parse(event.end)+(edge==="start"?0:delta)).toISOString();if(Date.parse(end)<=Date.parse(start))throw Error("종료는 시작 이후여야 합니다.");return {start,end};}
/** Moving preserves seconds. Resizing one endpoint leaves the other endpoint's provenance intact. */
export function previewDraft(draft:Draft,start:string,end:string):Draft{const original=draft.original;if(!original)return draft;const a=draft.kind==="main"?(original as Session).bedtimeIntentAt:(original as Nap).startAt,b=draft.kind==="main"?(original as Session).wakeAt:(original as Nap).endAt;return {...draft,start:a&&Date.parse(a)===Date.parse(start)?draft.start:endpoint(start,draft.start.zone,undefined,draft.start.date),end:b&&Date.parse(b)===Date.parse(end)?draft.end:endpoint(end,draft.end.zone,undefined,draft.end.date)};}
export function workoutMutation(original:Workout,start:string,end:string):{mutationId:string;action:string;expectedRevision:number;document:Workout}{if(!original.startedAt||!original.finishedAt)throw Error("진행 중이거나 시각이 없는 운동은 원본 앱에서 편집해주세요.");if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))throw Error("운동 시작·종료 날짜와 시각을 확인해주세요.");return {mutationId:crypto.randomUUID(),action:"SAVE",expectedRevision:original.revision,document:{...original,startedAt:start,finishedAt:end,date:clock(start).date}};}
export function eventsInRange(events:Event[],range:{start:string;end:string;from:string;to:string}){const a=Date.parse(range.start),b=Date.parse(range.end);return events.filter(e=>(e.attribution>=range.from&&e.attribution<=range.to)||(e.start&&e.end&&Date.parse(e.start)<b&&Date.parse(e.end)>a)||(e.start&&!e.end&&Date.parse(e.start)>=a&&Date.parse(e.start)<b));}
export function meanNight(sessions:Session[],from:string,to:string){const days=new Map<string,number>();for(const s of sessions){const date=s.logicalWakeDate??s.expectedWakeDate;if(s.status==="CLOSED"&&!s.excludedAt&&s.intervalMinutes!=null&&date>=from&&date<=to)days.set(date,(days.get(date)??0)+s.intervalMinutes);}return {count:days.size,mean:days.size?[...days.values()].reduce((a,b)=>a+b,0)/days.size:null};}
