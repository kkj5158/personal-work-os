"use client";

import { useState } from "react";
import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import { isFutureSeoulDate } from "@/lib/seoulDate";
import type { AttendancePlanDto, PlannableAttendanceStatus } from "@/lib/api/types";
import { ATTENDANCE_PRESENTATION } from "./attendancePresentation";
import { FOCUS_VISIBLE } from "./format";
import { toApiDateKey } from "./mapping";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";

const PLAN_STATUS_LABEL: Record<PlannableAttendanceStatus, AttendanceStatus> = {
  WORK: "근무",
  HALF_DAY: "반차",
  PAID_LEAVE: "연차",
  DAY_OFF: "휴일",
};

const SPECIAL_ACTUAL = new Set<AttendanceStatus>(["연차", "반차", "병가", "조퇴", "결근"]);
const SPECIAL_PLAN = new Set<AttendanceStatus>(["연차", "반차"]);

type Filter = "전체" | "연차" | "반차" | "병가" | "조퇴" | "결근";
const FILTERS: Filter[] = ["전체", "연차", "반차", "병가", "조퇴", "결근"];

interface HistoryRow {
  date: Date;
  planLabel: AttendanceStatus | null;
  actualLabel: AttendanceStatus | null;
  memo: string;
}

interface AttendanceHistoryProps {
  records: WorkLogRecord[];
  plans: AttendancePlanDto[];
  referenceDate: Date;
  onRowActivate: (date: Date) => void;
}

// Attendance History (§18) — not a general WorkRecord table: only
// exceptional/special attendance events, ordinary WORK/HOLIDAY excluded
// unless plan/actual disagree in a way that surfaces a special event on
// either side. Final columns only: 날짜 | 계획 | 실제 | 메모 — no
// 출근/퇴근 time, no detail arrow; the whole row is clickable.
export function AttendanceHistory({ records, plans, referenceDate, onRowActivate }: AttendanceHistoryProps) {
  const [filter, setFilter] = useState<Filter>("전체");

  const recordByDate = new Map(records.map((r) => [toApiDateKey(r.date), r]));
  const planByDate = new Map(plans.map((p) => [p.planDate, p]));
  const allDateKeys = new Set([...recordByDate.keys(), ...planByDate.keys()]);

  const rows: HistoryRow[] = [];
  for (const dateKey of allDateKeys) {
    const record = recordByDate.get(dateKey);
    const plan = planByDate.get(dateKey);
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (isFutureSeoulDate(date, referenceDate)) continue; // future plan-only entries belong to the calendar, not history

    const actualLabel = record?.status ?? null;
    const planLabel = plan ? PLAN_STATUS_LABEL[plan.plannedStatus] : null;

    const isSpecialActual = actualLabel != null && SPECIAL_ACTUAL.has(actualLabel);
    const isSpecialPlan = planLabel != null && SPECIAL_PLAN.has(planLabel);
    const differs = planLabel != null && actualLabel != null && planLabel !== actualLabel;

    const include = isSpecialActual || (isSpecialPlan && (differs || actualLabel == null));
    if (!include) continue;

    rows.push({ date, planLabel, actualLabel, memo: record?.memo || "" });
  }

  rows.sort((a, b) => b.date.getTime() - a.date.getTime());

  const filtered = filter === "전체" ? rows : rows.filter((r) => r.planLabel === filter || r.actualLabel === filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 w-fit rounded-md border border-border-default p-0.5 text-xs font-medium">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded px-2.5 ${filter === f ? "bg-primary-emphasis font-medium text-white" : "text-fg-muted hover:text-fg-default"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["날짜", "계획", "실제", "메모"].map((header) => (
                <th key={header} scope="col" className="whitespace-nowrap border-b border-border-default bg-canvas-subtle px-3 py-2.5 text-left text-xs font-medium text-fg-muted">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="border-b border-border-default px-3 py-6 text-center text-sm text-fg-muted">
                  표시할 이력이 없습니다.
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={toApiDateKey(row.date)}
                tabIndex={0}
                onClick={() => onRowActivate(row.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowActivate(row.date);
                  }
                }}
                className={`cursor-pointer hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                <td className="whitespace-nowrap border-b border-border-default px-3 py-2.5 tabular-nums text-fg-default">
                  {formatKoreanDate(row.date)} ({formatKoreanWeekday(row.date).slice(0, 1)})
                </td>
                <td className="whitespace-nowrap border-b border-border-default px-3 py-2.5">
                  {row.planLabel ? (
                    <span className="font-medium" style={{ color: ATTENDANCE_PRESENTATION[row.planLabel].strong }}>
                      {row.planLabel}
                    </span>
                  ) : (
                    <span className="text-fg-muted">–</span>
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-border-default px-3 py-2.5">
                  {row.actualLabel ? (
                    <span className="font-medium" style={{ color: ATTENDANCE_PRESENTATION[row.actualLabel].strong }}>
                      {row.actualLabel}
                    </span>
                  ) : (
                    <span className="text-fg-muted">미입력</span>
                  )}
                </td>
                <td className="max-w-[240px] truncate border-b border-border-default px-3 py-2.5 text-fg-muted">{row.memo || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
