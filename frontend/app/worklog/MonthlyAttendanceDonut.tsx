"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { aggregateMonthlyAttendance } from "./attendance";
import type { WorkLogRecord } from "./mockData";
import { FOCUS_VISIBLE } from "./format";

const SIZE = 240;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type CategoryKey = "근무" | "휴일" | "연차" | "병가" | "조퇴" | "결근" | "미입력";

// Dedicated donut palette (distinct from AttendanceBadge's semantic
// success/danger/warning hues) — exact hex values, reused as-is for the SVG
// ring segments (`stroke`), the legend dots (`style={{backgroundColor}}`),
// and the tooltip swatch, since none of those can consume a Tailwind class
// or an unrelated CSS token. Mirrors attendancePresentation.ts's own palette
// for 결근/미입력 so the two never visually disagree.
const SEGMENT_COLORS: Record<CategoryKey, string> = {
  근무: "#5B8DEF",
  휴일: "#A7AFBA",
  연차: "#8FBC7A",
  병가: "#B86B77",
  조퇴: "#E58B8B",
  결근: "#8B3A3A",
  미입력: "#D8DDE4",
};

// Fixed presentation order (spec: does not track object insertion order or
// aggregation order) — drives segment draw order (clockwise from the
// existing 12-o'clock start), legend rows, and tooltip lookups alike, so
// all three can never drift out of sync with each other.
const CATEGORY_ORDER: readonly CategoryKey[] = ["근무", "휴일", "연차", "병가", "조퇴", "결근", "미입력"];

// Tooltip is a small fixed-size popover (no measurement pass needed) — its
// two-line content is the same shape for every category, so a constant
// footprint is enough to compute containment without a second render pass.
const TOOLTIP_WIDTH = 184;
const TOOLTIP_HEIGHT = 54;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 10;
// Pushes the segment anchor point just outside the ring's outer edge so the
// tooltip never lands on top of the arc it describes or the center summary.
const SEGMENT_ANCHOR_RADIUS = RADIUS + STROKE / 2 + 10;
const TOOLTIP_ID = "monthly-attendance-donut-tooltip";

interface MonthlyAttendanceDonutProps {
  records: WorkLogRecord[];
  monthAnchor: Date;
  referenceDate: Date;
}

interface ActiveCategory {
  key: CategoryKey;
  source: "segment" | "legend";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Clamps a preferred anchor point to a position fully inside the card
// (spec: never clipped by the SVG or the card boundary at 1280/1920px).
// `align` controls which edge of the tooltip the anchor represents:
// "center" for a point on the ring (tooltip centers under/over it), "right"
// for a legend row (tooltip hangs from the row's right edge).
function computeTooltipPosition(
  anchorX: number,
  anchorY: number,
  cardWidth: number,
  cardHeight: number,
  align: "center" | "right",
): { left: number; top: number } {
  let left = align === "center" ? anchorX - TOOLTIP_WIDTH / 2 : anchorX - TOOLTIP_WIDTH;
  left = clamp(left, TOOLTIP_MARGIN, cardWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);

  const fitsBelow = anchorY + TOOLTIP_GAP + TOOLTIP_HEIGHT <= cardHeight - TOOLTIP_MARGIN;
  let top = fitsBelow ? anchorY + TOOLTIP_GAP : anchorY - TOOLTIP_GAP - TOOLTIP_HEIGHT;
  top = clamp(top, TOOLTIP_MARGIN, cardHeight - TOOLTIP_HEIGHT - TOOLTIP_MARGIN);

  return { left, top };
}

// Presentation only — all counting rules live in attendance.ts
// (aggregateMonthlyAttendance). This component never re-derives them; the
// tooltip percentage below is a pure display calculation on top of the
// already-aggregated counts, not a new aggregation rule.
export function MonthlyAttendanceDonut({ records, monthAnchor, referenceDate }: MonthlyAttendanceDonutProps) {
  const counts = aggregateMonthlyAttendance(records, monthAnchor, referenceDate);
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const daysElapsed = CATEGORY_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const monthLabel = `${monthAnchor.getMonth() + 1}월`;

  const [pinned, setPinned] = useState<ActiveCategory | null>(null);
  const [hovered, setHovered] = useState<ActiveCategory | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const active = pinned ?? hovered;

  const cardRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Partial<Record<CategoryKey, SVGCircleElement>>>({});
  const legendRefs = useRef<Partial<Record<CategoryKey, HTMLButtonElement>>>({});

  const ariaSummary = `${monthLabel} 출결 현황: ${CATEGORY_ORDER.map((key) => `${key} ${counts[key]}일`).join(", ")}. 근무일 합계 ${counts.workdayTotal}일, ${daysElapsed}일 경과 / ${daysInMonth}일.`;

  const lengths = CATEGORY_ORDER.map((key) => (daysElapsed > 0 ? (counts[key] / daysElapsed) * CIRCUMFERENCE : 0));
  const segments = CATEGORY_ORDER.map((key, index) => ({
    key,
    value: counts[key],
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, len) => sum + len, 0),
  }));

  function formatPercent(key: CategoryKey): string {
    if (daysElapsed <= 0) return "0.0";
    return ((counts[key] / daysElapsed) * 100).toFixed(1);
  }

  function togglePinned(next: ActiveCategory) {
    setPinned((prev) => (prev && prev.key === next.key && prev.source === next.source ? null : next));
  }

  function clearHover(source: ActiveCategory["source"], key: CategoryKey) {
    setHovered((prev) => (prev && prev.key === key && prev.source === source ? null : prev));
  }

  // Repositions the tooltip whenever the active category or its trigger
  // source changes — recomputed from scratch every time (rather than only
  // at the originating mouse/focus event) so switching directly between a
  // pinned segment and a hovered legend row, or vice versa, never leaves
  // the tooltip rendered at a stale anchor. useLayoutEffect (not
  // useEffect) so the first paint after opening already has the correct
  // position — no visible jump from 0,0.
  useLayoutEffect(() => {
    if (!active) return;
    const card = cardRef.current;
    if (!card) return;
    const cardRect = card.getBoundingClientRect();

    if (active.source === "segment") {
      const svgWrap = svgWrapRef.current;
      const segment = segments.find((s) => s.key === active.key && s.length > 0);
      if (!svgWrap || !segment) return;
      const svgRect = svgWrap.getBoundingClientRect();
      const midFraction = (segment.offset + segment.length / 2) / CIRCUMFERENCE;
      const theta = midFraction * 2 * Math.PI;
      const scaleX = svgRect.width / SIZE;
      const scaleY = svgRect.height / SIZE;
      const localX = SIZE / 2 + SEGMENT_ANCHOR_RADIUS * Math.sin(theta);
      const localY = SIZE / 2 - SEGMENT_ANCHOR_RADIUS * Math.cos(theta);
      const anchorX = svgRect.left + localX * scaleX - cardRect.left;
      const anchorY = svgRect.top + localY * scaleY - cardRect.top;
      setTooltipPos(computeTooltipPosition(anchorX, anchorY, cardRect.width, cardRect.height, "center"));
    } else {
      const el = legendRefs.current[active.key];
      if (!el) return;
      const itemRect = el.getBoundingClientRect();
      const anchorX = itemRect.right - cardRect.left;
      const anchorY = itemRect.bottom - cardRect.top;
      setTooltipPos(computeTooltipPosition(anchorX, anchorY, cardRect.width, cardRect.height, "right"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, active?.source]);

  // Click-outside dismissal only applies to a *pinned* tooltip — a
  // transient hover already clears itself on mouseleave/blur.
  useLayoutEffect(() => {
    if (!pinned) return;
    function handlePointerDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setPinned(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pinned]);

  useLayoutEffect(() => {
    if (!active) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinned(null);
        setHovered(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  const activeVisibleSegment = active ? segments.find((s) => s.key === active.key && s.length > 0) : undefined;

  return (
    <div ref={cardRef} className="relative flex h-full flex-col rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">{monthLabel} 출결 현황</h2>

      <div className="flex flex-1 items-center gap-6">
        <div ref={svgWrapRef} className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="group" aria-label={ariaSummary}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border-muted)" strokeWidth={STROKE} />

            {activeVisibleSegment && (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--fg-default)"
                strokeOpacity={0.18}
                strokeWidth={STROKE + 6}
                strokeDasharray={`${activeVisibleSegment.length} ${CIRCUMFERENCE - activeVisibleSegment.length}`}
                strokeDashoffset={-activeVisibleSegment.offset}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                style={{ pointerEvents: "none" }}
              />
            )}

            {segments
              .filter((s) => s.length > 0)
              .map((s) => (
                <circle
                  key={s.key}
                  ref={(el) => {
                    if (el) segmentRefs.current[s.key] = el;
                  }}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={SEGMENT_COLORS[s.key]}
                  strokeWidth={STROKE}
                  strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                  strokeDashoffset={-s.offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.key} ${s.value}일, 전체의 ${formatPercent(s.key)}%`}
                  aria-describedby={active?.key === s.key && active.source === "segment" ? TOOLTIP_ID : undefined}
                  className={`cursor-pointer outline-none ${FOCUS_VISIBLE}`}
                  onMouseEnter={() => setHovered({ key: s.key, source: "segment" })}
                  onMouseLeave={() => clearHover("segment", s.key)}
                  onFocus={() => setHovered({ key: s.key, source: "segment" })}
                  onBlur={() => clearHover("segment", s.key)}
                  onClick={() => togglePinned({ key: s.key, source: "segment" })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                      e.preventDefault();
                      togglePinned({ key: s.key, source: "segment" });
                    }
                  }}
                />
              ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold text-fg-default">{counts.workdayTotal}일</span>
            <span className="text-xs text-fg-muted">근무일</span>
            <span className="mt-1 text-[11px] text-fg-muted">
              {daysElapsed}일 경과 / {daysInMonth}일
            </span>
          </div>
        </div>

        <ul className="flex flex-1 flex-col gap-2">
          {CATEGORY_ORDER.map((key) => (
            <li key={key}>
              <button
                type="button"
                ref={(el) => {
                  if (el) legendRefs.current[key] = el;
                }}
                className={`-mx-1 flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-canvas-subtle ${FOCUS_VISIBLE} ${
                  active?.key === key ? "bg-canvas-subtle" : ""
                }`}
                aria-label={`${key} ${counts[key]}일, 전체의 ${formatPercent(key)}%`}
                aria-describedby={active?.key === key && active.source === "legend" ? TOOLTIP_ID : undefined}
                onMouseEnter={() => setHovered({ key, source: "legend" })}
                onMouseLeave={() => clearHover("legend", key)}
                onFocus={() => setHovered({ key, source: "legend" })}
                onBlur={() => clearHover("legend", key)}
                onClick={() => togglePinned({ key, source: "legend" })}
              >
                <span className="flex items-center gap-1.5 text-fg-default">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEGMENT_COLORS[key] }}
                    aria-hidden="true"
                  />
                  {key}
                </span>
                <span className="font-medium text-fg-default">{counts[key]}일</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {active && tooltipPos && (
        <div
          id={TOOLTIP_ID}
          role="tooltip"
          className="absolute z-10 flex flex-col gap-0.5 rounded-md border border-border-default bg-surface-default px-3 py-2 text-xs shadow-sm"
          style={{ left: tooltipPos.left, top: tooltipPos.top, width: TOOLTIP_WIDTH }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium text-fg-default">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SEGMENT_COLORS[active.key] }}
                aria-hidden="true"
              />
              {active.key}
            </span>
            <span className="font-medium text-fg-default">
              {counts[active.key]}일 · {formatPercent(active.key)}%
            </span>
          </div>
          <p className="text-[10px] text-fg-muted">경과일 기준</p>
        </div>
      )}
    </div>
  );
}
