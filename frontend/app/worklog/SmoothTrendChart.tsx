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

const WIDTH = 400;
const HEIGHT = 180;
const PADDING_TOP = 26;
const PADDING_BOTTOM = 26;
const PADDING_LEFT = 42;
const PADDING_RIGHT = 8;
const PLOT_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// X-axis label-density strategy for higher point counts (spec: 12-point
// readability). Deliberately width-independent rather than a viewport
// breakpoint switch: this chart's rendered width is capped by the page's
// own `max-w-[1400px]` container, so a two-column chart's actual pixel
// width barely changes between a 1280px and a 1920px+ viewport (measured
// ≈576px vs ≈636px). At n=12, showing every "M/D–M/D" range label
// (interval 1) was measured to overlap at *both* widths — the ~9-character
// label (~45–70px) doesn't fit in the ~41–58px per-point spacing either
// way. Every-second-week (interval 2, doubling the gap) was measured
// overlap-free at both. So one fixed interval already satisfies both
// per-width requirements (1920's "otherwise use a consistent interval"
// fallback and 1280's "prefer approximately every second week") — adding a
// breakpoint toggle on top would be complexity with no observable effect.
// Value labels ("HH:MM"/"N점", much shorter) were separately measured
// overlap-free at full density (interval 1) at both widths, so they render
// unconditionally with no reduction.
const X_LABEL_INTERVAL = 2;

// Builds the visible x-axis-label index set: 0, interval, 2*interval, ...
// plus the last index (n-1), which is always forced in so the latest
// position is never hidden. A plain "index % interval === 0 || index ===
// n-1" would occasionally place the last *regular* interval index directly
// next to the forced-last index (e.g. n=12, interval=2 → ...8, 10, 11 —
// 10 and 11 are adjacent, one slot apart, and their labels visually
// collide). So the last regular interval index is dropped whenever it
// would land immediately next to the forced-last index (unless it's index
// 0 itself, which must stay).
function computeVisibleXLabelIndices(n: number, interval: number): Set<number> {
  const visible = new Set<number>();
  if (n <= 0) return visible;
  visible.add(0);
  let last = 0;
  for (let i = interval; i < n - 1; i += interval) {
    if (i - last >= interval) {
      visible.add(i);
      last = i;
    }
  }
  if (n > 1 && n - 1 - last < interval && last !== 0) {
    visible.delete(last);
  }
  if (n > 1) visible.add(n - 1);
  return visible;
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
// (v2 trend-chart unit, 12-week expansion) — not a general analytics
// component. Follows the existing SVG house style established by
// ScoreRing.tsx/MonthlyAttendanceDonut.tsx: raw <svg>, colors via
// var(--token) (Tailwind classes can't drive SVG stroke/fill), role="img" +
// one composed aria-label. A null point breaks the line and area fill into
// separate contiguous segments and never becomes a zero-value point. Point
// count (`n`) is generic — every x/y position, circle, and curve segment
// derives from it directly — only x-axis *label* density is thinned at
// higher point counts (computeVisibleXLabelIndices above); geometry
// (circles, curve, value labels) is never thinned.
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
  const visibleXLabelIndices = computeVisibleXLabelIndices(n, X_LABEL_INTERVAL);
  const domainRange = domainMax - domainMin || 1;

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

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border-default bg-surface-default p-6">
      <h3 className="text-sm font-semibold text-fg-default">{title}</h3>

      {n === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">표시할 데이터가 없습니다</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={ariaSummary}>
            {ticks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line x1={PADDING_LEFT} y1={y} x2={WIDTH - PADDING_RIGHT} y2={y} stroke="var(--border-muted)" strokeWidth={1} />
                  <text x={PADDING_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" fill="var(--fg-muted)" className="text-[9px]">
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
                    strokeWidth={1.75}
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
              return (
                <g key={index}>
                  <circle cx={x} cy={y} r={3} fill={accentColor} />
                  <text x={x} y={y - 10} textAnchor="middle" fill="var(--fg-default)" className="text-[10px] font-medium">
                    {formatValue(point.value)}
                  </text>
                </g>
              );
            })}

            {points.map(
              (point, index) =>
                visibleXLabelIndices.has(index) && (
                  <text
                    key={`x-${index}`}
                    x={xFor(index)}
                    y={HEIGHT - PADDING_BOTTOM + 16}
                    textAnchor="middle"
                    fill="var(--fg-muted)"
                    className="text-[9px]"
                  >
                    {point.label}
                  </text>
                ),
            )}
          </svg>

          {!hasAnyValue && <p className="text-center text-xs text-fg-muted">{missingLabel} 표시할 데이터가 없습니다</p>}
        </>
      )}
    </div>
  );
}
