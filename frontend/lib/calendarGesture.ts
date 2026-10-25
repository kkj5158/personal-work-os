/** Shared by WORK FLOW and Sleep. Sleep retains its existing five-minute edits. */
export const snapMinute = (minute: number, interval = 15) => Math.round(minute / interval) * interval;
export const timeToPosition = (minutes: number, hourHeight: number) => minutes * hourHeight / 60;
export const positionToTime = (pixels: number, hourHeight: number) => pixels * 60 / hourHeight;
