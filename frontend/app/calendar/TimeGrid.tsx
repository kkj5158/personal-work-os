"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarAttendanceContextDto, CalendarStateBlockDto } from "@/lib/api/types";
import { formatDayHeader, isSameDay, parseLocalDateTime, startOfDay, toDateKey } from "@/lib/date";
import { resolveBlockColor, STATE_COLORS, type ColorMode } from "@/lib/calendarColor";
import { layoutDayLanes } from "./layoutLanes";
import type { GridBlock } from "./gridTypes";

const TOTAL_MIN = 1440;
const ACTIVITY_INSET = 14; // Reserved even when context is hidden: visibility never changes geometry.
const snap = (n: number) => Math.round(n / 15) * 15;
const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);
const at = (date: Date, min: number) => { const d = startOfDay(date); d.setMinutes(min); return d; };
const minute = (value: string, date: Date) => (parseLocalDateTime(value).getTime() - startOfDay(date).getTime()) / 60000;
const time = (min: number) => `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
const attendanceLabels = { WORK: "근무", HALF_DAY: "반차", PAID_LEAVE: "연차", DAY_OFF: "휴무" };

/** Strict overlap; adjoining endpoints are valid, and source IDs can coincide across domains. */
export function hasActualConflict(block: GridBlock | undefined, start: Date, end: Date, all: GridBlock[]) {
  return all.some(other => !(block && other.id === block.id && other.sourceType === block.sourceType)
    && start < parseLocalDateTime(other.endAt) && end > parseLocalDateTime(other.startAt));
}

export interface TimeGridProps {
  days: Date[];
  blocks: GridBlock[];
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  interactionMode: "plan" | "actual";
  onCreateRequest?: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: GridBlock) => void;
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
  onInvalidDrop?: () => void;
  onStateCreate?: (date: Date, start: number, end: number) => void;
  onStateClick?: (state: CalendarStateBlockDto) => void;
}

type Gesture = {
  mode: "create" | "state" | "move" | "resize";
  block?: GridBlock;
  dayIndex: number;
  originalDay: number;
  anchor: number;
  start: number;
  end: number;
  duration: number;
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
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? ownScrollRef;
  const contentRef = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [error, setError] = useState(false);
  const template = `48px repeat(${days.length}, minmax(${days.length === 1 ? 0 : 92}px, 1fr))`;
  const publish = (next: Gesture | null) => { gestureRef.current = next; setGesture(next); };
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 360; }, [scrollRef]);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(false), 3500); return () => clearTimeout(t); }, [error]);

  function position(x: number, y: number) {
    const index = columns.current.findIndex(col => { const r = col?.getBoundingClientRect(); return r && x >= r.left && x < r.right; });
    const rect = contentRef.current?.getBoundingClientRect();
    return { index, min: clamp(snap(y - (rect?.top ?? y)), 0, TOTAL_MIN) };
  }
  function updatePointer(x: number, y: number) {
    const g = gestureRef.current;
    if (!g) return;
    const p = position(x, y);
    const moved = g.moved || Math.abs(x - g.originX) > 3 || Math.abs(y - g.originY) > 3;
    let next = { ...g, pointerX: x, pointerY: y, moved };
    if (g.mode === "move") {
      const start = clamp(snap(p.min - g.anchor), 0, TOTAL_MIN - g.duration);
      next = { ...next, dayIndex: p.index < 0 ? g.dayIndex : p.index, start, end: start + g.duration };
    } else if (g.mode === "resize") {
      next.end = clamp(p.min, g.start + 15, TOTAL_MIN);
    } else {
      next.start = Math.min(g.anchor, p.min);
      next.end = Math.max(g.anchor, p.min);
      if (!moved || next.end === next.start) next.end = Math.min(next.start + 30, TOTAL_MIN);
      next.start = Math.min(next.start, next.end - 15);
    }
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
      const y = speed(g.pointerY, r.top + 44, r.bottom);
      const x = speed(g.pointerX, r.left, r.right);
      if (x || y) { el.scrollTop += y; el.scrollLeft += x; updatePointerRef.current(g.pointerX, g.pointerY); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [!!gesture, scrollRef]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === "Escape") publish(null); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  function begin(e: ReactPointerEvent, dayIndex: number, mode: Gesture["mode"], block?: GridBlock) {
    e.stopPropagation();
    if (e.button !== 0 || (mode === "create" && !onCreateRequest) || (mode === "state" && !onStateCreate)) return;
    e.preventDefault();
    contentRef.current?.setPointerCapture(e.pointerId);
    const p = position(e.clientX, e.clientY);
    const start = block ? minute(block.startAt, days[dayIndex]) : clamp(p.min, 0, TOTAL_MIN - 30);
    const end = block ? minute(block.endAt, days[dayIndex]) : start + 30;
    publish({ mode, block, dayIndex, originalDay: dayIndex, anchor: block ? p.min - start : start,
      start, end, duration: end - start, pointerX: e.clientX, pointerY: e.clientY,
      originX: e.clientX, originY: e.clientY, moved: false });
  }
  const invalid = gesture && gesture.mode !== "state" && interactionMode === "actual"
    ? hasActualConflict(gesture.block, at(days[gesture.dayIndex], gesture.start), at(days[gesture.dayIndex], gesture.end), conflictBlocks) : false;
  function finish() {
    const g = gestureRef.current;
    if (!g) return;
    publish(null);
    if (g.block && !g.moved) { onBlockClick(g.block); return; }
    if (invalid) { setError(true); onInvalidDrop?.(); return; }
    if (g.mode === "state") onStateCreate?.(days[g.dayIndex], g.start, g.end);
    else if (g.block) onBlockTimeChange(g.block, at(days[g.dayIndex], g.start), at(days[g.dayIndex], g.end));
    else onCreateRequest?.(days[g.dayIndex], g.start, g.end);
  }
  const byDay = useMemo(() => days.map(date => layoutDayLanes(blocks.filter(b => toDateKey(parseLocalDateTime(b.startAt)) === toDateKey(date)))), [days, blocks]);

  function blockNode(block: GridBlock, dayIndex: number, laneIndex = 0, laneCount = 1, preview = false) {
    const date = days[dayIndex];
    const g = preview ? gesture : null;
    const start = g ? g.start : minute(block.startAt, date);
    const end = g ? g.end : minute(block.endAt, date);
    const colors = appearance?.(block);
    const fallback = resolveBlockColor(block, colorMode, { phases, projects });
    const isDraft = block.id === "draft";
    const selected = block.id === selectedId || isDraft || preview;
    const ghost = gesture?.block?.id === block.id && gesture.moved && !preview;
    const isPlan = interactionMode === "plan";
    return <div key={preview ? "preview" : `${block.sourceType ?? "plan"}:${block.id}`} role="button" tabIndex={isDraft || preview ? -1 : 0}
      aria-label={`${block.title || "새 일정"} ${time(start)}–${time(end)}`} aria-pressed={selected}
      data-calendar-block={block.id} data-selected={selected} data-invalid={preview && invalid || undefined}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBlockClick(block); } }}
      onPointerDown={e => begin(e, dayIndex, "move", block)}
      className={`absolute select-none overflow-hidden rounded border text-[11px] leading-tight cursor-grab ${isPlan ? "border-dashed" : "border-solid"} ${!colors ? `${fallback.bg} ${fallback.border} ${fallback.text}` : "text-zinc-900"} ${selected ? "ring-2 ring-sky-500 shadow-md z-20" : "hover:brightness-95 z-10"} ${preview && invalid ? "ring-2 ring-red-500" : ""}`}
      style={{ top: start, height: Math.max(end - start, 15), left: `calc(${ACTIVITY_INSET}px + ${laneIndex} * (100% - ${ACTIVITY_INSET + 4}px) / ${laneCount})`,
        width: `calc((100% - ${ACTIVITY_INSET + 4}px) / ${laneCount} - 2px)`, touchAction: "none",
        opacity: ghost ? .22 : isDraft ? .65 : 1, pointerEvents: preview || isDraft ? "none" : undefined,
        backgroundColor: preview && invalid ? "#fee2e2" : colors ? `color-mix(in srgb, ${colors.body} ${isPlan ? 18 : 48}%, white)` : undefined,
        borderColor: colors?.parent }}>
      {colors && <div className="pointer-events-none absolute inset-y-0 left-0 w-[10%]" style={{ backgroundColor: `color-mix(in srgb, ${colors.parent} ${isPlan ? 45 : 85}%, white)` }} />}
      <div className={colors ? "relative ml-[10%] px-1 py-0.5" : "px-1 py-0.5"}>
        <div className="truncate font-medium">{block.title || "새 일정"}</div>
        {end - start >= 30 && <div className="truncate text-[10px] opacity-75">{time(start)}–{time(end)} · {end - start}분</div>}
      </div>
      {!isDraft && <div role="separator" aria-label="종료 시간 조절" onPointerDown={e => begin(e, dayIndex, "resize", block)}
        className={`absolute inset-x-0 bottom-0 h-2 cursor-ns-resize ${selected ? "bg-black/10" : "hover:bg-black/10"}`} />}
    </div>;
  }

  return <div className="relative min-w-0 flex-1">
    <div ref={scrollRef} className="overflow-auto border-y border-zinc-200 dark:border-zinc-800" style={{ maxHeight: `${maxHeightVh}vh` }}
      onScroll={onScroll ? e => onScroll(e.currentTarget.scrollTop) : undefined}>
      <div className="sticky top-0 z-30 grid bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800" style={{ gridTemplateColumns: template, minWidth: days.length === 1 ? undefined : 692 }}>
        <div className="text-[9px] text-zinc-400 self-center text-center">시간</div>
        {days.map(date => { const a = attendanceContext.find(item => item.date === toDateKey(date)); return <div key={toDateKey(date)}
          className={`h-12 min-w-0 border-l border-zinc-200 dark:border-zinc-800 px-1 py-1 text-center text-xs ${isSameDay(date, new Date()) ? "text-sky-600 font-semibold" : "text-zinc-600"}`}>
          {formatDayHeader(date)}<div className="mt-1 truncate text-[9px] font-normal text-zinc-400">{a?.plannedStatus ? attendanceLabels[a.plannedStatus] : "근태 미정"}{a?.plannedNetWorkMinutes ? ` · ${a.plannedNetWorkMinutes / 60}h` : ""}</div>
        </div>; })}
      </div>
      <div ref={contentRef} className="grid touch-none" style={{ gridTemplateColumns: template, minWidth: days.length === 1 ? undefined : 692 }}
        onPointerMove={e => updatePointer(e.clientX, e.clientY)} onPointerUp={finish} onPointerCancel={() => publish(null)}>
        <div className="relative" style={{ height: TOTAL_MIN }}>{Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute right-2 text-[10px] text-zinc-400" style={{ top: h * 60 - 6 }}>{time(h * 60)}</div>)}</div>
        {days.map((date, index) => {
          const key = toDateKey(date);
          const range = workingRanges.find(r => r.date === key);
          const attendance = attendanceContext.find(a => a.date === key);
          const states = stateBlocksByDate?.get(key) ?? [];
          const active = gesture?.dayIndex === index ? gesture : null;
          return <div key={key} ref={el => { columns.current[index] = el; }} data-calendar-date={key}
            className="relative min-w-0 border-l border-zinc-200 dark:border-zinc-800" style={{ height: TOTAL_MIN }} onPointerDown={e => begin(e, index, "create")}>
            {attendance?.plannedStatus && <div className="pointer-events-none absolute inset-x-0 bg-sky-100/25 dark:bg-sky-950/15" data-attendance-context={attendance.plannedStatus}
              style={{ top: range ? minute(range.startAt, date) : 0, height: range ? minute(range.endAt, date) - minute(range.startAt, date) : TOTAL_MIN }} />}
            {Array.from({ length: 48 }, (_, half) => <div key={half} className={`pointer-events-none absolute inset-x-0 border-t ${half % 2 ? "border-dotted border-zinc-100 dark:border-zinc-900" : "border-zinc-200/60 dark:border-zinc-800"}`} style={{ top: half * 30 }} />)}
            {showWeekStateStrip && <div data-state-rail className="absolute inset-y-0 left-0 z-20 w-3 cursor-crosshair bg-violet-50/60 dark:bg-violet-950/20" title="드래그하여 상태 추가" onPointerDown={e => begin(e, index, "state")}>
              {states.map(s => <button key={s.id} className={`absolute left-px w-2.5 rounded-sm ${STATE_COLORS[s.stateGroup].dot}`} style={{ top: minute(s.startAt, date), height: Math.max(minute(s.endAt, date) - minute(s.startAt, date), 4) }}
                title={`${s.label} · ${s.startAt.slice(11, 16)}–${s.endAt.slice(11, 16)}`} aria-label={`상태 ${s.label}`} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onStateClick?.(s); }} />)}
            </div>}
            {byDay[index].map(({ block, laneIndex, laneCount }) => blockNode(block, index, laneIndex, laneCount))}
            {draft && toDateKey(parseLocalDateTime(draft.startAt)) === key && blockNode(draft, index)}
            {active?.block && active.moved && blockNode(active.block, index, 0, 1, true)}
            {active && !active.block && <div className={`pointer-events-none absolute z-20 rounded border border-dashed px-1 text-[10px] ${invalid ? "border-red-500 bg-red-100/70 text-red-700" : "border-sky-500 bg-sky-100/60 text-sky-700"}`}
              style={{ top: active.start, height: active.end - active.start, left: active.mode === "state" ? 0 : ACTIVITY_INSET, right: active.mode === "state" ? "calc(100% - 12px)" : 4 }}>
              {active.mode !== "state" && `${time(active.start)}–${time(active.end)} · ${active.end - active.start}분`}
            </div>}
          </div>;
        })}
      </div>
    </div>
    {error && !onInvalidDrop && <div role="status" className="fixed bottom-5 right-5 z-50 rounded bg-zinc-900 px-4 py-3 text-xs text-white shadow">이미 기록된 실제 시간이 있습니다.</div>}
  </div>;
}
