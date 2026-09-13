import { validLocalDate } from "@/lib/localDateBridge";

export type VisualGroupRule = "ALL_DAY" | "SAME_TIME_EACH_DAY" | "PER_DAY" | "CONTINUOUS";
export interface VisualGroupDay { date: string; enabled: boolean; startTime: string | null; endTime: string | null }
export interface VisualGroupInput {
  title: string; startDate: string; endDate: string; timeRule: VisualGroupRule; color: string;
  startTime: string | null; endTime: string | null; weekdays: number[]; days: VisualGroupDay[];
}
export interface CalendarVisualGroup extends VisualGroupInput { id: string; createdAt?: string; updatedAt?: string }
export interface VisualGroupSlice {
  group: CalendarVisualGroup; date: string; start: number; end: number;
  startsHere: boolean; endsHere: boolean; lane: number; lanes: number;
}
export const GROUP_COLOR = "#64748b";
export const GROUP_RULE_LABELS: Record<VisualGroupRule, string> = { ALL_DAY: "종일", SAME_TIME_EACH_DAY: "매일 같은 시간", PER_DAY: "날짜별 시간", CONTINUOUS: "연속 기간" };
// UTC is only an arithmetic coordinate for an already date-only string. It
// never converts a user's local date or clock value across time zones.
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const dayString = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
export const shiftGroupDate = (date: string, delta: number) => dayString(dayNumber(date) + delta);
export const groupDateDistance = (from: string, to: string) => dayNumber(to) - dayNumber(from);
export const groupMinutes = (time: string | null) => time && /^\d{2}:\d{2}(?::00)?$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : NaN;
export const groupClock = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
const validClock = (time: string | null) => !!time && /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time) && groupMinutes(time) % 5 === 0;
const validPair = (start: string | null, end: string | null) => validClock(start) && validClock(end) && groupMinutes(start) < groupMinutes(end);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function validateVisualGroup(group: VisualGroupInput): string | null {
  if (!group.title.trim()) return "그룹 제목을 입력하세요.";
  if (group.title.trim().length > 200) return "제목은 200자 이내로 입력하세요.";
  if (!validLocalDate(group.startDate) || !validLocalDate(group.endDate) || group.startDate > group.endDate) return "올바른 시작일과 종료일을 입력하세요.";
  if (!/^#[\da-f]{6}$/i.test(group.color)) return "올바른 색상을 선택하세요.";
  if (group.timeRule === "ALL_DAY") return null;
  if (group.timeRule === "SAME_TIME_EACH_DAY") {
    if (!validPair(group.startTime, group.endTime)) return "시작보다 늦은 종료 시간을 5분 단위로 입력하세요.";
    if (!group.weekdays.length || group.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) return "요일을 하나 이상 선택하세요.";
  } else if (group.timeRule === "PER_DAY") {
    const seen = new Set<string>();
    for (const day of group.days) {
      if (!validLocalDate(day.date) || day.date < group.startDate || day.date > group.endDate || seen.has(day.date)) return "날짜별 시간은 기간 안에서 날짜마다 한 번만 설정하세요.";
      seen.add(day.date);
      if (day.enabled && !validPair(day.startTime, day.endTime)) return `${day.date}의 시작보다 늦은 종료 시간을 5분 단위로 입력하세요.`;
    }
  } else if (group.timeRule === "CONTINUOUS") {
    if (!validClock(group.startTime) || !validClock(group.endTime)) return "시작과 종료 시간을 5분 단위로 입력하세요.";
    if (groupDateDistance(group.startDate, group.endDate) * 1440 + groupMinutes(group.endTime) <= groupMinutes(group.startTime)) return "종료 일시는 시작 일시보다 늦어야 합니다.";
  } else return "시간 규칙을 선택하세요.";
  return null;
}

export function visualGroupInput(group: VisualGroupInput): VisualGroupInput {
  const timed = group.timeRule === "SAME_TIME_EACH_DAY" || group.timeRule === "CONTINUOUS";
  return { title: group.title.trim(), startDate: group.startDate, endDate: group.endDate, timeRule: group.timeRule, color: group.color,
    startTime: timed ? group.startTime?.slice(0, 5) ?? null : null, endTime: timed ? group.endTime?.slice(0, 5) ?? null : null,
    weekdays: group.timeRule === "SAME_TIME_EACH_DAY" ? [...new Set(group.weekdays)].sort() : [],
    days: group.timeRule === "PER_DAY" ? group.days.map(day => ({ ...day, startTime: day.enabled ? day.startTime?.slice(0, 5) ?? null : null, endTime: day.enabled ? day.endTime?.slice(0, 5) ?? null : null })).sort((a, b) => a.date.localeCompare(b.date)) : [] };
}
export function newVisualGroup(date: string, start = 9 * 60, end = 10 * 60): CalendarVisualGroup {
  const safeStart = clamp(Math.round(start / 5) * 5, 0, 1430);
  return { id: "", title: "", startDate: date, endDate: date, timeRule: "SAME_TIME_EACH_DAY", color: GROUP_COLOR,
    startTime: groupClock(safeStart), endTime: groupClock(clamp(Math.round(end / 5) * 5, safeStart + 5, 1435)), weekdays: [1, 2, 3, 4, 5, 6, 7], days: [] };
}

/** Clip only to requested dates, never expand a multi-month entity into storage rows. */
export function sliceVisualGroups(groups: CalendarVisualGroup[], dates: string[]): VisualGroupSlice[] {
  const slices: VisualGroupSlice[] = [];
  for (const date of dates) {
    const daySlices: VisualGroupSlice[] = [];
    for (const group of groups) {
      if (validateVisualGroup({ ...group, title: group.title.trim() || "새 그룹 블록" })) continue;
      if (date < group.startDate || date > group.endDate) continue;
      let start = 0, end = 1440;
      if (group.timeRule === "SAME_TIME_EACH_DAY") {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
        if (!group.weekdays.includes(weekday)) continue;
        start = groupMinutes(group.startTime); end = groupMinutes(group.endTime);
      } else if (group.timeRule === "PER_DAY") {
        const override = group.days.find(day => day.date === date);
        if (!override?.enabled) continue;
        start = groupMinutes(override.startTime); end = groupMinutes(override.endTime);
      } else if (group.timeRule === "CONTINUOUS") {
        if (date === group.startDate) start = groupMinutes(group.startTime);
        if (date === group.endDate) end = groupMinutes(group.endTime);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      daySlices.push({ group, date, start, end, startsHere: date === group.startDate, endsHere: date === group.endDate, lane: 0, lanes: 1 });
    }
    // Independent decoration lanes; Activity never sees these intervals.
    daySlices.sort((a, b) => a.start - b.start || b.end - a.end || a.group.id.localeCompare(b.group.id));
    let cluster: VisualGroupSlice[] = [], ends: number[] = [], clusterEnd = -1;
    const finish = () => { cluster.forEach(slice => { slice.lanes = ends.length; }); cluster = []; ends = []; };
    for (const slice of daySlices) {
      if (slice.start >= clusterEnd) finish();
      let lane = ends.findIndex(end => end <= slice.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = slice.end; slice.lane = lane; cluster.push(slice); clusterEnd = Math.max(clusterEnd, slice.end);
    }
    finish(); slices.push(...daySlices);
  }
  return slices;
}

function shiftedPair(startTime: string | null, endTime: string | null, delta: number) {
  return { startTime: groupClock(groupMinutes(startTime) + delta), endTime: groupClock(groupMinutes(endTime) + delta) };
}
const snappedDelta = (minutes: number, min: number, max: number) => clamp(Math.round(minutes / 15), Math.ceil(min / 15), Math.floor(max / 15)) * 15;

/** Pure group mutation: accepts no Activity collections and preserves five-minute offsets. */
export function moveVisualGroup(group: CalendarVisualGroup, dayDelta: number, minuteDelta = 0): CalendarVisualGroup {
  const offset = Math.round(dayDelta);
  const next = { ...group, startDate: shiftGroupDate(group.startDate, offset), endDate: shiftGroupDate(group.endDate, offset), days: group.days.map(day => ({ ...day, date: shiftGroupDate(day.date, offset) })) };
  if (group.timeRule === "CONTINUOUS") {
    const delta = Math.round(minuteDelta / 15) * 15;
    const shiftEndpoint = (date: string, time: string | null) => { const minutes = groupMinutes(time) + delta; const days = Math.floor(minutes / 1440); return { date: shiftGroupDate(date, days), time: groupClock(minutes - days * 1440) }; };
    const start = shiftEndpoint(next.startDate, group.startTime), end = shiftEndpoint(next.endDate, group.endTime);
    return { ...next, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time };
  }
  if (group.timeRule === "SAME_TIME_EACH_DAY") return { ...next, ...shiftedPair(group.startTime, group.endTime, snappedDelta(minuteDelta, -groupMinutes(group.startTime), 1435 - groupMinutes(group.endTime))) };
  if (group.timeRule === "PER_DAY") {
    const enabled = group.days.filter(day => day.enabled);
    const delta = enabled.length ? snappedDelta(minuteDelta, Math.max(...enabled.map(day => -groupMinutes(day.startTime))), Math.min(...enabled.map(day => 1435 - groupMinutes(day.endTime)))) : 0;
    return { ...next, days: next.days.map(day => day.enabled ? { ...day, ...shiftedPair(day.startTime, day.endTime, delta) } : day) };
  }
  return next;
}

/** For PER_DAY, a visible slice resize edits that date only; horizontal boundary
 * resizing otherwise changes the group's date range and removes out-of-range overrides. */
export function resizeVisualGroup(group: CalendarVisualGroup, edge: "start" | "end", dayDelta: number, minuteDelta = 0, sliceDate?: string): CalendarVisualGroup {
  const field = edge === "start" ? "startTime" : "endTime";
  const resizePair = (pair: { startTime: string | null; endTime: string | null }) => {
    const start = groupMinutes(pair.startTime), end = groupMinutes(pair.endTime);
    const delta = edge === "start" ? snappedDelta(minuteDelta, -start, end - start - 5) : snappedDelta(minuteDelta, start + 5 - end, 1435 - end);
    return { startTime: pair.startTime, endTime: pair.endTime, [field]: groupClock(groupMinutes(pair[field]) + delta) };
  };
  if (group.timeRule === "PER_DAY" && sliceDate) return { ...group, days: group.days.map(day => day.date === sliceDate && day.enabled ? { ...day, ...resizePair(day) } : day) };
  if (group.timeRule === "CONTINUOUS") {
    const start = dayNumber(group.startDate) * 1440 + groupMinutes(group.startTime), end = dayNumber(group.endDate) * 1440 + groupMinutes(group.endTime);
    const candidate = (edge === "start" ? start : end) + Math.round(dayDelta) * 1440 + Math.round(minuteDelta / 15) * 15;
    const endpoint = edge === "start" ? Math.min(candidate, end - 5) : Math.max(candidate, start + 5);
    const date = dayString(Math.floor(endpoint / 1440)), time = groupClock(endpoint % 1440);
    return edge === "start" ? { ...group, startDate: date, startTime: time } : { ...group, endDate: date, endTime: time };
  }
  const candidate = shiftGroupDate(edge === "start" ? group.startDate : group.endDate, Math.round(dayDelta));
  const next = { ...group, startDate: edge === "start" && candidate <= group.endDate ? candidate : group.startDate, endDate: edge === "end" && candidate >= group.startDate ? candidate : group.endDate };
  next.days = group.days.filter(day => day.date >= next.startDate && day.date <= next.endDate);
  return group.timeRule === "SAME_TIME_EACH_DAY" ? { ...next, ...resizePair(group) } : next;
}
