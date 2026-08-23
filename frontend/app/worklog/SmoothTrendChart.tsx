"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface SmoothTrendChartPoint {
  label: string;
  value: number | null;
}

interface SmoothTrendChartProps {
  title: string;
  points: SmoothTrendChartPoint[];
  domainMin: number;
  domainMax: number;
  ticks: number[];
  formatValue: (value: number) => string;
  /** Shown per null point in the accessible summary and as the empty-state
   *  caption when every point is null (e.g. "점수 없음"). */
  missingLabel: string;
  /** Line/circle color, as a CSS var() reference (SVG stroke/fill can't
   *  consume a Tailwind class). Defaults to the existing blue so the
   *  duration chart is unchanged; the score chart passes a cyan/teal
   *  accent so the two charts read as visually distinct series. */
  accentColor?: string;
  /** Area-fill color, paired with `accentColor`. */
  accentSubtleColor?: string;
}

// v4 visual-style batch: full-width single-row layout (see
// WorkLogTrendSection) gives roughly double the previous per-point spacing,
// which is what makes "all 12 labels, all 12 value labels" (below) fit
// without crowding — this wider/taller internal coordinate system is a
// direct consequence of that layout change, not an independent choice.
const WIDTH = 1200;
const HEIGHT = 300;
const PADDING_TOP = 32;
// Tall enough for a -38° rotated ~9-character date-range label without
// touching the card edge (measured: label descent under rotation ≈45px) —
// see X_LABEL_ROTATION_DEG below.
const PADDING_BOTTOM = 78;
// Wide enough that the *first* rotated label (text-anchor="end" swings its
// text leftward from its tick) never crosses x=0 — see the rotation note
// above; the y-axis tick labels also live in this margin.
const PADDING_LEFT = 56;
const PADDING_RIGHT = 24;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const X_LABEL_ROTATION_DEG = -38;

const TOOLTIP_WIDTH = 172;
const TOOLTIP_HEIGHT = 50;
const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// First/last-position *value* labels are edge-anchored (start/end) instead
// of centered so their text grows inward, away from the y-axis tick labels
// on the left and the SVG viewBox edge on the right. X-axis date labels
// don't need this: every one is rotated and text-anchor="end" uniformly
// (see the render below), which already keeps them growing away from their
// own tick in a consistent direction.
function valueLabelAnchor(index: number, n: number): "start" | "middle" | "end" {
  if (n <= 1) return "middle";
  if (index === 0) return "start";
  if (index === n - 1) return "end";
  return "middle";
}

interface PlottedPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

// Catmull–Rom-to-cubic-Bézier conversion for a small, fixed point count —
// passes through every real point exactly (unlike a fitted spline) and
// needs no dependency. `minPixelY`/`maxPixelY` are the chart's own plotted
// Y range (top of domainMax to bottom of domainMin); every control point is
// clamped to that range AND to the tighter min/max of its own segment's two
// endpoints, so a sharp zigzag can never visually overshoot past a real
// data point or past the chart's domain (e.g. the score curve visually
// leaving 0–100).
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

// Reusable pure-SVG line/area chart for the two Work Log trend charts only
// (v2 trend-chart unit; v4 restyled toward the approved Notion-style
// reference) — not a general analytics component. A null point breaks the
// line and area fill into separate contiguous segments and never becomes a
// zero-value point. Point count (`n`) is generic — every x/y position,
// circle, and curve segment derives from it directly, and geometry is never
// thinned. v4: label *density* is no longer thinned either — every one of
// the 12 x-axis dates and 12 value labels renders, relying on the wider
// full-row layout and rotated x-axis labels (rather than reduced density)
// to stay legible.
export function SmoothTrendChart({
  title,
  points,
  domainMin,
  domainMax,
  ticks,
  formatValue,
  missingLabel,
  accentColor = "var(--primary-emphasis)",
  accentSubtleColor = "var(--primary-subtle)",
}: SmoothTrendChartProps) {
  const n = points.length;
  const latestIndex = n - 1;
  const domainRange = domainMax - domainMin || 1;

  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  function xFor(index: number): number {
    if (n <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
    return PADDING_LEFT + (PLOT_WIDTH * index) / (n - 1);
  }

  function yFor(value: number): number {
    const ratio = (value - domainMin) / domainRange;
    return PADDING_TOP + PLOT_HEIGHT * (1 - ratio);
  }

  const baselineY = yFor(domainMin);
  const topY = yFor(domainMax);

  // Contiguous runs of non-null points — spec: never bridge a missing value.
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
    current.push({ x: xFor(index), y: yFor(point.value), label: point.label, value: point.value });
  });
  if (current.length > 0) segments.push(current);

  const hasAnyValue = points.some((p) => p.value != null);
  const ariaSummary = `${title} 추이: ${points.map((p) => `${p.label} ${p.value == null ? missingLabel : formatValue(p.value)}`).join(", ")}`;

  // Hover/focus point tooltip (v4): reads the actual rendered SVG size
  // (this chart is responsive — width="100%" with no fixed pixel height) so
  // the tooltip lands on the true screen position of the hovered point
  // regardless of viewport width, then clamps against the *card's* own
  // rect so it always stays fully inside it. No pinning — purely
  // hover/focus-driven, matching "no click-to-pin behavior for trend
  // points."
  useLayoutEffect(() => {
    if (hoveredIndex == null) return;
    const point = points[hoveredIndex];
    const svg = svgRef.current;
    const card = cardRef.current;
    if (!point || point.value == null || !svg || !card) return;

    const svgRect = svg.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const scaleX = svgRect.width / WIDTH;
    const scaleY = svgRect.height / HEIGHT;
    const anchorX = svgRect.left + xFor(hoveredIndex) * scaleX - cardRect.left;
    const anchorY = svgRect.top + yFor(point.value) * scaleY - cardRect.top;

    const left = clamp(anchorX - TOOLTIP_WIDTH / 2, TOOLTIP_MARGIN, cardRect.width - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
    const fitsAbove = anchorY - TOOLTIP_GAP - TOOLTIP_HEIGHT >= TOOLTIP_MARGIN;
    let top = fitsAbove ? anchorY - TOOLTIP_GAP - TOOLTIP_HEIGHT : anchorY + TOOLTIP_GAP;
    top = clamp(top, TOOLTIP_MARGIN, cardRect.height - TOOLTIP_HEIGHT - TOOLTIP_MARGIN);
    setTooltipPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredIndex]);

  const hoveredPoint = hoveredIndex != null ? points[hoveredIndex] : null;

  return (
    <div ref={cardRef} className="relative flex w-full flex-col gap-4 rounded-md border border-border-default bg-surface-default p-6">
      <h3 className="text-sm font-semibold text-fg-default">{title}</h3>

      {n === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">표시할 데이터가 없습니다</p>
      ) : (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="group" aria-label={ariaSummary}>
            {ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={WIDTH - PADDING_RIGHT}
                    y2={y}
                    stroke="var(--border-muted)"
                    strokeWidth={1}
                    strokeDasharray="3 4"
                  />
                  <text x={PADDING_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[10px] tabular-nums">
                    {formatValue(tick)}
                  </text>
                </g>
              );
            })}

            {segments.map(
              (segment, i) =>
                segment.length >= 2 && (
                  <path
                    key={`area-${i}`}
                    d={`${toSmoothPath(segment, topY, baselineY)} L ${segment[segment.length - 1].x} ${baselineY} L ${segment[0].x} ${baselineY} Z`}
                    fill={accentSubtleColor}
                    stroke="none"
                  />
                ),
            )}

            {segments.map(
              (segment, i) =>
                segment.length >= 2 && (
                  <path
                    key={`line-${i}`}
                    d={toSmoothPath(segment, topY, baselineY)}
                    fill="none"
                    stroke={accentColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                ),
            )}

            {points.map((point, index) => {
              const x = xFor(index);
              if (point.value == null) {
                return (
                  <text
                    key={index}
                    x={x}
                    y={PADDING_TOP + PLOT_HEIGHT / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--fg-muted)"
                    className="text-xs"
                  >
                    –
                  </text>
                );
              }
              const y = yFor(point.value);
              const isLatest = index === latestIndex;
              return (
                <g key={index}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isLatest ? 4.5 : 3}
                    fill={accentColor}
                    tabIndex={0}
                    role="img"
                    aria-label={`${point.label} ${formatValue(point.value)}`}
                    className="cursor-default outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-outline"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex((prev) => (prev === index ? null : prev))}
                  />
                  <text
                    x={x}
                    y={y - 12}
                    textAnchor={valueLabelAnchor(index, n)}
                    fill={isLatest ? "var(--fg-default)" : "var(--fg-muted)"}
                    className={`pointer-events-none text-[10px] tabular-nums ${isLatest ? "font-semibold" : "font-medium"}`}
                  >
                    {formatValue(point.value)}
                  </text>
                </g>
              );
            })}

            {points.map((point, index) => (
              <text
                key={`x-${index}`}
                x={xFor(index)}
                y={HEIGHT - PADDING_BOTTOM + 18}
                textAnchor="end"
                fill="var(--fg-muted)"
                className="text-[10px] tabular-nums"
                transform={`rotate(${X_LABEL_ROTATION_DEG} ${xFor(index)} ${HEIGHT - PADDING_BOTTOM + 18})`}
              >
                {point.label}
              </text>
            ))}
          </svg>

          {!hasAnyValue && <p className="text-center text-xs text-fg-muted">{missingLabel} 표시할 데이터가 없습니다</p>}

          {hoveredPoint && hoveredPoint.value != null && tooltipPos && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-md border border-border-default bg-surface-default px-3 py-2 text-xs shadow-sm"
              style={{ left: tooltipPos.left, top: tooltipPos.top, width: TOOLTIP_WIDTH }}
            >
              <span className="font-medium text-fg-default">{hoveredPoint.label}</span>
              <span className="font-semibold tabular-nums text-fg-default">{formatValue(hoveredPoint.value)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
