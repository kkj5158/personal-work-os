import type { CalendarUnscheduledActualDto } from "@/lib/api/types";
import { parseLocalDateTime } from "@/lib/date";
import type { GridBlock } from "./gridTypes";
import { snapCreate, snapMove } from "./overview";

export const sameSource = (a: {id:string|null;sourceType?:GridBlock["sourceType"]}, b: {id:string|null;sourceType?:GridBlock["sourceType"]}) => a.id === b.id && a.sourceType === b.sourceType;
export function actualConflict(block: Pick<GridBlock,"id"|"sourceType"> | undefined, start: Date, end: Date, all: GridBlock[]) {
  return all.find(other => !(block && sameSource(block,other)) && start < parseLocalDateTime(other.endAt) && end > parseLocalDateTime(other.startAt));
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
  if (start < 0 || end >= 1440 || item.durationMinutes <= 0 || start % 5 || end % 5) return null;
  return {start,end};
}
