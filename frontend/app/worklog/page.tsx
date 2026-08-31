"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, isSameDay, startOfWeek } from "@/lib/date";
import { isFutureSeoulDate, msUntilNextSeoulMidnight, seoulToday } from "@/lib/seoulDate";
import { ApiError } from "@/lib/api/client";
import { listCategories } from "@/lib/api/categories";
import { listStartTimeCriteria } from "@/lib/api/startTimeCriteria";
import { getLeaveMonthSummary } from "@/lib/api/leaveAllowances";
import { listWorkChartReferenceLines } from "@/lib/api/workChartReferenceLines";
import type { LeaveMonthSummaryDto, WorkChartReferenceLineDto } from "@/lib/api/types";
import {
  clearClockTimes as clearClockTimesApi,
  clockIn as clockInApi,
  clockOut as clockOutApi,
  correctAbsence,
  getWorkRecord,
  listWorkRecords,
  upsertWorkRecord,
} from "@/lib/api/workRecords";
import type { ActivityCategory } from "@/lib/api/types";
import { WorkLogToolbar, type PeriodUnit } from "./WorkLogToolbar";
import { WorkLogTable } from "./WorkLogTable";
import { MonthlyWorkLogView } from "./MonthlyWorkLogView";
import { DailyWorkLogView } from "./DailyWorkLogView";
import { WorkLogTrendSection } from "./WorkLogTrendSection";
import { WorkLogRecordDetailModal, type RecordSavePatch } from "./WorkLogRecordDetailModal";
import { WorkLogModal } from "./WorkLogModal";
import { WorkCategorySettingsSection } from "./WorkCategorySettingsSection";
import { DailyWorkChart } from "./DailyWorkChart";
import { ReferenceLineSettingsModal } from "./ReferenceLineSettingsModal";
import { WeeklySummary } from "./WeeklySummary";
import { MonthlyAttendanceDonut } from "./MonthlyAttendanceDonut";
import { TodayWorkPanel } from "./TodayWorkPanel";
import { TodaySummary, type TodayDraft } from "./TodaySummary";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";
import { buildDayEntries, getDailyWorkPoints, getEffectiveLateness, getNetWorkMinutes, getOnTimeOverrideEligibility } from "./selectors";
import { isWorkdayStatus } from "./attendance";
import { CLEARED_WORK_FIELDS, hasDestructibleWorkData, NON_WORKING_TRANSITION_WARNING } from "./attendanceTransition";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes } from "./format";
import {
  toWorkTimeDraftEntry,
  validateWorkTimeDraftEntries,
  type WorkTimeDraftEntry,
  type WorkTimeRowErrors,
} from "./workTimeEntry";
import { buildDraftRecord, isDraftRecord, mapCriterionFromDto, mapWorkRecordFromDto, mapWorkRecordToInput, toApiDateKey } from "./mapping";
import type { AppliedStartTime, StartTimeCriterion } from "./startTimeCriterion";

// Local calendar-month arithmetic (no date library, no UTC conversion —
// matches the style already used throughout lib/date.ts).
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// Rolling window size for the 근무 추이 trend section — current week plus
// this many immediately preceding weeks (a rolling window, not an exact
// calendar quarter).
const RECENT_TREND_WEEK_COUNT = 12;

type WorkLogModalState =
  | { type: "none" }
  | { type: "recordDetail"; recordId: string }
  // Historical no-record create flow (§17) — reuses WorkLogRecordDetailModal
  // with a fresh draft (buildDraftRecord) rather than an id lookup, since a
  // date with no WorkRecord yet has no id to key on. Never opened for a
  // future date — that belongs to AttendancePlan (see /worklog/attendance).
  | { type: "recordCreate"; date: Date }
  // "기준선 설정" (post-production iteration 1, batch 2) — Daily Work and
  // Work Trend each open the same ReferenceLineSettingsModal shell,
  // parameterized by which pair of scopes it manages.
  | { type: "referenceLineSettings"; section: "daily" | "weekly" }
  // Destructive working→non-working confirmation for Today's own immediate
  // (no draft) status change — see attendanceTransition.ts. Nothing is sent
  // to the server until the user explicitly confirms.
  | { type: "todayStatusConfirm"; status: AttendanceStatus }
  | { type: "clockInCancelConfirm" }
  | { type: "clockInCancelBlocked" }
  | { type: "dailyDiscardConfirm" }
  // Optimistic-lock conflict: the record at `date` changed on the server
  // since it was last read. Never silently overwritten — the user must
  // explicitly reload the latest state before trying again.
  | { type: "versionConflict"; date: Date };

type PendingDailyAction = { kind: "setDate"; date: Date } | { kind: "switchAwayFromDay"; unit: PeriodUnit } | { kind: "openTodayFromSummary" };

function toClockDateKey(date: Date): string {
  return toApiDateKey(date);
}

export default function WorkLogPage() {
  // "Today" per the backend's Asia/Seoul product-date semantics, not the
  // browser's own timezone — see docs/product/work-log-policy.md. Updated
  // by the rollover effect below when the Seoul calendar date advances, so
  // a tab left open across midnight doesn't keep treating yesterday as
  // today.
  const [now, setNow] = useState<Date>(() => seoulToday());
  const prevNowRef = useRef(now);
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("week");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(now));
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(now));
  const [modalState, setModalState] = useState<WorkLogModalState>({ type: "none" });

  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [startTimeCriteria, setStartTimeCriteria] = useState<StartTimeCriterion[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [leaveSummary, setLeaveSummary] = useState<LeaveMonthSummaryDto | null>(null);
  const [referenceLines, setReferenceLines] = useState<WorkChartReferenceLineDto[]>([]);
  // The Daily Work chart is always the actual current calendar week,
  // independent of whatever week/month the user is currently browsing —
  // mirrors recentTrendRecords' own "fixed dataset, not tied to browsing" pattern.
  const [currentWeekRecords, setCurrentWeekRecords] = useState<WorkLogRecord[]>([]);

  const [todayRecord, setTodayRecord] = useState<WorkLogRecord | null>(null);
  const [todayDraft, setTodayDraft] = useState<TodayDraft>({ score: null, memo: "" });
  // Tracks which todayRecord identity todayDraft was last synced from —
  // render-time "adjust state when a key changes" pattern (same idiom as
  // WorkLogRecordDetailModal's own syncedId), not a useEffect: setting
  // state directly during render like this is an explicitly supported
  // React pattern for resetting derived state when its source changes,
  // and avoids the effect-only "Avoid calling setState() directly within
  // an effect" lint rule for what both React and this codebase agree is a
  // resettable-derived-value, not a synchronize-with-an-external-system,
  // concern.
  const [syncedTodayRecordKey, setSyncedTodayRecordKey] = useState<string | null>(null);
  const [todaySaving, setTodaySaving] = useState(false);

  const [records, setRecords] = useState<WorkLogRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [monthlyTableRecords, setMonthlyTableRecords] = useState<WorkLogRecord[]>([]);
  const [monthlyTableLoading, setMonthlyTableLoading] = useState(true);
  const [monthRecords, setMonthRecords] = useState<WorkLogRecord[]>([]);
  const [recentTrendRecords, setRecentTrendRecords] = useState<WorkLogRecord[]>([]);

  const [dailyDate, setDailyDate] = useState<Date>(() => now);
  const [dailyRecord, setDailyRecord] = useState<WorkLogRecord | null>(null);
  const [dailyRecordLoading, setDailyRecordLoading] = useState(true);
  const [dailyDraftEntries, setDailyDraftEntries] = useState<WorkTimeDraftEntry[]>([]);
  const [dailyDraftErrors, setDailyDraftErrors] = useState<Record<string, WorkTimeRowErrors>>({});
  const [pendingDailyAction, setPendingDailyAction] = useState<PendingDailyAction | null>(null);
  const [scrollToDailyToken, setScrollToDailyToken] = useState(0);
  const dailyHeadingRef = useRef<HTMLHeadingElement>(null);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Multiple sections intentionally own different WorkRecord datasets, but
  // some of their ranges are exactly equal on the current week/month. Share
  // only an identical in-flight request; once it settles, later refreshes
  // remain independent and preserve each section's existing lifecycle.
  const workRecordRangeRequestsRef = useRef(new Map<string, ReturnType<typeof listWorkRecords>>());

  function listWorkRecordsDeduplicated(from: string, to: string) {
    const key = `${from}|${to}`;
    const existing = workRecordRangeRequestsRef.current.get(key);
    if (existing) return existing;

    const request = listWorkRecords(from, to);
    workRecordRangeRequestsRef.current.set(key, request);
    const clearRequest = () => {
      if (workRecordRangeRequestsRef.current.get(key) === request) {
        workRecordRangeRequestsRef.current.delete(key);
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  }

  const weekEnd = addDays(weekStart, 6);

  // --- Initial catalog load (categories, start-time criteria) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, criteriaDtos] = await Promise.all([listCategories(), listStartTimeCriteria()]);
        if (cancelled) return;
        setCategories(cats);
        setStartTimeCriteria(criteriaDtos.map(mapCriterionFromDto));
        setCatalogLoaded(true);
      } catch {
        if (!cancelled) setCatalogError("카테고리/출근 기준을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Seoul midnight rollover: keeps `now` (today's identity) correct for
  // a tab left open across the day boundary. A scheduled timer targets the
  // exact next Seoul midnight; a visibilitychange re-check covers the case
  // where the tab was backgrounded/the machine slept through that timer.
  // Both funnel through the same idempotent check, so neither can double-fire
  // or loop: setNow's functional update is a no-op once the Seoul date has
  // already advanced.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function checkForRollover() {
      const today = seoulToday();
      setNow((prev) => (isSameDay(prev, today) ? prev : today));
    }

    function scheduleNextCheck() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        checkForRollover();
        scheduleNextCheck();
      }, msUntilNextSeoulMidnight());
    }

    scheduleNextCheck();
    document.addEventListener("visibilitychange", checkForRollover);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", checkForRollover);
    };
  }, []);

  // --- Today's record --- keyed on `now` (not mount-only): a Seoul day
  // rollover means "today" is a genuinely different record, so it must be
  // re-fetched, not just relabeled.
  async function reloadTodayRecord() {
    const dto = await getWorkRecord(toClockDateKey(now));
    setTodayRecord(dto ? mapWorkRecordFromDto(dto, now) : buildDraftRecord(now));
  }

  useEffect(() => {
    (async () => {
      try {
        await reloadTodayRecord();
      } catch {
        setErrorBanner("오늘의 근무 기록을 불러오지 못했습니다.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // If the daily view was showing "today" before a midnight rollover,
  // follow it to the new today; if the user had navigated to some other
  // date, leave that navigation alone rather than yanking them back.
  useEffect(() => {
    const prevToday = prevNowRef.current;
    prevNowRef.current = now;
    if (isSameDay(prevToday, now)) return;
    setDailyDate((prev) => (isSameDay(prev, prevToday) ? now : prev));
  }, [now]);

  const todayRecordKey = todayRecord ? `${todayRecord.id || "draft"}|${toApiDateKey(todayRecord.date)}` : null;
  if (todayRecord && todayRecordKey !== syncedTodayRecordKey) {
    setSyncedTodayRecordKey(todayRecordKey);
    setTodayDraft({ score: todayRecord.score, memo: todayRecord.memo });
  }

  // --- Weekly table records ---
  async function reloadWeekRecords(start: Date) {
    setRecordsLoading(true);
    try {
      const dtos = await listWorkRecordsDeduplicated(toClockDateKey(start), toClockDateKey(addDays(start, 6)));
      const mapped = dtos.map((dto) => mapWorkRecordFromDto(dto, parseApiDateKeyLocal(dto.workDate)));
      setRecords(mapped);
    } catch {
      setErrorBanner("주간 근무 기록을 불러오지 못했습니다.");
    } finally {
      setRecordsLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadWeekRecords(weekStart);
    })();
  }, [weekStart]);

  // --- Monthly table records ---
  async function reloadMonthRecords(anchor: Date) {
    setMonthlyTableLoading(true);
    try {
      const start = startOfMonth(anchor);
      const end = endOfMonth(anchor);
      const dtos = await listWorkRecordsDeduplicated(toClockDateKey(start), toClockDateKey(end));
      setMonthlyTableRecords(dtos.map((dto) => mapWorkRecordFromDto(dto, parseApiDateKeyLocal(dto.workDate))));
    } catch {
      setErrorBanner("월간 근무 기록을 불러오지 못했습니다.");
    } finally {
      setMonthlyTableLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadMonthRecords(monthAnchor);
    })();
  }, [monthAnchor]);

  // --- Donut dataset: always the real current month, independent of
  // monthAnchor navigation. Keyed on `now` so a rollover that crosses a
  // month boundary (e.g. Aug 31 -> Sep 1) re-fetches the new month; a
  // same-month rollover re-runs this cheaply (once/day, never a loop) but
  // fetches the same range it already had.
  useEffect(() => {
    (async () => {
      try {
        const dtos = await listWorkRecordsDeduplicated(toClockDateKey(startOfMonth(now)), toClockDateKey(endOfMonth(now)));
        setMonthRecords(dtos.map((dto) => mapWorkRecordFromDto(dto, parseApiDateKeyLocal(dto.workDate))));
      } catch {
        setErrorBanner("이번 달 출결 현황을 불러오지 못했습니다.");
      }
    })();
  }, [now]);

  // --- Recent 12-week trend dataset: fixed rolling window, fetched once ---
  useEffect(() => {
    (async () => {
      try {
        const todayWeekStart = startOfWeek(now);
        const rangeStart = addDays(todayWeekStart, -7 * (RECENT_TREND_WEEK_COUNT - 1));
        const rangeEnd = addDays(todayWeekStart, 6);
        const dtos = await listWorkRecordsDeduplicated(toClockDateKey(rangeStart), toClockDateKey(rangeEnd));
        setRecentTrendRecords(dtos.map((dto) => mapWorkRecordFromDto(dto, parseApiDateKeyLocal(dto.workDate))));
      } catch {
        setErrorBanner("근무 추이 데이터를 불러오지 못했습니다.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Daily view record ---
  async function reloadDailyRecord(date: Date) {
    setDailyRecordLoading(true);
    try {
      const dto = await getWorkRecord(toClockDateKey(date));
      const mapped = dto ? mapWorkRecordFromDto(dto, date) : null;
      setDailyRecord(mapped);
      setDailyDraftEntries((mapped?.workTimeEntries ?? []).map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));
      setDailyDraftErrors({});
    } catch {
      setErrorBanner("선택한 날짜의 근무 기록을 불러오지 못했습니다.");
    } finally {
      setDailyRecordLoading(false);
    }
  }

  useEffect(() => {
    if (!catalogLoaded) return;
    void (async () => {
      await Promise.resolve();
      await reloadDailyRecord(dailyDate);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDate, catalogLoaded]);

  const isDailyDirty =
    dailyRecord !== null &&
    JSON.stringify(dailyDraftEntries) !==
      JSON.stringify(dailyRecord.workTimeEntries.map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));

  useEffect(() => {
    if (scrollToDailyToken === 0) return;
    dailyHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    dailyHeadingRef.current?.focus();
  }, [scrollToDailyToken]);

  // Replaces `updated`'s date in `list` if already present; otherwise
  // *inserts* it, but only when its date actually falls within
  // [rangeStart, rangeEnd] — a brand-new record (e.g. today's very first
  // save) never already has an entry to patch, so a patch-only .map() would
  // silently leave every other dataset showing stale "미입력" even though
  // the record now genuinely exists. Range-gated so a mutation to some
  // unrelated date never leaks into a dataset it doesn't belong in.
  function upsertIntoRange(list: WorkLogRecord[], updated: WorkLogRecord, rangeStart: Date, rangeEnd: Date): WorkLogRecord[] {
    if (list.some((r) => isSameDay(r.date, updated.date))) {
      return list.map((r) => (isSameDay(r.date, updated.date) ? updated : r));
    }
    if (updated.date.getTime() < rangeStart.getTime() || updated.date.getTime() > rangeEnd.getTime()) {
      return list;
    }
    return [...list, updated].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // --- Shared post-mutation reconciliation: patch (or insert into) every
  // dataset that covers this date, from the server's own authoritative
  // response — never a client-computed merge. ---
  function applyRecordEverywhere(updated: WorkLogRecord) {
    setTodayRecord((prev) => (prev && isSameDay(prev.date, updated.date) ? updated : prev));
    setRecords((prev) => upsertIntoRange(prev, updated, weekStart, weekEnd));
    setMonthlyTableRecords((prev) => upsertIntoRange(prev, updated, startOfMonth(monthAnchor), endOfMonth(monthAnchor)));
    const trendStart = addDays(startOfWeek(now), -7 * (RECENT_TREND_WEEK_COUNT - 1));
    const trendEnd = addDays(startOfWeek(now), 6);
    setRecentTrendRecords((prev) => upsertIntoRange(prev, updated, trendStart, trendEnd));
    setMonthRecords((prev) => upsertIntoRange(prev, updated, startOfMonth(now), endOfMonth(now)));
    setCurrentWeekRecords((prev) => upsertIntoRange(prev, updated, startOfWeek(now), addDays(startOfWeek(now), 6)));
    if (isSameDay(dailyDate, updated.date)) setDailyRecord(updated);
    // A saved attendance change can change this month's leave usage (연차/
    // 반차) — refresh the summary strip. Fire-and-forget: a transient
    // failure here shouldn't block or error out the record save itself.
    if (updated.date.getFullYear() === now.getFullYear() && updated.date.getMonth() === now.getMonth()) {
      void reloadLeaveSummary();
    }
  }

  async function reloadLeaveSummary() {
    try {
      setLeaveSummary(await getLeaveMonthSummary(now.getFullYear(), now.getMonth() + 1));
    } catch {
      // Non-critical display — leave the previous summary (or none) showing
      // rather than surfacing a banner for a background refresh failure.
    }
  }

  useEffect(() => {
    void reloadLeaveSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.getFullYear(), now.getMonth()]);

  async function reloadReferenceLines() {
    try {
      setReferenceLines(await listWorkChartReferenceLines());
    } catch {
      // Keep whatever was last loaded (or none, on first load) if this fails.
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadReferenceLines();
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const start = startOfWeek(now);
        const end = addDays(start, 6);
        const dtos = await listWorkRecordsDeduplicated(toClockDateKey(start), toClockDateKey(end));
        setCurrentWeekRecords(dtos.map((dto) => mapWorkRecordFromDto(dto, parseApiDateKeyLocal(dto.workDate))));
      } catch {
        // Non-critical chart data — leave whatever was last loaded (or empty).
      }
    })();
  }, [now]);

  function handleMutationError(error: unknown, date: Date) {
    if (error instanceof ApiError && error.status === 409) {
      setModalState({ type: "versionConflict", date });
      return;
    }
    setErrorBanner(describeApiError(error, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."));
  }

  // Resolves the conflict modal: discards the stale local draft and reloads
  // the latest server state for the affected date into every dataset.
  async function handleReloadAfterConflict() {
    if (modalState.type !== "versionConflict") return;
    const { date } = modalState;
    setModalState({ type: "none" });
    try {
      const dto = await getWorkRecord(toClockDateKey(date));
      const mapped = dto ? mapWorkRecordFromDto(dto, date) : buildDraftRecord(date);
      applyRecordEverywhere(mapped);
      if (isSameDay(date, dailyDate)) {
        setDailyRecord(mapped);
        setDailyDraftEntries(mapped.workTimeEntries.map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));
      }
    } catch {
      setErrorBanner("최신 상태를 불러오지 못했습니다.");
    }
  }

  // The one funnel for a *full-state* save (attendance/clock/criterion/
  // override/score/memo/work-time-entries all at once) — used by the
  // record-detail modal's 저장 and the daily view's own entries-only save
  // (which reuses this with only workTimeEntries actually different from
  // the loaded record). Calls the 결근 정정 endpoint instead of the plain
  // upsert whenever the record's *current* (pre-edit) status is 결근 —
  // eligibility is gated on that alone, matching the backend contract.
  async function saveFullRecord(
    baseline: WorkLogRecord,
    next: {
      status: AttendanceStatus;
      clockIn: string | null;
      clockOut: string | null;
      appliedStartTime: AppliedStartTime | null;
      isOnTimeOverride: boolean;
      score: number | null;
      memo: string;
      workTimeEntries: WorkLogRecord["workTimeEntries"];
    },
  ): Promise<WorkLogRecord | null> {
    const input = mapWorkRecordToInput({ ...next, location: baseline.location, version: baseline.version });
    const dateKey = toClockDateKey(baseline.date);
    try {
      const dto =
        baseline.status === "결근" && !isDraftRecord(baseline) ? await correctAbsence(dateKey, input) : await upsertWorkRecord(dateKey, input);
      const mapped = mapWorkRecordFromDto(dto, baseline.date);
      applyRecordEverywhere(mapped);
      setErrorBanner(null);
      return mapped;
    } catch (error) {
      handleMutationError(error, baseline.date);
      return null;
    }
  }

  function findAnyRecordById(id: string): WorkLogRecord | null {
    if (todayRecord && todayRecord.id === id) return todayRecord;
    return records.find((r) => r.id === id) ?? monthlyTableRecords.find((r) => r.id === id) ?? null;
  }

  const recordDetailRecord = modalState.type === "recordDetail" ? findAnyRecordById(modalState.recordId) : null;

  function goToWeek(nextWeekStart: Date) {
    setWeekStart(nextWeekStart);
    setModalState({ type: "none" });
  }

  function goToMonth(nextMonthAnchor: Date) {
    setMonthAnchor(nextMonthAnchor);
    setModalState({ type: "none" });
  }

  function handlePeriodUnitChange(unit: PeriodUnit) {
    setPeriodUnit(unit);
    setModalState({ type: "none" });
  }

  function requestPeriodUnitChange(unit: PeriodUnit) {
    if (periodUnit === "day" && unit !== "day" && isDailyDirty) {
      setPendingDailyAction({ kind: "switchAwayFromDay", unit });
      setModalState({ type: "dailyDiscardConfirm" });
      return;
    }
    handlePeriodUnitChange(unit);
  }

  function requestSetDailyDate(nextDate: Date) {
    if (isDailyDirty && !isSameDay(dailyDate, nextDate)) {
      setPendingDailyAction({ kind: "setDate", date: nextDate });
      setModalState({ type: "dailyDiscardConfirm" });
      return;
    }
    setDailyDate(nextDate);
  }

  function handlePrevPeriod() {
    if (periodUnit === "day") requestSetDailyDate(addDays(dailyDate, -1));
    else if (periodUnit === "week") goToWeek(addDays(weekStart, -7));
    else goToMonth(addMonths(monthAnchor, -1));
  }

  function handleNextPeriod() {
    if (periodUnit === "day") requestSetDailyDate(addDays(dailyDate, 1));
    else if (periodUnit === "week") goToWeek(addDays(weekStart, 7));
    else goToMonth(addMonths(monthAnchor, 1));
  }

  function handleTodayPeriod() {
    if (periodUnit === "day") requestSetDailyDate(now);
    else if (periodUnit === "week") goToWeek(startOfWeek(now));
    else goToMonth(startOfMonth(now));
  }

  function handleDiscardDailyDraft() {
    const action = pendingDailyAction;
    setModalState({ type: "none" });
    setPendingDailyAction(null);
    if (!action) return;
    if (action.kind === "setDate") {
      setDailyDate(action.date);
    } else if (action.kind === "switchAwayFromDay") {
      setDailyDraftEntries((dailyRecord?.workTimeEntries ?? []).map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));
      handlePeriodUnitChange(action.unit);
    } else if (action.kind === "openTodayFromSummary") {
      commitOpenTodayFromSummary();
    }
  }

  function handleDailyDraftChange(next: WorkTimeDraftEntry[]) {
    setDailyDraftEntries(next);
  }

  function handleDailyDraftDiscard() {
    setDailyDraftEntries((dailyRecord?.workTimeEntries ?? []).map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));
    setDailyDraftErrors({});
  }

  async function handleDailyDraftSave() {
    if (!dailyRecord) return;
    const { errors, validEntries } = validateWorkTimeDraftEntries(dailyDraftEntries, parseHoursMinutes, categories);
    if (Object.keys(errors).length > 0) {
      setDailyDraftErrors(errors);
      return;
    }
    setDailyDraftErrors({});
    const saved = await saveFullRecord(dailyRecord, {
      status: dailyRecord.status,
      clockIn: dailyRecord.clockIn,
      clockOut: dailyRecord.clockOut,
      appliedStartTime: dailyRecord.appliedStartTime,
      isOnTimeOverride: dailyRecord.isOnTimeOverride,
      score: dailyRecord.score,
      memo: dailyRecord.memo,
      workTimeEntries: validEntries,
    });
    if (saved) {
      setDailyDraftEntries(saved.workTimeEntries.map((entry) => toWorkTimeDraftEntry(entry, formatHoursMinutes, categories)));
    }
  }

  function requestOpenTodayFromSummary() {
    if (isDailyDirty && !(todayRecord && isSameDay(dailyDate, todayRecord.date))) {
      setPendingDailyAction({ kind: "openTodayFromSummary" });
      setModalState({ type: "dailyDiscardConfirm" });
      return;
    }
    commitOpenTodayFromSummary();
  }

  function commitOpenTodayFromSummary() {
    if (todayRecord && !isSameDay(dailyDate, todayRecord.date)) {
      setDailyDate(todayRecord.date);
    }
    setPeriodUnit("day");
    setModalState({ type: "none" });
    setScrollToDailyToken((t) => t + 1);
  }

  function openRecordDetail(recordId: string) {
    setModalState({ type: "recordDetail", recordId });
  }

  function closeModal() {
    setModalState({ type: "none" });
  }

  function openReferenceLineSettings(section: "daily" | "weekly") {
    setModalState({ type: "referenceLineSettings", section });
  }

  function openCreateRecordForDate(date: Date) {
    if (isFutureSeoulDate(date, now)) return; // future belongs to AttendancePlan, never an actual create here
    setModalState({ type: "recordCreate", date });
  }

  async function handleCreateRecordSave(patch: RecordSavePatch) {
    if (modalState.type !== "recordCreate") return;
    const saved = await saveFullRecord(buildDraftRecord(modalState.date), patch);
    if (saved) closeModal();
  }

  // Fast date-jump (§23): maps the picked date onto whichever range the
  // current period unit displays, mirroring handleTodayPeriod's own
  // per-unit navigation without introducing a second navigation model.
  function handleJumpToDate(date: Date) {
    if (periodUnit === "day") requestSetDailyDate(date);
    else if (periodUnit === "week") goToWeek(startOfWeek(date));
    else goToMonth(startOfMonth(date));
  }

  // Merges one created/updated category into the shared catalog — every
  // open selector (WorkTimeEntryEditor's root/child dropdowns, the
  // default-child lookup) reads from this same `categories` state, so a
  // single in-place replace/append keeps them all current without a
  // refetch. Setting a new default clears the previous default on the
  // server but the response only carries the new default itself — mirror
  // that clear locally on any other active sibling under the same parent,
  // or the old default's "기본" badge would linger until the next reload.
  function handleCategoryUpserted(category: ActivityCategory) {
    setCategories((prev) => {
      const index = prev.findIndex((c) => c.id === category.id);
      const next = index === -1 ? [...prev, category] : prev.map((c) => (c.id === category.id ? category : c));
      if (!category.isDefault) return next;
      return next.map((c) =>
        c.id !== category.id && c.parentId === category.parentId && c.isDefault ? { ...c, isDefault: false } : c,
      );
    });
  }

  // Removes a physically-deleted category from the shared catalog so every
  // open selector (WorkTimeEntryEditor's dropdowns) stops offering it
  // immediately, with no refetch needed.
  function handleCategoryDeleted(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  // Reorder returns the full refreshed list (unlike every other category
  // action, which returns just the one row it touched) — a wholesale
  // replace is correct and simplest here.
  function handleCategoriesReplaced(next: ActivityCategory[]) {
    setCategories(next);
  }

  async function handleRecordModalSave(patch: {
    status: AttendanceStatus;
    clockIn: string | null;
    clockOut: string | null;
    appliedStartTime: AppliedStartTime | null;
    isOnTimeOverride: boolean;
    score: number | null;
    memo: string;
    workTimeEntries: WorkLogRecord["workTimeEntries"];
  }) {
    if (modalState.type !== "recordDetail") return;
    const target = findAnyRecordById(modalState.recordId);
    if (!target) return;
    const saved = await saveFullRecord(target, patch);
    if (saved) {
      if (todayRecord && isSameDay(saved.date, todayRecord.date)) {
        setTodayDraft({ score: saved.score, memo: saved.memo });
      }
      closeModal();
    }
  }

  function handleTodayStatusChange(status: AttendanceStatus) {
    if (!todayRecord || status === todayRecord.status) return;
    const goingNonWorking = isWorkdayStatus(todayRecord.status) && !isWorkdayStatus(status);
    if (
      goingNonWorking &&
      hasDestructibleWorkData({
        clockIn: todayRecord.clockIn,
        clockOut: todayRecord.clockOut,
        appliedStartTime: todayRecord.appliedStartTime,
        isOnTimeOverride: todayRecord.isOnTimeOverride,
        score: todayRecord.score,
        hasWorkTimeEntries: todayRecord.workTimeEntries.length > 0,
      })
    ) {
      setModalState({ type: "todayStatusConfirm", status });
      return;
    }
    void applyTodayStatusTransition(status);
  }

  // Applies an already-decided Today status transition — see
  // WorkLogRecordDetailModal's applyStatusTransition for the same policy
  // applied to the draft-based modal instead of an immediate save. Crossing
  // the working/non-working boundary either way clears clock times, the
  // applied criterion, the on-time override, work score, and every
  // work-time entry (a non-working→working transition starts clean rather
  // than resurrecting anything); staying on the same side of that boundary
  // preserves every other field.
  async function applyTodayStatusTransition(status: AttendanceStatus) {
    if (!todayRecord) return;
    const crossesWorkingBoundary = isWorkdayStatus(todayRecord.status) !== isWorkdayStatus(status);
    if (crossesWorkingBoundary) {
      await saveTodayImmediate({ status, ...CLEARED_WORK_FIELDS });
    } else {
      await saveTodayImmediate({ status });
    }
  }

  async function handleTodayStatusConfirm() {
    if (modalState.type !== "todayStatusConfirm") return;
    const { status } = modalState;
    setModalState({ type: "none" });
    await applyTodayStatusTransition(status);
  }

  function todayFieldsFrom(record: WorkLogRecord) {
    return {
      status: record.status,
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      appliedStartTime: record.appliedStartTime,
      isOnTimeOverride: record.isOnTimeOverride,
      score: record.score,
      memo: record.memo,
      workTimeEntries: record.workTimeEntries,
    };
  }

  const clockLockRef = useRef(false);
  const [clockActionPending, setClockActionPending] = useState(false);

  async function handleClockIn() {
    if (!todayRecord || clockLockRef.current || !isWorkdayStatus(todayRecord.status) || todayRecord.clockIn) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    try {
      const dto = await clockInApi(toClockDateKey(todayRecord.date), { expectedVersion: todayRecord.version });
      applyRecordEverywhere(mapWorkRecordFromDto(dto, todayRecord.date));
      setErrorBanner(null);
    } catch (error) {
      handleMutationError(error, todayRecord.date);
    } finally {
      setClockActionPending(false);
      clockLockRef.current = false;
    }
  }

  async function handleClockOut() {
    if (!todayRecord || clockLockRef.current || !isWorkdayStatus(todayRecord.status) || !todayRecord.clockIn || todayRecord.clockOut) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    try {
      const dto = await clockOutApi(toClockDateKey(todayRecord.date), { expectedVersion: todayRecord.version });
      applyRecordEverywhere(mapWorkRecordFromDto(dto, todayRecord.date));
      setErrorBanner(null);
    } catch (error) {
      handleMutationError(error, todayRecord.date);
    } finally {
      setClockActionPending(false);
      clockLockRef.current = false;
    }
  }

  function handleClockInCancelRequest() {
    if (clockLockRef.current || !todayRecord) return;
    if (todayRecord.workTimeEntries.length > 0) {
      setModalState({ type: "clockInCancelBlocked" });
      return;
    }
    setModalState({ type: "clockInCancelConfirm" });
  }

  async function handleClockInCancelConfirm() {
    if (clockLockRef.current || !todayRecord) return;
    clockLockRef.current = true;
    setClockActionPending(true);
    try {
      const dto = await clearClockTimesApi(toClockDateKey(todayRecord.date), { expectedVersion: todayRecord.version });
      applyRecordEverywhere(mapWorkRecordFromDto(dto, todayRecord.date));
      setErrorBanner(null);
    } catch (error) {
      handleMutationError(error, todayRecord.date);
    } finally {
      setClockActionPending(false);
      clockLockRef.current = false;
      setModalState({ type: "none" });
    }
  }

  // Shared wrapper for every "immediate" (no separate Save step) today-panel
  // mutation — status/clock-time-edit/applied-criterion/on-time-override all
  // persist to the server as soon as the user acts, same as the old
  // mock-backed behavior, just now a real request. `todaySaving` disables
  // the clock buttons (via `clockActionPending`) for the duration, and
  // `clockLockRef` prevents an overlapping duplicate submission the same way
  // the dedicated clock actions already guard themselves.
  async function saveTodayImmediate(patch: Partial<ReturnType<typeof todayFieldsFrom>>) {
    if (!todayRecord || clockLockRef.current) return;
    clockLockRef.current = true;
    setTodaySaving(true);
    try {
      await saveFullRecord(todayRecord, { ...todayFieldsFrom(todayRecord), ...patch });
    } finally {
      setTodaySaving(false);
      clockLockRef.current = false;
    }
  }

  function handleTodayClockInEdit(value: string) {
    void saveTodayImmediate({ clockIn: value });
  }

  function handleTodayClockOutEdit(value: string) {
    void saveTodayImmediate({ clockOut: value });
  }

  function handleToggleTodayOnTimeOverride() {
    if (!todayRecord) return;
    void saveTodayImmediate({ isOnTimeOverride: !todayRecord.isOnTimeOverride });
  }

  function handleTodayAppliedStartTimeChange(next: AppliedStartTime | null) {
    void saveTodayImmediate({ appliedStartTime: next });
  }

  // Default start-time criterion (post-production iteration 1, REQ-02):
  // Today automatically preselects the user's default criterion so they can
  // normally check in without first touching the selector — persisted the
  // same way an explicit selection is (saveTodayImmediate), never merely a
  // local/visual default, since clock-in requires an already-applied
  // criterion on the server. Only fires once per today-record identity
  // (guarded by the ref below) and only while nothing is applied yet, the
  // status is still a workday one, and the user hasn't clocked in — the
  // user's own explicit choice (including deliberately clearing it) is
  // never overridden.
  const autoAppliedDefaultForKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!todayRecord || todayRecord.appliedStartTime != null) return;
    if (!isWorkdayStatus(todayRecord.status) || todayRecord.clockIn) return;
    if (autoAppliedDefaultForKeyRef.current === todayRecordKey) return;

    const defaultCriterion = startTimeCriteria.find((c) => c.isDefault && c.active);
    if (!defaultCriterion) return;

    autoAppliedDefaultForKeyRef.current = todayRecordKey;
    void saveTodayImmediate({
      appliedStartTime: {
        criterionId: defaultCriterion.id,
        criterionName: defaultCriterion.name,
        startTime: defaultCriterion.startTime,
        graceMinutes: defaultCriterion.graceMinutes,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRecordKey, todayRecord, startTimeCriteria]);

  function handleTodayDraftChange(patch: Partial<TodayDraft>) {
    setTodayDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleTodaySave() {
    if (!todayRecord) return;
    // A non-working record never retains a score, regardless of whatever
    // stale value the score input still holds locally (e.g. left over from
    // before a same-session transition away from a working status).
    const score = isWorkdayStatus(todayRecord.status) ? todayDraft.score : null;
    await saveFullRecord(todayRecord, { ...todayFieldsFrom(todayRecord), score, memo: todayDraft.memo });
  }

  const weekDayEntries = buildDayEntries(weekStart, weekEnd, records);
  const dailyWorkPoints = useMemo(
    () => getDailyWorkPoints(startOfWeek(now), addDays(startOfWeek(now), 6), currentWeekRecords),
    [now, currentWeekRecords],
  );

  if (catalogError) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-8 py-16 text-center">
        <p className="text-sm text-danger-fg">{catalogError}</p>
      </div>
    );
  }

  if (!catalogLoaded || !todayRecord) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-8 py-16 text-center">
        <p className="text-sm text-fg-muted">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas-default">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-16 px-8 py-8">
        {errorBanner && (
          <div className="flex items-center justify-between rounded-md border border-danger-fg bg-danger-subtle px-4 py-2 text-sm text-danger-fg">
            <span>{errorBanner}</span>
            <button type="button" onClick={() => setErrorBanner(null)} className={`rounded px-2 py-0.5 text-xs font-medium hover:opacity-80 ${FOCUS_VISIBLE}`}>
              닫기
            </button>
          </div>
        )}

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">근무 현황</h2>
            <p className="text-sm text-fg-muted">이번 달 출결과 오늘의 근무 상태를 확인합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <div className="grid grid-cols-1 items-start gap-6 min-[1400px]:grid-cols-[38%_1fr]">
            <div className="flex flex-col gap-4">
              <MonthlyAttendanceDonut records={monthRecords} monthAnchor={now} referenceDate={now} />
              <div className="flex items-center justify-between rounded-md border border-border-default bg-surface-default px-4 py-3 text-sm">
                <span className="text-xs font-medium text-fg-muted">이번 달 연차</span>
                {leaveSummary ? (
                  <span className="text-fg-default">
                    허용 <strong className="font-semibold">{leaveSummary.allowanceDays ?? "미설정"}</strong>
                    {leaveSummary.allowanceDays != null && "일"} · 사용{" "}
                    <strong className="font-semibold">{leaveSummary.usedDays}일</strong> · 잔여{" "}
                    <strong className="font-semibold text-primary-fg">
                      {leaveSummary.remainingDays == null ? "–" : `${leaveSummary.remainingDays}일`}
                    </strong>
                  </span>
                ) : (
                  <span className="text-fg-muted">불러오는 중…</span>
                )}
              </div>
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
                clockActionPending={clockActionPending || todaySaving}
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
                onOpenWorkTimeEntry={requestOpenTodayFromSummary}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">근무 기록</h2>
            <p className="text-sm text-fg-muted">일별 출결과 근무 내역을 조회하고 관리합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <div className="flex flex-col gap-4">
            <WorkLogToolbar
              periodUnit={periodUnit}
              onPeriodUnitChange={requestPeriodUnitChange}
              rangeStart={periodUnit === "day" ? dailyDate : periodUnit === "week" ? weekStart : monthAnchor}
              rangeEnd={periodUnit === "day" ? dailyDate : periodUnit === "week" ? weekEnd : endOfMonth(monthAnchor)}
              onPrev={handlePrevPeriod}
              onNext={handleNextPeriod}
              onToday={handleTodayPeriod}
              onJumpToDate={handleJumpToDate}
            />

            {periodUnit === "day" ? (
              dailyRecordLoading ? (
                <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
              ) : (
                <DailyWorkLogView
                  date={dailyDate}
                  record={dailyRecord}
                  entries={dailyDraftEntries}
                  errors={dailyDraftErrors}
                  isDirty={isDailyDirty}
                  onChange={handleDailyDraftChange}
                  onSave={handleDailyDraftSave}
                  onDiscard={handleDailyDraftDiscard}
                  headingRef={dailyHeadingRef}
                  categories={categories}
                  canCreateRecord={!isFutureSeoulDate(dailyDate, now)}
                  onCreateRecord={() => openCreateRecordForDate(dailyDate)}
                />
              )
            ) : periodUnit === "week" ? (
              recordsLoading ? (
                <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
              ) : (
                <WorkLogTable
                  days={weekDayEntries}
                  selectedRecordId={modalState.type === "recordDetail" ? modalState.recordId : null}
                  onRowActivate={openRecordDetail}
                  referenceDate={now}
                  onCreateRecord={openCreateRecordForDate}
                />
              )
            ) : monthlyTableLoading ? (
              <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
            ) : (
              <MonthlyWorkLogView
                rangeStart={startOfMonth(monthAnchor)}
                rangeEnd={endOfMonth(monthAnchor)}
                records={monthlyTableRecords}
                selectedRecordId={modalState.type === "recordDetail" ? modalState.recordId : null}
                onRowActivate={openRecordDetail}
                referenceDate={now}
                onCreateRecord={openCreateRecordForDate}
              />
            )}

            {periodUnit === "week" && !recordsLoading && <WeeklySummary weekStart={weekStart} weekEnd={weekEnd} records={records} />}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-fg-default">일별 근무</h2>
              <p className="text-sm text-fg-muted">이번 주 요일별 근무 시간과 점수 추이를 확인합니다.</p>
            </div>
            <button
              type="button"
              onClick={() => openReferenceLineSettings("daily")}
              className={`h-9 shrink-0 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              기준선 설정
            </button>
          </div>
          <div className="border-t border-border-default" />
          <DailyWorkChart
            points={dailyWorkPoints}
            referenceLines={referenceLines}
          />
        </section>

        <WorkLogTrendSection
          records={recentTrendRecords}
          referenceLines={referenceLines}
          onOpenReferenceLineSettings={() => openReferenceLineSettings("weekly")}
        />

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">근무 기록 설정</h2>
            <p className="text-sm text-fg-muted">업무시간 카테고리 등 근무 기록에 사용되는 설정을 관리합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <WorkCategorySettingsSection
            categories={categories}
            onCategoryUpserted={handleCategoryUpserted}
            onCategoryDeleted={handleCategoryDeleted}
            onCategoriesReplaced={handleCategoriesReplaced}
          />
        </section>
      </div>

      {modalState.type === "recordDetail" && recordDetailRecord && (
        <WorkLogRecordDetailModal
          record={recordDetailRecord}
          onSave={handleRecordModalSave}
          onClose={closeModal}
          criteria={startTimeCriteria}
          categories={categories}
        />
      )}

      {modalState.type === "recordCreate" && (
        <WorkLogRecordDetailModal
          record={buildDraftRecord(modalState.date)}
          onSave={handleCreateRecordSave}
          onClose={closeModal}
          criteria={startTimeCriteria}
          categories={categories}
        />
      )}

      {modalState.type === "referenceLineSettings" && modalState.section === "daily" && (
        <ReferenceLineSettingsModal
          title="기준선 설정 · 일별 근무"
          timeScope="DAILY_TIME"
          scoreScope="DAILY_SCORE"
          timeSectionTitle="실근무 시간 기준선"
          scoreSectionTitle="근무 점수 기준선"
          lines={referenceLines}
          onReload={reloadReferenceLines}
          onClose={closeModal}
        />
      )}

      {modalState.type === "referenceLineSettings" && modalState.section === "weekly" && (
        <ReferenceLineSettingsModal
          title="기준선 설정 · 근무 추이"
          timeScope="WEEKLY_TIME"
          scoreScope="WEEKLY_SCORE"
          timeSectionTitle="주간 근무 시간 기준선"
          scoreSectionTitle="주간 평균 점수 기준선"
          lines={referenceLines}
          onReload={reloadReferenceLines}
          onClose={closeModal}
        />
      )}

      {modalState.type === "todayStatusConfirm" && (
        <WorkLogModal
          titleId="worklog-today-status-confirm-title"
          title="비근무 상태로 변경할까요?"
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
                취소
              </button>
              <button
                type="button"
                onClick={handleTodayStatusConfirm}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                변경
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">{NON_WORKING_TRANSITION_WARNING}</p>
        </WorkLogModal>
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

      {modalState.type === "dailyDiscardConfirm" && (
        <WorkLogModal
          titleId="worklog-daily-discard-title"
          title="저장하지 않은 변경사항을 버릴까요?"
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
                계속 편집
              </button>
              <button
                type="button"
                onClick={handleDiscardDailyDraft}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                변경사항 버리기
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

      {modalState.type === "versionConflict" && (
        <WorkLogModal
          titleId="worklog-version-conflict-title"
          title="이 기록이 그 사이에 변경되었습니다."
          onClose={closeModal}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={closeModal}
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleReloadAfterConflict}
                data-autofocus
                className={`h-9 rounded-md bg-primary-emphasis px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                최신 내용 불러오기
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-muted">
            다른 곳에서 저장된 최신 내용으로 새로고침해야 계속 편집할 수 있습니다. 방금 입력한 내용은 저장되지 않았습니다.
          </p>
        </WorkLogModal>
      )}
    </div>
  );
}

// Local re-parse of the backend's own "yyyy-MM-dd" workDate — deliberately
// not lib/date.ts's parseLocalDateTime (that expects a full "T"-separated
// date-time). Timezone-naive: constructs the Date from local wall-clock
// fields, never toISOString()/UTC.
function parseApiDateKeyLocal(workDate: string): Date {
  const [year, month, day] = workDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
