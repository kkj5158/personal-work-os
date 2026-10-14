"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { civilDay, dateTicks, inclusiveDays, shiftDateRange, type DateRange, type RangeAction, type RangeScale } from "@/lib/dateRange";
import "./DateRangeTimeline.css";

export type TimelineItem = DateRange & { id: string; title: string; status: string; color: string; editable: boolean; modified?: boolean };
type Props = { items: TimelineItem[]; selectedId?: string; disabled?: boolean; onSelect: (id: string) => void; onChange: (id: string, range: DateRange) => void; actions?: React.ReactNode };
type Drag = { id: string; action: RangeAction; range: DateRange; proposed: DateRange; x: number; y: number; originX: number; scroll: number; px: number; min: number };
const extents = (items: TimelineItem[]) => {
  const dates = items.flatMap(i => [civilDay(i.startDate), civilDay(i.endDate)]);
  const now = civilDay(new Date().toISOString().slice(0, 10));
  return { min: Math.min(...dates, dates.length ? Infinity : now) - 14, max: Math.max(...dates, dates.length ? -Infinity : now) + 15 };
};

/** Domain-neutral civil-date editor. Consumers own drafts, validation and persistence. */
export function DateRangeTimeline({ items, selectedId, disabled, onSelect, onChange, actions }: Props) {
  const [scale, setScale] = useState<RangeScale>("week");
  const [bounds, setBounds] = useState(() => extents(items));
  const [fit, setFit] = useState(false), [viewport, setViewport] = useState(800), [tip, setTip] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null), stop = useRef<((cancel: boolean) => void) | null>(null);
  const callbacks = useRef({ onChange, onSelect });
  useLayoutEffect(() => { callbacks.current = { onChange, onSelect }; }, [onChange, onSelect]);
  useEffect(() => {
    const view = scroller.current;
    if (!view) return;
    const observer = new ResizeObserver(() => setViewport(view.clientWidth));
    observer.observe(view); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (drag.current) return;
    const next = extents(items);
    setBounds(old => next.min < old.min || next.max > old.max ? { min: Math.min(old.min, next.min), max: Math.max(old.max, next.max) } : old);
  }, [items]);
  useEffect(() => () => { stop.current?.(true); }, []);
  const px = fit ? Math.max(0.5, (viewport - 2) / (bounds.max - bounds.min + 1)) : scale === "day" ? 34 : scale === "week" ? 13 : 4;
  const width = Math.max(viewport, (bounds.max - bounds.min + 1) * px);
  const begin = (event: ReactPointerEvent<HTMLDivElement>, item: TimelineItem) => {
    if (event.button !== 0 || disabled || !item.editable || drag.current) return;
    event.preventDefault();
    const element = event.currentTarget, view = scroller.current!;
    const action = ((event.target as HTMLElement).closest<HTMLElement>("[data-range-action]")?.dataset.rangeAction ?? "move") as RangeAction;
    const initial: DateRange = { startDate: item.startDate, endDate: item.endDate };
    drag.current = { id: item.id, action, range: initial, proposed: initial, x: event.clientX, y: event.clientY, originX: event.clientX, scroll: view.scrollLeft, px, min: bounds.min };
    callbacks.current.onSelect(item.id);
    const focusTarget = (event.target as HTMLElement).closest<HTMLElement>("button") ?? element;
    focusTarget.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    setTip({ ...drag.current });
    let frame = 0;
    const apply = () => {
      const d = drag.current;
      if (!d) return;
      const rect = view.getBoundingClientRect();
      const speed = d.x < rect.left + 38 ? -Math.min(18, (rect.left + 38 - d.x) / 3) : d.x > rect.right - 38 ? Math.min(18, (d.x - rect.right + 38) / 3) : 0;
      if (speed) view.scrollLeft += speed;
      const next = shiftDateRange(d.range, d.action, (d.x - d.originX + view.scrollLeft - d.scroll) / d.px);
      if (next.startDate !== d.proposed.startDate || next.endDate !== d.proposed.endDate) { d.proposed = next; callbacks.current.onChange(d.id, next); }
      setTip({ ...d });
      frame = requestAnimationFrame(apply);
    };
    const move = (e: PointerEvent) => { if (e.pointerId === event.pointerId && drag.current) { drag.current.x = e.clientX; drag.current.y = e.clientY; } };
    const up = (e: PointerEvent) => { if (e.pointerId === event.pointerId) { move(e); const d = drag.current; if (d) { const next = shiftDateRange(d.range, d.action, (d.x - d.originX + view.scrollLeft - d.scroll) / d.px); callbacks.current.onChange(d.id, next); } finish(false); } };
    const cancel = () => finish(true);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); finish(true); } };
    const finish = (cancelled: boolean) => {
      const d = drag.current; drag.current = null;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", escape); window.removeEventListener("blur", cancel);
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (cancelled && d) callbacks.current.onChange(d.id, d.range);
      stop.current = null; setTip(null);
    };
    stop.current = finish;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", escape); window.addEventListener("blur", cancel);
    frame = requestAnimationFrame(apply);
  };
  return <section className="range-timeline" aria-label="챌린지 기간 타임라인">
    <header><div><h2>기간 타임라인</h2><small>모든 챌린지 · 날짜 조정 후 명시적으로 저장</small></div><div className="range-scales" aria-label="타임라인 배율">{(["day", "week", "month"] as const).map(s => <button key={s} disabled={!!tip} aria-pressed={scale === s} onClick={() => { setScale(s); setFit(false); }}>{s === "day" ? "일" : s === "week" ? "주" : "월"}</button>)}<button disabled={!!tip} aria-pressed={fit} onClick={() => { setBounds(extents(items)); setFit(true); }}>전체 맞춤</button></div></header>
    <div ref={scroller} className="range-scroll" tabIndex={0} aria-label="타임라인 가로 스크롤">
      <div className="range-grid" style={{ width }}>
        <div className="range-axis">{dateTicks(bounds.min, bounds.max, scale).map(t => <span key={t.day} style={{ left: (t.day - bounds.min) * px }}>{t.label}</span>)}</div>
        {items.map(item => <div key={item.id} data-lane-id={item.id} className={`range-lane ${item.id === selectedId ? "selected" : ""}`}>
          {dateTicks(bounds.min, bounds.max, scale).map(t => <i key={t.day} aria-hidden="true" className="range-gridline" style={{ left: (t.day - bounds.min) * px }} />)}
          <div className="range-lane-label"><button onClick={() => onSelect(item.id)} aria-pressed={item.id === selectedId}>{item.title || "새 챌린지"}</button><span>{item.status}</span>{item.modified && <em>수정됨</em>}<time>{item.startDate} → {item.endDate}</time></div>
          <div className={`range-bar ${item.editable ? "editable" : ""} ${tip?.id === item.id ? "dragging" : ""}`} data-range-id={item.id} role="group" tabIndex={item.editable ? 0 : -1} aria-label={`${item.title} 기간 이동`} title={`${item.title} · ${item.startDate} → ${item.endDate}`} style={{ left: (civilDay(item.startDate) - bounds.min) * px, width: inclusiveDays(item) * px, "--range-color": item.color } as CSSProperties} onPointerDown={e => begin(e, item)} onKeyDown={e => {
            if (disabled || !item.editable || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation(); onSelect(item.id);
            const action = ((e.target as HTMLElement).dataset.rangeAction ?? "move") as RangeAction;
            onChange(item.id, shiftDateRange(item, action, (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 7 : 1)));
          }}>
            <span className="range-date-label">{item.startDate.slice(5)} — {item.endDate.slice(5)}</span>
            {item.editable && <><button type="button" disabled={disabled} className="range-handle start" data-range-action="start" aria-label={`${item.title} 시작일 조정`}>│</button><button type="button" disabled={disabled} className="range-move-target" data-range-action="move" aria-label={`${item.title} 기간 이동 손잡이`}>↔</button><button type="button" disabled={disabled} className="range-handle end" data-range-action="end" aria-label={`${item.title} 종료일 조정`}>│</button></>}
          </div>
        </div>)}
        {!items.length && <p className="range-empty">표시할 챌린지가 없습니다.</p>}
      </div>
    </div>
    <small>양 끝 손잡이: 시작/종료일 · 막대/↔: 기간 이동 · 방향키: 1일 (Shift: 7일) · Esc: 이번 조정 취소</small>
    {actions && <footer>{actions}</footer>}
    {tip && createPortal(<div className="range-tooltip" role="status" style={{ left: Math.max(8, Math.min(window.innerWidth - Math.min(300, window.innerWidth - 16) - 8, tip.x - 145)), top: tip.y > 140 ? tip.y - 125 : Math.min(window.innerHeight - 114, tip.y + 40), width: Math.min(300, window.innerWidth - 16) }}><div>{tip.action === "start" ? "시작일 조정" : tip.action === "end" ? "종료일 조정" : "기간 이동"}<span>저장 전</span></div><p><b className={tip.action !== "end" ? "accent" : ""}>{tip.proposed.startDate}</b> → <b className={tip.action !== "start" ? "accent" : ""}>{tip.proposed.endDate}</b></p><div>{inclusiveDays(tip.proposed)}일 · 양 끝 날짜 포함<span>Esc 취소</span></div></div>, document.body)}
  </section>;
}
