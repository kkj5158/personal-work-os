"use client";

import type { ReactNode } from "react";
import { ClockIcon, LocationIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE, formatClockTime12Hour, formatKoreanDateWithWeekday } from "./format";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./mockData";
import { ATTENDANCE_STATUS_CLASSES } from "./AttendanceBadge";
import { AppliedStartTimeField } from "./AppliedStartTimeField";
import type { AppliedStartTime, StartTimeCriterion } from "./startTimeCriterion";

interface TodayWorkPanelProps {
  date: Date;
  status: AttendanceStatus;
  onStatusChange: (status: AttendanceStatus) => void;
  location: string;
  clockIn: string | null;
  clockOut: string | null;
  onClockIn: () => void;
  onClockOut: () => void;
  appliedStartTime: AppliedStartTime | null;
  onAppliedStartTimeChange: (next: AppliedStartTime | null) => void;
  criteria: StartTimeCriterion[];
}

// Presentation + a thin layer of local wiring only — no calculation here.
// clockIn/clockOut/status changes flow straight to page.tsx's single
// date-based update helper (spec §6.2): this component never decides
// lateness, duration, or score.
export function TodayWorkPanel({
  date,
  status,
  onStatusChange,
  location,
  clockIn,
  clockOut,
  onClockIn,
  onClockOut,
  appliedStartTime,
  onAppliedStartTimeChange,
  criteria,
}: TodayWorkPanelProps) {
  // Text-color-only reuse of AttendanceBadge's hue mapping (a native
  // <select> can't host the full badge markup), so the dropdown's current
  // value still reads with the same restrained semantic color.
  const statusTextClass = ATTENDANCE_STATUS_CLASSES[status].match(/text-\S+/)?.[0] ?? "text-fg-default";

  return (
    <div className="rounded-md border border-border-default bg-surface-default p-6">
      <h2 className="mb-3 text-sm font-semibold text-fg-default">오늘의 근무</h2>

      {/* Metadata row: date / attendance / workplace. */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-fg-default">{formatKoreanDateWithWeekday(date)}</span>

        <select
          aria-label="오늘 출결"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as AttendanceStatus)}
          className={`rounded-md border border-control-border bg-control-bg px-2.5 py-1.5 text-sm font-medium focus:border-primary-emphasis focus:outline-none ${statusTextClass} ${FOCUS_VISIBLE}`}
        >
          {ATTENDANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Confirmed MVP decision: 근무 장소 is read-only display in this
            phase — no editable control (input/select) is introduced here. */}
        <div className="flex items-center gap-1.5 rounded-md border border-control-border bg-control-bg px-2.5 py-1.5">
          <LocationIcon size={16} className="shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="text-sm text-fg-default">{location}</span>
        </div>
      </div>

      <div className="my-4 border-t border-border-default" />

      {/* Timing/action row: items-start (not items-end) is deliberate —
          AppliedStartTimeField grows a third line (직접 입력's custom-time
          input) when that mode is active, which would pull its own label
          away from 출근/퇴근 시간's labels under items-end (bottom-anchored
          alignment shifts every child's top by however tall it is). With
          items-start, every label starts at the same row-top instead (they
          share the same text-xs line height, so their tops *and* bottoms
          align), and every value/select naturally starts right after at
          the same Y (label height + gap-1 is identical for all three
          fields) — this holds regardless of whether the custom-time row is
          present, since that row only extends the AppliedStartTimeField
          column *downward* without affecting its siblings. The button
          group gets an invisible spacer matching the label's exact classes
          so its buttons start at that same shared value baseline too,
          without needing a real label above it. Right-pinned via ml-auto;
          no flex-wrap, so the buttons never drop onto their own line. */}
      <div className="flex items-start gap-6">
        <TimingField label="출근 시간">
          <span className="flex items-center gap-1 text-sm font-medium text-primary-fg">
            <ClockIcon size={14} aria-hidden="true" />
            {formatClockTime12Hour(clockIn)}
          </span>
        </TimingField>

        <TimingField label="퇴근 시간">
          <span className="flex items-center gap-1 text-sm font-medium text-fg-default">
            <ClockIcon size={14} aria-hidden="true" />
            {formatClockTime12Hour(clockOut)}
          </span>
        </TimingField>

        <AppliedStartTimeField
          value={appliedStartTime}
          onChange={onAppliedStartTimeChange}
          criteria={criteria}
          showLabel
        />

        <div className="ml-auto flex flex-col gap-1">
          <span className="invisible text-xs" aria-hidden="true">
            액션
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClockIn}
              className={`h-9 w-20 rounded-md bg-primary-emphasis text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              출근
            </button>
            <button
              type="button"
              onClick={onClockOut}
              className={`h-9 w-20 rounded-md border border-danger-fg bg-danger-subtle text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              퇴근
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Label-above-value column matching TodaySummary's SummaryField shape
// exactly (text-xs muted label, gap-1) — every field in the timing row uses
// this same shape (including the invisible-label button-group spacer) so
// items-start on the parent row aligns every label's top and every value's
// top consistently, regardless of which field happens to render taller.
function TimingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
