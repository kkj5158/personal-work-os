import { snapMinute, positionToTime } from "../calendarGesture";
export { timeToPosition, positionToTime } from "../calendarGesture";
import { addDay, instant, type Event } from "./model";
import { changed, draftOf, endpoint, localParts, resolve, type Draft, type Session, type Nap } from "../sleep/model";

/** The actual Sleep clock is linear (26px/hour), including all nap hours. */
export const editDelta = (pixels: number, hourHeight: number) => snapMinute(positionToTime(pixels, hourHeight), 5);
export function selectedInterval(day: string, anchor: number, cursor: number, overnight: boolean) {
  const a = Math.min(1425, Math.max(0, snapMinute(anchor))), b = Math.min(1440, Math.max(0, snapMinute(cursor)));
  const startMinute = Math.min(a,b), endMinute = Math.max(a,b,startMinute+15);
  const origin = Date.parse(instant(overnight ? addDay(day,-1) : day, overnight ? 18 : 0));
  return {start:new Date(origin+startMinute*60000).toISOString(),end:new Date(origin+endMinute*60000).toISOString()};
}
/** Defaults are a reviewable draft; they are never saved by creating/selecting it. */
export function creationDraft(kind: "main"|"nap", date: string, interval?: {start:string;end:string}): Draft {
  const draft = draftOf(kind,null,date);
  const start = interval?.start ?? instant(kind === "main" ? addDay(date,-1) : date, kind === "main" ? 23 : 13);
  const end = interval?.end ?? instant(date,kind === "main" ? 7 : 13.5);
  return {...draft,start:endpoint(start,"Asia/Seoul"),end:endpoint(end,"Asia/Seoul")};
}
export function draftCalendarEvent(draft: Draft): Event | null {
  if(draft.original) return null;
  try {
    const start=resolve(draft.start)?.at ?? null,end=resolve(draft.end)?.at ?? null;
    if(!start || !end || Date.parse(end)<=Date.parse(start)) return null;
    const minutes=(Date.parse(end)-Date.parse(start))/60000,day=localParts(draft.kind==="main"?end:start,"Asia/Seoul").date;
    const original = draft.kind==="main" ? {id:draft.id,revision:0,bedtimeIntentAt:start,wakeAt:end,logicalWakeDate:day,expectedWakeDate:day,status:"CLOSED",excludedAt:null,intervalMinutes:minutes} as Session : {id:draft.id,revision:0,startAt:start,endAt:end,startLocalDate:day,intervalMinutes:minutes} as Nap;
    return {key:`${draft.kind==="main"?"sleep":"nap"}:${draft.id}`,source:draft.kind==="main"?"sleep":"nap",id:draft.id,start,end,attribution:day,title:draft.kind==="main"?"새 야간 수면":"새 낮잠",state:"저장 전",mutable:true,revision:0,href:null,original};
  } catch { return null; }
}

/** Reapply only what the user actually edited; keep newer untouched annotations. */
export function rebaseDraft(draft: Draft, current: Session|Nap, date: string): Draft {
  if(!draft.original) return draft;
  const base=draftOf(draft.kind,draft.original,date),latest=draftOf(draft.kind,current,date);
  return {...draft,original:current,start:changed(draft.start,base.start)?draft.start:latest.start,end:changed(draft.end,base.end)?draft.end:latest.end,
    sleepScore:draft.sleepScore!==base.sleepScore?draft.sleepScore:latest.sleepScore,
    sleepNote:draft.sleepNote!==base.sleepNote?draft.sleepNote:latest.sleepNote};
}
