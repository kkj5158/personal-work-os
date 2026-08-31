"use client";

import { useState } from "react";
import { computeVisibleTickIndices, formatShortDateLabel, isDateLabel } from "./checklistLogic";

export interface AchievementTrendChartPoint {
  label: string;
  /** 0–1, or null for a bucket with no valid data (rendered as a gap, never bridged). */
  rate: number | null;
  /** 0–100, or null when not applicable to this point (e.g. an inactive item). */
  goalPercent: number | null;
}

interface AchievementTrendChartProps {
  points: AchievementTrendChartPoint[];
  accentColor?: string;
}

const WIDTH = 1200;
const HEIGHT = 260;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 36;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 20;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

// A full 월 (month) view can carry up to 31 daily points — rendering every
// one as an X-axis label overlaps into an unreadable smear. Capped at 8; see
// computeVisibleTickIndices in checklistLogic.ts for how the visible subset
// is chosen (always includes the first/last point). Every data point still
// renders regardless of which labels are shown — this only thins the text.
const MAX_VISIBLE_DATE_TICKS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface Plotted {
  x: number;
  y: number;
}

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

// Shared 0–100% achievement-rate chart with a dashed goal baseline, used by
// both checklist Analytics View 1 (Overall Achievement Trend) and View 3
// (Individual Item Tracking) — same shape, different data source. A null
// point is a genuine gap (inactive item / no valid data that bucket), never
// bridged or zeroed, matching the inactive/non-applicable chart semantics
// in docs/backend/checklist.md.
export function AchievementTrendChart({ points, accentColor = "var(--primary-emphasis)" }: AchievementTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const n = points.length;

  function xFor(index: number): number {
    if (n <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
    return PADDING_LEFT + (PLOT_WIDTH * index) / (n - 1);
  }
  function yFor(rate: number): number {
    return PADDING_TOP + PLOT_HEIGHT * (1 - rate);
  }
  const baselineY = yFor(0);
  const topY = yFor(1);

  const segments: Plotted[][] = [];
  let current: Plotted[] = [];
  points.forEach((point, index) => {
    if (point.rate == null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({ x: xFor(index), y: yFor(point.rate) });
  });
  if (current.length > 0) segments.push(current);

  // Goal baseline as a step line (the goal may itself have changed over the
  // period — see docs/backend/checklist.md's effective-dated goal history).
  const goalSegments: Plotted[][] = [];
  let goalCurrent: Plotted[] = [];
  points.forEach((point, index) => {
    if (point.goalPercent == null) {
      if (goalCurrent.length > 0) {
        goalSegments.push(goalCurrent);
        goalCurrent = [];
      }
      return;
    }
    const y = yFor(point.goalPercent / 100);
    if (goalCurrent.length > 0) goalCurrent.push({ x: xFor(index), y: goalCurrent[goalCurrent.length - 1].y });
    goalCurrent.push({ x: xFor(index), y });
  });
  if (goalCurrent.length > 0) goalSegments.push(goalCurrent);

  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;

  // Only thin actual calendar-date labels (DAILY/WEEKLY analytics
  // resolution) — MONTHLY ("yyyy-MM") buckets are already sparse (at most
  // 12 for a 연 view) and stay fully labeled, unchanged.
  const allDateLabeled = n > 0 && points.every((p) => isDateLabel(p.label));
  const visibleTickIndices = allDateLabeled ? computeVisibleTickIndices(n, MAX_VISIBLE_DATE_TICKS) : null;

  if (n === 0) {
    return <p className="py-8 text-center text-sm text-fg-muted">표시할 데이터가 없습니다</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="group" aria-label="달성률 추이 차트">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={PADDING_LEFT} y1={yFor(tick / 100)} x2={WIDTH - PADDING_RIGHT} y2={yFor(tick / 100)} stroke="var(--border-muted)" strokeWidth={1} strokeDasharray="3 4" />
            <text x={PADDING_LEFT - 8} y={yFor(tick / 100)} textAnchor="end" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
              {tick}%
            </text>
          </g>
        ))}

        {goalSegments.map((segment, i) => (
          <path key={`goal-${i}`} d={segment.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} fill="none" stroke="var(--fg-muted)" strokeWidth={1.5} strokeDasharray="6 4" />
        ))}

        {segments.map(
          (segment, i) =>
            segment.length >= 2 && (
              <path key={`area-${i}`} d={`${toSmoothPath(segment, topY, baselineY)} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`} fill={accentColor} fillOpacity={0.08} stroke="none" />
            ),
        )}
        {segments.map((segment, i) => segment.length >= 2 && <path key={`line-${i}`} d={toSmoothPath(segment, topY, baselineY)} fill="none" stroke={accentColor} strokeWidth={2} strokeLinecap="round" />)}

        {points.map((point, index) => {
          const x = xFor(index);
          if (point.rate == null) {
            return (
              <text key={index} x={x} y={PADDING_TOP + PLOT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--fg-muted)" className="text-xs">
                –
              </text>
            );
          }
          return (
            <circle
              key={index}
              cx={x}
              cy={yFor(point.rate)}
              r={3.5}
              fill={accentColor}
              tabIndex={0}
              role="img"
              aria-label={`${point.label} ${Math.round(point.rate * 100)}%`}
              className="cursor-default outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-outline"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
            />
          );
        })}

        {points.map((point, index) => {
          if (visibleTickIndices && !visibleTickIndices.has(index)) return null;
          const label = allDateLabeled ? formatShortDateLabel(point.label) : point.label;
          return (
            <text key={`x-${index}`} x={xFor(index)} y={HEIGHT - PADDING_BOTTOM + 20} textAnchor="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
              {label}
            </text>
          );
        })}
      </svg>
      {hovered && (
        <div className="flex items-center gap-3 rounded-md border border-border-default bg-canvas-subtle px-3 py-2 text-xs">
          <span className="font-medium text-fg-default">{hovered.label}</span>
          <span className="text-fg-muted">{hovered.rate == null ? "데이터 없음" : `${Math.round(hovered.rate * 100)}%`}</span>
          {hovered.goalPercent != null && <span className="text-fg-muted">목표 {hovered.goalPercent}%</span>}
        </div>
      )}
    </div>
  );
}
