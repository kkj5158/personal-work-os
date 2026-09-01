"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { seoulToday } from "@/lib/seoulDate";
import { addDays, toLocalDateTimeString } from "@/lib/date";
import { ApiError } from "@/lib/api/client";
import { listCategories } from "@/lib/api/categories";
import { listStartTimeCriteria } from "@/lib/api/startTimeCriteria";
import { listAttendancePlans } from "@/lib/api/attendancePlans";
import { listPlannedBlocks } from "@/lib/api/plannedBlocks";
import { getLeaveMonthSummary } from "@/lib/api/leaveAllowances";
import { correctAbsence, listWorkRecords, upsertWorkRecord } from "@/lib/api/workRecords";
import type { ActivityCategory, AttendancePlanDto, LeaveMonthSummaryDto, PlannedTimeBlock } from "@/lib/api/types";
import { AnnualAttendanceSummary } from "../AnnualAttendanceSummary";
import { MonthlyAttendanceSummary } from "../MonthlyAttendanceSummary";
import { LeaveAllowanceModal, LeaveStackedBar } from "../LeaveAllowanceModal";
import { AttendanceCalendar } from "../AttendanceCalendar";
import { AttendanceHistory } from "../AttendanceHistory";
import { StartTimeCriteriaManagement } from "../StartTimeCriteriaManagement";
import { WorkLogRecordDetailModal, type RecordSavePatch } from "../WorkLogRecordDetailModal";
import {
  aggregateMonthlyAttendance,
  aggregateYearlyAttendance,
  computeAverageWorkMinutes,
  computeMonthlyAbnormalAttendance,
  computeOnTimeRate,
} from "../attendance";
import { reconcileBlocksForDate } from "../attendanceCalendarLogic";
import { getAverageScore, getEffectiveLateness, getNetWorkMinutes } from "../selectors";
import { buildDraftRecord, fromApiDateKey, isDraftRecord, mapCriterionFromDto, mapWorkRecordFromDto, mapWorkRecordToInput, toApiDateKey } from "../mapping";
import type { WorkLogRecord } from "../mockData";
import type { StartTimeCriterion } from "../startTimeCriterion";
import { describeApiError } from "../errorMessages";
import { FOCUS_VISIBLE } from "../format";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

type ModalState = { type: "none" } | { type: "leaveAllowance" } | { type: "recordDetail"; date: Date };

// 출결 관리 (attendance management batch) — plan-vs-actual attendance
// administration, separate from 근무 기록's daily execution/record editing.
// See docs/product/work-attendance-management-design.md.
export default function AttendanceManagementPage() {
  const today = seoulToday();
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(today));

  const [yearRecords, setYearRecords] = useState<WorkLogRecord[]>([]);
  const [yearLoading, setYearLoading] = useState(true);
  const [plans, setPlans] = useState<AttendancePlanDto[]>([]);
  const [plannedBlocks, setPlannedBlocks] = useState<PlannedTimeBlock[]>([]);
  const [leaveSummary, setLeaveSummary] = useState<LeaveMonthSummaryDto | null>(null);
  const [criteria, setCriteria] = useState<StartTimeCriterion[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const [modalState, setModalState] = useState<ModalState>({ type: "none" });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const year = monthAnchor.getFullYear();

  // --- Catalog (criteria + categories), loaded once ---
  useEffect(() => {
    (async () => {
      try {
        const [criteriaDtos, cats] = await Promise.all([listStartTimeCriteria(), listCategories()]);
        setCriteria(criteriaDtos.map(mapCriterionFromDto));
        setCategories(cats);
        setCatalogLoaded(true);
      } catch {
        setErrorBanner("출근 기준/카테고리를 불러오지 못했습니다.");
      }
    })();
  }, []);

  // --- Year-scoped data (WorkRecords + AttendancePlans) — one pair of
  // range fetches covers the annual summary, monthly summary, calendar, and
  // history sections at once; never one request per date. Padded by a full
  // week on each side of the calendar year (attendance follow-up §6/§7): the
  // calendar now renders real adjacent-month/adjacent-year dates as
  // selectable cells, and a Monday-Sunday week total must never be truncated
  // just because it crosses the Dec 31/Jan 1 boundary. Seven days is the
  // most any Monday-start month view can lead/trail with, so this is the
  // minimal padding that guarantees every visible cell and every visible
  // week has real data behind it — not a wider "fetch everything" pass.
  //
  // QA round 2 §18-20 root-cause fix: rapid month/year navigation (or any
  // other trigger that fires this more than once before the first call
  // resolves) could previously let an OLDER, now-abandoned request's
  // response arrive AFTER a newer one and silently overwrite yearRecords
  // with the wrong year's data — since aggregateMonthlyAttendance/
  // aggregateYearlyAttendance filter by the CURRENTLY displayed monthAnchor,
  // the result was "이번 달 출결 요약"/the annual donut suddenly rendering
  // as empty/zeroed for the real current month, even though nothing was
  // actually deleted server-side (a plain refresh always re-fetched fresh
  // and looked correct again — exactly the reported symptom). A monotonic
  // request-id guard makes only the LATEST-DISPATCHED request's response
  // ever apply; every earlier one is a no-op once superseded. ---
  const yearRequestIdRef = useRef(0);
  async function reloadYearData(y: number) {
    const requestId = ++yearRequestIdRef.current;
    setYearLoading(true);
    try {
      const from = toApiDateKey(addDays(new Date(y, 0, 1), -7));
      const to = toApiDateKey(addDays(new Date(y, 11, 31), 7));
      const rangeStart = toLocalDateTimeString(addDays(new Date(y, 0, 1), -7));
      const rangeEnd = toLocalDateTimeString(addDays(new Date(y + 1, 0, 1), 7));
      const [recordDtos, planDtos, blocks] = await Promise.all([
        listWorkRecords(from, to),
        listAttendancePlans(from, to),
        listPlannedBlocks(rangeStart, rangeEnd),
      ]);
      if (requestId !== yearRequestIdRef.current) return; // superseded by a newer request — discard
      setYearRecords(recordDtos.map((dto) => parseWorkRecord(dto)));
      setPlans(planDtos);
      setPlannedBlocks(blocks);
      setErrorBanner(null);
    } catch (err) {
      if (requestId !== yearRequestIdRef.current) return;
      setErrorBanner(describeApiError(err, "출결 데이터를 불러오지 못했습니다."));
    } finally {
      if (requestId === yearRequestIdRef.current) setYearLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadYearData(year);
    })();
  }, [year]);

  // Same stale-response guard as reloadYearData above, and for the same
  // reason: this is called both by the month-change effect below AND
  // individually after every plan/block/record mutation (including once per
  // date in a multi-date paste/delete batch) — without a guard, an earlier
  // one of several concurrent calls finishing last would overwrite the
  // correct leave summary with an outdated one.
  const leaveRequestIdRef = useRef(0);
  async function reloadLeaveSummary() {
    const requestId = ++leaveRequestIdRef.current;
    const targetYear = monthAnchor.getFullYear();
    const targetMonth = monthAnchor.getMonth() + 1;
    try {
      const summary = await getLeaveMonthSummary(targetYear, targetMonth);
      if (requestId !== leaveRequestIdRef.current) return; // superseded — discard
      setLeaveSummary(summary);
    } catch {
      // Non-critical — leave the previous summary showing.
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadLeaveSummary();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthAnchor.getFullYear(), monthAnchor.getMonth()]);

  function goToMonth(next: Date) {
    setMonthAnchor(startOfMonth(next));
  }

  function reconcilePlan(plan: AttendancePlanDto) {
    setPlans((prev) => {
      const exists = prev.some((p) => p.planDate === plan.planDate);
      return exists ? prev.map((p) => (p.planDate === plan.planDate ? plan : p)) : [...prev, plan];
    });
  }

  function handlePlanSaved(plan: AttendancePlanDto) {
    reconcilePlan(plan);
    void reloadLeaveSummary();
  }

  function removePlan(date: Date) {
    const dateKey = toApiDateKey(date);
    setPlans((prev) => prev.filter((p) => p.planDate !== dateKey));
  }

  function handlePlanDeleted(date: Date) {
    removePlan(date);
    void reloadLeaveSummary();
  }

  // §12: the same canonical PlannedTimeBlock records the future Planning UI
  // reads/writes — optimistic local sync after the compact Attendance
  // popover editor's create/delete calls, same pattern as handlePlanSaved/
  // handlePlanDeleted above.
  function handleBlockUpserted(block: PlannedTimeBlock) {
    setPlannedBlocks((prev) => {
      const exists = prev.some((b) => b.id === block.id);
      return exists ? prev.map((b) => (b.id === block.id ? block : b)) : [...prev, block];
    });
  }

  function handleBlockDeleted(id: string) {
    setPlannedBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  // P1 fix: after a successful atomic broadcast replace, `blocks` is the
  // COMPLETE authoritative PlannedTimeBlock set for `date` — reconcile with
  // one remove-then-append state update (reconcileBlocksForDate) rather than
  // upserting each returned block individually, which could never remove a
  // stale block ID the backend's replace already deleted server-side.
  function handleBlocksReplacedForDate(date: Date, blocks: PlannedTimeBlock[]) {
    setPlannedBlocks((prev) => reconcileBlocksForDate(prev, date, blocks));
  }

  function findYearRecordByDate(date: Date): WorkLogRecord | null {
    const dateKey = toApiDateKey(date);
    return yearRecords.find((r) => toApiDateKey(r.date) === dateKey) ?? null;
  }

  function upsertYearRecord(updated: WorkLogRecord) {
    setYearRecords((prev) => {
      const dateKey = toApiDateKey(updated.date);
      const exists = prev.some((r) => toApiDateKey(r.date) === dateKey);
      return exists ? prev.map((r) => (toApiDateKey(r.date) === dateKey ? updated : r)) : [...prev, updated];
    });
  }

  function openRecordDetail(date: Date) {
    setModalState({ type: "recordDetail", date });
  }

  function closeModal() {
    setModalState({ type: "none" });
  }

  async function handleRecordModalSave(patch: RecordSavePatch) {
    if (modalState.type !== "recordDetail") return;
    const { date } = modalState;
    const baseline = findYearRecordByDate(date) ?? buildDraftRecord(date);
    const input = mapWorkRecordToInput({ ...patch, location: baseline.location, version: baseline.version });
    const dateKey = toApiDateKey(date);
    try {
      const dto = baseline.status === "결근" && !isDraftRecord(baseline) ? await correctAbsence(dateKey, input) : await upsertWorkRecord(dateKey, input);
      upsertYearRecord(mapWorkRecordFromDto(dto, date));
      void reloadLeaveSummary();
      closeModal();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorBanner("이 기록이 그 사이에 변경되었습니다. 새로고침 후 다시 시도해주세요.");
        closeModal();
        return;
      }
      setErrorBanner(describeApiError(err, "저장하지 못했습니다."));
    }
  }

  const recordDetailRecord = modalState.type === "recordDetail" ? findYearRecordByDate(modalState.date) ?? buildDraftRecord(modalState.date) : null;

  // These scans cover the padded full-year record collection. Local UI
  // changes such as opening a modal, selecting calendar cells, or receiving
  // a leave-summary response do not change their inputs, so retain the
  // derived result until records/month/today actually change.
  const todayKey = toApiDateKey(today);
  const attendanceMetrics = useMemo(() => {
    const metricReferenceDate = fromApiDateKey(todayKey);
    return {
      monthlyCounts: aggregateMonthlyAttendance(yearRecords, monthAnchor, metricReferenceDate),
      yearlyCounts: aggregateYearlyAttendance(yearRecords, monthAnchor, metricReferenceDate),
      monthlyAbnormal: computeMonthlyAbnormalAttendance(yearRecords, monthAnchor, metricReferenceDate, getEffectiveLateness),
      onTimeRate: computeOnTimeRate(yearRecords, getEffectiveLateness).rate,
      averageWorkMinutes: computeAverageWorkMinutes(yearRecords, getNetWorkMinutes),
      averageScore: getAverageScore(yearRecords),
    };
  }, [yearRecords, monthAnchor, todayKey]);
  const { monthlyCounts, yearlyCounts, monthlyAbnormal, onTimeRate, averageWorkMinutes, averageScore } = attendanceMetrics;
  const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;

  if (!catalogLoaded) {
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

        <section className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-fg-default">출결 관리</h1>
          <p className="text-sm text-fg-muted">연간 현황, 출결 기록과 통계 조회, 출근 기준을 관리합니다.</p>
        </section>

        {yearLoading ? (
          <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
        ) : (
          <AnnualAttendanceSummary
            year={year}
            counts={yearlyCounts}
            daysInYear={daysInYear}
            monthlyAbnormal={monthlyAbnormal}
            onTimeRate={onTimeRate}
            averageWorkMinutes={averageWorkMinutes}
            averageScore={averageScore}
            referenceDate={today}
          />
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-md border border-border-default bg-surface-default p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg-default">{monthAnchor.getMonth() + 1}월 연차 현황</h2>
              <button
                type="button"
                onClick={() => setModalState({ type: "leaveAllowance" })}
                className={`h-8 rounded-md bg-primary-emphasis px-3 text-xs font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
              >
                연차 설정
              </button>
            </div>
            {leaveSummary ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-fg-muted">총 연차</span>
                    <span className="text-lg font-semibold text-fg-default">
                      {leaveSummary.allowanceDays == null ? "미설정" : `${leaveSummary.allowanceDays}일`}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-fg-muted">확정 사용</span>
                    <span className="font-semibold text-fg-default">{leaveSummary.usedDays}일</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-fg-muted">예정 사용</span>
                    <span className="font-semibold text-fg-default">{leaveSummary.plannedDays}일</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-fg-muted">사용 가능</span>
                    <span className="font-semibold text-primary-fg">{leaveSummary.remainingDays == null ? "–" : `${leaveSummary.remainingDays}일`}</span>
                  </div>
                </div>
                {leaveSummary.allowanceDays != null && leaveSummary.allowanceDays > 0 && (
                  <LeaveStackedBar allowance={leaveSummary.allowanceDays} used={leaveSummary.usedDays} planned={leaveSummary.plannedDays} />
                )}
                {leaveSummary.allowanceDays == null && <p className="text-xs text-fg-muted">이번 달 연차를 먼저 설정해주세요.</p>}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-fg-muted">불러오는 중…</p>
            )}
          </div>

          {yearLoading ? (
            <div className="flex items-center justify-center rounded-md border border-border-default bg-surface-default p-6">
              <p className="text-sm text-fg-muted">불러오는 중…</p>
            </div>
          ) : (
            // §18-20: monthlyCounts is derived synchronously from yearRecords
            // on every render — during a cross-year navigation, yearRecords
            // still holds the PREVIOUS year's data for a moment while
            // monthAnchor already points at the new year, which would
            // otherwise flash a false "all zero/미입력" 이번 달 출결 요약
            // for the real current month. Gating on yearLoading (unlike the
            // leave card above, which intentionally keeps showing its own
            // last-valid data during a refetch) avoids that false zero,
            // since this section has no "previous value" of its own to fall
            // back to — it's recomputed fresh every render.
            <MonthlyAttendanceSummary counts={monthlyCounts} />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">출결 캘린더</h2>
            <p className="text-sm text-fg-muted">계획과 실제 출결을 한 눈에 확인하고 계획을 관리합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          {yearLoading ? (
            <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
          ) : (
            <AttendanceCalendar
              monthAnchor={monthAnchor}
              plans={plans}
              records={yearRecords}
              criteria={criteria}
              categories={categories}
              plannedBlocks={plannedBlocks}
              referenceDate={today}
              onPrevMonth={() => goToMonth(addMonths(monthAnchor, -1))}
              onNextMonth={() => goToMonth(addMonths(monthAnchor, 1))}
              onToday={() => goToMonth(today)}
              onGoToMonth={goToMonth}
              onPlanSaved={handlePlanSaved}
              onPlanDeleted={handlePlanDeleted}
              onPlanReconciled={reconcilePlan}
              onPlanRemoved={removePlan}
              onPlanningBatchSettled={() => void reloadLeaveSummary()}
              onBlockUpserted={handleBlockUpserted}
              onBlockDeleted={handleBlockDeleted}
              onBlocksReplacedForDate={handleBlocksReplacedForDate}
              onOpenWorkRecordDetail={openRecordDetail}
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">출결 이력</h2>
            <p className="text-sm text-fg-muted">특이 출결 이력만 모아 빠르게 검토합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          {yearLoading ? (
            <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
          ) : (
            <AttendanceHistory records={yearRecords} plans={plans} referenceDate={today} onRowActivate={openRecordDetail} />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">출근 기준 관리</h2>
            <p className="text-sm text-fg-muted">근무/반차 계획과 실제 기록에 적용할 출근 기준을 관리합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <StartTimeCriteriaManagement criteria={criteria} onSaved={setCriteria} />
        </section>
      </div>

      {modalState.type === "leaveAllowance" && (
        <LeaveAllowanceModal initialMonth={monthAnchor} onClose={closeModal} onSaved={reloadLeaveSummary} />
      )}

      {modalState.type === "recordDetail" && recordDetailRecord && (
        <WorkLogRecordDetailModal
          record={recordDetailRecord}
          onSave={handleRecordModalSave}
          onClose={closeModal}
          criteria={criteria}
          categories={categories}
        />
      )}
    </div>
  );
}

function parseWorkRecord(dto: Parameters<typeof mapWorkRecordFromDto>[0]): WorkLogRecord {
  const [y, m, d] = dto.workDate.split("-").map(Number);
  return mapWorkRecordFromDto(dto, new Date(y, m - 1, d));
}
