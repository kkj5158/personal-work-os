"use client";

import { ClockIcon, LocationIcon } from "@primer/octicons-react";
import { FOCUS_VISIBLE, formatClockTime12Hour, formatKoreanDateWithWeekday } from "./format";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "./mockData";
import { ATTENDANCE_STATUS_CLASSES } from "./AttendanceBadge";

interface TodayWorkPanelProps {
  date: Date;
  status: AttendanceStatus;
  onStatusChange: (status: AttendanceStatus) => void;
  location: string;
  clockIn: string | null;
  clockOut: string | null;
  onClockIn: () => void;
  onClockOut: () => void;
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
}: TodayWorkPanelProps) {
  // Text-color-only reuse of AttendanceBadge's hue mapping (a native
  // <select> can't host the full badge markup), so the dropdown's current
  // value still reads with the same restrained semantic color.
  const statusTextClass = ATTENDANCE_STATUS_CLASSES[status].match(/text-\S+/)?.[0] ?? "text-fg-default";

  return (
    <div className="rounded-md border border-border-default bg-surface-default p-4">
      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-fg-muted">출근 시간</span>
          <span className="flex items-center gap-1 font-medium text-primary-fg">
            <ClockIcon size={14} aria-hidden="true" />
            {formatClockTime12Hour(clockIn)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-fg-muted">퇴근 시간</span>
          <span className="flex items-center gap-1 font-medium text-fg-default">
            <ClockIcon size={14} aria-hidden="true" />
            {formatClockTime12Hour(clockOut)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClockIn}
            className={`rounded-md bg-primary-emphasis px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            출근
          </button>
          <button
            type="button"
            onClick={onClockOut}
            className={`rounded-md border border-danger-fg bg-danger-subtle px-4 py-1.5 text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            퇴근
          </button>
        </div>
      </div>
    </div>
  );
}
