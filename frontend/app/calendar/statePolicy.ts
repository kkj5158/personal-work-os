import type { StateGroup } from "@/lib/api/types";
export const STATE_LABELS: Record<StateGroup,string> = {STABLE:"안정",LOW:"저하",HIGH:"과활성",MIXED:"혼재",UNCLEAR:"애매"};
export function observedRange(date:string, end:string, now = new Date()): boolean {
  const timestamp = Date.parse(`${date}T${end}:00+09:00`);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}
