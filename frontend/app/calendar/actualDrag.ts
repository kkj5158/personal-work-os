import type { CalendarUnscheduledActualDto } from "@/lib/api/types";
import { parseLocalDateTime, toLocalDateTimeString } from "@/lib/date";
import type { GridBlock } from "./gridTypes";
import { snapCreate, snapMove } from "./overview";

export const sameSource = (a: {id:string|null;sourceType?:GridBlock["sourceType"]}, b: {id:string|null;sourceType?:GridBlock["sourceType"]}) => a.id === b.id && a.sourceType === b.sourceType;
export function actualConflict(block: GridBlock | undefined, start: Date, end: Date, all: GridBlock[]) {
  const span=(end.getTime()-start.getTime())/60000;
  const oldSpan=block ? (Date.parse(block.endAt)-Date.parse(block.startAt))/60000 : null;
  const moved=block ? {...block,startAt:toLocalDateTimeString(start),endAt:toLocalDateTimeString(end),durationMinutes:span !== oldSpan ? span : block.durationMinutes} : undefined;
  return all.find(other => !(block && sameSource(block,other)) && !(moved && identicalActual(moved,other)) && start < parseLocalDateTime(other.endAt) && end > parseLocalDateTime(other.startAt));
}
/** Equality only exempts intentional overlap; it never removes a record or
 * chooses a creation identity. The server remains the final guard. */
export function identicalActual(a:GridBlock,b:GridBlock):boolean {
  const duration=(v:GridBlock)=>v.durationMinutes ?? Math.round((Date.parse(v.endAt)-Date.parse(v.startAt))/60000);
  return a.sourceType === b.sourceType && a.title.trim() === b.title.trim() && a.activityCategoryId === b.activityCategoryId && a.lifeCategoryId === b.lifeCategoryId && a.phaseId === b.phaseId && (a.memo?.trim() || null) === (b.memo?.trim() || null) && a.startAt === b.startAt && a.endAt === b.endAt && duration(a) === duration(b);
}
export function conflictMessage(conflict: GridBlock) {
  return `${conflict.startAt.slice(11,16)}–${conflict.endAt.slice(11,16)} 기존 ${conflict.domainType} 기록과 겹칩니다.`;
}
/** Horizontal drags tolerate small vertical pointer drift. Meaningful vertical
 * movement uses a relative snap, so a persisted five-minute offset survives. */
export function movedStart(original:number, duration:number, minuteDelta:number, dx:number, dy:number, crossDate:boolean) {
  const horizontal = crossDate && Math.abs(dy) < 24 && Math.abs(dx) > Math.abs(dy);
  return snapMove(original, horizontal ? 0 : minuteDelta, duration);
}
export function scheduledPlacement(item:CalendarUnscheduledActualDto, minute:number) {
  const start=snapCreate(minute), end=start+item.durationMinutes;
  if (start < 0 || end > 1439 || item.durationMinutes <= 0 || start % 5 || (end % 5 && end !== 1439)) return null;
  return {start,end};
}
