"use client";

import type { ReactNode } from "react";
import { LocationIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE, formatKoreanDateWithWeekday } from "./format";
import { isWorkdayStatus } from "./attendance";
import type { AttendanceStatus } from "./mockData";
import { AttendanceSelect } from "./AttendanceSelect";
import { ClockTimeField } from "./ClockTimeField";
import { AppliedStartTimeField } from "./AppliedStartTimeField";
import { isActiveCriterionSnapshot, type AppliedStartTime, type StartTimeCriterion } from "./startTimeCriterion";

interface TodayWorkPanelProps {
  date: Date;
  status: AttendanceStatus;
  onStatusChange: (status: AttendanceStatus) => void;
  location: string;
  clockIn: string | null;
  clockOut: string | null;
  onClockIn: () => void;
  onClockOut: () => void;
  /** Opens the 출근 취소 confirmation (or the work-time-entry blocking
   *  notice) — page.tsx owns the actual clockIn-clearing patch, since it's
   *  gated behind a modal rather than applied directly on click. */
  onClockInCancelRequest: () => void;
  onClockInEdit: (value: string) => void;
  onClockOutEdit: (value: string) => void;
  /** True for the brief window an immediate clock action is in flight
   *  (spec v3 §6) — locks both buttons regardless of the clock state below,
   *  ignoring a duplicate rapid click. Always instantaneous against the
   *  current in-memory mock data, but the guard is structured this way so a
   *  future async API call can set/clear it around a real request without
   *  changing this component. */
  clockActionPending: boolean;
  appliedStartTime: AppliedStartTime | null;
  onAppliedStartTimeChange: (next: AppliedStartTime | null) => void;
  criteria: StartTimeCriterion[];
}

// Presentation + a thin layer of local wiring only — no calculation here.
// clockIn/clockOut/status changes flow straight to page.tsx's single
// date-based update helper (spec §6.2): this component never decides
// lateness, duration, or score. Three zones (spec v3 §4): header metadata,
// the work-time field grid, and the right-pinned clock actions.
export function TodayWorkPanel({
  date,
  status,
  onStatusChange,
  location,
  clockIn,
  clockOut,
  onClockIn,
  onClockOut,
  onClockInCancelRequest,
  onClockInEdit,
  onClockOutEdit,
  clockActionPending,
  appliedStartTime,
  onAppliedStartTimeChange,
  criteria,
}: TodayWorkPanelProps) {
  const isWorking = isWorkdayStatus(status);
  const hasValidCriterion = isActiveCriterionSnapshot(appliedStartTime, criteria);
  const isClockedInNotOut = !!clockIn && !clockOut;
  // Daily clock state machine (spec v5 §1): exactly one clock-in/out pair
  // per date, now with an explicit undo step. Non-working attendance
  // disables both regardless of any recorded clock time. A new clock-in is
  // additionally gated on having a saved active criterion selected (spec
  // §7) — corrections to an *already recorded* time go through
  // ClockTimeField instead, so 퇴근 (and 출근 취소, once clocked in) are
  // never blocked by a missing criterion — an in-progress shift must still
  // be completable safely.
  const canClockIn = isWorking && !clockActionPending && !clockIn && hasValidCriterion;
  const canCancelClockIn = isWorking && !clockActionPending && isClockedInNotOut;
  const canClockOut = isWorking && !clockActionPending && isClockedInNotOut;
  const showCriterionRequiredMessage = isWorking && !clockIn && !hasValidCriterion;

  return (
    <div className="rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">오늘의 근무</h2>

      {/* Zone 1 — header metadata: date / attendance / workplace. */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-fg-default">{formatKoreanDateWithWeekday(date)}</span>

        <AttendanceSelect value={status} onChange={onStatusChange} ariaLabel="오늘 출결" />

        {/* Confirmed MVP decision: 근무 장소 is read-only display in this
            phase — no editable control (input/select) is introduced here. */}
        <div className="flex items-center gap-1.5 rounded-md border border-control-border bg-control-bg px-2.5 py-1.5">
          <LocationIcon size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="text-sm text-fg-default">{location}</span>
        </div>
      </div>

      <div className="my-4 border-t border-border-default" />

      {/* Zone 2 (work-time grid) + Zone 3 (actions), one row: items-start so
          every field's label starts at the same top (every label shares the
          same text-xs line height, including the button group's invisible
          spacer below). ClockTimeField never changes size on click (spec
          v4), so this alignment is now static rather than needing to
          tolerate a taller "editing" row. Right-pinned via ml-auto; no
          flex-wrap, so the actions never drop onto their own line. */}
      <div className="flex items-start gap-6">
        <ClockTimeField
          label="출근 시간"
          value={clockIn}
          otherValue={clockOut}
          onConfirm={onClockInEdit}
          editButtonLabel="출근 시간 수정"
          valueClassName="text-primary-fg"
        />

        <ClockTimeField
          label="퇴근 시간"
          value={clockOut}
          otherValue={clockIn}
          onConfirm={onClockOutEdit}
          editButtonLabel="퇴근 시간 수정"
          valueClassName="text-fg-default"
        />

        <div className="flex flex-col gap-1">
          <AppliedStartTimeField value={appliedStartTime} onChange={onAppliedStartTimeChange} criteria={criteria} showLabel />
          {showCriterionRequiredMessage && <span className="text-xs text-danger-fg">출근 기준을 선택해주세요.</span>}
        </div>

        <ActionsSpacer>
          <div className="flex items-center gap-2">
            {isClockedInNotOut ? (
              <button
                type="button"
                onClick={onClockInCancelRequest}
                disabled={!canCancelClockIn}
                className={`h-9 w-20 whitespace-nowrap rounded-md border border-control-border bg-surface-default text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-default ${FOCUS_VISIBLE}`}
              >
                출근 취소
              </button>
            ) : (
              <button
                type="button"
                onClick={onClockIn}
                disabled={!canClockIn}
                className={`h-9 w-20 whitespace-nowrap rounded-md bg-primary-emphasis text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40 ${FOCUS_VISIBLE}`}
              >
                출근
              </button>
            )}
            <button
              type="button"
              onClick={onClockOut}
              disabled={!canClockOut}
              className={`h-9 w-20 whitespace-nowrap rounded-md border border-danger-fg bg-danger-subtle text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40 ${FOCUS_VISIBLE}`}
            >
              퇴근
            </button>
          </div>
        </ActionsSpacer>
      </div>
    </div>
  );
}

// Right-pinned action column with an invisible label matching every
// TimingField's own label height, so its buttons start at that same shared
// value baseline under items-start (see TodayWorkPanel's row comment).
function ActionsSpacer({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto flex flex-col gap-1">
      <span className="invisible text-xs" aria-hidden="true">
        액션
      </span>
      {children}
    </div>
  );
}
