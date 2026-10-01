/** Shared deterministic 14-hour window. Long overnight records do not anchor the day. */
export const ACTIVE_DAY_MINUTES = 14 * 60;
export function activeDayStart(ranges: { start: number; end: number }[]): number {
  const active = ranges.filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start && r.end - r.start <= 6 * 60 && r.start >= 4 * 60);
  if (!active.length) return 7 * 60;
  const starts = active.map(r => r.start).sort((a,b) => a-b);
  // A lower quartile anchor resists a single isolated early record in a busy week.
  return Math.max(0, Math.min(10 * 60, Math.floor((starts[Math.floor((starts.length - 1) / 4)] - 60) / 60) * 60));
}
export const snapCreate = (minute: number) => Math.round(minute / 15) * 15;
/** Gesture geometry for an existing block. The same-day end boundary is stored
 * as 23:59 (and older Plans may carry other off-grid minutes); dragging must not
 * carry that minute into the new position, so the span is widened to the
 * enclosing five-minute grid (23:59 → 24:00). The drop still clamps 24:00 back to 23:59. */
export const gestureSpan = (start: number, end: number) => ({ start: Math.floor(start / 5) * 5, end: Math.ceil(end / 5) * 5 });
export const snapMove = (original: number, delta: number, duration: number) => {
  const steps = Math.max(Math.ceil(-original / 15), Math.min(Math.floor((1440-duration-original) / 15), Math.round(delta / 15)));
  return original + steps * 15;
};
export const snapResize = (originalEnd: number, delta: number, start: number) => {
  const steps = Math.max(Math.ceil((start+5-originalEnd) / 15), Math.min(Math.floor((1440-originalEnd) / 15), Math.round(delta / 15)));
  return originalEnd + steps * 15;
};
