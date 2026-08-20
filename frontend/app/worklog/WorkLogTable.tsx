"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import { AttendanceBadge } from "./AttendanceBadge";
import { ScoreRing } from "./ScoreRing";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatClockRange12Hour, formatHoursMinutes, formatLateness } from "./format";
import type { WorkLogRecord } from "./mockData";
import { getNetWorkMinutes } from "./selectors";

interface WorkLogTableProps {
  records: WorkLogRecord[];
  selectedRecordId: string | null;
  onRowActivate: (id: string) => void;
}

const COLUMN_HEADERS = ["요일", "날짜", "출결", "출퇴근", "지각", "체류 시간", "실근무", "점수", "메모"];

const CELL = "border-b border-r border-border-default px-3 py-2.5 align-top text-sm";
const HEADER_CELL = `${CELL} bg-canvas-subtle text-left font-medium text-fg-muted`;

function latenessClass(lateMinutes: number | null): string {
  if (lateMinutes == null) return "text-fg-muted";
  if (lateMinutes > 0) return "font-medium text-danger-fg";
  return "font-medium text-success-fg";
}

// Spec §7 (v2): fixed nine-column order, full Korean weekday names, no
// location or 작업 블록 합계 column, dedicated 지각 column separate from
// 출퇴근, grid lines visible on every row and column. Row click/Enter/Space
// opens the record-detail modal (v2: no more permanent side panel).
export function WorkLogTable({ records, selectedRecordId, onRowActivate }: WorkLogTableProps) {
  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
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
                    className={`${CELL} text-fg-default ${isSelected ? "border-l-[3px] border-l-row-selected-indicator" : ""}`}
                  >
                    {formatKoreanWeekday(record.date)}
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-fg-default`}>{formatKoreanDate(record.date)}</td>
                  <td className={CELL}>
                    <AttendanceBadge status={record.status} />
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-fg-default`}>{formatClockRange12Hour(record.clockIn, record.clockOut)}</td>
                  <td className={`${CELL} whitespace-nowrap ${latenessClass(record.lateMinutes)}`}>
                    {formatLateness(record.lateMinutes)}
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-medium text-primary-fg`}>
                    {isOff ? <span className="text-fg-muted">–</span> : formatHoursMinutes(record.basicWorkMinutes)}
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-medium text-success-fg`}>
                    {isOff ? <span className="text-fg-muted">–</span> : formatHoursMinutes(getNetWorkMinutes(record))}
                  </td>
                  <td className={`${CELL} whitespace-nowrap`}>
                    {record.score == null ? (
                      <span className="text-fg-muted">–</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-fg-default">{record.score}</span>
                        <ScoreRing score={record.score} />
                      </div>
                    )}
                  </td>
                  <td className={`${CELL} max-w-[220px] truncate text-fg-muted`}>{record.memo || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-b border-l border-r border-border-default px-3 py-2 text-sm text-fg-muted">
        <span>{records.length}개 중 1–{records.length} 표시</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            aria-label="이전 페이지"
            className={`rounded p-1 text-fg-muted disabled:opacity-40 ${FOCUS_VISIBLE}`}
          >
            <ChevronLeftIcon size={16} aria-hidden="true" />
          </button>
          <span className="min-w-6 rounded-md border border-primary-emphasis px-2 py-1 text-center text-primary-fg">1</span>
          <button
            type="button"
            disabled
            aria-label="다음 페이지"
            className={`rounded p-1 text-fg-muted disabled:opacity-40 ${FOCUS_VISIBLE}`}
          >
            <ChevronRightIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
