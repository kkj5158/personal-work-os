"use client";

import type { ReactNode } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatHoursMinutes, formatLatenessResult, getLatenessResultClassName } from "./format";
import { getEffectiveLateness, getNetWorkMinutes } from "./selectors";
import type { WorkLogRecord } from "./mockData";

interface ActualRecordSummarySectionProps {
  record: WorkLogRecord | null;
  /** A future date with no actual WorkRecord renders nothing at all (§12) —
   *  the caller should skip mounting this section entirely rather than
   *  showing an empty/placeholder card; kept here too as a defensive guard. */
  isFuture: boolean;
  onOpenDetail: () => void;
}

// 실제 기록 section (§11.A) — read-only inside Attendance, always sourced
// from the canonical WorkRecord. Never a second WorkRecord editing surface:
// "근무 기록 상세 보기" hands off to the existing WorkLogRecordDetailModal
// for anything beyond viewing this summary.
export function ActualRecordSummarySection({ record, isFuture, onOpenDetail }: ActualRecordSummarySectionProps) {
  if (isFuture && !record) return null;

  if (!record) {
    return <p className="text-sm text-fg-muted">미입력</p>;
  }

  const lateness = getEffectiveLateness(record);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 min-[420px]:grid-cols-3">
        <MetricField label="출결">
          <AttendanceBadge status={record.status} />
        </MetricField>
        <MetricField label="출근">
          <span className="text-sm font-medium tabular-nums text-fg-default">{record.clockIn ?? "–"}</span>
        </MetricField>
        <MetricField label="퇴근">
          <span className="text-sm font-medium tabular-nums text-fg-default">{record.clockOut ?? "–"}</span>
        </MetricField>
        <MetricField label="체류">
          <span className="text-sm font-medium tabular-nums text-fg-default">{formatHoursMinutes(record.basicWorkMinutes)}</span>
        </MetricField>
        <MetricField label="실근무">
          <span className="text-sm font-medium tabular-nums text-fg-default">
            {isWorkdayStatus(record.status) ? formatHoursMinutes(getNetWorkMinutes(record)) : "–"}
          </span>
        </MetricField>
        <MetricField label="지각">
          <span className={`text-sm font-medium tabular-nums ${getLatenessResultClassName(lateness)}`}>{formatLatenessResult(lateness)}</span>
        </MetricField>
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className={`h-8 w-fit rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        근무 기록 상세 보기
      </button>
    </div>
  );
}

function MetricField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-col gap-1">
      <span className="whitespace-nowrap text-xs text-fg-muted">{label}</span>
      <div className="flex h-6 items-center">{children}</div>
    </div>
  );
}
