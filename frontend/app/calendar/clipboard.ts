import type { ActualSourceType, PlannedTimeBlockInput } from "@/lib/api/types";
import type { ActualRecord } from "./calendarWrites";
import { visualGroupInput, shiftGroupDate, groupDateDistance, validateVisualGroup, type VisualGroupInput } from "./visualGroups";

export interface CalendarRef { kind:"PLAN"|"ACTUAL"|"GROUP"; id:string; sourceType?:ActualSourceType|null }
export type ClipboardItem = {kind:"PLAN";plan:PlannedTimeBlockInput} | {kind:"ACTUAL";sourceType:ActualSourceType;actual:Omit<ActualRecord,"id"|"sourceType">} | {kind:"GROUP";group:VisualGroupInput};
export interface CalendarClipboard { items:ClipboardItem[]; anchor:number }
export interface PasteTarget {date:string;minute?:number}
export interface PasteResult { committed:boolean;results:{index:number;created:CalendarRef|null;error:string|null}[] }
export const selectionKey=(ref:CalendarRef)=>`${ref.kind}:${ref.sourceType ?? ""}:${ref.id}`;
export function selectCalendarItem(selection:CalendarRef[],ref:CalendarRef,additive=false) {
  if(!additive)return [ref];
  return selection.some(item=>selectionKey(item)===selectionKey(ref)) ? selection.filter(item=>selectionKey(item)!==selectionKey(ref)) : [...selection,ref];
}
export function isCalendarTextTarget(target:EventTarget|null) {
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="spinbutton"]');
}
// Local Calendar dates use UTC only as a timezone-free arithmetic coordinate.
const point=(date:string,time="00:00")=>Date.parse(`${date}T${time.slice(0,5)}:00Z`)/60000;
const stamp=(minutes:number)=>new Date(minutes*60000).toISOString().slice(0,19);
const timeAt=(minutes:number)=>stamp(minutes).slice(11,16);
export function itemAnchor(item:ClipboardItem) {
  if(item.kind==="PLAN")return point(item.plan.startAt.slice(0,10),item.plan.startAt.slice(11,16));
  if(item.kind==="ACTUAL")return point(item.actual.date,item.actual.startTime ?? "00:00");
  return point(item.group.startDate,item.group.startTime ?? "00:00");
}
export function copyCalendarItems(items:ClipboardItem[]):CalendarClipboard {
  return {items:structuredClone(items),anchor:Math.min(...items.map(itemAnchor))};
}
export function pasteCandidates(clipboard:CalendarClipboard,target:PasteTarget):ClipboardItem[] {
  const originalClock=((clipboard.anchor%1440)+1440)%1440;
  const delta=point(target.date)+(target.minute ?? originalClock)-clipboard.anchor;
  const dateDelta=groupDateDistance(stamp(clipboard.anchor).slice(0,10),target.date);
  return clipboard.items.map(item=>{
    if(item.kind==="PLAN") {
      const start=itemAnchor(item),duration=(Date.parse(`${item.plan.endAt}Z`)-Date.parse(`${item.plan.startAt}Z`))/60000;
      return {kind:"PLAN",plan:{...item.plan,startAt:stamp(start+delta),endAt:stamp(start+delta+duration)}};
    }
    if(item.kind==="ACTUAL") {
      const a=item.actual;
      if(!a.startTime)return {...item,actual:{...a,date:shiftGroupDate(a.date,dateDelta)}};
      const start=itemAnchor(item)+delta,end=point(a.date,a.endTime!)+delta;
      // Keep invalid same-day pairs for server preflight and explicit exclusion recovery.
      return {...item,actual:{...a,date:stamp(start).slice(0,10),startTime:timeAt(start),endTime:timeAt(end)}};
    }
    const g=visualGroupInput(item.group);
    if(g.timeRule==="ALL_DAY")return {kind:"GROUP",group:{...g,startDate:shiftGroupDate(g.startDate,dateDelta),endDate:shiftGroupDate(g.endDate,dateDelta)}};
    const start=itemAnchor(item)+delta,dayShift=groupDateDistance(g.startDate,stamp(start).slice(0,10));
    const next={...g,startDate:shiftGroupDate(g.startDate,dayShift),endDate:shiftGroupDate(g.endDate,dayShift),
      weekdays:g.weekdays.map(d=>((d-1+dayShift)%7+7)%7+1),days:g.days.map(d=>({...d,date:shiftGroupDate(d.date,dayShift)}))};
    if(g.timeRule==="CONTINUOUS") {const end=point(g.endDate,g.endTime!)+delta;next.startTime=timeAt(start);next.endDate=stamp(end).slice(0,10);next.endTime=timeAt(end);}
    else if(g.timeRule==="SAME_TIME_EACH_DAY") {next.startTime=timeAt(start);next.endTime=timeAt(point(g.startDate,g.endTime!)+delta);}
    else next.days=g.days.map(d=>{if(!d.enabled)return {...d,date:shiftGroupDate(d.date,dateDelta)};const s=point(d.date,d.startTime!)+delta,e=point(d.date,d.endTime!)+delta;return {...d,date:stamp(s).slice(0,10),startTime:timeAt(s),endTime:timeAt(e)};});
    const error=validateVisualGroup(next);if(error)throw new Error(`${g.title}: ${error} (그룹 규칙을 유지할 수 있는 날짜/시간을 선택하세요.)`);
    return {kind:"GROUP",group:next};
  });
}
