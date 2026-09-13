"use client";
import { useMemo, type PointerEvent } from "react";
import { sliceVisualGroups, type CalendarVisualGroup, type VisualGroupSlice } from "./visualGroups";

export interface VisualGroupLayerProps {
  groups: CalendarVisualGroup[]; date: string; scale: number; selectedId?: string;
  onSelect: (group: CalendarVisualGroup, slice: VisualGroupSlice) => void;
  onPointerDown?: (event: PointerEvent, group: CalendarVisualGroup, slice: VisualGroupSlice, handle: "move" | "start" | "end") => void;
}
/** Mount inside an existing relative day column. Decoration lanes affect only
 * this absolute background layer, never TimeGrid's Activity layout inputs. */
export function VisualGroupLayer({ groups, date, scale, selectedId, onSelect, onPointerDown }: VisualGroupLayerProps) {
  const slices = useMemo(() => sliceVisualGroups(groups, [date]), [groups, date]);
  return <div className="cal-visual-groups" aria-label="그룹 블록 배경">
    {slices.map(slice => {
      const group = slice.group, allDay = group.timeRule === "ALL_DAY";
      return <div key={group.id} data-visual-group={group.id} data-group-date={date} data-group-lane={slice.lane} className={`cal-visual-group ${selectedId === group.id ? "selected" : ""} ${allDay ? "all-day" : ""}`}
        style={{ top: slice.start * scale, height: Math.max(6, (slice.end - slice.start) * scale), left: `calc(${slice.lane / slice.lanes * 100}% + 2px)`, width: `calc(${100 / slice.lanes}% - 4px)`, backgroundColor: `${group.color}0b`, borderColor: `${group.color}65`, color: group.color }}>
        <div className="cal-visual-group-heading">
          <button className="cal-group-drag" aria-label={`${group.title} 그룹 블록 열기`} title={`${group.title} · ${group.startDate}–${group.endDate}`} onPointerDown={event => onPointerDown?.(event, group, slice, "move")} onClick={event => { event.stopPropagation(); if (!onPointerDown || event.detail === 0) onSelect(group, slice); }}>{group.title || "새 그룹 블록"}</button>
          {allDay && onPointerDown && <span className="cal-group-date-edges">
            <button aria-label={`${group.title} 시작일 조절`} title="시작일 조절" onPointerDown={event => onPointerDown(event, group, slice, "start")} onClick={event => event.stopPropagation()}>‹</button>
            <button aria-label={`${group.title} 종료일 조절`} title="종료일 조절" onPointerDown={event => onPointerDown(event, group, slice, "end")} onClick={event => event.stopPropagation()}>›</button>
          </span>}
        </div>
        {!allDay && onPointerDown && <>
          {(group.timeRule !== "CONTINUOUS" || slice.startsHere) && <button className="cal-group-edge start" aria-label={`${group.title} 시작 조절`} onPointerDown={event => onPointerDown(event, group, slice, "start")} onClick={event => event.stopPropagation()}/>}
          {(group.timeRule !== "CONTINUOUS" || slice.endsHere) && <button className="cal-group-edge end" aria-label={`${group.title} 종료 조절`} onPointerDown={event => onPointerDown(event, group, slice, "end")} onClick={event => event.stopPropagation()}/>}
        </>}
      </div>;
    })}
  </div>;
}
