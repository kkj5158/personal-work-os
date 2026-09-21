"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarAttendanceContextDto, CalendarStateBlockDto, CalendarUnscheduledActualDto } from "@/lib/api/types";
import { formatDayHeader, isSameDay, parseLocalDateTime, startOfDay, toDateKey } from "@/lib/date";
import { resolveBlockColor, STATE_COLORS, type ColorMode } from "@/lib/calendarColor";
import { layoutDayLanes } from "./layoutLanes";
import type { GridBlock } from "./gridTypes";
import { actualConflict, conflictMessage, movedStart, scheduledPlacement } from "./actualDrag";
import { WeekUnscheduledActualRow } from "./WeekUnscheduledActualRow";
import { VisualGroupLayer, VisualGroupPeriodBands } from "./VisualGroupLayer";
import { moveVisualGroup, resizeVisualGroup, type CalendarVisualGroup, type VisualGroupSlice } from "./visualGroups";

import { formatDuration } from "./duration";
const TOTAL_MIN = 1440;
const ACTIVITY_INSET = 14; // Reserved even when context is hidden: visibility never changes geometry.
import { snapCreate as snap, snapResize, ACTIVE_DAY_MINUTES } from "./overview";
import { STATE_LABELS } from "./statePolicy";
const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);
const at = (date: Date, min: number) => { const d = startOfDay(date); d.setMinutes(min); return d; };
const minute = (value: string, date: Date) => (parseLocalDateTime(value).getTime() - startOfDay(date).getTime()) / 60000;
const time = (value: number) => {const min=Math.floor(value);return `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;};
const attendanceLabels = { WORK: "근무", HALF_DAY: "반차", PAID_LEAVE: "연차", DAY_OFF: "휴무" };

/** Strict overlap; adjoining endpoints are valid, and source IDs can coincide across domains. */
export function hasActualConflict(block: GridBlock | undefined, start: Date, end: Date, all: GridBlock[]) {
  return !!actualConflict(block,start,end,all);
}

export type UnscheduledPlan = Omit<GridBlock,"startAt"|"endAt"> & {date:string;startAt:null;endAt:null};

export interface TimeGridProps {
  unscheduledPlans?:UnscheduledPlan[];
  onPlanPlacement?:(plan:UnscheduledPlan|GridBlock,date:string,start?:number,end?:number)=>void;
  onUnscheduledPlanClick?:(plan:UnscheduledPlan,additive?:boolean,range?:boolean)=>void;
  isPlanSelected?:(plan:UnscheduledPlan)=>boolean;
  now?: Date | null;
  overview?: boolean;
  activeStart?: number;
  footer?: ReactNode;
  days: Date[];
  blocks: GridBlock[];
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  interactionMode: "plan" | "actual";
  onCreateRequest?: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: GridBlock, additive?:boolean, range?:boolean) => void;
  isBlockSelected?: (block:GridBlock)=>boolean;
  clipboardActive?:boolean;
  onPasteTarget?:(date:string,minute?:number)=>void;
  onBlockTimeChange: (block: GridBlock, newStart: Date, newEnd: Date) => void;
  stateBlocksByDate?: Map<string, CalendarStateBlockDto[]>;
  /** Thin overlay context rail, supported in Day and Week. */
  showWeekStateStrip?: boolean;
  maxHeightVh?: number;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (scrollTop: number) => void;
  selectedId?: string;
  draft?: GridBlock | null;
  appearance?: (block: GridBlock) => { parent: string; body: string };
  /** Complete, unfiltered Actual projection for global overlap validation. */
  conflictBlocks?: GridBlock[];
  attendanceContext?: CalendarAttendanceContextDto[];
  workingRanges?: { date: string; startAt: string; endAt: string }[];
  onInvalidDrop?: (message:string) => void;
  unscheduledItems?: CalendarUnscheduledActualDto[];
  onUnscheduledClick?: (item:CalendarUnscheduledActualDto,additive?:boolean,range?:boolean)=>void;
  isUnscheduledSelected?:(item:CalendarUnscheduledActualDto)=>boolean;
  onScheduleActual?: (item:CalendarUnscheduledActualDto,start:Date,end:Date)=>void;
  onUnscheduleActual?: (block:GridBlock,date:string)=>void;
  visualGroups?:CalendarVisualGroup[];
  selectedGroupId?:string;
  selectedGroupIds?:string[];
  groupCreateMode?:boolean;
  onGroupCreate?:(date:Date,start:number,end:number)=>void;
  onGroupSelect?:(group:CalendarVisualGroup,slice:VisualGroupSlice,additive?:boolean)=>void;
  onGroupChange?:(group:CalendarVisualGroup,transform:(current:CalendarVisualGroup)=>CalendarVisualGroup)=>void;
  onStateCreate?: (date: Date, start: number, end: number) => void;
  onStateClick?: (state: CalendarStateBlockDto) => void;
}

type Gesture = {
  mode: "create" | "state" | "move" | "resize" | "schedule" | "group" | "group-create";
  block?: GridBlock;
  item?: CalendarUnscheduledActualDto;
  planItem?:UnscheduledPlan;
  dropDate?: string;
  group?:CalendarVisualGroup;
  slice?:VisualGroupSlice;
  groupHandle?:"move"|"start"|"end";
  dayDelta?:number;
  minuteDelta?:number;
  dayIndex: number;
  originalDay: number;
  anchor: number;
  start: number;
  end: number;
  duration: number;
  originalStart: number;
  originalEnd: number;
  anchorMinute: number;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

export function TimeGrid(props: TimeGridProps) {
  const { days, blocks, colorMode, phases, projects, interactionMode, onCreateRequest, onBlockClick,
    onBlockTimeChange, stateBlocksByDate, showWeekStateStrip = false, maxHeightVh = 68,
    scrollContainerRef, onScroll, selectedId, draft, appearance, conflictBlocks = blocks,
    attendanceContext = [], workingRanges = [], onInvalidDrop, onStateCreate, onStateClick } = props;
  const now=props.now;
  const overview=props.overview ?? false;
  const [scale,setScale]=useState(overview ? .55 : 1);
  const activeStart=props.activeStart ?? 420;
  const nowMinute=now ? now.getHours()*60+now.getMinutes() : 0;
  const showNow=!!now && days.some(day=>isSameDay(day,now));
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? ownScrollRef;
  const contentRef = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [error, setError] = useState<string|null>(null);
  const inset=overview && days.length > 1 ? 7 : ACTIVITY_INSET;
  const minWidth=overview || days.length === 1 ? undefined : 692;
  const template = `${overview ? 34 : 48}px repeat(${days.length}, minmax(${overview || days.length === 1 ? 0 : 92}px, 1fr))`;
  const publish = (next: Gesture | null) => { gestureRef.current = next; setGesture(next); };
  useEffect(() => {
    const resize=()=>setScale(overview ? Math.max(.2,(window.innerHeight * maxHeightVh / 100 - 49) / ACTIVE_DAY_MINUTES) : 1);
    resize();window.addEventListener("resize",resize);return ()=>window.removeEventListener("resize",resize);
  },[overview,maxHeightVh]);
  useEffect(() => { if(scrollRef.current)scrollRef.current.scrollTop=(overview ? activeStart : 360)*scale; },[scrollRef,overview,activeStart,scale]);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(null), 3500); return () => clearTimeout(t); }, [error]);

  function position(x: number, y: number) {
    const index = columns.current.findIndex(col => { const r = col?.getBoundingClientRect(); return r && x >= r.left && x < r.right; });
    const rect = contentRef.current?.getBoundingClientRect();
    return { index, min: clamp(snap((y - (rect?.top ?? y)) / scale), 0, TOTAL_MIN) };
  }
  function updatePointer(x: number, y: number) {
    const g = gestureRef.current;
    if (!g) return;
    const p = position(x, y);
    const moved = g.moved || Math.abs(x - g.originX) > 3 || Math.abs(y - g.originY) > 3;
    const bucket = document.elementsFromPoint(x,y).map(el=>el.closest<HTMLElement>("[data-unscheduled-date]")).find(Boolean);
    let next = { ...g, pointerX: x, pointerY: y, moved, dropDate:bucket?.dataset.unscheduledDate };
    if(g.mode === "group") {
      const dayDelta=p.index < 0 ? (g.dayDelta ?? 0) : p.index-g.originalDay;
      const smallDrift=dayDelta !== 0 && Math.abs(y-g.originY)<24 && Math.abs(x-g.originX)>Math.abs(y-g.originY);
      next={...next,dropDate:undefined,dayDelta,minuteDelta:smallDrift ? 0 : p.min-g.anchorMinute};
    } else if (g.mode === "move") {
      const start = movedStart(g.originalStart,g.duration,p.min-g.anchorMinute,x-g.originX,y-g.originY,p.index >= 0 && p.index !== g.originalDay);
      next = { ...next, dayIndex: p.index < 0 ? g.dayIndex : p.index, start, end: start + g.duration };
    } else if(g.mode === "schedule") {
      next = {...next,dayIndex:p.index < 0 ? g.dayIndex : p.index,start:p.min,end:p.min+g.duration};
    } else if (g.mode === "resize") {
      next.end = snapResize(g.originalEnd, p.min - g.anchorMinute, g.start);
    } else {
      next.start = Math.min(g.anchor, p.min);
      next.end = Math.max(g.anchor, p.min);
      if (!moved || next.end === next.start) next.end = Math.min(next.start + 30, TOTAL_MIN);
      next.start = Math.min(next.start, next.end - 15);
    }
    if(!next.dropDate && next.mode!=="group" && !next.planItem){next.end=Math.min(next.end,1439);}
    publish(next);
  }
  // Recalculate against the scrolled content every animation frame, even if the pointer is stationary.
  const updatePointerRef = useRef(updatePointer);
  useEffect(() => { updatePointerRef.current = updatePointer; });
  useEffect(() => {
    if (!gesture) return;
    let frame: number;
    const tick = () => {
      const g = gestureRef.current;
      const el = scrollRef.current;
      if (!g || !el) return;
      const r = el.getBoundingClientRect();
      const speed = (p: number, lo: number, hi: number) => p < lo + 48 ? -14 * Math.pow(clamp((lo + 48 - p) / 48, 0, 1), 2)
        : p > hi - 48 ? 14 * Math.pow(clamp((p - hi + 48) / 48, 0, 1), 2) : 0;
      const y = g.dropDate ? 0 : speed(g.pointerY, r.top + 44, r.bottom);
      const x = speed(g.pointerX, r.left, r.right);
      if (x || y) { el.scrollTop += y; el.scrollLeft += x; updatePointerRef.current(g.pointerX, g.pointerY); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [!!gesture, scrollRef]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === "Escape" && gestureRef.current) {e.preventDefault();publish(null);} };
    window.addEventListener("keydown", cancel,true);
    return () => window.removeEventListener("keydown", cancel,true);
  }, []);

  function begin(e: ReactPointerEvent, dayIndex: number, mode: Gesture["mode"], block?: GridBlock) {
    e.stopPropagation();
    if(mode === "create" && props.groupCreateMode)mode="group-create";
    if (e.button !== 0 || (mode === "create" && !onCreateRequest) || (mode === "state" && !onStateCreate)) return;
    if(block && (e.ctrlKey || e.metaKey || e.shiftKey)){e.preventDefault();(e.currentTarget as HTMLElement).focus();onBlockClick(block,!e.shiftKey,e.shiftKey);return;}
    if(block?.running){onBlockClick(block);return;}
    if(block)(e.currentTarget as HTMLElement).focus();
    if(overview){if(block)onBlockClick(block);else if(props.clipboardActive){const p=position(e.clientX,e.clientY);props.onPasteTarget?.(toDateKey(days[dayIndex]),p.min);}return;}
    e.preventDefault();
    contentRef.current?.setPointerCapture(e.pointerId);
    const p = position(e.clientX, e.clientY);
    const start = block ? minute(block.startAt, days[dayIndex]) : clamp(p.min, 0, TOTAL_MIN - 30);
    const end = block ? minute(block.endAt, days[dayIndex]) : start + 30;
    publish({ mode, block, dayIndex, originalDay: dayIndex, anchor: block ? p.min - start : start,
      start, end, originalStart:start,originalEnd:end,anchorMinute:p.min,duration: end - start, pointerX: e.clientX, pointerY: e.clientY,
      originX: e.clientX, originY: e.clientY, moved: false });
  }
  function beginGroup(e:ReactPointerEvent,group:CalendarVisualGroup,slice:VisualGroupSlice,handle:"move"|"start"|"end") {
    e.stopPropagation();if(e.button !== 0 || !group.id)return;
    (e.currentTarget as HTMLElement).focus();
    if(e.ctrlKey || e.metaKey){e.preventDefault();props.onGroupSelect?.(group,slice,true);return;}
    if(overview){props.onGroupSelect?.(group,slice);return;}
    e.preventDefault();contentRef.current?.setPointerCapture(e.pointerId);
    const dayIndex=days.findIndex(day=>toDateKey(day) === slice.date), p=position(e.clientX,e.clientY);
    publish({mode:"group",group,slice,groupHandle:handle,dayDelta:0,minuteDelta:0,dayIndex,originalDay:p.index >= 0 ? p.index : dayIndex,anchor:p.min,start:slice.start,end:slice.end,duration:slice.end-slice.start,originalStart:slice.start,originalEnd:slice.end,anchorMinute:p.min,pointerX:e.clientX,pointerY:e.clientY,originX:e.clientX,originY:e.clientY,moved:false});
  }
  function transformGroup(g:Gesture,current:CalendarVisualGroup) {
    return g.groupHandle === "move" ? moveVisualGroup(current,g.dayDelta ?? 0,g.minuteDelta ?? 0)
      : resizeVisualGroup(current,g.groupHandle ?? "end",g.dayDelta ?? 0,g.minuteDelta ?? 0,g.slice?.date);
  }
  function beginUnscheduled(e:ReactPointerEvent,item:CalendarUnscheduledActualDto) {
    if(e.button !== 0 || overview)return;
    (e.currentTarget as HTMLElement).focus();
    if(e.ctrlKey || e.metaKey || e.shiftKey){e.stopPropagation();e.preventDefault();props.onUnscheduledClick?.(item,!e.shiftKey,e.shiftKey);return;}
    e.stopPropagation();e.preventDefault();contentRef.current?.setPointerCapture(e.pointerId);
    const dayIndex=Math.max(0,days.findIndex(day=>toDateKey(day) === item.date));
    publish({mode:"schedule",item,dayIndex,originalDay:dayIndex,anchor:0,start:0,end:item.durationMinutes,duration:item.durationMinutes,originalStart:0,originalEnd:item.durationMinutes,anchorMinute:0,pointerX:e.clientX,pointerY:e.clientY,originX:e.clientX,originY:e.clientY,moved:false,dropDate:item.date});
  }
  function beginUnscheduledPlan(e:ReactPointerEvent,plan:UnscheduledPlan) {
    e.stopPropagation();if(e.button!==0)return;e.preventDefault();
    if(e.ctrlKey||e.metaKey||e.shiftKey){props.onUnscheduledPlanClick?.(plan,!e.shiftKey,e.shiftKey);return;}
    contentRef.current?.setPointerCapture(e.pointerId);
    const dayIndex=Math.max(0,days.findIndex(d=>toDateKey(d)===plan.date));
    const duration=plan.durationMinutes && plan.durationMinutes>0 ? plan.durationMinutes : 60;
    publish({mode:"schedule",planItem:plan,dayIndex,originalDay:dayIndex,anchor:0,start:0,end:duration,duration,originalStart:0,originalEnd:duration,anchorMinute:0,pointerX:e.clientX,pointerY:e.clientY,originX:e.clientX,originY:e.clientY,moved:false,dropDate:plan.date});
  }
  function invalidMessage(g:Gesture):string|null {
    if(g.planItem && !g.dropDate && g.end>1439)return "계획이 같은 날짜에 들어가도록 시작 시각을 선택하세요.";
    if(g.planItem || (g.block && !g.block.sourceType))return null;
    if(g.dropDate || g.mode === "state" || g.mode === "group" || g.mode === "group-create" || (interactionMode !== "actual" && !g.block?.sourceType && !g.item))return null;
    if(g.end >= TOTAL_MIN || (g.item && !scheduledPlacement(g.item,g.start)))return "Actual은 같은 날짜 안의 유효한 시간에 배치하세요.";
    const identity=g.block ?? (g.item ? {id:g.item.sourceId,sourceType:g.item.sourceType} : undefined);
    const conflict=actualConflict(identity,at(days[g.dayIndex],g.start),at(days[g.dayIndex],g.end),conflictBlocks);
    return conflict ? conflictMessage(conflict) : null;
  }
  const invalid = gesture ? invalidMessage(gesture) : null;
  function finish() {
    const g = gestureRef.current;
    if (!g) return;
    publish(null);
    if(g.group && g.slice){if(!g.moved)props.onGroupSelect?.(g.group,g.slice);else props.onGroupChange?.(g.group,current=>transformGroup(g,current));return;}
    if(g.planItem && !g.moved){props.onUnscheduledPlanClick?.(g.planItem);return;}
    if(g.item && !g.moved){props.onUnscheduledClick?.(g.item);return;}
    if (g.block && !g.moved) { onBlockClick(g.block); return; }
    if(g.dropDate){if(g.planItem)props.onPlanPlacement?.(g.planItem,g.dropDate);else if(g.block && !g.block.sourceType)props.onPlanPlacement?.(g.block,g.dropDate);else if(g.block?.sourceType && g.mode === "move")props.onUnscheduleActual?.(g.block,g.dropDate);return;}
    if(position(g.pointerX,g.pointerY).index < 0)return;
    if(g.mode === "create" && !g.moved && props.clipboardActive){props.onPasteTarget?.(toDateKey(days[g.dayIndex]),g.start);return;}
    const message=invalidMessage(g);
    if (message) { setError(message); onInvalidDrop?.(message); return; }
    if(g.planItem){props.onPlanPlacement?.(g.planItem,toDateKey(days[g.dayIndex]),g.start,g.end);return;}
    if(g.item){props.onScheduleActual?.(g.item,at(days[g.dayIndex],g.start),at(days[g.dayIndex],g.end));return;}
    if(g.mode === "group-create"){props.onGroupCreate?.(days[g.dayIndex],g.start,g.end);return;}
    if (g.mode === "state") onStateCreate?.(days[g.dayIndex], g.start, g.end);
    else if (g.block) onBlockTimeChange(g.block, at(days[g.dayIndex], g.start), at(days[g.dayIndex], Math.min(g.end,1439)));
    else onCreateRequest?.(days[g.dayIndex], g.start, g.end);
  }
  const byDay = useMemo(() => days.map(date => layoutDayLanes(blocks.filter(b => toDateKey(parseLocalDateTime(b.startAt)) === toDateKey(date)))), [days, blocks]);
  const groupDates=useMemo(()=>days.map(toDateKey),[days]);
  const shownGroups=(props.visualGroups ?? []).map(group=>gesture?.group?.id === group.id && gesture.moved ? transformGroup(gesture,group) : group);

  function blockNode(block: GridBlock, dayIndex: number, laneIndex = 0, laneCount = 1, preview = false) {
    const date = days[dayIndex];
    const g = preview ? gesture : null;
    const start = g ? g.start : minute(block.startAt, date);
    const end = g ? g.end : minute(block.endAt, date);
    const colors = appearance?.(block);
    const fallback = resolveBlockColor(block, colorMode, { phases, projects });
    const isDraft = block.id === "draft";
    const selected = (props.isBlockSelected ? props.isBlockSelected(block) : block.id === selectedId) || isDraft || preview;
    const ghost = gesture?.block?.id === block.id && gesture.moved && !preview;
    const isPlan = !block.sourceType;
    return <div key={preview ? "preview" : `${block.sourceType ?? "plan"}:${block.id}`} role="button" tabIndex={isDraft || preview ? -1 : 0}
      title={`${block.title || "새 일정"} ${time(start)}–${time(end)}`}
      aria-label={`${block.title || "새 일정"} ${time(start)}–${time(end)}`} aria-pressed={selected}
      data-calendar-block={block.id} data-selected={selected} data-invalid={preview && invalid || undefined}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBlockClick(block,e.ctrlKey || e.metaKey); } }}
      onPointerDown={e => begin(e, dayIndex, "move", block)}
      className={`absolute select-none overflow-hidden rounded border text-[11px] leading-tight cursor-grab ${isPlan ? "border-dashed" : "border-solid"} ${!colors ? `${fallback.bg} ${fallback.border} ${fallback.text}` : "text-zinc-900"} ${selected ? "ring-2 ring-sky-500 shadow-md z-20" : "hover:brightness-95 z-10"} ${preview && invalid ? "ring-2 ring-red-500" : ""}`}
      style={{ top: start*scale, height: Math.max((end - start)*scale, overview ? 2 : 5), left: `calc(${inset}px + ${laneIndex} * (100% - ${inset + 4}px) / ${laneCount})`,
        width: `calc((100% - ${inset + 4}px) / ${laneCount} - 2px)`, touchAction: "none",
        opacity: ghost ? .22 : isDraft ? .65 : 1, pointerEvents: preview || isDraft ? "none" : undefined,
        backgroundColor: preview && invalid ? "#fee2e2" : colors ? `color-mix(in srgb, ${colors.body} ${isPlan ? 0 : 48}%, white)` : undefined,
        borderColor: colors?.parent }}>
      {colors && <div className="pointer-events-none absolute inset-y-0 left-0 w-[10%]" style={{ backgroundColor: `color-mix(in srgb, ${colors.parent} ${isPlan ? 45 : 85}%, white)` }} />}
      <div className={colors ? "relative ml-[10%] px-1 py-0.5" : "px-1 py-0.5"} style={{fontSize:overview ? 12 : undefined,display:overview && (days.length > 1 || (end-start)*scale < 18) ? "none" : undefined}}>
        <div className="truncate font-medium">{block.title || "새 일정"}</div>
        {(end - start)*scale >= 38 && <div className="truncate text-[10px] opacity-75">{time(start)}–{time(end)} · {formatDuration(end-start)}</div>}
      </div>
      {!isDraft && !overview && !block.running && <div role="separator" aria-label="종료 시간 조절" onPointerDown={e => begin(e, dayIndex, "resize", block)}
        className={`absolute inset-x-0 bottom-0 h-2 cursor-ns-resize ${selected ? "bg-black/10" : "hover:bg-black/10"}`} />}
    </div>;
  }

  return <div className="relative min-w-0 flex-1">
    <div ref={scrollRef} data-overview={overview || undefined} data-minute-scale={scale} className="overflow-auto border-y border-zinc-200" style={{ maxHeight: `${maxHeightVh}vh` }}
      onScroll={onScroll ? e => onScroll(e.currentTarget.scrollTop) : undefined}>
      <div className="sticky top-0 z-30 bg-white border-b border-zinc-200" style={{minWidth}}>
      <div className="grid" style={{gridTemplateColumns:template}}>
        <div className="text-[9px] text-zinc-400 self-center text-center">시간</div>
        {days.map(date => { const a = attendanceContext.find(item => item.date === toDateKey(date)); return <div key={toDateKey(date)} role="button" tabIndex={0} aria-label={`${toDateKey(date)} 붙여넣기 날짜`} onClick={()=>props.onPasteTarget?.(toDateKey(date))} onKeyDown={e=>{if(e.key === "Enter")props.onPasteTarget?.(toDateKey(date));}}
          className={`h-12 min-w-0 border-l border-zinc-200 px-1 py-1 text-center text-xs ${isSameDay(date, new Date()) ? "text-sky-600 font-semibold" : "text-zinc-600"}`}>
          {formatDayHeader(date)}<div className="mt-1 truncate text-[9px] font-normal text-zinc-400">{a?.plannedStatus ? attendanceLabels[a.plannedStatus] : "근태 미정"}{a?.plannedNetWorkMinutes ? ` · ${a.plannedNetWorkMinutes / 60}h` : ""}</div>
        </div>; })}
      </div>
      <div style={{marginLeft:overview ? 34 : 48}}><VisualGroupPeriodBands groups={shownGroups} dates={groupDates} scale={scale} selectedId={props.selectedGroupId} selectedIds={props.selectedGroupIds} onSelect={(group,slice,additive)=>props.onGroupSelect?.(group,slice,additive)} onPointerDown={beginGroup}/></div>
      </div>
      <div ref={contentRef} className="relative grid touch-none" style={{ gridTemplateColumns: template, minWidth }}
        onPointerMove={e => updatePointer(e.clientX, e.clientY)} onPointerUp={finish} onPointerCancel={() => publish(null)}>
        <div className="relative" style={{ height: TOTAL_MIN*scale }}>{Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute right-2 text-[10px] text-zinc-400" style={{ top: h * 60*scale - 6 }}>{time(h * 60)}</div>)}{showNow && <span data-current-time-label className="pointer-events-none absolute right-1 z-20 rounded bg-red-50 px-1 text-[9px] font-medium text-red-600" style={{top:nowMinute*scale-6}}>{time(nowMinute)}</span>}</div>
        <div className="cal-group-grid-layer" style={{left:overview ? 34 : 48}}><VisualGroupLayer groups={shownGroups} dates={groupDates} scale={scale} selectedId={props.selectedGroupId} selectedIds={props.selectedGroupIds} onSelect={(group,slice,additive)=>props.onGroupSelect?.(group,slice,additive)} onPointerDown={beginGroup}/></div>
        {days.map((date, index) => {
          const key = toDateKey(date);
          const range = workingRanges.find(r => r.date === key);
          const states = stateBlocksByDate?.get(key) ?? [];
          const active = gesture?.dayIndex === index && !gesture.dropDate ? gesture : null;
          return <div key={key} ref={el => { columns.current[index] = el; }} data-calendar-date={key}
            className="relative min-w-0 border-l border-zinc-200" style={{ height: TOTAL_MIN*scale }} onPointerDown={e => begin(e, index, "create")}>
            {range && <div className="pointer-events-none absolute inset-x-0 bg-sky-100/40" data-working-range={key}
              style={{ top: clamp(minute(range.startAt,date),0,TOTAL_MIN)*scale, height: Math.max(0,clamp(minute(range.endAt,date),0,TOTAL_MIN)-clamp(minute(range.startAt,date),0,TOTAL_MIN))*scale }} />}
            {now && isSameDay(date,now) && <div data-current-time={key} className="pointer-events-none absolute inset-x-0 z-20 border-t border-red-500/75" style={{top:nowMinute*scale}} />}
            {Array.from({ length: 48 }, (_, half) => <div key={half} className={`pointer-events-none absolute inset-x-0 border-t ${half % 2 ? "border-dotted border-zinc-100" : "border-zinc-200/60"}`} style={{ top: half * 30*scale }} />)}
            {showWeekStateStrip && <div data-state-rail className="absolute inset-y-0 left-0 z-20 cursor-crosshair bg-violet-50/60" style={{width:inset-2}} title="드래그하여 상태 추가" onPointerDown={e => begin(e, index, "state")}>
              {states.map(s => <button key={s.id} className={`absolute left-px rounded-sm ${STATE_COLORS[s.stateGroup].dot}`} style={{width:inset-4, top: minute(s.startAt, date)*scale, height: Math.max((minute(s.endAt, date) - minute(s.startAt, date))*scale, 2) }}
                title={`${STATE_LABELS[s.stateGroup]}${s.label ? ` · ${s.label}` : ""} · ${s.startAt.slice(11, 16)}–${s.endAt.slice(11, 16)}`} aria-label={`상태 ${STATE_LABELS[s.stateGroup]}${s.label ? ` · ${s.label}` : ""}`} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onStateClick?.(s); }} />)}
            </div>}
            {byDay[index].map(({ block, laneIndex, laneCount }) => blockNode(block, index, laneIndex, laneCount))}
            {draft && toDateKey(parseLocalDateTime(draft.startAt)) === key && blockNode(draft, index)}
            {active?.block && active.moved && blockNode(active.block, index, 0, 1, true)}
            {active && !active.block && active.mode !== "group" && <div className={`pointer-events-none absolute z-20 rounded border border-dashed px-1 text-[10px] ${invalid ? "border-red-500 bg-red-100/70 text-red-700" : "border-sky-500 bg-sky-100/60 text-sky-700"}`}
              style={{ top: active.start*scale, height: (active.end - active.start)*scale, left: active.mode === "state" ? 0 : ACTIVITY_INSET, right: active.mode === "state" ? "calc(100% - 12px)" : 4 }}>
              {active.mode !== "state" && `${toDateKey(days[index])} · ${time(active.start)}–${time(active.end)} · ${formatDuration(active.end-active.start)}`}
            </div>}
          </div>;
        })}
      </div>
      {props.unscheduledPlans && <div className="sticky bottom-0 z-30 grid border-t bg-white" style={{gridTemplateColumns:template}}><span className="text-xs">Plan<br/>시간 미지정</span>{days.map(day=><div key={toDateKey(day)} data-unscheduled-date={toDateKey(day)} className="min-h-14 border-l p-1" onClick={()=>props.onPasteTarget?.(toDateKey(day))}>{props.unscheduledPlans!.filter(p=>p.date===toDateKey(day)).map(p=><button key={p.id} data-unscheduled-plan={p.id} aria-pressed={props.isPlanSelected?.(p)} className="m-1 rounded border border-dashed px-2 text-xs" onPointerDown={e=>beginUnscheduledPlan(e,p)} onClick={e=>e.stopPropagation()}>{p.title}</button>)}</div>)}</div>}
      {gesture?.dropDate && <div role="status" className="sticky bottom-0 z-40 bg-sky-50 p-2 text-xs">{gesture.dropDate} · 시간 미지정으로 이동</div>}
      {(props.footer || props.unscheduledItems) && <div className="sticky bottom-0 z-30 bg-white" style={{minWidth:days.length === 1 ? undefined : 692}}>{props.unscheduledItems ? <WeekUnscheduledActualRow days={days} items={props.unscheduledItems} onScheduleRequest={(item,additive)=>props.onUnscheduledClick?.(item,additive)} isSelected={props.isUnscheduledSelected} onDateClick={props.onPasteTarget} onItemPointerDown={beginUnscheduled} activeDropDate={gesture?.dropDate}/> : props.footer}</div>}
    </div>
    {error && !onInvalidDrop && <div role="status" className="fixed bottom-5 right-5 z-50 rounded bg-zinc-900 px-4 py-3 text-xs text-white shadow">{error}</div>}
  </div>;
}
