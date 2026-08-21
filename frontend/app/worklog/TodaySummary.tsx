"use client";

import type { ReactNode } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
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
    <div className="rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">오늘의 근무 요약</h2>

      {/* One grid for the whole row: the six metric columns are auto-width
          and center their label+value pair (justify-items-center), 메모
          takes the flexible remaining width (1fr, stretched via
          justify-self), and the action column is pinned to the right edge
          (justify-self-end). items-start (not items-end): value content
          heights differ per column (a badge vs. plain text vs. a score
          input+ring), so bottom-anchoring would push each column's *label*
          to a different top depending on its own value's height. Every
          label uses the same text-xs sizing, so top-anchoring aligns every
          label consistently, and every value then starts at the same Y
          right after (uniform label height + gap-1) — the action column's
          invisible spacer label gives its buttons that same starting
          point. */}
      <div className="grid grid-cols-[auto_auto_auto_auto_auto_auto_1fr_auto] items-start justify-items-center gap-x-6">
        <SummaryField label="출결" className="min-w-[52px] whitespace-nowrap">
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

        <SummaryField label="지각" className="min-w-[64px] whitespace-nowrap">
          <span className={`text-sm font-medium ${getLatenessResultClassName(lateness)}`}>
            {formatLatenessResult(lateness)}
          </span>
        </SummaryField>

        <SummaryField label="근무 점수">
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
            className={`h-9 w-16 rounded-md border border-control-border bg-control-bg px-2 text-center text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </SummaryField>

        <SummaryField label="메모" center={false} className="w-full min-w-[220px] justify-self-stretch">
          <input
            type="text"
            aria-label="오늘 메모"
            maxLength={MEMO_MAX_LENGTH}
            value={draft.memo}
            onChange={(e) => onDraftChange({ memo: e.target.value })}
            className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </SummaryField>

        <div className="flex flex-col gap-1 justify-self-end">
          <span className="invisible text-xs" aria-hidden="true">
            액션
          </span>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onOpenWorkTimeEntry}
              disabled={!isWorkdayStatus(status)}
              title={isWorkdayStatus(status) ? undefined : "근무 또는 조퇴 기록에서만 업무시간을 입력할 수 있습니다"}
              className={`h-9 w-32 whitespace-nowrap rounded-md border border-control-border bg-surface-default text-center text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
            >
              업무시간 기록
            </button>
            <button
              type="button"
              onClick={onSave}
              className={`h-9 w-32 whitespace-nowrap rounded-md border border-control-border bg-surface-default text-center text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// `center` (default true) horizontally centers the label+value pair within
// the field's own width — right for the six short metric columns, where a
// narrower value (e.g. "82") should sit centered under a wider label (e.g.
// "작업 블록 합계"). The 메모 field opts out (center={false}) since it's a
// flexible-width input that must stay left-aligned/stretched, not shrink-
// and-center like the metric fields.
function SummaryField({
  label,
  className = "",
  center = true,
  children,
}: {
  label: string;
  className?: string;
  center?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${center ? "items-center" : ""} ${className}`}>
      <span className="whitespace-nowrap text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
