"use client";

import { useState } from "react";
import type { WorkChartReferenceLineDto } from "@/lib/api/types";
import { summarizeDailyLateness, type DailyWorkPoint } from "./selectors";
import { formatHoursMinutes } from "./format";
import { formatReferenceLineValue, linesForScope, referenceLineColorVar } from "./referenceLine";

interface DailyWorkChartProps {
  points: DailyWorkPoint[]; // exactly the current week, 7 points
  referenceLines: WorkChartReferenceLineDto[]; // all scopes — filtered internally to DAILY_TIME/DAILY_SCORE
}

type Mode = "time" | "score";

const WIDTH = 1200;
const HEIGHT = 300;
const PADDING_TOP = 32;
// Tall enough for both the date label and, beneath it, a per-day "⚠️ 지각"
// marker (§3 lateness UX) — the marker row only ever renders for late
// days, but the reserved space must stay constant so the plot area doesn't
// shift height between weeks with and without a late day.
const PADDING_BOTTOM = 50;
const PADDING_LEFT = 56;
const PADDING_RIGHT = 24;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface Plotted {
  x: number;
  y: number;
}

// Same Catmull-Rom-to-cubic-Bézier technique as SmoothTrendChart — kept as
// its own small copy here rather than a shared extraction, since this
// chart's two-series-plus-baseline shape doesn't map cleanly onto that
// component's single-series props without risking its existing behavior.
function toSmoothPath(points: Plotted[], minPixelY: number, maxPixelY: number): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const segmentLow = Math.min(p1.y, p2.y);
    const segmentHigh = Math.max(p1.y, p2.y);
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;
    cp1y = clamp(clamp(cp1y, segmentLow, segmentHigh), minPixelY, maxPixelY);
    cp2y = clamp(clamp(cp2y, segmentLow, segmentHigh), minPixelY, maxPixelY);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const HOUR_STEP_CANDIDATES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

function buildDurationTicks(maxMinutes: number): number[] {
  const maxHours = Math.max(1, (maxMinutes * 1.15) / 60);
  const step = HOUR_STEP_CANDIDATES.find((candidate) => maxHours / candidate <= 5) ?? Math.ceil(maxHours / 5);
  const upperHour = Math.ceil(maxHours / step) * step;
  const ticks: number[] = [];
  for (let hour = 0; hour <= upperHour; hour += step) ticks.push(hour * 60);
  return ticks;
}

// Daily Work chart (post-production iteration 1, REQ-04; reference-line
// generalization in batch 2) — a new context chart alongside the existing
// 주간 근무 시간/평균 점수 trend cards, scoped to the current week's seven
// days rather than a 12-week rolling window. Time mode plots two series
// (체류 시간, 실근무); Score mode plots one (근무 점수). Both modes show up
// to 3 configurable dashed reference lines ("기준선 설정") instead of the
// old single fixed target — simple current values, no effective-dated
// history (explicit scope limit carried over from REQ-04). Non-work dates
// are gaps, never a fake zero.
export function DailyWorkChart({ points, referenceLines }: DailyWorkChartProps) {
  const [mode, setMode] = useState<Mode>("time");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const n = points.length;
  const latenessSummary = summarizeDailyLateness(points);
  const timeLines = linesForScope(referenceLines, "DAILY_TIME");
  const scoreLines = linesForScope(referenceLines, "DAILY_SCORE");
  const activeLines = mode === "time" ? timeLines : scoreLines;
  const lineValues = activeLines.map((l) => l.value);

  const rawMax =
    mode === "score"
      ? 100
      : Math.max(0, ...lineValues, ...points.map((p) => Math.max(p.stayMinutes ?? 0, p.netWorkMinutes ?? 0)));
  const ticks = mode === "score" ? [0, 20, 40, 60, 80, 100] : buildDurationTicks(rawMax);
  const domainMax = mode === "score" ? 100 : ticks[ticks.length - 1];
  const formatValue = mode === "score" ? (v: number) => `${v}점` : (v: number) => formatHoursMinutes(v);

  function xFor(index: number): number {
    if (n <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
    return PADDING_LEFT + (PLOT_WIDTH * index) / (n - 1);
  }
  function yFor(value: number): number {
    const ratio = value / (domainMax || 1);
    return PADDING_TOP + PLOT_HEIGHT * (1 - ratio);
  }
  const baselineY = yFor(0);
  const topY = yFor(domainMax);

  function buildSegments(values: (number | null)[]): Plotted[][] {
    const segments: Plotted[][] = [];
    let current: Plotted[] = [];
    values.forEach((value, index) => {
      if (value == null) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        return;
      }
      current.push({ x: xFor(index), y: yFor(value) });
    });
    if (current.length > 0) segments.push(current);
    return segments;
  }

  const staySegments = mode === "time" ? buildSegments(points.map((p) => p.stayMinutes)) : [];
  const netWorkSegments = mode === "time" ? buildSegments(points.map((p) => p.netWorkMinutes)) : [];
  const scoreSegments = mode === "score" ? buildSegments(points.map((p) => p.score)) : [];

  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;

  return (
    <div className="flex w-full flex-col gap-4 rounded-md border border-border-default bg-surface-default p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg-default">일별 근무</h3>
          <p className="text-xs text-fg-muted">이번 주 요일별 근무 시간과 점수를 확인합니다.</p>
        </div>
        <div className="flex h-8 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
          {(["time", "score"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 ${mode === m ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
            >
              {m === "time" ? "시간" : "점수"}
            </button>
          ))}
        </div>
      </div>

      {/* Lightweight lateness summary (§2) — plain text, not a new
          dashboard card. Always shown (matching WeeklySummary's own "지각
          n회" — a week with zero late days still reads as a confirmed
          zero, not an absent field); only the color escalates when late
          days exist. */}
      <p className={`text-xs ${latenessSummary.count > 0 ? "text-danger-fg" : "text-fg-muted"}`}>
        지각 {latenessSummary.count}회 · 총 지각 시간 {latenessSummary.totalMinutes}분 · 평균 지각 시간{" "}
        {latenessSummary.averageMinutes == null ? "–" : `${latenessSummary.averageMinutes}분`}
      </p>

      <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        {mode === "time" ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--primary-emphasis)" }} />
              체류 시간
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--success-emphasis)" }} />
              실근무
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--chart-score-emphasis)" }} />
            근무 점수
          </span>
        )}
        {activeLines.map((line) => (
          <span key={line.id} className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-t border-dashed" style={{ borderColor: referenceLineColorVar(line.color) }} />
            {line.label} {formatReferenceLineValue(mode === "time" ? "DAILY_TIME" : "DAILY_SCORE", line.value)}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="group" aria-label="일별 근무 차트">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PADDING_LEFT} y1={yFor(tick)} x2={WIDTH - PADDING_RIGHT} y2={yFor(tick)} stroke="var(--border-muted)" strokeWidth={1} strokeDasharray="3 4" />
            <text x={PADDING_LEFT - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {/* Reference lines (up to 3) — thin dashed, each in its own
            configured color, with its label+value rendered adjacent to the
            line itself (spec: never make the user decode from a distant
            legend alone) rather than only in the strip above. */}
        {activeLines.map((line) => {
          const y = yFor(line.value);
          const color = referenceLineColorVar(line.color);
          return (
            <g key={line.id}>
              <line x1={PADDING_LEFT} y1={y} x2={WIDTH - PADDING_RIGHT} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray="6 4" />
              <text x={WIDTH - PADDING_RIGHT - 4} y={y - 5} textAnchor="end" fill={color} className="text-[10px] font-medium">
                {line.label} · {formatReferenceLineValue(mode === "time" ? "DAILY_TIME" : "DAILY_SCORE", line.value)}
              </text>
            </g>
          );
        })}

        {/* Translucent area fills beneath both time-mode series (§24
            refinement) — makes the 체류 시간/실근무 gap visually obvious at
            a glance. Rendered before the line strokes so the lines stay on
            top; each segment fills only its own contiguous run, so a
            non-work gap is never bridged or drawn as a filled zero. */}
        {mode === "time" &&
          staySegments.map(
            (segment, i) =>
              segment.length >= 2 && (
                <path
                  key={`stay-fill-${i}`}
                  d={`${toSmoothPath(segment, topY, baselineY)} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`}
                  fill="var(--primary-emphasis)"
                  fillOpacity={0.08}
                  stroke="none"
                />
              ),
          )}
        {mode === "time" &&
          netWorkSegments.map(
            (segment, i) =>
              segment.length >= 2 && (
                <path
                  key={`net-fill-${i}`}
                  d={`${toSmoothPath(segment, topY, baselineY)} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`}
                  fill="var(--success-emphasis)"
                  fillOpacity={0.1}
                  stroke="none"
                />
              ),
          )}

        {mode === "time" &&
          staySegments.map(
            (segment, i) =>
              segment.length >= 2 && (
                <path key={`stay-${i}`} d={toSmoothPath(segment, topY, baselineY)} fill="none" stroke="var(--primary-emphasis)" strokeWidth={2} strokeLinecap="round" />
              ),
          )}
        {mode === "time" &&
          netWorkSegments.map(
            (segment, i) =>
              segment.length >= 2 && (
                <path key={`net-${i}`} d={toSmoothPath(segment, topY, baselineY)} fill="none" stroke="var(--success-emphasis)" strokeWidth={2} strokeLinecap="round" />
              ),
          )}
        {mode === "score" &&
          scoreSegments.map(
            (segment, i) =>
              segment.length >= 2 && (
                <path key={`score-${i}`} d={toSmoothPath(segment, topY, baselineY)} fill="none" stroke="var(--chart-score-emphasis)" strokeWidth={2} strokeLinecap="round" />
              ),
          )}

        {points.map((point, index) => {
          const x = xFor(index);
          const values =
            mode === "time" ? [{ value: point.stayMinutes, color: "var(--primary-emphasis)" }, { value: point.netWorkMinutes, color: "var(--success-emphasis)" }] : [{ value: point.score, color: "var(--chart-score-emphasis)" }];
          const hasAny = values.some((v) => v.value != null);
          return (
            <g key={index}>
              {!hasAny && (
                <text x={x} y={PADDING_TOP + PLOT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--fg-muted)" className="text-xs">
                  –
                </text>
              )}
              {values.map(
                (v, vi) =>
                  v.value != null && (
                    <circle
                      key={vi}
                      cx={x}
                      cy={yFor(v.value)}
                      r={3.5}
                      fill={v.color}
                      tabIndex={0}
                      role="img"
                      aria-label={`${point.label} ${formatValue(v.value)}`}
                      className="cursor-default outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-outline"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                      onFocus={() => setHoveredIndex(index)}
                      onBlur={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                    />
                  ),
              )}
              <rect x={x - PLOT_WIDTH / (2 * Math.max(n - 1, 1))} y={PADDING_TOP} width={PLOT_WIDTH / Math.max(n - 1, 1)} height={PLOT_HEIGHT} fill="transparent" onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))} />
            </g>
          );
        })}

        {points.map((point, index) => (
          <text key={`x-${index}`} x={xFor(index)} y={HEIGHT - PADDING_BOTTOM + 20} textAnchor="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
            {point.label}
          </text>
        ))}

        {/* Per-day late marker (§3) — only ever rendered for an actually
            late day; on-time/not-applicable days show nothing beneath the
            date, never a "정상" confirmation. */}
        {points.map(
          (point, index) =>
            point.lateness.status === "late" && (
              <text key={`late-${index}`} x={xFor(index)} y={HEIGHT - PADDING_BOTTOM + 34} textAnchor="middle" fill="var(--danger-fg)" className="text-[10px] font-medium">
                ⚠️ 지각
              </text>
            ),
        )}
      </svg>

      {hovered && (
        <div className="flex items-center gap-4 rounded-md border border-border-default bg-canvas-subtle px-3 py-2 text-xs">
          <span className="font-medium text-fg-default">{hovered.label}</span>
          {mode === "time" ? (
            <>
              <span className="text-fg-muted">체류 {hovered.stayMinutes == null ? "–" : formatHoursMinutes(hovered.stayMinutes)}</span>
              <span className="text-fg-muted">실근무 {hovered.netWorkMinutes == null ? "–" : formatHoursMinutes(hovered.netWorkMinutes)}</span>
            </>
          ) : (
            <span className="text-fg-muted">점수 {hovered.score == null ? "–" : `${hovered.score}점`}</span>
          )}
        </div>
      )}
    </div>
  );
}
