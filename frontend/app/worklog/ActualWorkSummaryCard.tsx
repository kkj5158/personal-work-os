"use client";

import { formatHoursMinutes } from "./format";

interface ActualWorkSummaryCardProps {
  regularMinutes: number;
  supplementalMinutes: number;
}

// Combined 실근무 total for the Day Work Record editing surface (Plan A) —
// shared by WorkLogRecordDetailModal and DailyWorkLogView so the "정규 +
// 보강" breakdown rule (confirmed policy §25) has exactly one implementation.
// When Supplemental Work is zero, shows the plain simpler summary (no
// breakdown line, no "(정규 + 보강)" suffix) — never permanently adding
// visual noise for the common case where no Supplemental Work exists.
export function ActualWorkSummaryCard({ regularMinutes, supplementalMinutes }: ActualWorkSummaryCardProps) {
  const hasSupplemental = supplementalMinutes > 0;
  const total = regularMinutes + supplementalMinutes;

  return (
    <div className="rounded-lg border border-border-default bg-canvas-subtle px-6 py-4">
      <span className="text-xs text-fg-muted">실근무{hasSupplemental ? " (정규 + 보강)" : ""}</span>
      <div className="text-2xl font-semibold tabular-nums text-primary-fg">{formatHoursMinutes(total)}</div>
      {hasSupplemental && (
        <div className="mt-0.5 text-xs tabular-nums text-fg-muted">
          정규 {formatHoursMinutes(regularMinutes)} + 보강 {formatHoursMinutes(supplementalMinutes)}
        </div>
      )}
    </div>
  );
}
