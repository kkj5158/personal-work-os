import { SmoothTrendChart } from "./SmoothTrendChart";
import { formatCompactDateRange, formatHoursMinutes } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getWeeklyTrendPoints } from "./selectors";

interface WorkLogTrendSectionProps {
  records: WorkLogRecord[];
}

const HOUR_STEP_CANDIDATES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];

// Builds a zero-based, whole-hour tick set for the duration chart so labels
// read as clean hour marks (e.g. 00:00/10:00/20:00) rather than an awkward
// value like "13:20" from splitting the raw max evenly. The upper bound
// always exceeds the raw max (15% headroom, then rounded up to the chosen
// step) so the highest point's value label never touches the plot edge,
// and an all-zero series still gets a small non-zero domain to render a
// visible zero line against.
function buildDurationTicks(maxMinutes: number): number[] {
  const maxHours = Math.max(1, (maxMinutes * 1.15) / 60);
  const step = HOUR_STEP_CANDIDATES.find((candidate) => maxHours / candidate <= 5) ?? Math.ceil(maxHours / 5);
  const upperHour = Math.ceil(maxHours / step) * step;
  const ticks: number[] = [];
  for (let hour = 0; hour <= upperHour; hour += step) {
    ticks.push(hour * 60);
  }
  return ticks;
}

// v2 trend-chart unit (12-week expansion): an independent "근무 추이"
// section that always renders regardless of periodUnit — not nested inside
// either the weekly or monthly record area. Owns no navigation/modal state
// and fetches nothing itself — `records` is page.tsx's fixed recent-12-week
// dataset (recentTrendRecords, a rolling window — current week plus the
// eleven preceding, never an exact calendar quarter), never the currently-
// browsed week/month data. All aggregation comes from the shared, period-
// agnostic getWeeklyTrendPoints selector; this component only formats and
// lays out.
export function WorkLogTrendSection({ records }: WorkLogTrendSectionProps) {
  const trendPoints = getWeeklyTrendPoints(records);

  if (trendPoints.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-fg-default">근무 추이</h2>
          <p className="text-sm text-fg-muted">최근 12주의 근무 시간과 점수 변화를 확인합니다.</p>
        </div>
        <div className="border-t border-border-default" />
        <p className="text-sm text-fg-muted">표시할 데이터가 없습니다</p>
      </section>
    );
  }

  const durationPoints = trendPoints.map((point) => ({
    label: formatCompactDateRange(point.rangeStart, point.rangeEnd),
    value: point.netWorkMinutes,
  }));
  const scorePoints = trendPoints.map((point) => ({
    label: formatCompactDateRange(point.rangeStart, point.rangeEnd),
    value: point.averageScore,
  }));

  const maxDuration = Math.max(...durationPoints.map((point) => point.value));
  const durationTicks = buildDurationTicks(maxDuration);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg-default">근무 추이</h2>
        <p className="text-sm text-fg-muted">최근 12주의 근무 시간과 점수 변화를 확인합니다.</p>
      </div>
      <div className="border-t border-border-default" />
      <div className="grid grid-cols-2 gap-6">
        <SmoothTrendChart
          title="주간 실근무"
          points={durationPoints}
          domainMin={0}
          domainMax={durationTicks[durationTicks.length - 1]}
          ticks={durationTicks}
          formatValue={(value) => formatHoursMinutes(value)}
          missingLabel="데이터 없음"
        />
        <SmoothTrendChart
          title="주간 평균 근무점수"
          points={scorePoints}
          domainMin={0}
          domainMax={100}
          ticks={[0, 20, 40, 60, 80, 100]}
          formatValue={(value) => `${value}점`}
          missingLabel="점수 없음"
          accentColor="var(--chart-score-emphasis)"
          accentSubtleColor="var(--chart-score-subtle)"
        />
      </div>
    </section>
  );
}
