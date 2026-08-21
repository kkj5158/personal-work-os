"use client";

import type { ReactNode } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
import { ScoreRing } from "./ScoreRing";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatHoursMinutes, formatLatenessResult, getLatenessResultClassName } from "./format";
import type { AttendanceStatus } from "./mockData";
import type { LatenessResult } from "./selectors";

const MEMO_MAX_LENGTH = 500;

export interface TodayDraft {
  score: number | null;
  memo: string;
}

interface TodaySummaryProps {
  status: AttendanceStatus;
  basicWorkMinutes: number | null;
  netWorkMinutes: number | null;
  actualBlockMinutes: number | null;
  lateness: LatenessResult;
  draft: TodayDraft;
  onDraftChange: (patch: Partial<TodayDraft>) => void;
  onSave: () => void;
  onOpenWorkTimeEntry: () => void;
}

// 출결/체류 시간/실근무/작업 블록 합계/지각 are display-only in this phase
// (spec §6.3) — only 근무 점수 and 메모 are part of the local Today draft.
// 실근무 (v2 Phase 4) is passed in already derived from workTimeEntries via
// getNetWorkMinutes — never independently edited here. 업무시간 기록 opens
// WorkTimeEntryModal for today's record via onOpenWorkTimeEntry.
export function TodaySummary({
  status,
  basicWorkMinutes,
  netWorkMinutes,
  actualBlockMinutes,
  lateness,
  draft,
  onDraftChange,
  onSave,
  onOpenWorkTimeEntry,
}: TodaySummaryProps) {
  return (
    <div className="rounded-md border border-border-default bg-surface-default p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <SummaryField label="출결">
          <AttendanceBadge status={status} />
        </SummaryField>

        <SummaryField label="체류 시간">
          <span className="text-sm font-medium text-primary-fg">{formatHoursMinutes(basicWorkMinutes)}</span>
        </SummaryField>

        <SummaryField label="실근무">
          <span className="text-sm font-medium text-success-fg">
            {isWorkdayStatus(status) ? formatHoursMinutes(netWorkMinutes) : "–"}
          </span>
        </SummaryField>

        <SummaryField label="작업 블록 합계">
          <span className="text-sm text-fg-muted">{formatHoursMinutes(actualBlockMinutes)}</span>
        </SummaryField>

        <SummaryField label="지각">
          <span className={`text-sm font-medium ${getLatenessResultClassName(lateness)}`}>
            {formatLatenessResult(lateness)}
          </span>
        </SummaryField>

        <SummaryField label="근무 점수">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={100}
              aria-label="오늘 근무 점수"
              value={draft.score ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                onDraftChange({ score: value == null ? null : Math.max(0, Math.min(100, value)) });
              }}
              className={`w-14 rounded-md border border-control-border bg-control-bg px-2 py-1 text-right text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
            <ScoreRing score={draft.score} size={22} />
          </div>
        </SummaryField>

        <SummaryField label="메모" className="min-w-[220px] flex-1">
          <input
            type="text"
            aria-label="오늘 메모"
            maxLength={MEMO_MAX_LENGTH}
            value={draft.memo}
            onChange={(e) => onDraftChange({ memo: e.target.value })}
            className={`w-full rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </SummaryField>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenWorkTimeEntry}
            disabled={!isWorkdayStatus(status)}
            title={isWorkdayStatus(status) ? undefined : "근무 또는 조퇴 기록에서만 업무시간을 입력할 수 있습니다"}
            className={`rounded-md border border-control-border bg-surface-default px-3 py-1.5 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
          >
            업무시간 기록
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`rounded-md border border-control-border bg-surface-default px-3 py-1.5 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
