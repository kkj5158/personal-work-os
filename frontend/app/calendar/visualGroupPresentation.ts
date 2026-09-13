import { groupClock, groupDateDistance, sliceVisualGroups, type CalendarVisualGroup, type VisualGroupSlice } from "./visualGroups";

export interface VisualGroupRun { slice: VisualGroupSlice; first: number; last: number }

/** Presentation only: adjacent active dates share a frame, never a new entity. */
export function visualGroupRuns(groups: CalendarVisualGroup[], dates: string[]): VisualGroupRun[] {
  const slices = sliceVisualGroups(groups, dates), runs: VisualGroupRun[] = [];
  for (const group of groups) {
    let previous: VisualGroupRun | undefined;
    for (const slice of slices.filter(item => item.group === group)) {
      const index = dates.indexOf(slice.date);
      if (group.timeRule === "SAME_TIME_EACH_DAY" && previous && previous.last + 1 === index
        && groupDateDistance(dates[previous.last], slice.date) === 1) {
        previous.last = index;
        previous.slice = { ...previous.slice, endsHere: slice.endsHere,
          lane: Math.max(previous.slice.lane, slice.lane), lanes: Math.max(previous.slice.lanes, slice.lanes) };
      } else { previous = { slice: { ...slice }, first: index, last: index }; runs.push(previous); }
    }
  }
  return runs;
}

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const weekday = (date: string) => "일월화수목금토"[new Date(`${date}T00:00:00Z`).getUTCDay()];
export function visualGroupHeader(run: VisualGroupRun, dates: string[], period = false) {
  const { group, start, end } = run.slice, title = group.title || "새 그룹 블록";
  if (period) return `${title} · ${shortDate(group.startDate)}${group.startDate === group.endDate ? " · 종일" : `–${shortDate(group.endDate)}`}`;
  const days = run.first === run.last ? "" : `${weekday(dates[run.first])}–${weekday(dates[run.last])} · `;
  return `${title} · ${days}${groupClock(start)}–${groupClock(end)}`;
}

/** Period bands clip to the visible week. Repeating groups still skip OFF days. */
export function visualGroupBands(groups: CalendarVisualGroup[], dates: string[]) {
  const bands: (VisualGroupRun & { row: number })[] = [], rowEnds: number[] = [];
  for (const group of groups) {
    if (group.timeRule !== "ALL_DAY" && (dates.length === 1 || group.startDate === group.endDate)) continue;
    const runs = group.timeRule === "SAME_TIME_EACH_DAY" ? visualGroupRuns([group], dates)
      : visualGroupRuns([{ ...group, timeRule: "ALL_DAY" }], dates);
    if (!runs.length) continue;
    const spans = group.timeRule === "SAME_TIME_EACH_DAY" ? runs : [{ ...runs[0], last: runs[runs.length - 1].last }];
    for (const span of spans) {
      let row = rowEnds.findIndex(end => end < span.first);
      if (row < 0) row = rowEnds.length;
      rowEnds[row] = span.last;
      const actual = sliceVisualGroups([group], [dates[span.first]])[0];
      bands.push({ ...span, slice: actual ?? { ...span.slice, group }, row });
    }
  }
  return bands;
}
