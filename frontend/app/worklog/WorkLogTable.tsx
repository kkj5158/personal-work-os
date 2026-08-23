"use client";

import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import { AttendanceBadge } from "./AttendanceBadge";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatClockRange24Hour, formatHoursMinutes, formatLatenessTableDisplay, getLatenessTableClassName } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getEffectiveLateness, getNetWorkMinutes, type LatenessResult } from "./selectors";

interface WorkLogTableProps {
  records: WorkLogRecord[];
  selectedRecordId: string | null;
  onRowActivate: (id: string) => void;
}

const COLUMN_HEADERS = ["요일", "날짜", "출결", "출퇴근", "지각", "체류 시간", "실근무", "점수", "메모"];

// Row cells target ~52px (py-4 + text-sm line-height + border) and header
// cells ~42px (py-2.5) per the density-polishing unit's 40–44/50–56px
// targets — vertically centered (align-middle) rather than top-aligned.
// v6 visual-polish unit: internal vertical rules removed — only the
// outer table border (on the wrapper below) and horizontal row/header
// separators remain, so the table reads calmer and less spreadsheet-like
// while column alignment (via the table's own cell layout) stays intact.
const CELL = "border-b border-border-default px-3 py-4 align-middle text-sm";
const HEADER_CELL = "border-b border-border-default bg-canvas-subtle px-3 py-2.5 text-left align-middle text-sm font-medium text-fg-muted";

// Spec §7 (v2): fixed nine-column order, full Korean weekday names, no
// location or 작업 블록 합계 column, dedicated 지각 column separate from
// 출퇴근, grid lines visible on every row and column. Row click/Enter/Space
// opens the record-detail modal directly in edit mode (v4: no more view-mode
// step or permanent side panel). v3: the weekly/monthly pagination footer is
// gone entirely — both callers (page.tsx's weekly view and
// MonthlyWorkLogView's per-week blocks) close naturally after the last row.
export function WorkLogTable({ records, selectedRecordId, onRowActivate }: WorkLogTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {COLUMN_HEADERS.map((header) => (
              <th key={header} scope="col" className={HEADER_CELL}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const isSelected = record.id === selectedRecordId;
            const isOff = !isWorkdayStatus(record.status);
            const lateness = getEffectiveLateness(record);

            return (
              <tr
                key={record.id}
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onRowActivate(record.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowActivate(record.id);
                  }
                }}
                className={`cursor-pointer ${FOCUS_VISIBLE} ${isSelected ? "bg-row-selected-bg" : "hover:bg-canvas-subtle"}`}
              >
                <td
                  className={`${CELL} whitespace-nowrap text-fg-default ${isSelected ? "border-l-[3px] border-l-row-selected-indicator" : ""}`}
                >
                  {formatKoreanWeekday(record.date)}
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums text-fg-default`}>{formatKoreanDate(record.date)}</td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <AttendanceBadge status={record.status} />
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums text-fg-default`}>
                  {formatClockRange24Hour(record.clockIn, record.clockOut)}
                </td>
                <td className={`${CELL} whitespace-nowrap font-medium tabular-nums`}>
                  <LatenessCell lateness={lateness} />
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums text-fg-default`}>
                  {isOff ? <span className="text-fg-muted">–</span> : formatHoursMinutes(record.basicWorkMinutes)}
                </td>
                <td className={`${CELL} whitespace-nowrap font-medium tabular-nums text-fg-default`}>
                  {isOff ? <span className="text-fg-muted">–</span> : formatHoursMinutes(getNetWorkMinutes(record))}
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums text-fg-default`}>
                  {record.score ?? <span className="text-fg-muted">–</span>}
                </td>
                <td className={`${CELL} max-w-[220px] truncate text-fg-muted`}>{record.memo || "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Table lateness cell (spec v3 §10): 0분 -> 정시 출근, 1–9분 -> exact
// value, 10분 이상 -> "10+" with the exact value revealed on hover/focus,
// not-applicable/criterion-required -> "–". `lateness` is already the
// *effective* result (selectors.ts's getEffectiveLateness — reflects the
// on-time override when active), so an overridden record simply never
// reaches the "late" branch here at all.
function LatenessCell({ lateness }: { lateness: LatenessResult }) {
  const display = formatLatenessTableDisplay(lateness);
  const colorClassName = getLatenessTableClassName(lateness);
  const showsExactTooltip = lateness.status === "late" && lateness.minutes >= 10;

  if (!showsExactTooltip) {
    return <span className={colorClassName}>{display}</span>;
  }

  return (
    <span
      tabIndex={0}
      aria-label={`${lateness.minutes}분 지각`}
      className={`group relative inline-flex cursor-default rounded outline-none ${colorClassName} ${FOCUS_VISIBLE}`}
    >
      {display}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-default bg-surface-default px-2 py-1 text-xs font-normal text-fg-default opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100">
        {lateness.minutes}분 지각
      </span>
    </span>
  );
}
