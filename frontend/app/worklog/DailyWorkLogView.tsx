"use client";

import type { RefObject } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
import { WorkTimeEntryEditor } from "./WorkTimeEntryEditor";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday } from "./format";
import type { WorkLogRecord } from "./mockData";
import type { WorkTimeDraftEntry, WorkTimeRowErrors } from "./workTimeEntry";
import type { ActivityCategory } from "@/lib/api/types";

interface DailyWorkLogViewProps {
  date: Date;
  /** null whenever `date` isn't already represented in one of the tracked
   *  page-level Work Log datasets — this component never invents a record
   *  for that case, it just renders the no-record empty state below with no
   *  editor and no Save/Cancel. */
  record: WorkLogRecord | null;
  entries: WorkTimeDraftEntry[];
  errors: Record<string, WorkTimeRowErrors>;
  isDirty: boolean;
  onChange: (entries: WorkTimeDraftEntry[]) => void;
  onSave: () => void;
  onDiscard: () => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** The canonical shared ActivityCategory catalog, passed straight through
   *  to WorkTimeEntryEditor — see activityCategory.ts. */
  categories: ActivityCategory[];
  /** True when `date` has already elapsed (or is today) — a historical
   *  missing record can be manually created; a future date cannot (it
   *  belongs to AttendancePlan). Only meaningful when `record` is null. */
  canCreateRecord?: boolean;
  onCreateRecord?: () => void;
}

// Primary inline workspace for continuously recording work-time entries for
// one date (v8 daily-view unit) — not a replacement for the unified record
// edit modal, which still owns every other field. Reuses the exact same
// controlled WorkTimeEntryEditor the modal and the (removed) standalone
// modal used, so there is only ever one entry-editing implementation. The
// draft/dirty/save/discard lifecycle lives one level up in page.tsx (this
// component never mutates page-level Work Log state itself).
export function DailyWorkLogView({
  date,
  record,
  entries,
  errors,
  isDirty,
  onChange,
  onSave,
  onDiscard,
  headingRef,
  categories,
  canCreateRecord,
  onCreateRecord,
}: DailyWorkLogViewProps) {
  const isEligible = !!record && isWorkdayStatus(record.status);

  return (
    <div className="flex w-full flex-col gap-4 rounded-md border border-border-default bg-surface-default p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-fg-default outline-none">
            업무시간 기록
          </h3>
          <span className="text-sm tabular-nums text-fg-muted">{formatKoreanDateWithWeekday(date)}</span>
          {record && <AttendanceBadge status={record.status} />}
        </div>
        {isDirty && <span className="whitespace-nowrap text-xs font-medium text-warning-fg">저장하지 않은 변경사항</span>}
      </div>

      {!record ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-fg-muted">선택한 날짜의 근무 기록이 없습니다.</p>
          {canCreateRecord && onCreateRecord && (
            <button
              type="button"
              onClick={onCreateRecord}
              className={`h-9 rounded-md bg-primary-emphasis px-4 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              근무 기록 생성
            </button>
          )}
        </div>
      ) : !isEligible ? (
        <div className="flex flex-col gap-3">
          {record.workTimeEntries.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-warning-fg bg-warning-subtle p-3 text-xs text-warning-fg">
              <span>비근무 출결에 남아있는 업무시간 기록입니다 — 삭제하지 않고 읽기 전용으로 표시합니다.</span>
              <ul className="flex flex-col gap-1 text-fg-default">
                {record.workTimeEntries.map((entry) => (
                  <li key={entry.id} className="tabular-nums">
                    {entry.item} · {formatHoursMinutes(entry.minutes)}
                    {entry.memo ? ` · ${entry.memo}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="py-6 text-center text-sm text-fg-muted">근무 또는 조퇴 기록에서만 업무시간을 입력할 수 있습니다.</p>
        </div>
      ) : (
        <>
          <WorkTimeEntryEditor entries={entries} onChange={onChange} errors={errors} categories={categories} />
          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onDiscard}
              disabled={!isDirty}
              className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
            >
              변경 취소
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty}
              className={`h-9 rounded-md bg-primary-emphasis px-4 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              변경사항 저장
            </button>
          </div>
        </>
      )}
    </div>
  );
}
