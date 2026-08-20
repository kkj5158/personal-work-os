"use client";

import { useState } from "react";
import { addDays, isSameDay, startOfWeek } from "@/lib/date";
import { WorkLogToolbar } from "./WorkLogToolbar";
import { WorkLogTable } from "./WorkLogTable";
import { WorkLogRecordDetailModal } from "./WorkLogRecordDetailModal";
import { WeeklySummary } from "./WeeklySummary";
import { MonthlyAttendanceDonut } from "./MonthlyAttendanceDonut";
import { TodayWorkPanel } from "./TodayWorkPanel";
import { TodaySummary, type TodayDraft } from "./TodaySummary";
import { getMonthRecords, getWeekRecords, type AttendanceStatus, type WorkLogRecord } from "./mockData";
import { findRecordForDate } from "./selectors";

// Default anchor matches the approved reference image's week
// (docs/frontend/work-log/work-log-ui-final.png, 2026.08.10–2026.08.16) so
// this page can be visually compared against it directly. "오늘" still
// navigates to the real current week.
const MOCK_ANCHOR_DATE = new Date(2026, 7, 10);

// Single discriminated modal state (v2 Phase 3 §6): structurally prevents
// two overlays ever being open at once. Phase 4's Work-time modal is
// expected to extend this union with a `workTime` variant, never add a
// second independent piece of modal state.
type WorkLogModalState = { type: "none" } | { type: "recordDetail"; recordId: string; mode: "view" | "edit" };

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
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(MOCK_ANCHOR_DATE));
  const [records, setRecords] = useState<WorkLogRecord[]>(() => getWeekRecords(startOfWeek(MOCK_ANCHOR_DATE)));
  const [modalState, setModalState] = useState<WorkLogModalState>({ type: "none" });

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
  // regardless of which week is selected in the table below (spec §3).
  const [monthRecords] = useState<WorkLogRecord[]>(() => getMonthRecords(now));

  const weekEnd = addDays(weekStart, 6);
  const modalRecord = modalState.type === "recordDetail" ? (records.find((r) => r.id === modalState.recordId) ?? null) : null;

  // Single date-based update helper (v2 Phase 2 requirement): every mutation
  // that targets a specific calendar date — clock buttons, Today's status
  // dropdown, Today's save, and the record-detail modal's save — funnels
  // through this one function, so `todayRecord` and `records` never
  // visibly disagree when they overlap on the same date.
  function updateRecordForDate(date: Date, patch: Partial<WorkLogRecord>) {
    if (isSameDay(todayRecord.date, date)) {
      setTodayRecord((prev) => ({ ...prev, ...patch }));
    }
    setRecords((prev) => prev.map((r) => (isSameDay(r.date, date) ? { ...r, ...patch } : r)));
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

  function openRecordDetail(recordId: string) {
    setModalState({ type: "recordDetail", recordId, mode: "view" });
  }

  function closeModal() {
    setModalState({ type: "none" });
  }

  function handleRecordModalModeChange(mode: "view" | "edit") {
    setModalState((prev) => (prev.type === "recordDetail" ? { ...prev, mode } : prev));
  }

  function handleRecordModalSave(patch: Partial<WorkLogRecord>) {
    if (modalState.type !== "recordDetail") return;
    const target = records.find((r) => r.id === modalState.recordId);
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

  function handleTodayStatusChange(status: AttendanceStatus) {
    updateRecordForDate(todayRecord.date, { status });
  }

  function handleClockIn() {
    updateRecordForDate(todayRecord.date, { clockIn: toClockString(new Date()) });
  }

  function handleClockOut() {
    updateRecordForDate(todayRecord.date, { clockOut: toClockString(new Date()) });
  }

  function handleTodayDraftChange(patch: Partial<TodayDraft>) {
    setTodayDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleTodaySave() {
    updateRecordForDate(todayRecord.date, { score: todayDraft.score, memo: todayDraft.memo });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas-default">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-6 py-4">
        <div className="flex items-stretch gap-4">
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
            />
            <TodaySummary
              status={todayRecord.status}
              basicWorkMinutes={todayRecord.basicWorkMinutes}
              netWorkMinutes={todayRecord.netWorkMinutes}
              actualBlockMinutes={todayRecord.actualBlockMinutes}
              lateMinutes={todayRecord.lateMinutes}
              draft={todayDraft}
              onDraftChange={handleTodayDraftChange}
              onSave={handleTodaySave}
            />
          </div>
        </div>

        <WorkLogToolbar
          weekStart={weekStart}
          weekEnd={weekEnd}
          onPrevWeek={() => goToWeek(addDays(weekStart, -7))}
          onNextWeek={() => goToWeek(addDays(weekStart, 7))}
          onToday={() => goToWeek(startOfWeek(new Date()))}
        />

        <WorkLogTable
          records={records}
          selectedRecordId={modalState.type === "recordDetail" ? modalState.recordId : null}
          onRowActivate={openRecordDetail}
        />

        <WeeklySummary weekStart={weekStart} weekEnd={weekEnd} records={records} />
      </div>

      {modalState.type === "recordDetail" && modalRecord && (
        <WorkLogRecordDetailModal
          record={modalRecord}
          mode={modalState.mode}
          onModeChange={handleRecordModalModeChange}
          onSave={handleRecordModalSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
