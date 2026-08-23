"use client";

import { useRef, useState } from "react";
import { addDays, isSameDay, startOfWeek } from "@/lib/date";
import { WorkLogToolbar, type PeriodUnit } from "./WorkLogToolbar";
import { WorkLogTable } from "./WorkLogTable";
import { MonthlyWorkLogView } from "./MonthlyWorkLogView";
import { WorkLogTrendSection } from "./WorkLogTrendSection";
import { WorkLogRecordDetailModal } from "./WorkLogRecordDetailModal";
import { WorkLogModal } from "./WorkLogModal";
import { WorkTimeEntryModal } from "./WorkTimeEntryModal";
import { StartTimeCriteriaModal } from "./StartTimeCriteriaModal";
import { WeeklySummary } from "./WeeklySummary";
import { MonthlyAttendanceDonut } from "./MonthlyAttendanceDonut";
import { TodayWorkPanel } from "./TodayWorkPanel";
import { TodaySummary, type TodayDraft } from "./TodaySummary";
import { buildTrendHistoryWeekRecords, getMonthRecords, getWeekRecords, TREND_HISTORY_TARGETS, type AttendanceStatus, type WorkLogRecord } from "./mockData";
import { computeStayMinutes, findRecordForDate, getEffectiveLateness, getNetWorkMinutes, getOnTimeOverrideEligibility } from "./selectors";
import { isWorkdayStatus } from "./attendance";
import { FOCUS_VISIBLE } from "./format";
import type { WorkTimeEntry } from "./workTimeEntry";
import { cloneStartTimeCriteria, START_TIME_CRITERIA, type AppliedStartTime, type StartTimeCriterion } from "./startTimeCriterion";

// Local calendar-month arithmetic (no date library, no UTC conversion —
// matches the style already used throughout lib/date.ts and mockData.ts).
// Kept page-local rather than added to the shared lib/date.ts since nothing
// else needs them yet (v2 Phase 5 scope §5).
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// Default anchor matches the approved reference image's week
// (docs/frontend/work-log/work-log-ui-final.png, 2026.08.10–2026.08.16) so
// this page can be visually compared against it directly. "오늘" still
// navigates to the real current week.
const MOCK_ANCHOR_DATE = new Date(2026, 7, 10);

// Rolling window size for the 근무 추이 trend section — current week plus
// this many immediately preceding weeks (spec: "최근 12주", a rolling
// window, not an exact calendar quarter).
const RECENT_TREND_WEEK_COUNT = 12;

// Single discriminated modal state (v2 Phase 3 §6, simplified in the v4
// unified-record-modal policy correction): structurally prevents two
// overlays ever being open at once. `recordDetail` no longer carries a
// view/edit `mode` — it always opens as one editable form now (see
// WorkLogRecordDetailModal) — and `workTimeEntry` no longer needs a
// `returnTo`, since it's exclusively Today Summary's standalone entry point
// now; the record-edit modal embeds its own copy of the editor instead of
// ever opening this as a second modal.
type WorkLogModalState =
  | { type: "none" }
  | { type: "recordDetail"; recordId: string }
  | { type: "workTimeEntry"; recordId: string }
  | { type: "startTimeCriteria" }
  // v5 clock-in cancellation unit — both are always Today's own record, so
  // neither needs to carry a recordId (unlike the three above).
  | { type: "clockInCancelConfirm" }
  | { type: "clockInCancelBlocked" };

function toClockString(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// Fetches whatever mock week actually contains `referenceDate` and picks
// today's record out of it via the Phase 1 local-date selector — this is
// the "existing mock retrieval boundary and local-date selector" the v2
// Phase 2 spec asks Today's initial state to go through.
function getInitialTodayRecord(referenceDate: Date): WorkLogRecord {
  const weekRecords = getWeekRecords(startOfWeek(referenceDate));
  return findRecordForDate(weekRecords, referenceDate) ?? weekRecords[0];
}

export default function WorkLogPage() {
  const [now] = useState<Date>(() => new Date());
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("week");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(MOCK_ANCHOR_DATE));
  const [records, setRecords] = useState<WorkLogRecord[]>(() => getWeekRecords(startOfWeek(MOCK_ANCHOR_DATE)));
  const [modalState, setModalState] = useState<WorkLogModalState>({ type: "none" });

  // Reusable start-time criteria list (criteria-management unit): in-memory
  // only, deliberately independent of any WorkLogRecord — records still only
  // ever carry their own frozen appliedStartTime snapshot (see selectors.ts's
  // getLateness), so editing this list can never retroactively change a
  // record's displayed lateness. Cloned once at init so mutating this state
  // never reaches the shared START_TIME_CRITERIA seed constant.
  const [startTimeCriteria, setStartTimeCriteria] = useState<StartTimeCriterion[]>(() =>
    cloneStartTimeCriteria(START_TIME_CRITERIA),
  );

  // Navigable monthly-table state (v2 Phase 5) — deliberately separate from
  // `monthRecords` below, which stays permanently pinned to the real
  // current month for the overview donut regardless of navigation here.
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(MOCK_ANCHOR_DATE));
  const [monthlyTableRecords, setMonthlyTableRecords] = useState<WorkLogRecord[]>(() => getMonthRecords(MOCK_ANCHOR_DATE));

  // Today's record is intentionally independent of `records` (the
  // currently-displayed week) so it stays visible while browsing other
  // weeks. `updateRecordForDate` below is the single path that keeps the
  // two in sync whenever they happen to refer to the same calendar date.
  const [todayRecord, setTodayRecord] = useState<WorkLogRecord>(() => getInitialTodayRecord(now));
  const [todayDraft, setTodayDraft] = useState<TodayDraft>(() => ({
    score: todayRecord.score,
    memo: todayRecord.memo,
  }));

  // Monthly donut data: always the calendar month containing `now`,
  // regardless of which week/month is selected below (spec §3) — this is
  // intentionally a separate dataset from `monthlyTableRecords` above and
  // must never be affected by navigating the monthly grouped table.
  const [monthRecords] = useState<WorkLogRecord[]>(() => getMonthRecords(now));

  // Fixed recent-12-week dataset for the always-visible 근무 추이 trend
  // section (rolling window, not a calendar quarter) — the Today-containing
  // Monday–Sunday week plus the eleven immediately preceding weeks, anchored
  // to the same `now` Today anchor used everywhere else on this page. Built
  // oldest-first/current-last via a single relative-week loop (generalizes
  // the previous 4-week literal array) so `getWeeklyTrendPoints`'
  // ascending-by-weekStart sort naturally lands current week last. Computed
  // once at mount and never regenerated by week/month navigation, Today
  // navigation, or Week↔Month switching — only `updateRecordForDate` ever
  // touches it, and only when an edited date happens to fall inside it.
  // `getWeekRecords` already builds valid records for any historical Monday
  // (buildRecordForDate has no year/month bound), so no mockData.ts change
  // was needed for the wider range.
  // v6 visual-polish unit: every week except the current (last) one is
  // built from TREND_HISTORY_TARGETS instead of the daily template, so the
  // chart curves actually rise and fall — see mockData.ts's
  // buildTrendHistoryWeekRecords. The current week still comes from the
  // real displayed data (getWeekRecords) for consistency with the rest of
  // the page.
  const [recentTrendRecords, setRecentTrendRecords] = useState<WorkLogRecord[]>(() => {
    const todayWeekStart = startOfWeek(now);
    const weekStarts = Array.from({ length: RECENT_TREND_WEEK_COUNT }, (_, i) =>
      addDays(todayWeekStart, -7 * (RECENT_TREND_WEEK_COUNT - 1 - i)),
    );
    return weekStarts.flatMap((start, index) =>
      index < TREND_HISTORY_TARGETS.length ? buildTrendHistoryWeekRecords(start, TREND_HISTORY_TARGETS[index]) : getWeekRecords(start),
    );
  });

  const weekEnd = addDays(weekStart, 6);

  // Resolves a record by id from `todayRecord`, the displayed week, or the
  // navigable monthly table — needed because a record opened from any one
  // of these views may not be present in the other two (see the
  // `updateRecordForDate` comment below).
  function findAnyRecordById(id: string): WorkLogRecord | null {
    if (todayRecord.id === id) return todayRecord;
    return records.find((r) => r.id === id) ?? monthlyTableRecords.find((r) => r.id === id) ?? null;
  }

  const recordDetailRecord = modalState.type === "recordDetail" ? findAnyRecordById(modalState.recordId) : null;
  const workTimeEntryRecord = modalState.type === "workTimeEntry" ? findAnyRecordById(modalState.recordId) : null;

  // Single date-based update helper (v2 Phase 2 requirement, extended in
  // Phase 5 and the trend-chart correction): every mutation that targets a
  // specific calendar date — clock buttons, Today's status dropdown,
  // Today's save, the record-detail modal's save, and work-time-entry saves
  // — funnels through this one function, so `todayRecord`, the weekly
  // `records`, the monthly `monthlyTableRecords`, and the trend section's
  // `recentTrendRecords` never visibly disagree when they overlap on the
  // same date. Still exactly one update path — no separate per-dataset
  // update logic, and a date outside a given dataset simply produces a
  // no-op `.map()` for that one (unrelated data stays untouched).
  function findExistingRecordForDate(date: Date): WorkLogRecord | null {
    if (isSameDay(todayRecord.date, date)) return todayRecord;
    return (
      records.find((r) => isSameDay(r.date, date)) ??
      monthlyTableRecords.find((r) => isSameDay(r.date, date)) ??
      recentTrendRecords.find((r) => isSameDay(r.date, date)) ??
      null
    );
  }

  function updateRecordForDate(date: Date, patch: Partial<WorkLogRecord>) {
    // On-time-override invalidation (v3 MVP unit): any edit that could
    // change *why* a record was late — clock-in, the applied criterion, or
    // leaving working status — silently clears an already-active override,
    // so a stale "정시 출근" display can never survive a fact that no
    // longer supports it. Skipped whenever the caller already decided the
    // override value itself (e.g. the record-edit modal's own unified
    // draft, or the explicit toggle handlers below) — this only fills in
    // the rule for callers that don't think about the override at all,
    // like Today's plain clock-time edits.
    const existing = findExistingRecordForDate(date);
    let finalPatch = patch;
    if (existing?.isOnTimeOverride && !("isOnTimeOverride" in patch)) {
      const clockInChanging = "clockIn" in patch && patch.clockIn !== existing.clockIn;
      const appliedStartTimeChanging =
        "appliedStartTime" in patch && JSON.stringify(patch.appliedStartTime) !== JSON.stringify(existing.appliedStartTime);
      const goingNonWorking =
        "status" in patch && isWorkdayStatus(existing.status) && !isWorkdayStatus(patch.status as AttendanceStatus);
      if (clockInChanging || appliedStartTimeChanging || goingNonWorking) {
        finalPatch = { ...patch, isOnTimeOverride: false };
      }
    }

    if (isSameDay(todayRecord.date, date)) {
      setTodayRecord((prev) => ({ ...prev, ...finalPatch }));
    }
    setRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...finalPatch } : r)));
    setMonthlyTableRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...finalPatch } : r)));
    setRecentTrendRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...finalPatch } : r)));
  }

  function goToWeek(nextWeekStart: Date) {
    setWeekStart(nextWeekStart);
    // A fresh mock fetch would otherwise re-derive today's row from the
    // template and silently discard any edits already applied to
    // `todayRecord` — the same "don't visibly disagree" concern
    // `updateRecordForDate` exists for, just triggered by navigation
    // instead of a direct edit. `todayRecord` stays the one authoritative
    // value for its own date across both code paths.
    const fresh = getWeekRecords(nextWeekStart);
    setRecords(fresh.map((r) => (isSameDay(r.date, todayRecord.date) ? todayRecord : r)));
    // Navigating away safely closes any open detail modal (spec §6) rather
    // than leaving it pointing at a record that's no longer in `records`.
    setModalState({ type: "none" });
  }

  // Mirrors goToWeek's reconciliation pattern exactly, just for the monthly
  // table instead of the weekly one (v2 Phase 5).
  function goToMonth(nextMonthAnchor: Date) {
    setMonthAnchor(nextMonthAnchor);
    const fresh = getMonthRecords(nextMonthAnchor);
    setMonthlyTableRecords(fresh.map((r) => (isSameDay(r.date, todayRecord.date) ? todayRecord : r)));
    setModalState({ type: "none" });
  }

  function handlePeriodUnitChange(unit: PeriodUnit) {
    setPeriodUnit(unit);
    // Switching views can leave an open modal pointing at a record that
    // belongs to the view being left (spec §A) — close it defensively,
    // exactly like goToWeek/goToMonth already do on navigation.
    setModalState({ type: "none" });
  }

  function handlePrevPeriod() {
    if (periodUnit === "week") {
      goToWeek(addDays(weekStart, -7));
    } else {
      goToMonth(addMonths(monthAnchor, -1));
    }
  }

  function handleNextPeriod() {
    if (periodUnit === "week") {
      goToWeek(addDays(weekStart, 7));
    } else {
      goToMonth(addMonths(monthAnchor, 1));
    }
  }

  function handleTodayPeriod() {
    if (periodUnit === "week") {
      goToWeek(startOfWeek(new Date()));
    } else {
      goToMonth(startOfMonth(new Date()));
    }
  }

  // v4 policy correction: a weekly/monthly row now always opens straight
  // into the unified editable modal — there is no more read-only "view"
  // step to land on first.
  function openRecordDetail(recordId: string) {
    setModalState({ type: "recordDetail", recordId });
  }

  function closeModal() {
    setModalState({ type: "none" });
  }

  function openStartTimeCriteria() {
    setModalState({ type: "startTimeCriteria" });
  }

  function handleStartTimeCriteriaSave(next: StartTimeCriterion[]) {
    setStartTimeCriteria(next);
    setModalState({ type: "none" });
  }

  // The unified record-edit modal already validated and merged every field
  // (attendance, clock times, applied start time, the on-time override,
  // work score, work-time entries, memo) into one patch before calling
  // this — it also closes itself right after, so this only needs to commit
  // the patch through the single update funnel.
  function handleRecordModalSave(patch: Partial<WorkLogRecord>) {
    if (modalState.type !== "recordDetail") return;
    const target = findAnyRecordById(modalState.recordId);
    if (!target) return;
    updateRecordForDate(target.date, patch);
    // The modal writes score/memo straight to the record, bypassing Today
    // Summary's own local draft — without this, editing today's record
    // through the modal would leave todayDraft showing stale values.
    if (isSameDay(target.date, todayRecord.date)) {
      setTodayDraft((prev) => ({
        score: patch.score !== undefined ? patch.score : prev.score,
        memo: patch.memo !== undefined ? patch.memo : prev.memo,
      }));
    }
  }

  // Today Summary's 업무시간 기록 button — the one remaining entry point for
  // this standalone modal (v4: the record-edit modal embeds its own copy of
  // the editor instead of ever opening this as a second modal). Defensive
  // guard (attendance/work-time consistency rule): the button is already
  // natively disabled for non-working statuses, but a stale or programmatic
  // event must not be able to open the modal anyway — silently no-op.
  function openWorkTimeEntryFromToday() {
    if (!isWorkdayStatus(todayRecord.status)) return;
    setModalState({ type: "workTimeEntry", recordId: todayRecord.id });
  }

  function closeWorkTimeEntry() {
    setModalState({ type: "none" });
  }

  function handleWorkTimeEntrySave(entries: WorkTimeEntry[]) {
    if (modalState.type !== "workTimeEntry") return;
    const target = findAnyRecordById(modalState.recordId);
    if (!target) return;
    // Defensive guard: entries can never be saved onto a non-working
    // record, even if the modal was somehow already open when the status
    // changed elsewhere — reject silently and leave existing state as-is.
    if (!isWorkdayStatus(target.status)) return;
    // workTimeEntries is the only field this save path ever touches —
    // attendance/location/clock/lateness/score/memo are untouched (spec §7).
    updateRecordForDate(target.date, { workTimeEntries: entries });
    closeWorkTimeEntry();
  }

  function handleTodayStatusChange(status: AttendanceStatus) {
    updateRecordForDate(todayRecord.date, { status });
  }

  // Daily clock state machine + duplicate-click guard (v3 §6): `clockLockRef`
  // rejects a re-entrant call within the same synchronous invocation (the
  // structural guard a future async API call would also need), while the
  // eligibility checks below reject a click that arrives after the button
  // should already be disabled (e.g. a stale event). `clockActionPending`
  // additionally disables *both* buttons for the duration of the update —
  // instantaneous against this in-memory mock, but shaped so a later real
  // request can set/clear it around an actual network call unchanged.
  const clockLockRef = useRef(false);
  const [clockActionPending, setClockActionPending] = useState(false);

  function handleClockIn() {
    if (clockLockRef.current || !isWorkdayStatus(todayRecord.status) || todayRecord.clockIn) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    updateRecordForDate(todayRecord.date, { clockIn: toClockString(new Date()) });
    setClockActionPending(false);
    clockLockRef.current = false;
  }

  function handleClockOut() {
    if (clockLockRef.current || !isWorkdayStatus(todayRecord.status) || !todayRecord.clockIn || todayRecord.clockOut) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    const now = toClockString(new Date());
    updateRecordForDate(todayRecord.date, { clockOut: now, basicWorkMinutes: computeStayMinutes(todayRecord.clockIn, now) });
    setClockActionPending(false);
    clockLockRef.current = false;
  }

  // Clock-in cancellation (v5 §1–4): 출근 취소 opens a title-only
  // confirmation, *unless* today's record already has work-time entries, in
  // which case it opens a blocking notice instead and never reaches the
  // confirmation at all — entries are never silently discarded by this flow.
  function handleClockInCancelRequest() {
    if (clockLockRef.current) return;
    if (todayRecord.workTimeEntries.length > 0) {
      setModalState({ type: "clockInCancelBlocked" });
      return;
    }
    setModalState({ type: "clockInCancelConfirm" });
  }

  // Clears exactly what clock-in itself owns/derives — clockIn,
  // basicWorkMinutes (already null since cancellation is only offered
  // before clock-out), and the on-time override (spec: cancelling clock-in
  // is one of the explicit override-invalidation triggers). Attendance,
  // location, the selected applied criterion, score, memo, and work-time
  // entries are all untouched by the `{...prev, ...patch}` merge.
  function handleClockInCancelConfirm() {
    if (clockLockRef.current) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    updateRecordForDate(todayRecord.date, { clockIn: null, basicWorkMinutes: null, isOnTimeOverride: false });
    setClockActionPending(false);
    clockLockRef.current = false;
    setModalState({ type: "none" });
  }

  // Today's inline pencil-edit confirm handlers (v3 §5) — immediate update
  // through the same funnel, no separate save step. 체류 시간 is recomputed
  // from whichever pair results (spec §7: correctly crosses midnight).
  function handleTodayClockInEdit(value: string) {
    updateRecordForDate(todayRecord.date, { clockIn: value, basicWorkMinutes: computeStayMinutes(value, todayRecord.clockOut) });
  }

  function handleTodayClockOutEdit(value: string) {
    updateRecordForDate(todayRecord.date, { clockOut: value, basicWorkMinutes: computeStayMinutes(todayRecord.clockIn, value) });
  }

  function handleToggleTodayOnTimeOverride() {
    updateRecordForDate(todayRecord.date, { isOnTimeOverride: !todayRecord.isOnTimeOverride });
  }

  function handleTodayAppliedStartTimeChange(next: AppliedStartTime | null) {
    updateRecordForDate(todayRecord.date, { appliedStartTime: next });
  }

  function handleTodayDraftChange(patch: Partial<TodayDraft>) {
    setTodayDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleTodaySave() {
    updateRecordForDate(todayRecord.date, { score: todayDraft.score, memo: todayDraft.memo });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas-default">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-16 px-8 py-8">
        {/* 근무 현황 — monthly overview + Today, unchanged contents/behavior,
            only the section-level header/divider/spacing wrapper is new
            (UI-polishing unit: section hierarchy only). */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">근무 현황</h2>
            <p className="text-sm text-fg-muted">이번 달 출결과 오늘의 근무 상태를 확인합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <div className="grid grid-cols-[38%_1fr] items-start gap-6">
            <div>
              <MonthlyAttendanceDonut records={monthRecords} monthAnchor={now} referenceDate={now} />
            </div>
            <div className="flex flex-col gap-4">
              <TodayWorkPanel
                date={todayRecord.date}
                status={todayRecord.status}
                onStatusChange={handleTodayStatusChange}
                location={todayRecord.location}
                clockIn={todayRecord.clockIn}
                clockOut={todayRecord.clockOut}
                onClockIn={handleClockIn}
                onClockOut={handleClockOut}
                onClockInCancelRequest={handleClockInCancelRequest}
                onClockInEdit={handleTodayClockInEdit}
                onClockOutEdit={handleTodayClockOutEdit}
                clockActionPending={clockActionPending}
                appliedStartTime={todayRecord.appliedStartTime}
                onAppliedStartTimeChange={handleTodayAppliedStartTimeChange}
                criteria={startTimeCriteria}
              />
              <TodaySummary
                status={todayRecord.status}
                basicWorkMinutes={todayRecord.basicWorkMinutes}
                netWorkMinutes={getNetWorkMinutes(todayRecord)}
                lateness={getEffectiveLateness(todayRecord)}
                overrideEligibility={getOnTimeOverrideEligibility(todayRecord)}
                onToggleOnTimeOverride={handleToggleTodayOnTimeOverride}
                draft={todayDraft}
                onDraftChange={handleTodayDraftChange}
                onSave={handleTodaySave}
                onOpenWorkTimeEntry={openWorkTimeEntryFromToday}
              />
            </div>
          </div>
        </section>

        {/* 근무 기록 — toolbar + active week/month record view, unchanged
            contents/behavior/navigation, only the section wrapper is new. */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">근무 기록</h2>
            <p className="text-sm text-fg-muted">일별 출결과 근무 내역을 조회하고 관리합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <div className="flex flex-col gap-4">
            <WorkLogToolbar
              periodUnit={periodUnit}
              onPeriodUnitChange={handlePeriodUnitChange}
              rangeStart={periodUnit === "week" ? weekStart : monthAnchor}
              rangeEnd={periodUnit === "week" ? weekEnd : endOfMonth(monthAnchor)}
              onPrev={handlePrevPeriod}
              onNext={handleNextPeriod}
              onToday={handleTodayPeriod}
              onOpenStartTimeCriteria={openStartTimeCriteria}
            />

            {periodUnit === "week" ? (
              <WorkLogTable
                records={records}
                selectedRecordId={modalState.type === "recordDetail" || modalState.type === "workTimeEntry" ? modalState.recordId : null}
                onRowActivate={openRecordDetail}
              />
            ) : (
              <MonthlyWorkLogView
                records={monthlyTableRecords}
                selectedRecordId={modalState.type === "recordDetail" || modalState.type === "workTimeEntry" ? modalState.recordId : null}
                onRowActivate={openRecordDetail}
              />
            )}

            {periodUnit === "week" && <WeeklySummary weekStart={weekStart} weekEnd={weekEnd} records={records} />}
          </div>
        </section>

        {/* 근무 추이 — independent of periodUnit (spec §2/§8): always renders
            below the records section regardless of which record view is
            active, and driven only by the fixed recent-12-week dataset
            above. Owns its own section header/divider internally (see
            WorkLogTrendSection) so this stays a single top-level section
            among the three, with no duplicate heading here. */}
        <WorkLogTrendSection records={recentTrendRecords} />
      </div>

      {modalState.type === "recordDetail" && recordDetailRecord && (
        <WorkLogRecordDetailModal record={recordDetailRecord} onSave={handleRecordModalSave} onClose={closeModal} criteria={startTimeCriteria} />
      )}

      {modalState.type === "workTimeEntry" && workTimeEntryRecord && (
        <WorkTimeEntryModal record={workTimeEntryRecord} onSave={handleWorkTimeEntrySave} onClose={closeWorkTimeEntry} />
      )}

      {modalState.type === "startTimeCriteria" && (
        <StartTimeCriteriaModal criteria={startTimeCriteria} onSave={handleStartTimeCriteriaSave} onClose={closeModal} />
      )}

      {modalState.type === "clockInCancelConfirm" && (
        <WorkLogModal
          titleId="worklog-clock-in-cancel-title"
          title="출근을 취소할까요?"
          onClose={closeModal}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={closeModal}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={handleClockInCancelConfirm}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                출근 취소
              </button>
            </div>
          }
        />
      )}

      {modalState.type === "clockInCancelBlocked" && (
        <WorkLogModal
          titleId="worklog-clock-in-cancel-blocked-title"
          title="업무시간 기록을 먼저 삭제해주세요."
          onClose={closeModal}
          size="compact"
          footer={
            <button
              type="button"
              onClick={closeModal}
              data-autofocus
              className={`ml-auto h-9 rounded-md bg-primary-emphasis px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
            >
              확인
            </button>
          }
        />
      )}
    </div>
  );
}
