"use client";

import type { ChecklistMatrixColumnDto, ChecklistMatrixResponseDto, ChecklistResult, WorkAttendanceStatus } from "@/lib/api/types";
import { formatKoreanDate, formatKoreanWeekday, toDateKey } from "@/lib/date";
import { findCell, groupByPriority, isApplicable } from "./checklistLogic";
import { AttendanceBadge } from "./AttendanceBadge";
import { mapStatusFromBackend } from "./mapping";
import { ChecklistResultControl } from "./ChecklistResultControl";

type Row = ChecklistMatrixResponseDto["rows"][number];

interface ChecklistDateTableProps {
  dates: Date[];
  columns: ChecklistMatrixColumnDto[];
  rowByDate: Map<string, Row>;
  onResultChange: (entryId: string, result: ChecklistResult) => void;
}

const PRIORITY_HEADER_LABEL: Record<"core" | "secondary", string> = { core: "CORE", secondary: "SECONDARY" };

// The canonical date-row Checklist table (§21/§23-26) — shared by Week (one
// group) and Month (one instance per weekly group, §28). Full Korean
// weekday/date names, frozen 요일/날짜/출결 context columns, subtle
// CORE/SECONDARY group headers, and checkbox-ONLY applicable cells — no
// emoji/Goal/memo/Category anywhere in a cell, by explicit policy (§23).
// Not-applicable cells render a quiet "–", never an ordinary editable
// checkbox (§25), so 미완료 and 해당 없음 are never visually confused.
export function ChecklistDateTable({ dates, columns, rowByDate, onResultChange }: ChecklistDateTableProps) {
  const { core, secondary } = groupByPriority(columns);
  const groups: ["core" | "secondary", ChecklistMatrixColumnDto[]][] = [];
  if (core.length > 0) groups.push(["core", core]);
  if (secondary.length > 0) groups.push(["secondary", secondary]);
  const orderedColumns = [...core, ...secondary];

  if (orderedColumns.length === 0) {
    return <p className="rounded-md border border-border-default py-8 text-center text-sm text-fg-muted">표시할 항목이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border-default bg-canvas-subtle px-3 py-2 text-left text-xs font-medium text-fg-muted [text-wrap:balance]" style={{ wordBreak: "keep-all" }}>
              요일
            </th>
            <th scope="col" rowSpan={2} className="sticky left-[64px] z-10 whitespace-nowrap border-b border-r border-border-default bg-canvas-subtle px-3 py-2 text-left text-xs font-medium text-fg-muted">
              날짜
            </th>
            <th scope="col" rowSpan={2} className="sticky left-[168px] z-10 whitespace-nowrap border-b border-r border-border-default bg-canvas-subtle px-3 py-2 text-left text-xs font-medium text-fg-muted">
              출결
            </th>
            {groups.map(([kind, cols]) => (
              <th key={kind} colSpan={cols.length} scope="colgroup" className="border-b border-r border-border-default bg-canvas-subtle/60 px-3 py-1 text-left text-[10px] font-medium tracking-wide text-fg-muted">
                {PRIORITY_HEADER_LABEL[kind]}
              </th>
            ))}
          </tr>
          <tr>
            {orderedColumns.map((c) => (
              <th key={c.itemId} scope="col" style={{ minWidth: 128, wordBreak: "keep-all" }} className="whitespace-normal border-b border-r border-border-default bg-canvas-subtle px-3 py-2 text-left text-xs font-medium text-fg-default">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const dateKey = toDateKey(date);
            const row = rowByDate.get(dateKey);
            return (
              <tr key={dateKey} className="border-t border-border-default" style={{ height: 50 }}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border-default bg-surface-default px-3 py-2 text-fg-default">{formatKoreanWeekday(date)}</td>
                <td className="sticky left-[64px] z-10 whitespace-nowrap border-b border-r border-border-default bg-surface-default px-3 py-2 tabular-nums text-fg-default">{formatKoreanDate(date)}</td>
                <td className="sticky left-[168px] z-10 whitespace-nowrap border-b border-r border-border-default bg-surface-default px-3 py-2">
                  {row ? <AttendanceBadge status={mapStatusFromBackend(row.status as WorkAttendanceStatus)} /> : <span className="text-fg-muted">미입력</span>}
                </td>
                {orderedColumns.map((c) => {
                  const applicable = isApplicable(row, c.itemId);
                  const cell = findCell(row, c.itemId);
                  return (
                    <td key={c.itemId} className="border-b border-r border-border-default px-3 py-2 text-center">
                      {applicable && cell ? (
                        <ChecklistResultControl
                          result={cell.result}
                          onChange={(result) => onResultChange(cell.entryId, result)}
                          label={`${formatKoreanDate(date)} ${c.name}`}
                          size="sm"
                        />
                      ) : (
                        <span aria-label={`${formatKoreanDate(date)} ${c.name} 해당 없음`} className="text-fg-muted">
                          –
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
