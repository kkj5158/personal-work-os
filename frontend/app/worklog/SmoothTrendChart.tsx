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
// (v2 trend-chart unit) — not a general analytics component. Follows the
// existing SVG house style established by ScoreRing.tsx/
// MonthlyAttendanceDonut.tsx: raw <svg>, colors via var(--token) (Tailwind
// classes can't drive SVG stroke/fill), role="img" + one composed
// aria-label. A null point breaks the line and area fill into separate
// contiguous segments and never becomes a zero-value point.
export function SmoothTrendChart({ title, points, domainMin, domainMax, ticks, formatValue, missingLabel }: SmoothTrendChartProps) {
  const n = points.length;
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
    <div className="flex flex-col gap-2 rounded-md border border-border-default bg-surface-default p-4">
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
                    fill="var(--primary-subtle)"
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
                    stroke="var(--primary-emphasis)"
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
              return (
                <g key={index}>
                  <circle cx={x} cy={y} r={3.5} fill="var(--primary-emphasis)" />
                  <text x={x} y={y - 10} textAnchor="middle" fill="var(--fg-default)" className="text-[10px] font-medium">
                    {formatValue(point.value)}
                  </text>
                </g>
              );
            })}

            {points.map((point, index) => (
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
            ))}
          </svg>

          {!hasAnyValue && <p className="text-center text-xs text-fg-muted">{missingLabel} 표시할 데이터가 없습니다</p>}
        </>
      )}
    </div>
  );
}
