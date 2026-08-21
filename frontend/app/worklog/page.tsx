"use client";

import { useState } from "react";
import { addDays, isSameDay, startOfWeek } from "@/lib/date";
import { WorkLogToolbar, type PeriodUnit } from "./WorkLogToolbar";
import { WorkLogTable } from "./WorkLogTable";
import { MonthlyWorkLogView } from "./MonthlyWorkLogView";
import { WorkLogTrendSection } from "./WorkLogTrendSection";
import { WorkLogRecordDetailModal } from "./WorkLogRecordDetailModal";
import { WorkTimeEntryModal } from "./WorkTimeEntryModal";
import { StartTimeCriteriaModal } from "./StartTimeCriteriaModal";
import { WeeklySummary } from "./WeeklySummary";
import { MonthlyAttendanceDonut } from "./MonthlyAttendanceDonut";
import { TodayWorkPanel } from "./TodayWorkPanel";
import { TodaySummary, type TodayDraft } from "./TodaySummary";
import { getMonthRecords, getWeekRecords, type AttendanceStatus, type WorkLogRecord } from "./mockData";
import { findRecordForDate, getLateness, getNetWorkMinutes } from "./selectors";
import { isWorkdayStatus } from "./attendance";
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

// Single discriminated modal state (v2 Phase 3 §6, extended in Phase 4 §8):
// structurally prevents two overlays ever being open at once. `returnTo` on
// the `workTimeEntry` variant tracks only what's needed to decide whether
// closing/cancelling/saving should land back on the record-detail modal
// (opened via 업무시간 기록 보기) or on the bare page (opened via Today
// Summary's 업무시간 기록) — no separate/global state involved.
type WorkLogModalState =
  | { type: "none" }
  | { type: "recordDetail"; recordId: string; mode: "view" | "edit" }
  | { type: "workTimeEntry"; recordId: string; returnTo: "none" | "recordDetail" }
  | { type: "startTimeCriteria" };

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
  const [recentTrendRecords, setRecentTrendRecords] = useState<WorkLogRecord[]>(() => {
    const todayWeekStart = startOfWeek(now);
    const weekStarts = Array.from({ length: RECENT_TREND_WEEK_COUNT }, (_, i) =>
      addDays(todayWeekStart, -7 * (RECENT_TREND_WEEK_COUNT - 1 - i)),
    );
    return weekStarts.flatMap((start) => getWeekRecords(start));
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
  function updateRecordForDate(date: Date, patch: Partial<WorkLogRecord>) {
    if (isSameDay(todayRecord.date, date)) {
      setTodayRecord((prev) => ({ ...prev, ...patch }));
    }
    setRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...patch } : r)));
    setMonthlyTableRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...patch } : r)));
    setRecentTrendRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...patch } : r)));
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

  function openRecordDetail(recordId: string) {
    setModalState({ type: "recordDetail", recordId, mode: "view" });
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

  function handleRecordModalModeChange(mode: "view" | "edit") {
    setModalState((prev) => (prev.type === "recordDetail" ? { ...prev, mode } : prev));
  }

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
    setModalState({ ...modalState, mode: "view" });
  }

  // Entry path A (spec §8): Today Summary's 업무시간 기록 button — always
  // targets today's own record, regardless of which week is displayed.
  // Defensive guard (attendance/work-time consistency rule): the button is
  // already natively disabled for non-working statuses, but a stale or
  // programmatic event must not be able to open the modal anyway — silently
  // no-op, no alert/toast/console output.
  function openWorkTimeEntryFromToday() {
    if (!isWorkdayStatus(todayRecord.status)) return;
    setModalState({ type: "workTimeEntry", recordId: todayRecord.id, returnTo: "none" });
  }

  // Entry path B (spec §8): the record-detail modal's 업무시간 기록 보기
  // button — replaces the detail modal with the work-time modal for the
  // same record (never stacks; the single discriminated state can only ever
  // describe one open modal). Same defensive guard as path A.
  function openWorkTimeEntryFromDetail() {
    if (modalState.type !== "recordDetail") return;
    const target = findAnyRecordById(modalState.recordId);
    if (!target || !isWorkdayStatus(target.status)) return;
    setModalState({ type: "workTimeEntry", recordId: modalState.recordId, returnTo: "recordDetail" });
  }

  // Closing/cancelling/saving the work-time modal all resolve through this
  // one function, so every exit path (취소, Escape, overlay click, and
  // post-save) lands on the same "return to detail" vs "return to page"
  // decision (spec §8's recommended 근무 기록 상세로 돌아가기 behavior).
  function closeWorkTimeEntry() {
    if (modalState.type !== "workTimeEntry") return;
    if (modalState.returnTo === "recordDetail") {
      setModalState({ type: "recordDetail", recordId: modalState.recordId, mode: "view" });
    } else {
      setModalState({ type: "none" });
    }
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

  function handleClockIn() {
    updateRecordForDate(todayRecord.date, { clockIn: toClockString(new Date()) });
  }

  function handleClockOut() {
    updateRecordForDate(todayRecord.date, { clockOut: toClockString(new Date()) });
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
          <div className="flex items-stretch gap-6">
            <div className="w-[360px] shrink-0">
              <MonthlyAttendanceDonut records={monthRecords} monthAnchor={now} referenceDate={now} />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <TodayWorkPanel
                date={todayRecord.date}
                status={todayRecord.status}
                onStatusChange={handleTodayStatusChange}
                location={todayRecord.location}
                clockIn={todayRecord.clockIn}
                clockOut={todayRecord.clockOut}
                onClockIn={handleClockIn}
                onClockOut={handleClockOut}
                appliedStartTime={todayRecord.appliedStartTime}
                onAppliedStartTimeChange={handleTodayAppliedStartTimeChange}
                criteria={startTimeCriteria}
              />
              <TodaySummary
                status={todayRecord.status}
                basicWorkMinutes={todayRecord.basicWorkMinutes}
                netWorkMinutes={getNetWorkMinutes(todayRecord)}
                actualBlockMinutes={todayRecord.actualBlockMinutes}
                lateness={getLateness(todayRecord)}
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
        <WorkLogRecordDetailModal
          record={recordDetailRecord}
          mode={modalState.mode}
          onModeChange={handleRecordModalModeChange}
          onSave={handleRecordModalSave}
          onClose={closeModal}
          onOpenWorkTimeEntry={openWorkTimeEntryFromDetail}
          criteria={startTimeCriteria}
        />
      )}

      {modalState.type === "workTimeEntry" && workTimeEntryRecord && (
        <WorkTimeEntryModal record={workTimeEntryRecord} onSave={handleWorkTimeEntrySave} onClose={closeWorkTimeEntry} />
      )}

      {modalState.type === "startTimeCriteria" && (
        <StartTimeCriteriaModal criteria={startTimeCriteria} onSave={handleStartTimeCriteriaSave} onClose={closeModal} />
      )}
    </div>
  );
}
