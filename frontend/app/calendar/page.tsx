"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarToolbar, type CalendarPlanMode, type CalendarViewMode } from "./CalendarToolbar";
import { TimeGrid } from "./TimeGrid";
import { StateRail } from "./StateRail";
import { DayCompareView } from "./DayCompareView";
import { WeekCompareView } from "./WeekCompareView";
import { UnscheduledActualPanel } from "./UnscheduledActualPanel";
import { WeekUnscheduledActualRow } from "./WeekUnscheduledActualRow";
import { PhaseTimeline } from "./PhaseTimeline";
import { ScheduleTimeDialog } from "./ScheduleTimeDialog";
import { CalendarBlockEditDialog, type PlanBlockEditValue } from "./CalendarBlockEditDialog";
import { LifeActualEditDialog, type LifeActualEditValue } from "./LifeActualEditDialog";
import { BatchActualEditor } from "./BatchActualEditor";
import { ReflectionModal } from "./ReflectionModal";
import type { GridBlock } from "./gridTypes";
import type { ColorMode } from "@/lib/calendarColor";
import type {
  ActivityCategory,
  CalendarRangeResponse,
  CalendarStateBlockDto,
  CalendarUnscheduledActualDto,
  LifeCategoryDto,
  PhaseWithProjectDto,
  PlanDomainType,
  ProjectDto,
} from "@/lib/api/types";
import { getCalendarRange, scheduleActual } from "@/lib/api/calendar";
import { listCategories } from "@/lib/api/categories";
import { listLifeCategories } from "@/lib/api/lifeCategories";
import { listPhaseSelector, listPhaseTimeline, listProjects } from "@/lib/api/projects";
import { createPlannedBlock, deletePlannedBlock, duplicatePlannedBlock, reschedulePlannedBlock, updatePlannedBlock } from "@/lib/api/plannedBlocks";
import { createLifeTimeEntry, deleteLifeTimeEntry, updateLifeTimeEntry } from "@/lib/api/lifeTimeEntries";
import { addDays, formatKoreanDate, formatKoreanDateRange, parseLocalDateTime, startOfDay, startOfWeek, toDateKey } from "@/lib/date";

const EMPTY_RANGE: CalendarRangeResponse = {
  planBlocks: [],
  actualBlocks: [],
  unscheduledActual: [],
  stateBlocks: [],
  attendanceContext: [],
  workRecords: [],
};

function planToGridBlock(p: CalendarRangeResponse["planBlocks"][number]): GridBlock {
  return {
    id: p.id,
    title: p.title,
    startAt: p.startAt,
    endAt: p.endAt,
    domainType: p.domainType,
    activityCategoryId: p.activityCategoryId,
    lifeCategoryId: p.lifeCategoryId,
    phaseId: p.phaseId,
    memo: p.memo,
  };
}
function actualToGridBlock(a: CalendarRangeResponse["actualBlocks"][number]): GridBlock {
  return {
    id: a.sourceId,
    sourceType: a.sourceType,
    title: a.title,
    startAt: a.startAt,
    endAt: a.endAt,
    domainType: a.domainType,
    activityCategoryId: a.activityCategoryId,
    lifeCategoryId: a.lifeCategoryId,
    phaseId: a.phaseId,
    memo: a.memo,
  };
}
function minutesToTimeInput(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

interface PlanDialogState {
  open: boolean;
  mode: "create" | "edit";
  blockId: string | null;
  initialValue: PlanBlockEditValue | null;
}
const CLOSED_PLAN_DIALOG: PlanDialogState = { open: false, mode: "create", blockId: null, initialValue: null };

interface LifeDialogState {
  open: boolean;
  mode: "create" | "edit";
  entryId: string | null;
  initialValue: LifeActualEditValue | null;
}
const CLOSED_LIFE_DIALOG: LifeDialogState = { open: false, mode: "create", entryId: null, initialValue: null };

export default function CalendarPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [planMode, setPlanMode] = useState<CalendarPlanMode>("plan");
  const [colorMode, setColorMode] = useState<ColorMode>("ACTIVITY");
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));

  const [range, setRange] = useState<CalendarRangeResponse>(EMPTY_RANGE);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const [activityCategories, setActivityCategories] = useState<ActivityCategory[]>([]);
  const [lifeCategories, setLifeCategories] = useState<LifeCategoryDto[]>([]);
  const [phaseSelector, setPhaseSelector] = useState<PhaseWithProjectDto[]>([]);
  const [phaseTimeline, setPhaseTimeline] = useState<PhaseWithProjectDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);

  const [planDialog, setPlanDialog] = useState<PlanDialogState>(CLOSED_PLAN_DIALOG);
  const [lifeDialog, setLifeDialog] = useState<LifeDialogState>(CLOSED_LIFE_DIALOG);
  const [scheduleItem, setScheduleItem] = useState<CalendarUnscheduledActualDto | null>(null);
  const [batchEditorOpen, setBatchEditorOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);

  const days = useMemo<Date[]>(() => {
    if (viewMode === "day") return [anchorDate];
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, anchorDate]);

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const fromKey = toDateKey(rangeStart);
  const toKey = toDateKey(rangeEnd);
  const anchorKey = toDateKey(anchorDate);

  const refetchRange = useCallback(async () => {
    try {
      const fetched = await getCalendarRange(fromKey, toKey);
      setRange(fetched);
      setRangeError(null);
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : "캘린더 데이터를 불러오지 못했습니다.");
    }
  }, [fromKey, toKey]);

  useEffect(() => {
    void refetchRange();
  }, [refetchRange]);

  useEffect(() => {
    void listPhaseTimeline(fromKey, toKey).then(setPhaseTimeline).catch(() => setPhaseTimeline([]));
  }, [fromKey, toKey]);

  useEffect(() => {
    void listCategories().then(setActivityCategories);
    void listLifeCategories().then(setLifeCategories);
    void listPhaseSelector().then(setPhaseSelector);
    void listProjects().then(setProjects);
  }, []);

  function handlePrev() {
    setAnchorDate((d) => addDays(d, viewMode === "day" ? -1 : -7));
  }
  function handleNext() {
    setAnchorDate((d) => addDays(d, viewMode === "day" ? 1 : 7));
  }
  function handleToday() {
    setAnchorDate(startOfDay(new Date()));
  }

  // --- Planning ---

  function handlePlanCreateRequest(date: Date, startMin: number, endMin: number) {
    setPlanDialog({
      open: true,
      mode: "create",
      blockId: null,
      initialValue: {
        domainType: "WORK",
        title: "",
        date,
        startTime: minutesToTimeInput(startMin),
        endTime: minutesToTimeInput(endMin),
        activityCategoryId: null,
        lifeCategoryId: null,
        phaseId: null,
        memo: "",
      },
    });
  }

  function handlePlanBlockClick(block: GridBlock) {
    setPlanDialog({
      open: true,
      mode: "edit",
      blockId: block.id,
      initialValue: {
        domainType: block.domainType as PlanDomainType,
        title: block.title,
        date: startOfDay(parseLocalDateTime(block.startAt)),
        startTime: block.startAt.slice(11, 16),
        endTime: block.endAt.slice(11, 16),
        activityCategoryId: block.activityCategoryId,
        lifeCategoryId: block.lifeCategoryId,
        phaseId: block.phaseId,
        memo: block.memo ?? "",
      },
    });
  }

  async function handlePlanBlockTimeChange(block: GridBlock, newStart: Date, newEnd: Date) {
    try {
      await reschedulePlannedBlock(block.id, toLocalDateTimeString(newStart), toLocalDateTimeString(newEnd));
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : "계획을 이동하지 못했습니다.");
    } finally {
      await refetchRange();
    }
  }

  async function handlePlanDialogSave(value: PlanBlockEditValue) {
    const [startHour, startMinute] = value.startTime.split(":").map(Number);
    const [endHour, endMinute] = value.endTime.split(":").map(Number);
    const startDate = new Date(value.date);
    startDate.setHours(startHour, startMinute, 0, 0);
    const endDate = new Date(value.date);
    endDate.setHours(endHour, endMinute, 0, 0);

    const input = {
      domainType: value.domainType,
      title: value.title,
      startAt: toLocalDateTimeString(startDate),
      endAt: toLocalDateTimeString(endDate),
      activityCategoryId: value.activityCategoryId,
      lifeCategoryId: value.lifeCategoryId,
      phaseId: value.phaseId,
      memo: value.memo || null,
    };

    if (planDialog.mode === "create") {
      await createPlannedBlock(input);
    } else if (planDialog.blockId) {
      await updatePlannedBlock(planDialog.blockId, input);
    }
    await refetchRange();
    setPlanDialog(CLOSED_PLAN_DIALOG);
  }

  async function handlePlanDialogDelete() {
    if (!planDialog.blockId) return;
    await deletePlannedBlock(planDialog.blockId);
    await refetchRange();
    setPlanDialog(CLOSED_PLAN_DIALOG);
  }

  async function handlePlanDialogDuplicate(date: Date) {
    if (!planDialog.blockId) return;
    await duplicatePlannedBlock(planDialog.blockId, toLocalDateTimeString(date));
    await refetchRange();
    setPlanDialog(CLOSED_PLAN_DIALOG);
  }

  // --- Actual ---

  function handleActualBlockClick(block: GridBlock) {
    if (block.sourceType === "LIFE_TIME_ENTRY") {
      setLifeDialog({
        open: true,
        mode: "edit",
        entryId: block.id,
        initialValue: {
          title: block.title,
          lifeCategoryId: block.lifeCategoryId,
          durationMinutes: Math.round((parseLocalDateTime(block.endAt).getTime() - parseLocalDateTime(block.startAt).getTime()) / 60000),
          startTime: block.startAt.slice(11, 16),
          endTime: block.endAt.slice(11, 16),
          memo: block.memo ?? "",
        },
      });
      return;
    }
    // WORK actual (WorkTimeEntry/SupplementalWorkEntry) reuses the existing
    // Work Log day editor rather than duplicating a second edit surface —
    // locked V1 policy §24.
    router.push(`/worklog?date=${toDateKey(parseLocalDateTime(block.startAt))}`);
  }

  async function handleActualBlockTimeChange(block: GridBlock, newStart: Date, newEnd: Date) {
    if (!block.sourceType) return;
    try {
      await scheduleActual(block.sourceType, block.id, minutesToTimeInput(newStart.getHours() * 60 + newStart.getMinutes()), minutesToTimeInput(newEnd.getHours() * 60 + newEnd.getMinutes()));
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : "실제 기록을 이동하지 못했습니다.");
    } finally {
      await refetchRange();
    }
  }

  function handleUnscheduledScheduleRequest(item: CalendarUnscheduledActualDto) {
    setScheduleItem(item);
  }

  async function handleScheduleTimeSave(startTime: string, endTime: string) {
    if (!scheduleItem) return;
    await scheduleActual(scheduleItem.sourceType, scheduleItem.sourceId, startTime, endTime);
    await refetchRange();
    setScheduleItem(null);
  }

  async function handleLifeDialogSave(value: LifeActualEditValue) {
    const input = {
      entryDate: anchorKey,
      lifeCategoryId: value.lifeCategoryId,
      title: value.title,
      durationMinutes: value.durationMinutes,
      startTime: value.startTime,
      endTime: value.endTime,
      memo: value.memo || null,
    };
    if (lifeDialog.mode === "create") {
      await createLifeTimeEntry(input);
    } else if (lifeDialog.entryId) {
      await updateLifeTimeEntry(lifeDialog.entryId, input);
    }
    await refetchRange();
    setLifeDialog(CLOSED_LIFE_DIALOG);
  }

  async function handleLifeDialogDelete() {
    if (!lifeDialog.entryId) return;
    await deleteLifeTimeEntry(lifeDialog.entryId);
    await refetchRange();
    setLifeDialog(CLOSED_LIFE_DIALOG);
  }

  function categoryLabelFor(domainType: "WORK" | "LIFE", categoryId: string | null): string {
    if (!categoryId) return "카테고리 없음";
    if (domainType === "WORK") return activityCategories.find((c) => c.id === categoryId)?.name ?? "카테고리 없음";
    return lifeCategories.find((c) => c.id === categoryId)?.name ?? "카테고리 없음";
  }

  // --- Derived render data ---

  const planGridBlocks = useMemo(() => range.planBlocks.map(planToGridBlock), [range.planBlocks]);
  const actualGridBlocks = useMemo(() => range.actualBlocks.map(actualToGridBlock), [range.actualBlocks]);
  const stateBlocksByDate = useMemo(() => {
    const map = new Map<string, CalendarStateBlockDto[]>();
    for (const s of range.stateBlocks) {
      const bucket = map.get(s.date);
      if (bucket) bucket.push(s);
      else map.set(s.date, [s]);
    }
    return map;
  }, [range.stateBlocks]);
  const todaysStateBlocks = stateBlocksByDate.get(anchorKey) ?? [];
  const unscheduledForDays = useMemo(
    () => range.unscheduledActual.filter((item) => days.some((d) => toDateKey(d) === item.date)),
    [range.unscheduledActual, days],
  );
  const todaysPlanBlocksForBatch = useMemo(() => range.planBlocks.filter((p) => p.startAt.slice(0, 10) === anchorKey), [range.planBlocks, anchorKey]);

  const attendanceContext = range.attendanceContext.find((a) => a.date === anchorKey);
  const workRecord = range.workRecords.find((w) => w.date === anchorKey);

  const label = viewMode === "day" ? formatKoreanDate(anchorDate) : formatKoreanDateRange(days[0], days[days.length - 1]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col bg-white dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">캘린더</h1>
      </header>

      <PhaseTimeline phases={phaseTimeline} rangeStart={rangeStart} rangeEnd={addDays(rangeEnd, 1)} selectedDate={anchorDate} />

      <CalendarToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        planMode={planMode}
        onPlanModeChange={setPlanMode}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        label={label}
      />

      <div className="flex flex-wrap items-center gap-3 px-4 pb-2 text-xs text-zinc-500">
        {planMode !== "actual" && attendanceContext && (
          <span>
            근무 시간(계획){viewMode === "week" ? ` · ${label}` : ""} {attendanceContext.plannedNetWorkMinutes ? `${Math.floor(attendanceContext.plannedNetWorkMinutes / 60)}시간 ${attendanceContext.plannedNetWorkMinutes % 60}분` : "-"}
          </span>
        )}
        {planMode !== "plan" && workRecord && (
          <span>
            근무 시간(실제){viewMode === "week" ? ` · ${label}` : ""} {workRecord.clockInAt?.slice(11, 16) ?? "-"} ~ {workRecord.clockOutAt?.slice(11, 16) ?? "-"}
          </span>
        )}
        {viewMode === "day" && planMode === "actual" && (
          <button
            type="button"
            onClick={() => setBatchEditorOpen(true)}
            disabled={todaysPlanBlocksForBatch.length === 0}
            className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            오늘 계획 전체 실행으로 가져오기
          </button>
        )}
        {viewMode === "day" && planMode === "compare" && (
          <button
            type="button"
            onClick={() => setReflectionOpen(true)}
            className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            회고 열기 →
          </button>
        )}
      </div>

      {rangeError && <p className="px-4 py-1 text-xs text-red-600">{rangeError}</p>}

      <div className="flex-1 px-4 pb-6 pt-1">
        {viewMode === "day" && planMode === "plan" && (
          <div className="mx-auto max-w-[720px]">
            <TimeGrid
              days={days}
              blocks={planGridBlocks}
              colorMode={colorMode}
              phases={phaseSelector}
              projects={projects}
              interactionMode="plan"
              onCreateRequest={handlePlanCreateRequest}
              onBlockClick={handlePlanBlockClick}
              onBlockTimeChange={handlePlanBlockTimeChange}
            />
          </div>
        )}

        {viewMode === "day" && planMode === "actual" && (
          <div className="mx-auto flex max-w-[720px] flex-col gap-2">
            <div className="flex gap-1.5">
              {todaysStateBlocks.length > 0 && <StateRail stateBlocks={todaysStateBlocks} />}
              <div className="min-w-0 flex-1">
                <TimeGrid
                  days={days}
                  blocks={actualGridBlocks}
                  colorMode={colorMode}
                  phases={phaseSelector}
                  projects={projects}
                  interactionMode="actual"
                  onBlockClick={handleActualBlockClick}
                  onBlockTimeChange={handleActualBlockTimeChange}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-zinc-500">시간 미지정</span>
              <UnscheduledActualPanel items={unscheduledForDays} onScheduleRequest={handleUnscheduledScheduleRequest} />
              <button
                type="button"
                onClick={() => setLifeDialog({ open: true, mode: "create", entryId: null, initialValue: null })}
                className="ml-auto shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                + 생활 기록 추가
              </button>
            </div>
          </div>
        )}

        {viewMode === "day" && planMode === "compare" && (
          <DayCompareView
            date={anchorDate}
            planBlocks={planGridBlocks}
            actualBlocks={actualGridBlocks}
            stateBlocks={todaysStateBlocks}
            colorMode={colorMode}
            phases={phaseSelector}
            projects={projects}
            onPlanBlockClick={handlePlanBlockClick}
            onActualBlockClick={handleActualBlockClick}
            onActualTimeChange={handleActualBlockTimeChange}
          />
        )}

        {viewMode === "week" && planMode === "plan" && (
          <TimeGrid
            days={days}
            blocks={planGridBlocks}
            colorMode={colorMode}
            phases={phaseSelector}
            projects={projects}
            interactionMode="plan"
            onCreateRequest={handlePlanCreateRequest}
            onBlockClick={handlePlanBlockClick}
            onBlockTimeChange={handlePlanBlockTimeChange}
          />
        )}

        {viewMode === "week" && planMode === "actual" && (
          <div className="flex flex-col gap-2">
            <TimeGrid
              days={days}
              blocks={actualGridBlocks}
              colorMode={colorMode}
              phases={phaseSelector}
              projects={projects}
              interactionMode="actual"
              onBlockClick={handleActualBlockClick}
              onBlockTimeChange={handleActualBlockTimeChange}
              stateBlocksByDate={stateBlocksByDate}
              showWeekStateStrip
            />
            <WeekUnscheduledActualRow days={days} items={unscheduledForDays} onScheduleRequest={handleUnscheduledScheduleRequest} />
          </div>
        )}

        {viewMode === "week" && planMode === "compare" && (
          <WeekCompareView
            days={days}
            planBlocks={planGridBlocks}
            actualBlocks={actualGridBlocks}
            stateBlocksByDate={stateBlocksByDate}
            colorMode={colorMode}
            phases={phaseSelector}
            projects={projects}
            onPlanBlockClick={handlePlanBlockClick}
            onActualBlockClick={handleActualBlockClick}
            onActualTimeChange={handleActualBlockTimeChange}
          />
        )}
      </div>

      <CalendarBlockEditDialog
        open={planDialog.open}
        mode={planDialog.mode}
        initialValue={planDialog.initialValue}
        activityCategories={activityCategories}
        lifeCategories={lifeCategories}
        phases={phaseSelector}
        onSave={handlePlanDialogSave}
        onDelete={planDialog.mode === "edit" ? handlePlanDialogDelete : undefined}
        onDuplicate={planDialog.mode === "edit" ? handlePlanDialogDuplicate : undefined}
        onClose={() => setPlanDialog(CLOSED_PLAN_DIALOG)}
      />

      <LifeActualEditDialog
        open={lifeDialog.open}
        mode={lifeDialog.mode}
        date={anchorKey}
        initialValue={lifeDialog.initialValue}
        lifeCategories={lifeCategories}
        onSave={handleLifeDialogSave}
        onDelete={lifeDialog.mode === "edit" ? handleLifeDialogDelete : undefined}
        onClose={() => setLifeDialog(CLOSED_LIFE_DIALOG)}
      />

      <ScheduleTimeDialog item={scheduleItem} onSave={handleScheduleTimeSave} onClose={() => setScheduleItem(null)} />

      <BatchActualEditor
        open={batchEditorOpen}
        date={anchorDate}
        sourcePlans={todaysPlanBlocksForBatch}
        categoryLabelFor={categoryLabelFor}
        onClose={() => setBatchEditorOpen(false)}
        onCommitted={refetchRange}
      />

      <ReflectionModal open={reflectionOpen} date={anchorKey} onClose={() => setReflectionOpen(false)} />
    </div>
  );
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
