"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface WorkTrendChartPoint {
  label: string;
  value: number | null;
}

export interface WorkTrendChartSeries {
  key: string;
  label: string;
  points: WorkTrendChartPoint[];
  /** Which Y axis this series plots against — duration (실근무/체류시간)
   *  and score are different units and must never share one normalized
   *  scale. */
  axis: "left" | "right";
  color: string;
  /** Area-fill color. Omit to render a line only (used for 체류시간 in
   *  비교 mode so three overlaid series stay readable). */
  subtleColor?: string;
  /** Defaults to 2. 체류시간 uses a thinner stroke in 비교 mode so it reads
   *  as visually subordinate to 실근무/평균 점수. */
  strokeWidth?: number;
}

export interface WorkTrendChartReferenceLine {
  id: string;
  label: string;
  value: number;
  axis: "left" | "right";
  color: string;
}

interface WorkTrendChartProps {
  title: string;
  series: WorkTrendChartSeries[];
  leftTicks: number[];
  leftDomainMax: number;
  formatLeftValue: (value: number) => string;
  rightTicks: number[];
  rightDomainMax: number;
  formatRightValue: (value: number) => string;
  missingLabel: string;
  referenceLines?: WorkTrendChartReferenceLine[];
  /** One weekly lateness count per bucket, same order/length as
   *  series[0].points — rendered as a small amber "categorical" marker
   *  strip aligned to the shared X axis (never a line, never a Y-axis
   *  value) and folded into the tooltip. Omit entirely to render no
   *  annotation strip at all. */
  weeklyLateCounts?: number[];
  headerAction?: React.ReactNode;
  /** Small subordinate control anchored to the chart's lower-right corner
   *  (e.g. the "점수 숨기기" checkbox) — deliberately not another header-
   *  level segmented control. */
  footerAction?: React.ReactNode;
}

const WIDTH = 1200;
const HEIGHT = 320;
const PADDING_TOP = 32;
// Reserves room for, top to bottom: the plot itself, the rotated date
// label, and — below the date label, not between it and the plot (§4
// follow-up placement fix) — the lateness annotation row. A rotate(-38)
// end-anchored label actually droops DOWN-and-left from its own anchor
// point in SVG's y-down coordinate system (verified: for a ~9-character
// week-range string this reaches roughly 30-33px below its anchor), so
// ANNOTATION_NUMBER_Y_OFFSET must clear X_LABEL_Y_OFFSET plus that droop,
// not just X_LABEL_Y_OFFSET itself.
const PADDING_BOTTOM = 124;
const PADDING_LEFT = 60;
const PADDING_RIGHT = 60;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const X_LABEL_ROTATION_DEG = -38;
const X_LABEL_Y_OFFSET = 54;
// Below the date label's own lowest reach (~54 + 33px droop), with a small
// gap — never between the plot and the date label.
const ANNOTATION_NUMBER_Y_OFFSET = 108;

const TOOLTIP_WIDTH = 180;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface PlottedPoint {
  x: number;
  y: number;
}

// Catmull–Rom-to-cubic-Bézier conversion for a small, fixed point count —
// passes through every real point exactly (unlike a fitted spline) and
// needs no dependency. Shared technique with DailyWorkChart's own copy;
// kept separate since the two charts' axis/series shapes differ enough
// that a common extraction isn't worth the coupling.
function toSmoothPath(points: PlottedPoint[], minPixelY: number, maxPixelY: number): string {
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

function buildSegments(points: WorkTrendChartPoint[], xFor: (i: number) => number, yFor: (v: number) => number): PlottedPoint[][] {
  const segments: PlottedPoint[][] = [];
  let current: PlottedPoint[] = [];
  points.forEach((point, index) => {
    if (point.value == null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({ x: xFor(index), y: yFor(point.value) });
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

// The single consolidated 12-week Work Trend chart (post-production
// iteration 1, batch 2 — supersedes the earlier two-separate-charts
// design). One shared X axis (12 weekly buckets); duration
// (실근무/체류시간) plots against a LEFT Y axis, average work score
// against a RIGHT Y axis — deliberately never normalized onto one shared
// scale, since they're different units. 비교 mode adds 체류시간 as a
// visually subordinate (thinner, unfilled) left-axis series alongside
// 실근무 so the 3-series overlay stays readable.
export function WorkTrendChart({
  title,
  series,
  leftTicks,
  leftDomainMax,
  formatLeftValue,
  rightTicks,
  rightDomainMax,
  formatRightValue,
  missingLabel,
  referenceLines = [],
  weeklyLateCounts,
  headerAction,
  footerAction,
}: WorkTrendChartProps) {
  const n = series[0]?.points.length ?? 0;
  // `series` order drives the legend/tooltip (caller controls the meaningful
  // reading order, e.g. 실근무/평균 점수/체류시간). Paint order is derived
  // separately: a subordinate line-only series (no subtleColor — e.g.
  // 체류시간 in 비교 mode) always paints first/underneath, so a prominent
  // filled series never gets visually buried beneath it regardless of the
  // caller's own array order.
  const paintOrder = [...series].sort((a, b) => (a.subtleColor ? 1 : 0) - (b.subtleColor ? 1 : 0));
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  function xFor(index: number): number {
    if (n <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
    return PADDING_LEFT + (PLOT_WIDTH * index) / (n - 1);
  }
  function yForLeft(value: number): number {
    return PADDING_TOP + PLOT_HEIGHT * (1 - value / (leftDomainMax || 1));
  }
  function yForRight(value: number): number {
    return PADDING_TOP + PLOT_HEIGHT * (1 - value / (rightDomainMax || 1));
  }
  function yFor(axis: "left" | "right", value: number): number {
    return axis === "left" ? yForLeft(value) : yForRight(value);
  }

  const baselineY = PADDING_TOP + PLOT_HEIGHT;
  const topY = PADDING_TOP;

  const seriesSegments = paintOrder.map((s) => ({ s, segments: buildSegments(s.points, xFor, (v) => yFor(s.axis, v)) }));

  const hasAnyValue = series.some((s) => s.points.some((p) => p.value != null));
  const ariaSummary = series
    .map(
      (s) =>
        `${s.label}: ${s.points
          .map((p) => `${p.label} ${p.value == null ? missingLabel : (s.axis === "left" ? formatLeftValue : formatRightValue)(p.value)}`)
          .join(", ")}`,
    )
    .join(" / ");

  useLayoutEffect(() => {
    if (hoveredIndex == null) return;
    const svg = svgRef.current;
    const card = cardRef.current;
    if (!svg || !card) return;

    const svgRect = svg.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const scaleX = svgRect.width / WIDTH;
    const scaleY = svgRect.height / HEIGHT;
    const anchorX = svgRect.left + xFor(hoveredIndex) * scaleX - cardRect.left;
    const anchorY = svgRect.top + PADDING_TOP * scaleY - cardRect.top;
    const tooltipHeight = 24 + (series.length + (weeklyLateCounts ? 1 : 0)) * 18;

    const left = clamp(anchorX - TOOLTIP_WIDTH / 2, TOOLTIP_MARGIN, cardRect.width - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
    const top = clamp(anchorY - TOOLTIP_GAP - tooltipHeight, TOOLTIP_MARGIN, cardRect.height - tooltipHeight - TOOLTIP_MARGIN);
    setTooltipPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredIndex]);

  const hoveredLabel = hoveredIndex != null ? series[0]?.points[hoveredIndex]?.label : null;

  return (
    <div ref={cardRef} className="relative flex w-full flex-col gap-4 rounded-md border border-border-default bg-surface-default p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-fg-default">{title}</h3>
        {headerAction}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {n === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">표시할 데이터가 없습니다</p>
      ) : (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="group" aria-label={`${title} 추이: ${ariaSummary}`}>
            {leftTicks.map((tick) => (
              <g key={`left-${tick}`}>
                <line x1={PADDING_LEFT} y1={yForLeft(tick)} x2={WIDTH - PADDING_RIGHT} y2={yForLeft(tick)} stroke="var(--border-muted)" strokeWidth={1} strokeDasharray="3 4" />
                <text x={PADDING_LEFT - 8} y={yForLeft(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
                  {formatLeftValue(tick)}
                </text>
              </g>
            ))}
            {rightTicks.map((tick) => (
              <text key={`right-${tick}`} x={WIDTH - PADDING_RIGHT + 8} y={yForRight(tick)} textAnchor="start" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
                {formatRightValue(tick)}
              </text>
            ))}

            {/* Reference lines (up to 3 per axis) — each bound to its own
                scope's axis (time -> left, score -> right), rendered
                beneath the data series. */}
            {referenceLines.map((line) => {
              const y = yFor(line.axis, line.value);
              return (
                <g key={line.id}>
                  <line x1={PADDING_LEFT} y1={y} x2={WIDTH - PADDING_RIGHT} y2={y} stroke={line.color} strokeWidth={1.5} strokeDasharray="6 4" />
                  <text x={WIDTH - PADDING_RIGHT - 4} y={y - 5} textAnchor="end" fill={line.color} className="text-[10px] font-medium">
                    {line.label} · {(line.axis === "left" ? formatLeftValue : formatRightValue)(line.value)}
                  </text>
                </g>
              );
            })}

            {seriesSegments.map(
              ({ s, segments }) =>
                s.subtleColor &&
                segments.map(
                  (segment, i) =>
                    segment.length >= 2 && (
                      <path
                        key={`area-${s.key}-${i}`}
                        d={`${toSmoothPath(segment, topY, baselineY)} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`}
                        fill={s.subtleColor}
                        stroke="none"
                      />
                    ),
                ),
            )}

            {seriesSegments.map(({ s, segments }) =>
              segments.map(
                (segment, i) =>
                  segment.length >= 2 && (
                    <path
                      key={`line-${s.key}-${i}`}
                      d={toSmoothPath(segment, topY, baselineY)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.strokeWidth ?? 2}
                      strokeLinecap="round"
                    />
                  ),
              ),
            )}

            {Array.from({ length: n }).map((_, index) => {
              const x = xFor(index);
              const anyValue = series.some((s) => s.points[index]?.value != null);
              return (
                <g key={index}>
                  {!anyValue && (
                    <text x={x} y={PADDING_TOP + PLOT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--fg-muted)" className="text-xs">
                      –
                    </text>
                  )}
                  {paintOrder.map((s) => {
                    const v = s.points[index]?.value;
                    if (v == null) return null;
                    return (
                      <circle
                        key={s.key}
                        cx={x}
                        cy={yFor(s.axis, v)}
                        r={index === n - 1 ? 4 : 3}
                        fill={s.color}
                        tabIndex={0}
                        role="img"
                        aria-label={`${s.points[index].label} ${s.label} ${(s.axis === "left" ? formatLeftValue : formatRightValue)(v)}`}
                        className="cursor-default outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-outline"
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                        onFocus={() => setHoveredIndex(index)}
                        onBlur={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                      />
                    );
                  })}
                  <rect
                    x={x - PLOT_WIDTH / (2 * Math.max(n - 1, 1))}
                    y={PADDING_TOP}
                    width={PLOT_WIDTH / Math.max(n - 1, 1)}
                    height={PLOT_HEIGHT}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                  />
                </g>
              );
            })}

            {series[0]?.points.map((point, index) => (
              <text
                key={`x-${index}`}
                x={xFor(index)}
                y={HEIGHT - PADDING_BOTTOM + X_LABEL_Y_OFFSET}
                textAnchor="end"
                fill="var(--fg-muted)"
                className="text-[10px] tabular-nums"
                transform={`rotate(${X_LABEL_ROTATION_DEG} ${xFor(index)} ${HEIGHT - PADDING_BOTTOM + X_LABEL_Y_OFFSET})`}
              >
                {point.label}
              </text>
            ))}

            {/* Weekly lateness annotation row (§4 follow-up: number-only,
                no "회" suffix, larger/readable, positioned below the date
                label rather than between it and the plot) — categorical,
                never a line/area/third axis: each week's count sits fixed
                directly under its own X-axis tick, never implying a
                numeric Y relationship. Zero-lateness weeks stay blank. */}
            {weeklyLateCounts?.map((count, index) => {
              if (!count) return null;
              return (
                <text
                  key={`late-${index}`}
                  x={xFor(index)}
                  y={HEIGHT - PADDING_BOTTOM + ANNOTATION_NUMBER_Y_OFFSET}
                  textAnchor="middle"
                  fill="var(--warning-emphasis)"
                  className="text-[13px] font-semibold tabular-nums"
                >
                  {count}
                </text>
              );
            })}
          </svg>

          {!hasAnyValue && <p className="text-center text-xs text-fg-muted">{missingLabel} 표시할 데이터가 없습니다</p>}

          {hoveredIndex != null && tooltipPos && hoveredLabel && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-md border border-border-default bg-surface-default px-3 py-2 text-xs shadow-sm"
              style={{ left: tooltipPos.left, top: tooltipPos.top, width: TOOLTIP_WIDTH }}
            >
              <span className="font-medium text-fg-default">{hoveredLabel}</span>
              {series.map((s) => {
                const v = s.points[hoveredIndex]?.value;
                return (
                  <span key={s.key} className="flex items-center justify-between gap-2">
                    <span className="text-fg-muted">{s.label}</span>
                    <span className="font-semibold tabular-nums text-fg-default">
                      {v == null ? missingLabel : (s.axis === "left" ? formatLeftValue : formatRightValue)(v)}
                    </span>
                  </span>
                );
              })}
              {weeklyLateCounts && (
                <span className="flex items-center justify-between gap-2">
                  <span className="text-fg-muted">지각</span>
                  <span className="font-semibold tabular-nums text-warning-fg">{weeklyLateCounts[hoveredIndex] ?? 0}회</span>
                </span>
              )}
            </div>
          )}

          {footerAction && <div className="flex justify-end">{footerAction}</div>}
        </>
      )}
    </div>
  );
}
