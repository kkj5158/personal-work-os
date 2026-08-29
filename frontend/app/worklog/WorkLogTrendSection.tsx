"use client";

import { useState } from "react";
import type { WorkChartReferenceLineDto } from "@/lib/api/types";
import { WorkTrendChart, type WorkTrendChartReferenceLine, type WorkTrendChartSeries } from "./WorkTrendChart";
import { formatCompactDateRange, formatHoursMinutes, FOCUS_VISIBLE } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getWeeklyTrendPoints } from "./selectors";
import { linesForScope, referenceLineColorVar } from "./referenceLine";

interface WorkLogTrendSectionProps {
  records: WorkLogRecord[];
  referenceLines: WorkChartReferenceLineDto[];
  onOpenReferenceLineSettings: () => void;
}

type WeeklyTimeMode = "actual" | "compare";

const HOUR_STEP_CANDIDATES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100];

// Builds a zero-based, whole-hour tick set for the duration (left) axis so
// labels read as clean hour marks (e.g. 00:00/10:00/20:00) rather than an
// awkward value like "13:20" from splitting the raw max evenly. The upper
// bound always exceeds the raw max (15% headroom, then rounded up to the
// chosen step) so the highest point's value label never touches the plot
// edge, and an all-zero series still gets a small non-zero domain to render
// a visible zero line against.
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

function toChartReferenceLines(
  lines: WorkChartReferenceLineDto[],
  axis: "left" | "right",
): WorkTrendChartReferenceLine[] {
  return lines.map((l) => ({ id: l.id, label: l.label, value: l.value, axis, color: referenceLineColorVar(l.color) }));
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
//
// Post-production iteration 1 batch 2: consolidated into ONE dual-Y-axis
// chart (duration on the left, average score on the right — never
// normalized onto one shared scale, different units) instead of two
// separate large charts. Weekly comparison mode is view-only local state —
// no persistence, always resets to 실근무 on reload, per product decision.
export function WorkLogTrendSection({ records, referenceLines, onOpenReferenceLineSettings }: WorkLogTrendSectionProps) {
  const [weeklyTimeMode, setWeeklyTimeMode] = useState<WeeklyTimeMode>("actual");
  const trendPoints = getWeeklyTrendPoints(records);

  const weeklyTimeLines = toChartReferenceLines(linesForScope(referenceLines, "WEEKLY_TIME"), "left");
  const weeklyScoreLines = toChartReferenceLines(linesForScope(referenceLines, "WEEKLY_SCORE"), "right");

  const header = (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg-default">근무 추이</h2>
        <p className="text-sm text-fg-muted">최근 12주의 근무 시간과 점수 변화를 확인합니다.</p>
      </div>
      <button
        type="button"
        onClick={onOpenReferenceLineSettings}
        className={`h-9 shrink-0 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        기준선 설정
      </button>
    </div>
  );

  if (trendPoints.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <div className="border-t border-border-default" />
        <p className="text-sm text-fg-muted">표시할 데이터가 없습니다</p>
      </section>
    );
  }

  const labelFor = (point: (typeof trendPoints)[number]) => formatCompactDateRange(point.rangeStart, point.rangeEnd);

  const netWorkPoints = trendPoints.map((point) => ({ label: labelFor(point), value: point.netWorkMinutes }));
  const netStayPoints = trendPoints.map((point) => ({ label: labelFor(point), value: point.netStayMinutes }));
  const scorePoints = trendPoints.map((point) => ({ label: labelFor(point), value: point.averageScore }));

  const series: WorkTrendChartSeries[] =
    weeklyTimeMode === "actual"
      ? [
          { key: "net", label: "실근무", points: netWorkPoints, axis: "left", color: "var(--primary-emphasis)", subtleColor: "var(--primary-subtle)" },
          { key: "score", label: "평균 점수", points: scorePoints, axis: "right", color: "var(--chart-score-emphasis)", subtleColor: "var(--chart-score-subtle)" },
        ]
      : [
          // Legend/tooltip order: 실근무, 평균 점수, then 체류시간 as the
          // additional comparison metric. Paint order is separate — the
          // chart itself always draws a subordinate (no subtleColor) series
          // like 체류시간 underneath, regardless of this array's order.
          { key: "net", label: "실근무", points: netWorkPoints, axis: "left", color: "var(--success-emphasis)", subtleColor: "var(--success-subtle)" },
          { key: "score", label: "평균 점수", points: scorePoints, axis: "right", color: "var(--chart-score-emphasis)", subtleColor: "var(--chart-score-subtle)" },
          // 체류시간 is visually subordinate (thinner, unfilled) so the
          // 3-series overlay stays readable.
          { key: "stay", label: "체류시간", points: netStayPoints, axis: "left", color: "var(--primary-emphasis)", strokeWidth: 1.5 },
        ];

  const maxDuration = Math.max(
    ...netWorkPoints.map((point) => point.value),
    ...(weeklyTimeMode === "compare" ? netStayPoints.map((point) => point.value) : []),
    ...weeklyTimeLines.map((line) => line.value),
  );
  const leftTicks = buildDurationTicks(maxDuration);

  return (
    <section className="flex flex-col gap-6">
      {header}
      <div className="border-t border-border-default" />
      <WorkTrendChart
        title="주간 근무 시간 · 평균 점수"
        series={series}
        leftTicks={leftTicks}
        leftDomainMax={leftTicks[leftTicks.length - 1]}
        formatLeftValue={(value) => formatHoursMinutes(value)}
        rightTicks={[0, 20, 40, 60, 80, 100]}
        rightDomainMax={100}
        formatRightValue={(value) => `${value}점`}
        missingLabel="데이터 없음"
        referenceLines={[...weeklyTimeLines, ...weeklyScoreLines]}
        headerAction={
          <div className="flex h-8 rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
            {(["actual", "compare"] as WeeklyTimeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWeeklyTimeMode(m)}
                aria-pressed={weeklyTimeMode === m}
                className={`rounded px-3 ${weeklyTimeMode === m ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
              >
                {m === "actual" ? "실근무" : "비교"}
              </button>
            ))}
          </div>
        }
      />
    </section>
  );
}
