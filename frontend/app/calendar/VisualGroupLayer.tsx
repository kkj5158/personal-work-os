"use client";
import { useMemo, type PointerEvent } from "react";
import { type CalendarVisualGroup, type VisualGroupSlice } from "./visualGroups";

import { visualGroupRuns, visualGroupHeader, visualGroupBands } from "./visualGroupPresentation";

export interface VisualGroupLayerProps {
  groups: CalendarVisualGroup[]; date?: string; dates?: string[]; scale: number; selectedId?: string; selectedIds?:string[];
  onSelect: (group: CalendarVisualGroup, slice: VisualGroupSlice, additive?:boolean) => void;
  onPointerDown?: (event: PointerEvent, group: CalendarVisualGroup, slice: VisualGroupSlice, handle: "move" | "start" | "end") => void;
}
/** One absolute layer across the existing columns; Activity lanes remain untouched. */
export function VisualGroupLayer({ groups, date, dates: range, scale, selectedId, selectedIds, onSelect, onPointerDown }: VisualGroupLayerProps) {
  const dates = useMemo(() => range ?? (date ? [date] : []), [range, date]);
  const runs = useMemo(() => visualGroupRuns(groups, dates), [groups, dates]);
  return <div className="cal-visual-groups" aria-label="그룹 블록 배경">
    {runs.filter(run => run.slice.group.timeRule !== "ALL_DAY").map(run => {
      const { slice, first, last } = run;
      const label = visualGroupHeader(run, dates);
      const group = slice.group, allDay = group.timeRule === "ALL_DAY";
      return <div key={`${group.id}:${slice.date}`} data-visual-group={group.id} data-group-date={slice.date} data-group-last-date={dates[last]} data-group-lane={slice.lane} className={`cal-visual-group ${(selectedIds?.includes(group.id) ?? selectedId === group.id) ? "selected" : ""} ${allDay ? "all-day" : ""}`}
        style={{ top: slice.start * scale, height: Math.max(6, (slice.end - slice.start) * scale), left: `calc(${(first + slice.lane / slice.lanes) / dates.length * 100}% + 2px)`, width: `calc(${(last - first + 1 / slice.lanes) / dates.length * 100}% - 4px)`, backgroundColor: `${group.color}09`, borderColor: `${group.color}80`, color: group.color }}>
        <div className="cal-visual-group-heading">
          <button className="cal-group-drag" aria-label={`${group.title} 그룹 블록 열기`} title={label} onPointerDown={event => onPointerDown?.(event, group, slice, "move")} onClick={event => { event.stopPropagation(); if (!onPointerDown || event.detail === 0) onSelect(group, slice,event.ctrlKey || event.metaKey); }}>{label}</button>

        </div>
        {(["left", "right", "bottom"] as const).map(edge => <button key={edge} className={`cal-group-frame ${edge}`} aria-label={`${group.title} 그룹 ${edge} 테두리 선택`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onSelect(group,slice,event.ctrlKey || event.metaKey); }} />)}
        {selectedId === group.id && !allDay && onPointerDown && <>
          {(group.timeRule !== "CONTINUOUS" || slice.startsHere) && <button className="cal-group-edge start" aria-label={`${group.title} 시작 조절`} onPointerDown={event => onPointerDown(event, group, slice, "start")} onClick={event => event.stopPropagation()}/>}
          {(group.timeRule !== "CONTINUOUS" || slice.endsHere) && <button className="cal-group-edge end" aria-label={`${group.title} 종료 조절`} onPointerDown={event => onPointerDown(event, group, slice, "end")} onClick={event => event.stopPropagation()}/>}
        </>}
      </div>;
    })}
  </div>;
}

export function VisualGroupPeriodBands({ groups, dates = [], selectedId, selectedIds, onSelect, onPointerDown }: VisualGroupLayerProps) {
  const bands = useMemo(() => visualGroupBands(groups, dates), [groups, dates]);
  if (!bands.length) return null;
  return <div className="cal-group-periods" aria-label="그룹 기간" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
    {bands.map(run => {
      const { group } = run.slice, selected = selectedIds?.includes(group.id) ?? selectedId === group.id;
      return <div key={`${group.id}:${run.first}`} data-group-band={group.id} data-band-start={dates[run.first]} data-band-end={dates[run.last]}
        className={`cal-group-period ${selected ? "selected" : ""}`} style={{ gridColumn: `${run.first + 1} / ${run.last + 2}`, gridRow: run.row + 1, color: group.color, borderColor: `${group.color}80`, backgroundColor: `${group.color}09` }}>
        <button title={visualGroupHeader(run, dates, true)} onClick={event => onSelect(group, run.slice,event.ctrlKey || event.metaKey)}>{visualGroupHeader(run, dates, true)}</button>
        {selected && group.timeRule === "ALL_DAY" && onPointerDown && <span className="cal-group-date-edges">
          {(["start", "move", "end"] as const).map(handle => <button key={handle} aria-label={`${group.title} ${handle === "move" ? "기간 이동" : handle === "start" ? "시작일 조절" : "종료일 조절"}`} onPointerDown={e => onPointerDown(e, group, run.slice, handle)}>{handle === "start" ? "‹" : handle === "end" ? "›" : "↔"}</button>)}
        </span>}
      </div>;
    })}
  </div>;
}
