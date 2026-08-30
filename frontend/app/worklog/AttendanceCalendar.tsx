"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { isSameDay, parseLocalDateTime, toDateKey } from "@/lib/date";
import { isFutureSeoulDate } from "@/lib/seoulDate";
import type { ActivityCategory, AttendancePlanDto, PlannableAttendanceStatus, PlannedTimeBlock } from "@/lib/api/types";
import { isWorkdayStatus } from "./attendance";
import { ATTENDANCE_PRESENTATION, type DonutCategory } from "./attendancePresentation";
import { upsertAttendancePlan } from "@/lib/api/attendancePlans";
import { AttendancePlanPopover } from "./AttendancePlanPopover";
import { FOCUS_VISIBLE, formatHoursMinutes } from "./format";
import { toApiDateKey } from "./mapping";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";
import { getNetWorkMinutes } from "./selectors";
import type { StartTimeCriterion } from "./startTimeCriterion";

export type CalendarViewMode = "both" | "planOnly" | "actualOnly";

const PLAN_STATUS_LABEL: Record<PlannableAttendanceStatus, AttendanceStatus> = {
  WORK: "근무",
  HALF_DAY: "반차",
  PAID_LEAVE: "연차",
  DAY_OFF: "휴일",
};

const WEEKDAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

interface AttendanceCalendarProps {
  monthAnchor: Date;
  plans: AttendancePlanDto[];
  records: WorkLogRecord[];
  criteria: StartTimeCriterion[];
  categories: ActivityCategory[];
  plannedBlocks: PlannedTimeBlock[];
  referenceDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onPlanSaved: (plan: AttendancePlanDto) => void;
  onPlanDeleted: (date: Date) => void;
  onBlockUpserted: (block: PlannedTimeBlock) => void;
  onBlockDeleted: (id: string) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Monday=0..Sunday=6, matching this app's existing Monday-start convention.
function mondayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

// Attendance batch §8: the calendar week's cumulative actual work time,
// shown on each Sunday cell. Sums getNetWorkMinutes (the same canonical
// actual-work-time definition Work Record uses) across that Monday->Sunday
// week's workday-status records only — never fabricated for 휴일/연차/etc.
// `recordByDate` is built from the full-year `records` prop already loaded
// by the Attendance page, so this correctly covers weeks spanning a month
// boundary; a week spanning the Dec 31/Jan 1 year boundary would miss the
// adjacent year's day(s) since that data isn't in scope here.
function sundayWeekNetMinutes(sunday: Date, recordByDate: Map<string, WorkLogRecord>): number {
  let total = 0;
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - offset);
    const record = recordByDate.get(toApiDateKey(day));
    if (record && isWorkdayStatus(record.status)) {
      total += getNetWorkMinutes(record);
    }
  }
  return total;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// The single plan-vs-actual calendar (§11) — one physical calendar, three
// view modes, never separate plan/actual calendars. Combined cells show a
// fixed upper(plan)/divider/lower(actual) layout — the divider is a
// confirmed visual requirement even when one side is blank, since the
// spatial position is what communicates meaning (no repeated "계획"/"실제"
// labels inside every cell).
export function AttendanceCalendar({
  monthAnchor,
  plans,
  records,
  criteria,
  categories,
  plannedBlocks,
  referenceDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onPlanSaved,
  onPlanDeleted,
  onBlockUpserted,
  onBlockDeleted,
}: AttendanceCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("actualOnly");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [popover, setPopover] = useState<{ date: Date; anchorRect: DOMRect } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clipboardRef = useRef<{ status: PlannableAttendanceStatus; startTimeCriterionId: string | null } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monthStart = startOfMonth(monthAnchor);
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const leadingBlank = mondayIndex(monthStart);
  const trailingBlank = (7 - ((leadingBlank + daysInMonth) % 7)) % 7;

  const planByDate = new Map(plans.map((p) => [p.planDate, p]));
  const recordByDate = new Map(records.map((r) => [toDateKey(r.date), r]));

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function pastePlan(date: Date, clip: { status: PlannableAttendanceStatus; startTimeCriterionId: string | null }) {
    try {
      const saved = await upsertAttendancePlan(toApiDateKey(date), {
        plannedStatus: clip.status,
        startTimeCriterionId: clip.startTimeCriterionId,
      });
      onPlanSaved(saved);
      showToast("계획을 붙여넣었습니다.");
    } catch {
      showToast("붙여넣기에 실패했습니다.");
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable)) return;
      if (!selectedDate) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        const plan = planByDate.get(toApiDateKey(selectedDate));
        if (!plan) return;
        e.preventDefault();
        clipboardRef.current = { status: plan.plannedStatus, startTimeCriterionId: plan.startTimeCriterionId };
        showToast("계획을 복사했습니다.");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        const clip = clipboardRef.current;
        if (!clip) return;
        if (isSameDay(selectedDate, referenceDate) === false && selectedDate.getTime() < referenceDate.getTime()) return;
        e.preventDefault();
        void pastePlan(selectedDate, clip);
      } else if (e.key === "Escape") {
        setSelectedDate(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plans, referenceDate]);

  function isPlannable(date: Date): boolean {
    return isSameDay(date, referenceDate) || date.getTime() > referenceDate.getTime();
  }

  function handleCellClick(date: Date, e: React.MouseEvent<HTMLDivElement>) {
    setSelectedDate(date);
    if (isPlannable(date)) {
      setPopover({ date, anchorRect: e.currentTarget.getBoundingClientRect() });
    } else {
      setPopover(null);
    }
  }

  const days: Date[] = Array.from({ length: daysInMonth }, (_, i) => new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), i + 1));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="이전 달"
            className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <ChevronLeftIcon size={16} aria-hidden="true" />
          </button>
          <span className="w-28 text-center text-sm font-semibold text-fg-default">
            {monthAnchor.getFullYear()}년 {monthAnchor.getMonth() + 1}월
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="다음 달"
            className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <ChevronRightIcon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className={`ml-1 h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            오늘
          </button>
        </div>

        <div className="flex h-8 rounded-md border border-border-default p-0.5 text-xs font-medium">
          {([
            ["actualOnly", "실제"],
            ["planOnly", "계획"],
            ["both", "계획 + 실제"],
          ] as [CalendarViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`rounded px-2.5 ${viewMode === mode ? "bg-primary-emphasis font-medium text-white" : "text-fg-muted hover:text-fg-default"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border-default bg-border-default">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="bg-canvas-subtle px-2 py-1.5 text-center text-xs font-medium text-fg-muted">
            {label}
          </div>
        ))}

        {Array.from({ length: leadingBlank }).map((_, i) => (
          <div key={`blank-lead-${i}`} className="min-h-[72px] bg-surface-default sm:min-h-[88px]" />
        ))}

        {days.map((date) => {
          const dateKey = toApiDateKey(date);
          const plan = planByDate.get(dateKey);
          const record = recordByDate.get(dateKey);
          const isToday = isSameDay(date, referenceDate);
          const isFuture = isFutureSeoulDate(date, referenceDate);
          const isSelected = selectedDate != null && isSameDay(selectedDate, date);

          const planLabel = plan ? PLAN_STATUS_LABEL[plan.plannedStatus] : null;
          const planColor = plan ? ATTENDANCE_PRESENTATION[PLAN_STATUS_LABEL[plan.plannedStatus]].strong : undefined;

          let actualLabel: DonutCategory | null = null;
          let actualColor: string | undefined;
          if (record) {
            actualLabel = record.status;
            actualColor = ATTENDANCE_PRESENTATION[record.status].strong;
          } else if (!isFuture && !isToday) {
            actualLabel = "미입력";
            actualColor = ATTENDANCE_PRESENTATION.미입력.strong;
          }

          return (
            <div
              key={dateKey}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onClick={(e) => handleCellClick(date, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleCellClick(date, e as unknown as React.MouseEvent<HTMLDivElement>);
                }
              }}
              className={`flex min-h-[72px] cursor-pointer flex-col bg-surface-default px-2 py-1.5 text-xs outline-none sm:min-h-[88px] ${FOCUS_VISIBLE} ${
                isSelected ? "bg-primary-subtle" : "hover:bg-canvas-subtle"
              }`}
            >
              <span className={`mb-1 text-[11px] tabular-nums ${isToday ? "font-semibold text-primary-fg" : "text-fg-muted"}`}>
                {date.getDate()}
              </span>

              {viewMode !== "actualOnly" && (
                <div className={viewMode === "both" ? "min-h-[16px] border-b border-border-default pb-1" : "min-h-[16px]"}>
                  {planLabel && (
                    <span className="font-medium" style={{ color: planColor }}>
                      {planLabel}
                    </span>
                  )}
                </div>
              )}

              {viewMode !== "planOnly" && (
                <div className="flex min-h-[16px] flex-col gap-0.5 pt-1">
                  {actualLabel && (
                    <span className="font-medium" style={{ color: actualColor }}>
                      {actualLabel}
                    </span>
                  )}
                  {record && isWorkdayStatus(record.status) && (
                    <span className="tabular-nums text-fg-muted">실근무 {formatHoursMinutes(getNetWorkMinutes(record))}</span>
                  )}
                  {date.getDay() === 0 && (
                    <span className="tabular-nums text-fg-muted">주간 {formatHoursMinutes(sundayWeekNetMinutes(date, recordByDate))}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {Array.from({ length: trailingBlank }).map((_, i) => (
          <div key={`blank-trail-${i}`} className="min-h-[72px] bg-surface-default sm:min-h-[88px]" />
        ))}
      </div>

      {popover && (
        <AttendancePlanPopover
          date={popover.date}
          existingPlan={planByDate.get(toApiDateKey(popover.date)) ?? null}
          criteria={criteria}
          categories={categories}
          plannedBlocks={plannedBlocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), popover.date))}
          anchorRect={popover.anchorRect}
          onClose={() => setPopover(null)}
          onSaved={(plan) => {
            onPlanSaved(plan);
            setPopover(null);
          }}
          onDeleted={(date) => {
            onPlanDeleted(date);
            setPopover(null);
          }}
          onBlockUpserted={onBlockUpserted}
          onBlockDeleted={onBlockDeleted}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-fg-default px-4 py-2 text-sm text-canvas-default shadow-md">
          {toast}
        </div>
      )}
    </div>
  );
}
