"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ClockIcon, PeopleIcon, StarIcon } from "@primer/octicons-react";
import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";
import { monthElapsedDays, type MonthlyAbnormalCounts, type MonthlyAttendanceCounts } from "./attendance";

type DonutKey = "근무" | "휴일" | "연차" | "병가" | "조퇴" | "반차" | "결근" | "미입력";
// 미입력 included: daysElapsed must equal the actual calendar day-of-year
// (see aggregateYearlyAttendance's own day-by-day iteration, which counts
// every past-or-today date exactly once across these 8 buckets — never
// derivable from summing only "resolved" statuses, which undercounts on any
// date with unentered days). Keeping it last in the ring/legend since it's
// a neutral "not yet entered" bucket, not a real attendance outcome.
const DONUT_ORDER: readonly DonutKey[] = ["근무", "휴일", "연차", "병가", "조퇴", "반차", "결근", "미입력"];

const SIZE = 200;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface AnnualAttendanceSummaryProps {
  year: number;
  counts: MonthlyAttendanceCounts;
  daysInYear: number;
  monthlyAbnormal: MonthlyAbnormalCounts[];
  onTimeRate: number | null;
  averageWorkMinutes: number | null;
  averageScore: number | null;
  /** Needed only for the monthly flow chart's own elapsed-day denominator
   *  (attendance follow-up §18) — every other calculation here already
   *  receives pre-aggregated, reference-date-aware values. */
  referenceDate: Date;
}

// Fixed-footprint tooltip, positioned via the hovered/clicked element's own
// getBoundingClientRect() in viewport coordinates (`position: fixed`) —
// deliberately simpler than a card-relative measurement pass, and shared by
// both interactive widgets in this file (the annual donut and the monthly
// flow chart) despite them living in separate bordered cards.
const TOOLTIP_WIDTH = 200;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function tooltipPositionFromRect(rect: DOMRect, estimatedHeight: number): { left: number; top: number } {
  let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  left = clamp(left, TOOLTIP_MARGIN, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const fitsBelow = rect.bottom + TOOLTIP_GAP + estimatedHeight <= window.innerHeight - TOOLTIP_MARGIN;
  const top = fitsBelow ? rect.bottom + TOOLTIP_GAP : rect.top - TOOLTIP_GAP - estimatedHeight;
  return { left, top: clamp(top, TOOLTIP_MARGIN, window.innerHeight - estimatedHeight - TOOLTIP_MARGIN) };
}

// Annual summary (REQ: attendance management batch) — full-width section:
// LEFT an actual-attendance-composition donut for the selected year, RIGHT
// one monthly stacked 지각/조퇴/결근 bar chart (never three separate row
// charts — a confirmed requirement), plus a restrained secondary KPI row
// beneath both. Reuses the exact PROD attendance palette
// (attendancePresentation.ts) for every status color — never a new palette
// invented from the visual reference images.
//
// Attendance follow-up refinement (§3/§18): both the donut and the flow
// chart are now interactive — hover or click any segment/bar for a compact
// detail tooltip, matching the Monthly Attendance Donut's own established
// hover/click-to-pin/Escape/click-outside interaction (MonthlyAttendanceDonut.tsx).
export function AnnualAttendanceSummary({
  year,
  counts,
  daysInYear,
  monthlyAbnormal,
  onTimeRate,
  averageWorkMinutes,
  averageScore,
  referenceDate,
}: AnnualAttendanceSummaryProps) {
  const daysElapsed = DONUT_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const lengths = DONUT_ORDER.map((key) => (daysElapsed > 0 ? (counts[key] / daysElapsed) * CIRCUMFERENCE : 0));
  const segments = DONUT_ORDER.map((key, index) => ({
    key,
    value: counts[key],
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, len) => sum + len, 0),
  }));

  const insight = computeInsight(monthlyAbnormal);

  // --- Annual donut interaction (§3) ---
  const [pinnedDonutKey, setPinnedDonutKey] = useState<DonutKey | null>(null);
  const [hoveredDonutKey, setHoveredDonutKey] = useState<DonutKey | null>(null);
  const [donutTooltipPos, setDonutTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const activeDonutKey = pinnedDonutKey ?? hoveredDonutKey;
  const donutCardRef = useRef<HTMLDivElement>(null);
  const donutSegmentRefs = useRef<Partial<Record<DonutKey, SVGCircleElement>>>({});
  const donutLegendRefs = useRef<Partial<Record<DonutKey, HTMLButtonElement>>>({});

  function donutPercent(key: DonutKey): string {
    if (daysElapsed <= 0) return "0.0";
    return ((counts[key] / daysElapsed) * 100).toFixed(1);
  }

  useLayoutEffect(() => {
    if (!activeDonutKey) return;
    const segmentEl = donutSegmentRefs.current[activeDonutKey];
    const legendEl = donutLegendRefs.current[activeDonutKey];
    const el = segmentEl ?? legendEl;
    if (!el) return;
    setDonutTooltipPos(tooltipPositionFromRect(el.getBoundingClientRect(), 58));
  }, [activeDonutKey]);

  useLayoutEffect(() => {
    if (!pinnedDonutKey) return;
    function handlePointerDown(e: MouseEvent) {
      if (donutCardRef.current && !donutCardRef.current.contains(e.target as Node)) setPinnedDonutKey(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pinnedDonutKey]);

  useLayoutEffect(() => {
    if (!activeDonutKey) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinnedDonutKey(null);
        setHoveredDonutKey(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeDonutKey]);

  function toggleDonutPin(key: DonutKey) {
    setPinnedDonutKey((prev) => (prev === key ? null : key));
  }
  function clearDonutHover(key: DonutKey) {
    setHoveredDonutKey((prev) => (prev === key ? null : prev));
  }

  // --- Monthly flow chart interaction (§18) ---
  // Percentage denominator: that month's own elapsed calendar days — the
  // same "경과일 기준" concept the annual donut/Monthly Attendance Donut
  // already use, just scoped to one month, rather than inventing a new
  // workday-eligibility denominator. computeMonthlyAbnormalAttendance itself
  // only ever counts events up to referenceDate, so this never changes any
  // underlying count — purely a display-time ratio.
  const [pinnedBar, setPinnedBar] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const activeBar = pinnedBar ?? hoveredBar;
  const [barTooltipPos, setBarTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const flowCardRef = useRef<HTMLDivElement>(null);
  const barPartRefs = useRef<Record<string, SVGRectElement | SVGGElement>>({});

  useLayoutEffect(() => {
    if (!activeBar) return;
    const el = barPartRefs.current[activeBar];
    if (!el) return;
    setBarTooltipPos(tooltipPositionFromRect(el.getBoundingClientRect(), 58));
  }, [activeBar]);

  useLayoutEffect(() => {
    if (!pinnedBar) return;
    function handlePointerDown(e: MouseEvent) {
      if (flowCardRef.current && !flowCardRef.current.contains(e.target as Node)) setPinnedBar(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pinnedBar]);

  useLayoutEffect(() => {
    if (!activeBar) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinnedBar(null);
        setHoveredBar(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeBar]);

  function toggleBarPin(key: string) {
    setPinnedBar((prev) => (prev === key ? null : key));
  }
  function clearBarHover(key: string) {
    setHoveredBar((prev) => (prev === key ? null : prev));
  }

  const activeBarTooltip = activeBar ? parseBarKey(activeBar) : null;
  const activeBarMonthData = activeBarTooltip ? monthlyAbnormal[activeBarTooltip.month] : null;
  const activeBarElapsedDays = activeBarTooltip ? monthElapsedDays(year, activeBarTooltip.month, referenceDate) : 0;

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div ref={donutCardRef} className="relative rounded-md border border-border-default bg-surface-default p-6">
          <h2 className="mb-1 text-sm font-semibold text-fg-default">{year}년 연간 요약</h2>
          <p className="mb-4 text-xs text-fg-muted">
            {year}.01.01 ~ {year}.12.31 ({daysInYear}일)
          </p>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${year}년 연간 출결 요약`}>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border-muted)" strokeWidth={STROKE} />
                {segments
                  .filter((s) => s.length > 0)
                  .map((s) => (
                    <circle
                      key={s.key}
                      ref={(el) => {
                        if (el) donutSegmentRefs.current[s.key] = el;
                      }}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={ATTENDANCE_PRESENTATION[s.key].base}
                      strokeWidth={STROKE}
                      strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
                      strokeDashoffset={-s.offset}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                      tabIndex={0}
                      role="button"
                      aria-label={`${s.key} ${s.value}일, 전체의 ${donutPercent(s.key)}%`}
                      className="cursor-pointer outline-none"
                      onMouseEnter={() => setHoveredDonutKey(s.key)}
                      onMouseLeave={() => clearDonutHover(s.key)}
                      onFocus={() => setHoveredDonutKey(s.key)}
                      onBlur={() => clearDonutHover(s.key)}
                      onClick={() => toggleDonutPin(s.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleDonutPin(s.key);
                        }
                      }}
                    />
                  ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-semibold text-fg-default">{daysElapsed}일</span>
                <span className="text-xs text-fg-muted">경과</span>
                <span className="mt-1 text-[11px] text-fg-muted">/ {daysInYear}일</span>
              </div>
            </div>

            <ul className="flex flex-1 flex-col gap-1.5">
              {DONUT_ORDER.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) donutLegendRefs.current[key] = el;
                    }}
                    className={`-mx-1 flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-canvas-subtle ${
                      activeDonutKey === key ? "bg-canvas-subtle" : ""
                    }`}
                    aria-label={`${key} ${counts[key]}일, 전체의 ${donutPercent(key)}%`}
                    onMouseEnter={() => setHoveredDonutKey(key)}
                    onMouseLeave={() => clearDonutHover(key)}
                    onFocus={() => setHoveredDonutKey(key)}
                    onBlur={() => clearDonutHover(key)}
                    onClick={() => toggleDonutPin(key)}
                  >
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-fg-default">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: ATTENDANCE_PRESENTATION[key].base }}
                        aria-hidden="true"
                      />
                      {key}
                    </span>
                    <span className="whitespace-nowrap text-fg-muted">
                      <span className="font-medium text-fg-default">{counts[key]}일</span> ({donutPercent(key)}%)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {activeDonutKey && donutTooltipPos && (
            <div
              role="tooltip"
              className="fixed z-10 flex flex-col gap-0.5 rounded-md border border-border-default bg-surface-default px-3 py-2 text-xs shadow-sm"
              style={{ left: donutTooltipPos.left, top: donutTooltipPos.top, width: TOOLTIP_WIDTH }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-fg-default">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ATTENDANCE_PRESENTATION[activeDonutKey].base }}
                    aria-hidden="true"
                  />
                  {activeDonutKey}
                </span>
                <span className="font-medium text-fg-default">
                  {counts[activeDonutKey]}일 · {donutPercent(activeDonutKey)}%
                </span>
              </div>
              <p className="text-[10px] text-fg-muted">경과일 기준</p>
            </div>
          )}
        </div>

        <div ref={flowCardRef} className="relative rounded-md border border-border-default bg-surface-default p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg-default">월별 출결 흐름</h2>
            <Legend />
          </div>
          <p className="mb-4 text-xs text-fg-muted">지각 · 조퇴 · 결근 월별 발생 추이</p>
          <MonthlyAbnormalBarChart
            data={monthlyAbnormal}
            activeBar={activeBar}
            barPartRefs={barPartRefs}
            onHover={setHoveredBar}
            onClearHover={clearBarHover}
            onTogglePin={toggleBarPin}
          />
          {insight && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-border-default bg-canvas-subtle px-3 py-2.5 text-xs text-fg-default">
              <span aria-hidden="true">💡</span>
              <span>{insight}</span>
            </div>
          )}

          {activeBarTooltip && activeBarMonthData && barTooltipPos && (
            <div
              role="tooltip"
              className="fixed z-10 flex flex-col gap-0.5 rounded-md border border-border-default bg-surface-default px-3 py-2 text-xs shadow-sm"
              style={{ left: barTooltipPos.left, top: barTooltipPos.top, width: TOOLTIP_WIDTH }}
            >
              <BarTooltipContent month={activeBarTooltip.month} part={activeBarTooltip.part} data={activeBarMonthData} elapsedDays={activeBarElapsedDays} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md border border-border-default bg-surface-default p-6 min-[700px]:grid-cols-3">
        <Kpi icon={<ClockIcon size={20} aria-hidden="true" />} label="정시 출근율 (평균)" value={onTimeRate == null ? "–" : `${Math.round(onTimeRate * 100)}%`} />
        <Kpi
          icon={<PeopleIcon size={20} aria-hidden="true" />}
          label="평균 근무 시간 (일)"
          value={averageWorkMinutes == null ? "–" : formatMinutes(averageWorkMinutes)}
          sub="실근무 기준"
        />
        <Kpi icon={<StarIcon size={20} aria-hidden="true" />} label="근무 점수 (평균)" value={averageScore == null ? "–" : `${averageScore}점`} sub="전체 평균 점수" />
      </div>
    </section>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["지각", "#E8A33D"],
    ["조퇴", ATTENDANCE_PRESENTATION.조퇴.base],
    ["결근", ATTENDANCE_PRESENTATION.결근.base],
  ];
  return (
    <div className="flex items-center gap-3 text-xs text-fg-muted">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas-subtle text-fg-muted">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="text-xl font-semibold text-fg-default">{value}</span>
        {sub && <span className="text-[11px] text-fg-muted">{sub}</span>}
      </div>
    </div>
  );
}

const LATE_COLOR = "#E8A33D";

// month/part encoded into one string key so a single activeBar state can
// identify either a whole stacked bar ("total") or one of its three parts.
function barKey(month: number, part: "total" | "late" | "earlyLeave" | "absent"): string {
  return `${month}:${part}`;
}
function parseBarKey(key: string): { month: number; part: "total" | "late" | "earlyLeave" | "absent" } {
  const [monthStr, part] = key.split(":");
  return { month: Number(monthStr), part: part as "total" | "late" | "earlyLeave" | "absent" };
}

function BarTooltipContent({
  month,
  part,
  data,
  elapsedDays,
}: {
  month: number;
  part: "total" | "late" | "earlyLeave" | "absent";
  data: MonthlyAbnormalCounts;
  elapsedDays: number;
}) {
  const total = data.late + data.earlyLeave + data.absent;
  function pct(count: number): string {
    return elapsedDays > 0 ? ((count / elapsedDays) * 100).toFixed(1) : "0.0";
  }

  if (part === "total") {
    return (
      <>
        <div className="flex items-center justify-between gap-2 font-medium text-fg-default">
          <span>{month + 1}월</span>
          <span>총 {total}건</span>
        </div>
        <p className="text-[10px] text-fg-muted">지각 {data.late} · 조퇴 {data.earlyLeave} · 결근 {data.absent}</p>
        <p className="text-[10px] text-fg-muted">그 달의 경과일 {elapsedDays}일 기준</p>
      </>
    );
  }

  const labels: Record<"late" | "earlyLeave" | "absent", string> = { late: "지각", earlyLeave: "조퇴", absent: "결근" };
  const colors: Record<"late" | "earlyLeave" | "absent", string> = {
    late: LATE_COLOR,
    earlyLeave: ATTENDANCE_PRESENTATION.조퇴.base,
    absent: ATTENDANCE_PRESENTATION.결근.base,
  };
  const count = data[part];
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-fg-default">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[part] }} aria-hidden="true" />
          {month + 1}월 {labels[part]}
        </span>
        <span className="font-medium text-fg-default">
          {count}건 · {pct(count)}%
        </span>
      </div>
      <p className="text-[10px] text-fg-muted">그 달의 경과일 {elapsedDays}일 기준</p>
    </>
  );
}

function MonthlyAbnormalBarChart({
  data,
  activeBar,
  barPartRefs,
  onHover,
  onClearHover,
  onTogglePin,
}: {
  data: MonthlyAbnormalCounts[];
  activeBar: string | null;
  barPartRefs: React.MutableRefObject<Record<string, SVGRectElement | SVGGElement>>;
  onHover: (key: string) => void;
  onClearHover: (key: string) => void;
  onTogglePin: (key: string) => void;
}) {
  const width = 560;
  const height = 220;
  const paddingLeft = 32;
  const paddingBottom = 24;
  const paddingTop = 20;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingLeft - 8;

  const totals = data.map((m) => m.late + m.earlyLeave + m.absent);
  const maxTotal = Math.max(1, ...totals);
  const yMax = Math.ceil(maxTotal / 5) * 5 || 5;
  const barWidth = (chartWidth / 12) * 0.6;
  const groupWidth = chartWidth / 12;

  function y(value: number): number {
    return paddingTop + chartHeight - (value / yMax) * chartHeight;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="월별 지각/조퇴/결근 발생 추이">
      {gridLines.map((value) => (
        <g key={value}>
          <line x1={paddingLeft} x2={width} y1={y(value)} y2={y(value)} stroke="var(--border-muted)" strokeDasharray="3 3" />
          <text x={paddingLeft - 6} y={y(value) + 3} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
            {value}회
          </text>
        </g>
      ))}

      {data.map((m, index) => {
        const x = paddingLeft + index * groupWidth + (groupWidth - barWidth) / 2;
        const total = m.late + m.earlyLeave + m.absent;
        const lateHeight = chartHeight * (m.late / yMax);
        const earlyHeight = chartHeight * (m.earlyLeave / yMax);
        const absentHeight = chartHeight * (m.absent / yMax);
        const baseY = paddingTop + chartHeight;
        const totalKey = barKey(m.month, "total");
        const lateKey = barKey(m.month, "late");
        const earlyKey = barKey(m.month, "earlyLeave");
        const absentKey = barKey(m.month, "absent");
        return (
          <g key={m.month}>
            {m.late > 0 && (
              <rect
                ref={(el) => {
                  if (el) barPartRefs.current[lateKey] = el;
                }}
                x={x}
                y={baseY - lateHeight}
                width={barWidth}
                height={lateHeight}
                fill={LATE_COLOR}
                tabIndex={0}
                role="button"
                aria-label={`${m.month + 1}월 지각 ${m.late}건`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onHover(lateKey)}
                onMouseLeave={() => onClearHover(lateKey)}
                onFocus={() => onHover(lateKey)}
                onBlur={() => onClearHover(lateKey)}
                onClick={() => onTogglePin(lateKey)}
              />
            )}
            {m.earlyLeave > 0 && (
              <rect
                ref={(el) => {
                  if (el) barPartRefs.current[earlyKey] = el;
                }}
                x={x}
                y={baseY - lateHeight - earlyHeight}
                width={barWidth}
                height={earlyHeight}
                fill={ATTENDANCE_PRESENTATION.조퇴.base}
                tabIndex={0}
                role="button"
                aria-label={`${m.month + 1}월 조퇴 ${m.earlyLeave}건`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onHover(earlyKey)}
                onMouseLeave={() => onClearHover(earlyKey)}
                onFocus={() => onHover(earlyKey)}
                onBlur={() => onClearHover(earlyKey)}
                onClick={() => onTogglePin(earlyKey)}
              />
            )}
            {m.absent > 0 && (
              <rect
                ref={(el) => {
                  if (el) barPartRefs.current[absentKey] = el;
                }}
                x={x}
                y={baseY - lateHeight - earlyHeight - absentHeight}
                width={barWidth}
                height={absentHeight}
                fill={ATTENDANCE_PRESENTATION.결근.base}
                tabIndex={0}
                role="button"
                aria-label={`${m.month + 1}월 결근 ${m.absent}건`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onHover(absentKey)}
                onMouseLeave={() => onClearHover(absentKey)}
                onFocus={() => onHover(absentKey)}
                onBlur={() => onClearHover(absentKey)}
                onClick={() => onTogglePin(absentKey)}
              />
            )}
            {total > 0 && (
              <text
                ref={(el) => {
                  if (el) barPartRefs.current[totalKey] = el as unknown as SVGGElement;
                }}
                x={x + barWidth / 2}
                y={baseY - lateHeight - earlyHeight - absentHeight - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--fg-default)"
                tabIndex={0}
                role="button"
                aria-label={`${m.month + 1}월 전체 이상 출결 ${total}건`}
                className={`cursor-pointer outline-none ${activeBar === totalKey ? "font-semibold" : ""}`}
                onMouseEnter={() => onHover(totalKey)}
                onMouseLeave={() => onClearHover(totalKey)}
                onFocus={() => onHover(totalKey)}
                onBlur={() => onClearHover(totalKey)}
                onClick={() => onTogglePin(totalKey)}
              >
                {total}
              </text>
            )}
            <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">
              {m.month + 1}월
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function computeInsight(data: MonthlyAbnormalCounts[]): string | null {
  const totals = data.map((m) => m.late);
  const max = Math.max(...totals);
  if (max <= 0) return null;
  const monthIndex = totals.indexOf(max);
  return `${monthIndex + 1}월에 지각이 가장 많았어요.`;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}
