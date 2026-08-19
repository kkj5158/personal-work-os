"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ViewSwitcher } from "./ViewSwitcher";
import { WorkPlanPanel } from "./WorkPlanPanel";
import { PlanningGrid } from "./PlanningGrid";
import { BlockEditDialog, type BlockEditValue } from "./BlockEditDialog";
import { createPlannedBlock, deletePlannedBlock, listPlannedBlocks, updatePlannedBlock } from "@/lib/api/plannedBlocks";
import { createCategory, listCategories } from "@/lib/api/categories";
import { getEffectiveWorkPlan, getWorkScheduleOverride, upsertWorkScheduleOverride } from "@/lib/api/workPlan";
import { ApiError } from "@/lib/api/client";
import type {
  EffectiveWorkSchedule,
  PlannedTimeBlock,
  TimeBlockCategory,
  WorkScheduleOverride,
  WorkScheduleOverrideInput,
} from "@/lib/api/types";
import { addDays, formatDayHeader, parseLocalDateTime, startOfDay, startOfWeek, toDateKey, toLocalDateTimeString } from "@/lib/date";

type ViewMode = "day" | "week";

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  blockId: string | null;
  initialValue: BlockEditValue | null;
}

const CLOSED_DIALOG: DialogState = { open: false, mode: "create", blockId: null, initialValue: null };

export default function PlanningPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));

  const [blocks, setBlocks] = useState<PlannedTimeBlock[]>([]);
  const [categories, setCategories] = useState<TimeBlockCategory[]>([]);

  const [effective, setEffective] = useState<EffectiveWorkSchedule | null>(null);
  const [override, setOverride] = useState<WorkScheduleOverride | null>(null);
  const [workPlanLoading, setWorkPlanLoading] = useState(true);
  const [workPlanError, setWorkPlanError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);
  const [gridError, setGridError] = useState<string | null>(null);

  const days = useMemo<Date[]>(() => {
    if (viewMode === "day") return [anchorDate];
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, anchorDate]);

  const range = useMemo(() => {
    const rangeStart = viewMode === "day" ? startOfDay(anchorDate) : startOfWeek(anchorDate);
    const rangeEnd = addDays(rangeStart, viewMode === "day" ? 1 : 7);
    return { rangeStart, rangeEnd };
  }, [viewMode, anchorDate]);

  const refetchBlocks = useCallback(async () => {
    try {
      const fetched = await listPlannedBlocks(toLocalDateTimeString(range.rangeStart), toLocalDateTimeString(range.rangeEnd));
      setBlocks(fetched);
      setGridError(null);
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Failed to load planned blocks");
    }
  }, [range]);

  const refetchCategories = useCallback(async () => {
    const fetched = await listCategories();
    setCategories(fetched);
  }, []);

  const refetchWorkPlan = useCallback(async () => {
    setWorkPlanLoading(true);
    setWorkPlanError(null);
    const dateKey = toDateKey(anchorDate);
    try {
      const [eff, ovr] = await Promise.all([getEffectiveWorkPlan(dateKey), getWorkScheduleOverride(dateKey)]);
      setEffective(eff);
      setOverride(ovr);
    } catch (e) {
      setEffective(null);
      setOverride(null);
      setWorkPlanError(e instanceof ApiError ? e.message : "Failed to load work plan");
    } finally {
      setWorkPlanLoading(false);
    }
  }, [anchorDate]);

  useEffect(() => {
    refetchBlocks();
  }, [refetchBlocks]);

  useEffect(() => {
    refetchCategories();
  }, [refetchCategories]);

  useEffect(() => {
    refetchWorkPlan();
  }, [refetchWorkPlan]);

  function handlePrev() {
    setAnchorDate((d) => addDays(d, viewMode === "day" ? -1 : -7));
  }
  function handleNext() {
    setAnchorDate((d) => addDays(d, viewMode === "day" ? 1 : 7));
  }
  function handleToday() {
    setAnchorDate(startOfDay(new Date()));
  }

  function minutesToTimeInput(min: number): string {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  function handleCreateRequest(date: Date, startMinutes: number, endMinutes: number) {
    setDialog({
      open: true,
      mode: "create",
      blockId: null,
      initialValue: {
        title: "",
        date,
        startTime: minutesToTimeInput(startMinutes),
        endTime: minutesToTimeInput(endMinutes),
        categoryId: null,
        memo: "",
      },
    });
  }

  function handleBlockClick(block: PlannedTimeBlock) {
    setDialog({
      open: true,
      mode: "edit",
      blockId: block.id,
      initialValue: {
        title: block.title,
        date: startOfDay(parseLocalDateTime(block.startAt)),
        startTime: block.startAt.slice(11, 16),
        endTime: block.endAt.slice(11, 16),
        categoryId: block.categoryId,
        memo: block.memo ?? "",
      },
    });
  }

  async function handleBlockTimeChange(block: PlannedTimeBlock, newStart: Date, newEnd: Date) {
    try {
      await updatePlannedBlock(block.id, {
        title: block.title,
        startAt: toLocalDateTimeString(newStart),
        endAt: toLocalDateTimeString(newEnd),
        categoryId: block.categoryId,
        memo: block.memo,
      });
    } catch (e) {
      setGridError(e instanceof Error ? e.message : "Failed to move block");
    } finally {
      await refetchBlocks();
    }
  }

  async function handleDialogSave(value: BlockEditValue) {
    const [startHour, startMinute] = value.startTime.split(":").map(Number);
    const [endHour, endMinute] = value.endTime.split(":").map(Number);
    const startDate = new Date(value.date);
    startDate.setHours(startHour, startMinute, 0, 0);
    const endDate = new Date(value.date);
    endDate.setHours(endHour, endMinute, 0, 0);

    const input = {
      title: value.title,
      startAt: toLocalDateTimeString(startDate),
      endAt: toLocalDateTimeString(endDate),
      categoryId: value.categoryId,
      memo: value.memo || null,
    };

    if (dialog.mode === "create") {
      await createPlannedBlock(input);
    } else if (dialog.blockId) {
      await updatePlannedBlock(dialog.blockId, input);
    }
    await refetchBlocks();
    setDialog(CLOSED_DIALOG);
  }

  async function handleDialogDelete() {
    if (!dialog.blockId) return;
    await deletePlannedBlock(dialog.blockId);
    await refetchBlocks();
    setDialog(CLOSED_DIALOG);
  }

  async function handleCreateCategory(name: string, parentId: string | null) {
    const created = await createCategory({ name, parentId });
    await refetchCategories();
    return created;
  }

  async function handleWorkPlanSave(input: WorkScheduleOverrideInput) {
    const dateKey = toDateKey(anchorDate);
    await upsertWorkScheduleOverride(dateKey, input);
    await refetchWorkPlan();
  }

  const label = viewMode === "day" ? formatDayHeader(anchorDate) : `Week of ${formatDayHeader(days[0])}`;

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Planning</h1>
      </header>

      <ViewSwitcher
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        label={label}
      />

      <WorkPlanPanel
        effective={effective}
        override={override}
        loading={workPlanLoading}
        error={workPlanError}
        onSave={handleWorkPlanSave}
      />

      {gridError && <p className="px-4 py-1 text-xs text-red-600">{gridError}</p>}

      <div className="flex-1 px-4 pb-6 pt-3">
        <PlanningGrid
          days={days}
          blocks={blocks}
          onCreateRequest={handleCreateRequest}
          onBlockClick={handleBlockClick}
          onBlockTimeChange={handleBlockTimeChange}
        />
      </div>

      <BlockEditDialog
        open={dialog.open}
        mode={dialog.mode}
        initialValue={dialog.initialValue}
        categories={categories}
        onSave={handleDialogSave}
        onDelete={dialog.mode === "edit" ? handleDialogDelete : undefined}
        onClose={() => setDialog(CLOSED_DIALOG)}
        onCreateCategory={handleCreateCategory}
      />
    </div>
  );
}
