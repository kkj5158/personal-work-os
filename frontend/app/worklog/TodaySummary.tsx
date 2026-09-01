"use client";

import type { ReactNode } from "react";
import { AttendanceBadge } from "./AttendanceBadge";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE, formatHoursMinutes, formatLatenessResult, getLatenessResultClassName } from "./format";
import type { AttendanceStatus } from "./mockData";
import type { LatenessResult, OnTimeOverrideEligibility } from "./selectors";

const MEMO_MAX_LENGTH = 500;
const NUMBER_SPINNER_NONE = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export interface TodayDraft {
  score: number | null;
  memo: string;
}

interface TodaySummaryProps {
  status: AttendanceStatus;
  basicWorkMinutes: number | null;
  netWorkMinutes: number | null;
  /** Already layered with the on-time override (selectors.ts's
   *  getEffectiveLateness) — this is exactly what should render, including
   *  the exact raw minutes when no override is active (Today never
   *  truncates to "10+"; that's a table-only compaction). */
  lateness: LatenessResult;
  overrideEligibility: OnTimeOverrideEligibility;
  onToggleOnTimeOverride: () => void;
  draft: TodayDraft;
  onDraftChange: (patch: Partial<TodayDraft>) => void;
  onSave: () => void;
  onOpenWorkTimeEntry: () => void;
}

// v6 visual-polish layout: upper read-only metric grid (출결/체류 시간/
// 실근무/지각 — 근무 점수 moved down into the editable row) + a lower
// editable row (점수/메모/업무시간 기록/저장), separated by a restrained
// divider. 실근무/체류 시간 are neutral strong foreground now (previously
// decorative primary/success colors) — 지각 keeps its semantic color since
// that's the one metric where color communicates real state. 작업 블록
// 합계 and ScoreRing are never shown.
export function TodaySummary({
  status,
  basicWorkMinutes,
  netWorkMinutes,
  lateness,
  overrideEligibility,
  onToggleOnTimeOverride,
  draft,
  onDraftChange,
  onSave,
  onOpenWorkTimeEntry,
}: TodaySummaryProps) {
  return (
    <div className="rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">오늘의 근무 요약</h2>

      {/* Upper — read-only metrics: a stable 4-column grid so label/value
          baselines always line up regardless of content width. */}
      <div className="grid grid-cols-4 gap-x-6">
        <MetricField label="출결">
          <AttendanceBadge status={status} />
        </MetricField>

        <MetricField label="체류 시간">
          <span className="text-sm font-medium tabular-nums text-fg-default">{formatHoursMinutes(basicWorkMinutes)}</span>
        </MetricField>

        <MetricField label="실근무">
          <span className="text-sm font-medium tabular-nums text-fg-default">
            {isWorkdayStatus(status) ? formatHoursMinutes(netWorkMinutes) : "–"}
          </span>
        </MetricField>

        <MetricField label="지각">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium tabular-nums ${getLatenessResultClassName(lateness)}`}>
              {formatLatenessResult(lateness)}
            </span>
            {overrideEligibility === "apply" && (
              <button
                type="button"
                onClick={onToggleOnTimeOverride}
                aria-label="정시 출근으로 처리"
                className={`h-6 shrink-0 whitespace-nowrap rounded border border-control-border bg-surface-default px-2 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-fg-default ${FOCUS_VISIBLE}`}
              >
                정시 출근 처리
              </button>
            )}
            {overrideEligibility === "cancel" && (
              <button
                type="button"
                onClick={onToggleOnTimeOverride}
                aria-label="정시 출근 처리 취소"
                className={`h-6 shrink-0 whitespace-nowrap rounded border border-control-border bg-surface-default px-2 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-fg-default ${FOCUS_VISIBLE}`}
              >
                처리 취소
              </button>
            )}
          </div>
        </MetricField>
      </div>

      <div className="my-4 border-t border-border-default" />

      {/* Lower — editable fields + actions: 근무 점수(72–88px) / 메모
          (flexible, minmax(240px,1fr)) / actions(140–160px), all controls
          the same 36px height. */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-20 shrink-0 flex-col gap-1">
          <span className="text-xs text-fg-muted">근무 점수</span>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            aria-label="오늘 근무 점수"
            disabled={!isWorkdayStatus(status)}
            title={isWorkdayStatus(status) ? undefined : "비근무 상태에는 근무 점수를 기록하지 않습니다"}
            value={isWorkdayStatus(status) ? (draft.score ?? "") : ""}
            onChange={(e) => {
              const value = e.target.value === "" ? null : Number(e.target.value);
              onDraftChange({ score: value == null ? null : Math.max(0, Math.min(100, value)) });
            }}
            className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-center text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${NUMBER_SPINNER_NONE} ${FOCUS_VISIBLE}`}
          />
        </label>

        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-xs text-fg-muted">메모</span>
          <input
            type="text"
            aria-label="오늘 메모"
            maxLength={MEMO_MAX_LENGTH}
            value={draft.memo}
            onChange={(e) => onDraftChange({ memo: e.target.value })}
            className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </label>

        <div className="flex shrink-0 flex-col gap-1">
          {/* No fixed width here — the two buttons' own content (업무시간
              기록's text plus 저장's padding) needs ~169px, more than the
              old w-36 (144px) allowed, which let 저장 overflow straight
              through the card's right padding and sit flush against the
              border. Sizing to content and relying on `shrink-0` (so 메모's
              flex-1 gives up space first) keeps this block fully inside the
              card's existing padding instead.
              Invisible spacer matching the score/memo labels' own text-xs
              line above their inputs, so this action row's controls sit at
              exactly the same baseline as the adjacent inputs regardless of
              flex cross-axis rounding — never relying on items-end alone to
              keep 저장 fully inside the card. */}
          <span className="text-xs text-fg-muted opacity-0 select-none" aria-hidden="true">
            &nbsp;
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenWorkTimeEntry}
              disabled={!isWorkdayStatus(status)}
              title={isWorkdayStatus(status) ? undefined : "근무 또는 조퇴 기록에서만 업무시간을 입력할 수 있습니다"}
              className={`h-9 flex-1 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
            >
              업무시간 기록
            </button>
            <button
              type="button"
              onClick={onSave}
              className={`h-9 shrink-0 whitespace-nowrap rounded-md bg-primary-emphasis px-4 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-col gap-1">
      <span className="whitespace-nowrap text-xs text-fg-muted">{label}</span>
      <div className="flex h-9 items-center">{children}</div>
    </div>
  );
}
