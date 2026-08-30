"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { addDays, isSameDay, parseLocalDateTime, toDateKey, toLocalDateTimeString } from "@/lib/date";
import { isFutureSeoulDate } from "@/lib/seoulDate";
import { createPlannedBlock, deletePlannedBlock } from "@/lib/api/plannedBlocks";
import { deleteAttendancePlan, replaceAttendancePlanning, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import type { ActivityCategory, AttendancePlanDto, AttendancePlanInput, PlannableAttendanceStatus, PlannedTimeBlock, PlannedTimeBlockInput } from "@/lib/api/types";
import { isWorkdayStatus, requiresCriterion } from "./attendance";
import { buildClipboardSnapshot, computeGridDates, dateRangeKeys, planBroadcastTargets, sundayWeekNetMinutes, type ClipboardDaySnapshot } from "./attendanceCalendarLogic";
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
  /** Item 4 (fast month/year picker): jumps the calendar directly to an
   *  arbitrary month, using the exact same state-transition path as
   *  onPrevMonth/onNextMonth/onToday (all three already funnel through the
   *  page's own goToMonth). Never mutates plan/actual data. */
  onGoToMonth: (date: Date) => void;
  onPlanSaved: (plan: AttendancePlanDto) => void;
  onPlanDeleted: (date: Date) => void;
  onBlockUpserted: (block: PlannedTimeBlock) => void;
  onBlockDeleted: (id: string) => void;
  /** P1 fix (authoritative block reconciliation): after a successful atomic
   *  broadcast replace, `blocks` is the COMPLETE authoritative
   *  PlannedTimeBlock set for `date` — the parent must replace its local
   *  collection for that date with exactly this list (remove every existing
   *  block for that date, then append these), never upsert them individually
   *  (which only adds/updates by ID and can never remove a stale block the
   *  backend's replace already deleted). Other dates' blocks are untouched. */
  onBlocksReplacedForDate: (date: Date, blocks: PlannedTimeBlock[]) => void;
  onOpenWorkRecordDetail: (date: Date) => void;
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
  onGoToMonth,
  onPlanSaved,
  onPlanDeleted,
  onBlockUpserted,
  onBlockDeleted,
  onBlocksReplacedForDate,
  onOpenWorkRecordDetail,
}: AttendanceCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("actualOnly");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // §14: distinguishes "N selected, N deletable" from "N selected, only M
  // deletable" so the confirmation copy is never ambiguous about which
  // dates (or whether WorkRecord) are actually affected.
  const [pendingDelete, setPendingDelete] = useState<{ totalSelected: number; eligibleDates: Date[] } | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);
  // Item 4: fast month/year picker, a compact popover anchored to the month
  // label — pickerYear is browsed independently of monthAnchor until a
  // month is actually chosen, so paging through years doesn't navigate the
  // calendar behind it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(monthAnchor.getFullYear());
  // Item 5/6: broadcast paste (one copied source date -> many selected
  // target dates) and its overwrite-conflict confirmation.
  const [pendingBroadcast, setPendingBroadcast] = useState<{
    snapshot: ClipboardDaySnapshot;
    targets: Date[];
    totalSelected: number;
    conflictCount: number;
    skippedPast: number;
  } | null>(null);
  const [broadcastPasting, setBroadcastPasting] = useState(false);

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

  // §15: navigating to a different rendered month resets the active
  // selection and range anchor — visible adjacent-month dates within the
  // CURRENT grid remain real Shift/drag targets (unchanged), but a Shift
  // anchor left over from a month the user has since navigated away from
  // must never silently extend into a huge cross-month range on the next
  // click. The plan CLIPBOARD (clipboardRef) is deliberately untouched here
  // — §16 requires it to survive month navigation for the intended
  // copy-in-one-month/paste-in-another workflow. State reset happens
  // directly during render (React's own documented pattern for "reset state
  // when a prop changes", guarded so it only ever runs on the render where
  // the month actually changed); the ref resets are a separate effect,
  // since refs must never be read or written during render itself.
  const monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;
  const [prevMonthKey, setPrevMonthKey] = useState(monthKey);
  if (monthKey !== prevMonthKey) {
    setPrevMonthKey(monthKey);
    setSelectedKeys(new Set());
    setIsMouseDown(false);
  }

  useEffect(() => {
    anchorDateRef.current = null;
    mouseDownDateRef.current = null;
    dragMovedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthAnchor.getFullYear(), monthAnchor.getMonth()]);

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
        return buildClipboardSnapshot(d, offsetDays, planByDate.get(toApiDateKey(d)), plannedBlocks);
      })
      .filter((s) => s.plan != null || s.blocks.length > 0);

    if (snapshots.length === 0) {
      showToast("복사할 계획이 없습니다.");
      return;
    }
    clipboardRef.current = snapshots;
    showToast(`${dates.length}일의 계획을 복사했습니다.`);
  }

  // Used by the existing offset-based paste only (never adds a destructive
  // delete-existing-blocks step — that path only ever pastes onto dates the
  // user picked as a fresh target, never as an overwrite-confirmed replace).
  // Broadcast overwrite (item 6 / P1-C) no longer builds its target state
  // through a sequence of independent requests here — see
  // executeBroadcastPaste, which calls the atomic backend replace endpoint
  // instead so a mid-sequence failure can never leave a target half-replaced.
  async function applySnapshotTo(targetDate: Date, snap: ClipboardDaySnapshot) {
    if (snap.plan) {
      const saved = await upsertAttendancePlan(toApiDateKey(targetDate), {
        plannedStatus: snap.plan.status,
        startTimeCriterionId: snap.plan.startTimeCriterionId,
        plannedNetWorkMinutes: snap.plan.plannedNetWorkMinutes,
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
  }

  // Item 6: before a broadcast paste overwrites anything, check whether any
  // eligible target already has its own AttendancePlan — if so, confirm
  // first rather than silently overwriting (never merging, never touched
  // silently). No conflicts -> proceed immediately, no unnecessary dialog.
  // P1-A fix: a target with PlannedTimeBlocks but no AttendancePlan already
  // contains planning data and must count as a conflict too — checking only
  // planByDate previously let a block-only target's blocks be silently
  // deleted and replaced with zero confirmation.
  function hasExistingPlanningData(d: Date): boolean {
    return planByDate.has(toApiDateKey(d)) || plannedBlocks.some((b) => isSameDay(parseLocalDateTime(b.startAt), d));
  }

  function detectBroadcastConflictsAndRun(snapshot: ClipboardDaySnapshot, allTargets: Date[]) {
    const { eligible, skippedPast, conflictCount } = planBroadcastTargets(allTargets, isPlannable, hasExistingPlanningData);
    if (eligible.length === 0) {
      showToast("붙여넣을 수 있는 날짜가 없습니다.");
      return;
    }
    if (conflictCount > 0) {
      setPendingBroadcast({ snapshot, targets: eligible, totalSelected: allTargets.length, conflictCount, skippedPast });
      return;
    }
    void executeBroadcastPaste(snapshot, eligible, skippedPast);
  }

  // P1-C fix: broadcast overwrite now maps one target date to exactly one
  // atomic backend call (PUT .../replace) instead of a delete-blocks /
  // upsert-plan / create-blocks sequence of independent requests — a
  // mid-sequence failure previously could leave a target with its old
  // blocks gone, a partially-saved plan, and only some replacement blocks
  // created. Each target's replace either fully succeeds or fully rolls
  // back server-side; Promise.allSettled here only governs how the several
  // INDEPENDENT targets run concurrently, never a single target's own
  // atomicity. Every UI update below comes directly from that target's own
  // successful response body — a failed target's local plan/block state was
  // never touched to begin with, so it already matches the (rolled-back)
  // server truth with no separate reconciliation fetch required.
  async function executeBroadcastPaste(snapshot: ClipboardDaySnapshot, targets: Date[], skippedPast: number) {
    setBroadcastPasting(true);
    let successCount = 0;
    let failedCount = 0;

    const planInput: AttendancePlanInput | null = snapshot.plan
      ? { plannedStatus: snapshot.plan.status, startTimeCriterionId: snapshot.plan.startTimeCriterionId, plannedNetWorkMinutes: snapshot.plan.plannedNetWorkMinutes }
      : null;

    await Promise.allSettled(
      targets.map(async (targetDate) => {
        const blocks: PlannedTimeBlockInput[] = snapshot.blocks.map((block) => ({
          title: block.title,
          startAt: toLocalDateTimeString(combineDateAndMinutes(targetDate, block.startMinutes)),
          endAt: toLocalDateTimeString(combineDateAndMinutes(targetDate, block.endMinutes)),
          categoryId: block.categoryId,
          memo: block.memo,
        }));
        try {
          const result = await replaceAttendancePlanning(toApiDateKey(targetDate), { plan: planInput, blocks });
          if (result.plan) onPlanSaved(result.plan);
          // P1 fix: result.blocks is the COMPLETE authoritative set for this
          // date — reconcile (remove-then-append), never upsert one by one,
          // or a stale block the backend's replace already deleted would
          // linger in local state until the next full reload.
          onBlocksReplacedForDate(targetDate, result.blocks);
          successCount++;
        } catch {
          failedCount++;
        }
      }),
    );

    setBroadcastPasting(false);
    setPendingBroadcast(null);
    if (failedCount > 0) {
      showToast(`붙여넣기 완료 ${successCount}일 · 실패 ${failedCount}일 (실패한 날짜는 변경되지 않았습니다)`);
    } else if (skippedPast > 0) {
      showToast(`${successCount}일에 붙여넣었습니다. (과거 날짜 ${skippedPast}일 제외)`);
    } else {
      showToast(`${successCount}일에 계획을 붙여넣었습니다.`);
    }
  }

  async function handlePaste() {
    const snapshots = clipboardRef.current;
    if (!snapshots || snapshots.length === 0) return;

    // Item 5: exactly one copied source date + multiple currently-selected
    // target dates -> broadcast the same plan to every selected date,
    // independent of each other. A multi-day source (snapshots.length > 1)
    // always keeps the pre-existing offset-from-anchor behavior unchanged,
    // regardless of how many dates happen to be selected.
    if (snapshots.length === 1 && selectedKeys.size >= 2) {
      const allTargets = [...selectedKeys].map(fromApiDateKey);
      detectBroadcastConflictsAndRun(snapshots[0], allTargets);
      return;
    }

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
          await applySnapshotTo(targetDate, snap);
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
      pendingDelete.eligibleDates.map(async (date) => {
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
        e.preventDefault();
        const allSelected = [...selectedKeys].map(fromApiDateKey);
        const eligible = allSelected.filter(isPlannable);
        if (eligible.length === 0) {
          // §14 Case C: only past/historical dates selected — never a
          // destructive confirmation for a delete that would do nothing.
          showToast("과거 계획 및 실제 근무 기록은 삭제할 수 없습니다.");
          return;
        }
        setPendingDelete({ totalSelected: allSelected.length, eligibleDates: eligible });
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

  // §17: a successful plan-related SAVE (never a delete, never a mere
  // open/close, never a failed save — those paths simply never call this)
  // reveals the result by switching out of 실제 into 계획, but only when the
  // user was actually in 실제 to begin with — 계획/계획+실제 are left alone
  // since the user can already see plan data there.
  function revealPlanViewAfterSave() {
    setViewMode((prev) => (prev === "actualOnly" ? "planOnly" : prev));
  }

  // Item 1 (save-based modals close on success), refined by P1-B: whether
  // the dialog itself actually closes after a successful 계획 저장 is now
  // decided inside DateDetailDialog (it alone knows whether the block
  // editor has an unsaved draft that closing would silently discard) — this
  // callback only updates shared calendar state, same as every other plan
  // mutation path.
  function handleDialogPlanSaved(plan: AttendancePlanDto) {
    onPlanSaved(plan);
    revealPlanViewAfterSave();
  }

  function handleDialogBlockUpserted(block: PlannedTimeBlock) {
    onBlockUpserted(block);
    revealPlanViewAfterSave();
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
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setPickerYear(monthAnchor.getFullYear());
                setPickerOpen((prev) => !prev);
              }}
              aria-expanded={pickerOpen}
              className={`w-28 rounded-md px-1 text-center text-sm font-semibold text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              {monthLabel} ▾
            </button>
            {pickerOpen && (
              <>
                {/* Item 4: minimal click-outside affordance — an invisible
                    full-viewport button behind the popover, avoiding a full
                    modal/overlay just to close a small picker. */}
                <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border-default bg-surface-default p-2 shadow-overlay">
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y - 1)}
                      aria-label="이전 연도"
                      className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                    >
                      <ChevronLeftIcon size={14} aria-hidden="true" />
                    </button>
                    <span className="text-sm font-semibold text-fg-default">{pickerYear}년</span>
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y + 1)}
                      aria-label="다음 연도"
                      className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                    >
                      <ChevronRightIcon size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i).map((monthIndex) => {
                      const isDisplayed = pickerYear === monthAnchor.getFullYear() && monthIndex === monthAnchor.getMonth();
                      return (
                        <button
                          key={monthIndex}
                          type="button"
                          onClick={() => {
                            onGoToMonth(new Date(pickerYear, monthIndex, 1));
                            setPickerOpen(false);
                          }}
                          aria-pressed={isDisplayed}
                          className={`h-8 rounded-md text-xs font-medium ${FOCUS_VISIBLE} ${
                            isDisplayed ? "bg-primary-emphasis text-white" : "text-fg-default hover:bg-canvas-subtle"
                          }`}
                        >
                          {monthIndex + 1}월
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
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

      {/* Item 3 (week-row separator fix): every internal grid line is drawn by
          exactly one owning cell's own border-r/border-b, with the container
          closing the box via border-l/border-t — a continuous line across
          all 7 columns by construction, regardless of row height or content.
          The previous approach (a 1px gap showing the container's
          background through) broke down wherever an adjacent cell's own
          border-2 (used for the selected-state color) was non-transparent,
          since a thick colored border on both sides of a 1px gap visually
          swallows it. Selection is now a ring-inset overlay instead, which
          never touches border-color and so never threatens this line. */}
      <div className={`grid grid-cols-7 overflow-hidden rounded-md border-l border-t border-border-default ${isMouseDown ? "select-none" : ""}`}>
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="border-r border-b border-border-default bg-canvas-subtle px-2 py-1.5 text-center text-xs font-medium text-fg-muted">
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
              className={`flex min-h-[72px] cursor-pointer flex-col border-r border-b border-border-default px-2 py-1.5 text-xs outline-none sm:min-h-[88px] ${FOCUS_VISIBLE} ${
                isSelected
                  ? "ring-2 ring-inset ring-primary-emphasis bg-primary-subtle"
                  : isCurrentMonth
                    ? "bg-surface-default hover:bg-canvas-subtle"
                    : "bg-canvas-subtle/20 hover:bg-canvas-subtle"
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
                <div className={viewMode === "both" ? "flex flex-col gap-0.5 border-b border-border-default pb-1 min-h-[16px]" : "flex flex-col gap-0.5 min-h-[16px]"}>
                  {planLabel && (
                    <span className="font-medium" style={{ color: planColor, opacity: isCurrentMonth ? 1 : 0.65 }}>
                      {planLabel}
                    </span>
                  )}
                  {plan?.plannedNetWorkMinutes != null && requiresCriterion(plan.plannedStatus) && (
                    <span className={`tabular-nums ${isCurrentMonth ? "text-fg-muted" : "text-fg-muted/60"}`}>
                      계획 실근무 {formatHoursMinutes(plan.plannedNetWorkMinutes)}
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
          onPlanSaved={handleDialogPlanSaved}
          onPlanDeleted={onPlanDeleted}
          onBlockUpserted={handleDialogBlockUpserted}
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
                {deletingBatch ? "삭제 중…" : `계획 ${pendingDelete.eligibleDates.length}일 삭제`}
              </button>
            </div>
          }
        >
          {pendingDelete.eligibleDates.length === pendingDelete.totalSelected ? (
            <p className="text-sm text-fg-default">선택한 {pendingDelete.totalSelected}일의 출결 계획을 삭제할까요?</p>
          ) : (
            <>
              <p className="text-sm text-fg-default">
                선택한 {pendingDelete.totalSelected}일 중 삭제 가능한 계획 {pendingDelete.eligibleDates.length}일만 삭제됩니다.
              </p>
              <p className="mt-1 text-xs text-fg-muted">과거 계획과 실제 근무 기록은 삭제되지 않습니다.</p>
            </>
          )}
        </WorkLogModal>
      )}

      {pendingBroadcast && (
        <WorkLogModal
          titleId="attendance-broadcast-paste-title"
          title="기존 계획 덮어쓰기"
          onClose={() => (broadcastPasting ? undefined : setPendingBroadcast(null))}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingBroadcast(null)}
                disabled={broadcastPasting}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void executeBroadcastPaste(pendingBroadcast.snapshot, pendingBroadcast.targets, pendingBroadcast.skippedPast)}
                disabled={broadcastPasting}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                {broadcastPasting ? "붙여넣는 중…" : "덮어쓰기"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">
            선택한 {pendingBroadcast.totalSelected}일 중 {pendingBroadcast.conflictCount}일에 기존 계획이 있습니다. 덮어쓸까요?
          </p>
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
