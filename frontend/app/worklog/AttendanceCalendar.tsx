"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { addDays, isSameDay, minutesFromMidnight, parseLocalDateTime, toDateKey, toLocalDateTimeString } from "@/lib/date";
import { isFutureSeoulDate } from "@/lib/seoulDate";
import { createPlannedBlock, deletePlannedBlock } from "@/lib/api/plannedBlocks";
import { deleteAttendancePlan, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import type { ActivityCategory, AttendancePlanDto, PlannableAttendanceStatus, PlannedTimeBlock } from "@/lib/api/types";
import { isWorkdayStatus } from "./attendance";
import { computeGridDates, dateRangeKeys, sundayWeekNetMinutes } from "./attendanceCalendarLogic";
import { ATTENDANCE_PRESENTATION, type DonutCategory } from "./attendancePresentation";
import { DateDetailDialog } from "./DateDetailDialog";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, formatHoursMinutes } from "./format";
import { combineDateAndMinutes, fromApiDateKey, toApiDateKey } from "./mapping";
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
  onOpenWorkRecordDetail: (date: Date) => void;
}

interface ClipboardBlockEntry {
  title: string;
  startMinutes: number;
  endMinutes: number;
  categoryId: string | null;
  memo: string | null;
}

interface ClipboardDaySnapshot {
  /** Days after the earliest copied date — preserved on paste so the whole
   *  selection's relative shape survives regardless of the paste target. */
  offsetDays: number;
  plan: { status: PlannableAttendanceStatus; startTimeCriterionId: string | null } | null;
  blocks: ClipboardBlockEntry[];
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// The single plan-vs-actual calendar (§11) — one physical calendar, three
// view modes, never separate plan/actual calendars. Combined cells show a
// fixed upper(plan)/divider/lower(actual) layout — the divider is a
// confirmed visual requirement even when one side is blank, since the
// spatial position is what communicates meaning (no repeated "계획"/"실제"
// labels inside every cell).
//
// Attendance follow-up refinement: leading/trailing cells are now real,
// selectable adjacent-month dates (§6) rather than anonymous blanks — this
// also happens to be what fixes the partial-week border artifact (§2),
// since every grid cell (42 of them, always a whole number of weeks) now
// renders through the exact same cell markup instead of a separate blank-div
// code path. Multi-selection (§5) is date-keyed, not grid-index-keyed, so a
// Shift-range anchored in a previously-viewed month still resolves correctly
// after navigating away.
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
  onOpenWorkRecordDetail,
}: AttendanceCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("actualOnly");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Date[] | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  const anchorDateRef = useRef<Date | null>(null);
  const clipboardRef = useRef<ClipboardDaySnapshot[] | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-vs-click disambiguation: a plain mousedown never mutates selection
  // immediately — only once the pointer visits a *different* cell (dragMoved)
  // does it become a range-select; releasing without moving is a normal
  // single-cell click that opens the Date Detail Dialog.
  const [isMouseDown, setIsMouseDown] = useState(false);
  const mouseDownDateRef = useRef<Date | null>(null);
  const dragMovedRef = useRef(false);

  const gridDates = computeGridDates(monthAnchor);

  const planByDate = new Map(plans.map((p) => [p.planDate, p]));
  const recordByDate = new Map(records.map((r) => [toDateKey(r.date), r]));

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function isPlannable(date: Date): boolean {
    return isSameDay(date, referenceDate) || date.getTime() > referenceDate.getTime();
  }

  // --- Selection: click / shift-click / ctrl-click / drag (§5) ---

  function handleCellMouseDown(date: Date, e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      e.preventDefault();
      const anchor = anchorDateRef.current ?? date;
      setSelectedKeys(dateRangeKeys(anchor, date));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const key = toApiDateKey(date);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      anchorDateRef.current = date;
      return;
    }
    e.preventDefault();
    mouseDownDateRef.current = date;
    dragMovedRef.current = false;
    setIsMouseDown(true);
  }

  function handleCellMouseEnter(date: Date) {
    if (!isMouseDown || !mouseDownDateRef.current) return;
    dragMovedRef.current = true;
    setSelectedKeys(dateRangeKeys(mouseDownDateRef.current, date));
  }

  useEffect(() => {
    if (!isMouseDown) return;
    function handleUp() {
      const startDate = mouseDownDateRef.current;
      if (startDate && !dragMovedRef.current) {
        // Pure click, no drag: clear previous selection, select exactly this
        // date, open the Date Detail Dialog.
        setSelectedKeys(new Set([toApiDateKey(startDate)]));
        anchorDateRef.current = startDate;
        setDialogDate(startDate);
      } else if (startDate) {
        anchorDateRef.current = startDate;
      }
      setIsMouseDown(false);
      mouseDownDateRef.current = null;
      dragMovedRef.current = false;
    }
    document.addEventListener("mouseup", handleUp);
    return () => document.removeEventListener("mouseup", handleUp);
  }, [isMouseDown]);

  function handleCellKeyDown(date: Date, e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedKeys(new Set([toApiDateKey(date)]));
      anchorDateRef.current = date;
      setDialogDate(date);
    }
  }

  // --- Multi-date copy / paste / delete (§8/§9) ---

  function handleCopy() {
    if (selectedKeys.size === 0) return;
    const dates = [...selectedKeys].map(fromApiDateKey).sort((a, b) => a.getTime() - b.getTime());
    const earliest = dates[0];
    const snapshots: ClipboardDaySnapshot[] = dates
      .map((d) => {
        const offsetDays = Math.round((d.getTime() - earliest.getTime()) / 86400000);
        const plan = planByDate.get(toApiDateKey(d));
        const blocksForDate = plannedBlocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), d));
        return {
          offsetDays,
          plan: plan ? { status: plan.plannedStatus, startTimeCriterionId: plan.startTimeCriterionId } : null,
          blocks: blocksForDate.map((b) => ({
            title: b.title,
            startMinutes: minutesFromMidnight(parseLocalDateTime(b.startAt)),
            endMinutes: minutesFromMidnight(parseLocalDateTime(b.endAt)),
            categoryId: b.categoryId,
            memo: b.memo,
          })),
        };
      })
      .filter((s) => s.plan != null || s.blocks.length > 0);

    if (snapshots.length === 0) {
      showToast("복사할 계획이 없습니다.");
      return;
    }
    clipboardRef.current = snapshots;
    showToast(`${dates.length}일의 계획을 복사했습니다.`);
  }

  async function handlePaste() {
    const snapshots = clipboardRef.current;
    if (!snapshots || snapshots.length === 0) return;
    const target = anchorDateRef.current;
    if (!target) return;

    let successCount = 0;
    let skippedPast = 0;
    let failedCount = 0;

    await Promise.allSettled(
      snapshots.map(async (snap) => {
        const targetDate = addDays(target, snap.offsetDays);
        if (!isPlannable(targetDate)) {
          skippedPast++;
          return;
        }
        try {
          if (snap.plan) {
            const saved = await upsertAttendancePlan(toApiDateKey(targetDate), {
              plannedStatus: snap.plan.status,
              startTimeCriterionId: snap.plan.startTimeCriterionId,
            });
            onPlanSaved(saved);
          }
          for (const block of snap.blocks) {
            const created = await createPlannedBlock({
              title: block.title,
              startAt: toLocalDateTimeString(combineDateAndMinutes(targetDate, block.startMinutes)),
              endAt: toLocalDateTimeString(combineDateAndMinutes(targetDate, block.endMinutes)),
              categoryId: block.categoryId,
              memo: block.memo,
            });
            onBlockUpserted(created);
          }
          successCount++;
        } catch {
          failedCount++;
        }
      }),
    );

    if (failedCount > 0) {
      showToast(`붙여넣기 완료 ${successCount}일 · 실패 ${failedCount}일`);
    } else if (skippedPast > 0 && successCount > 0) {
      showToast(`${successCount}일에 붙여넣었습니다. (과거 날짜 ${skippedPast}일 제외)`);
    } else if (successCount > 0) {
      showToast(`${successCount}일에 계획을 붙여넣었습니다.`);
    } else {
      showToast("붙여넣을 수 있는 날짜가 없습니다.");
    }
  }

  async function handleConfirmMultiDelete() {
    if (!pendingDelete) return;
    setDeletingBatch(true);
    let successCount = 0;
    let failedCount = 0;

    await Promise.allSettled(
      pendingDelete.map(async (date) => {
        const dateKey = toApiDateKey(date);
        const plan = planByDate.get(dateKey);
        const blocksForDate = plannedBlocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), date));
        try {
          if (plan) {
            await deleteAttendancePlan(dateKey);
            onPlanDeleted(date);
          }
          for (const block of blocksForDate) {
            await deletePlannedBlock(block.id);
            onBlockDeleted(block.id);
          }
          successCount++;
        } catch {
          failedCount++;
        }
      }),
    );

    setDeletingBatch(false);
    setPendingDelete(null);
    setSelectedKeys(new Set());
    if (failedCount > 0) {
      showToast(`삭제 완료 ${successCount}일 · 실패 ${failedCount}일`);
    } else {
      showToast(`${successCount}일의 출결 계획을 삭제했습니다.`);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (EDITABLE_TAGS.has(target.tagName) || target.isContentEditable)) return;
      if (selectedKeys.size === 0) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void handlePaste();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const eligible = [...selectedKeys].map(fromApiDateKey).filter(isPlannable);
        if (eligible.length === 0) return;
        e.preventDefault();
        setPendingDelete(eligible);
      } else if (e.key === "Escape") {
        setSelectedKeys(new Set());
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, plans, plannedBlocks, referenceDate]);

  function closeDialog() {
    setDialogDate(null);
  }

  function handleOpenWorkRecordDetail(date: Date) {
    // §10: never a nested modal chain — close this dialog before handing off
    // to the page-level WorkLogRecordDetailModal.
    setDialogDate(null);
    onOpenWorkRecordDetail(date);
  }

  const monthLabel = `${monthAnchor.getFullYear()}년 ${monthAnchor.getMonth() + 1}월`;

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
          <span className="w-28 text-center text-sm font-semibold text-fg-default">{monthLabel}</span>
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

      <div className={`grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border-default bg-border-default ${isMouseDown ? "select-none" : ""}`}>
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="bg-canvas-subtle px-2 py-1.5 text-center text-xs font-medium text-fg-muted">
            {label}
          </div>
        ))}

        {gridDates.map((date) => {
          const dateKey = toApiDateKey(date);
          const plan = planByDate.get(dateKey);
          const record = recordByDate.get(dateKey);
          const isToday = isSameDay(date, referenceDate);
          const isFuture = isFutureSeoulDate(date, referenceDate);
          const isCurrentMonth = date.getMonth() === monthAnchor.getMonth() && date.getFullYear() === monthAnchor.getFullYear();
          const isSelected = selectedKeys.has(dateKey);

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
              aria-label={`${dateKey}${isSelected ? " 선택됨" : ""}`}
              onMouseDown={(e) => handleCellMouseDown(date, e)}
              onMouseEnter={() => handleCellMouseEnter(date)}
              onKeyDown={(e) => handleCellKeyDown(date, e)}
              className={`flex min-h-[72px] cursor-pointer flex-col border-2 px-2 py-1.5 text-xs outline-none sm:min-h-[88px] ${FOCUS_VISIBLE} ${
                isSelected
                  ? "border-primary-emphasis bg-primary-subtle"
                  : `border-transparent ${isCurrentMonth ? "bg-surface-default hover:bg-canvas-subtle" : "bg-canvas-subtle/40 hover:bg-canvas-subtle"}`
              }`}
            >
              <span
                className={`mb-1 text-[11px] tabular-nums ${
                  isToday ? "font-semibold text-primary-fg" : isCurrentMonth ? "text-fg-muted" : "text-fg-muted/60"
                }`}
              >
                {date.getMonth() + 1}/{date.getDate()}
              </span>

              {viewMode !== "actualOnly" && (
                <div className={viewMode === "both" ? "min-h-[16px] border-b border-border-default pb-1" : "min-h-[16px]"}>
                  {planLabel && (
                    <span className="font-medium" style={{ color: planColor, opacity: isCurrentMonth ? 1 : 0.65 }}>
                      {planLabel}
                    </span>
                  )}
                </div>
              )}

              {viewMode !== "planOnly" && (
                <div className="flex min-h-[16px] flex-col gap-0.5 pt-1">
                  {actualLabel && (
                    <span className="font-medium" style={{ color: actualColor, opacity: isCurrentMonth ? 1 : 0.65 }}>
                      {actualLabel}
                    </span>
                  )}
                  {record && isWorkdayStatus(record.status) && (
                    <span className={`tabular-nums ${isCurrentMonth ? "text-fg-muted" : "text-fg-muted/60"}`}>
                      실근무 {formatHoursMinutes(getNetWorkMinutes(record))}
                    </span>
                  )}
                  {date.getDay() === 0 && (
                    <span className={`tabular-nums ${isCurrentMonth ? "text-fg-muted" : "text-fg-muted/60"}`}>
                      주간 {formatHoursMinutes(sundayWeekNetMinutes(date, recordByDate))}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {dialogDate && (
        <DateDetailDialog
          date={dialogDate}
          referenceDate={referenceDate}
          record={recordByDate.get(toApiDateKey(dialogDate)) ?? null}
          existingPlan={planByDate.get(toApiDateKey(dialogDate)) ?? null}
          criteria={criteria}
          categories={categories}
          plannedBlocks={plannedBlocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), dialogDate))}
          onClose={closeDialog}
          onPlanSaved={onPlanSaved}
          onPlanDeleted={onPlanDeleted}
          onBlockUpserted={onBlockUpserted}
          onBlockDeleted={onBlockDeleted}
          onOpenWorkRecordDetail={handleOpenWorkRecordDetail}
        />
      )}

      {pendingDelete && (
        <WorkLogModal
          titleId="attendance-multi-delete-title"
          title="출결 계획 삭제"
          onClose={() => (deletingBatch ? undefined : setPendingDelete(null))}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingBatch}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmMultiDelete}
                disabled={deletingBatch}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                {deletingBatch ? "삭제 중…" : "삭제"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">선택한 {pendingDelete.length}일의 출결 계획을 삭제할까요?</p>
          <p className="mt-1 text-xs text-fg-muted">해당 날짜의 출결 계획과 계획 업무 블록이 삭제됩니다. 실제 근무 기록은 영향을 받지 않습니다.</p>
        </WorkLogModal>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-fg-default px-4 py-2 text-sm text-canvas-default shadow-md">
          {toast}
        </div>
      )}
    </div>
  );
}
