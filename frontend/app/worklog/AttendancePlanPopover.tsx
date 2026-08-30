"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon } from "@primer/octicons-react";
import { parseLocalDateTime, toLocalDateTimeString } from "@/lib/date";
import { deleteAttendancePlan, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import { createPlannedBlock, deletePlannedBlock } from "@/lib/api/plannedBlocks";
import type { ActivityCategory, AttendancePlanDto, PlannableAttendanceStatus, PlannedTimeBlock } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, formatHoursMinutes, formatKoreanDateWithWeekday, parseTimeOfDayMinutes } from "./format";
import { TimeTextInput } from "./TimeTextInput";
import type { StartTimeCriterion } from "./startTimeCriterion";
import { toApiDateKey } from "./mapping";

const STATUS_LABELS: Record<PlannableAttendanceStatus, string> = {
  WORK: "근무",
  HALF_DAY: "반차",
  PAID_LEAVE: "연차",
  DAY_OFF: "휴일",
};

const STATUS_ORDER: PlannableAttendanceStatus[] = ["WORK", "HALF_DAY", "PAID_LEAVE", "DAY_OFF"];

function requiresCriterion(status: PlannableAttendanceStatus): boolean {
  return status === "WORK" || status === "HALF_DAY";
}

function combineDateAndMinutes(date: Date, minutes: number): Date {
  const combined = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  combined.setMinutes(minutes);
  return combined;
}

function blockMinutes(block: PlannedTimeBlock): number {
  return Math.round((parseLocalDateTime(block.endAt).getTime() - parseLocalDateTime(block.startAt).getTime()) / 60000);
}

interface AttendancePlanPopoverProps {
  date: Date;
  existingPlan: AttendancePlanDto | null;
  criteria: StartTimeCriterion[];
  /** Shared work-category taxonomy (§11) — the planned-block editor below
   *  never uses a second "planning categories" list. */
  categories: ActivityCategory[];
  /** Already scoped to this popover's own date by the caller. */
  plannedBlocks: PlannedTimeBlock[];
  /** Viewport-relative anchor rect (the clicked cell) — the popover
   *  positions itself just below/beside it, clamped to stay on-screen. */
  anchorRect: DOMRect;
  onClose: () => void;
  onSaved: (plan: AttendancePlanDto) => void;
  onDeleted: (date: Date) => void;
  onBlockUpserted: (block: PlannedTimeBlock) => void;
  onBlockDeleted: (id: string) => void;
}

// Quick Plan Popover (attendance management batch, §12) — deliberately
// small: no range planning, no recurring pattern builder. Opening it never
// writes anything; only Save/Delete persist. Existing plan preloads.
export function AttendancePlanPopover({
  date,
  existingPlan,
  criteria,
  categories,
  plannedBlocks,
  anchorRect,
  onClose,
  onSaved,
  onDeleted,
  onBlockUpserted,
  onBlockDeleted,
}: AttendancePlanPopoverProps) {
  const initialStatus = existingPlan?.plannedStatus ?? "WORK";
  const [status, setStatus] = useState<PlannableAttendanceStatus>(initialStatus);
  const [criterionId, setCriterionId] = useState<string | null>(() => {
    if (existingPlan?.startTimeCriterionId != null) return existingPlan.startTimeCriterionId;
    if (!requiresCriterion(initialStatus)) return null;
    const activeCriteria = criteria.filter((c) => c.active);
    return (activeCriteria.find((c) => c.isDefault) ?? activeCriteria[0])?.id ?? null;
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // §12 compact planned-work editor — edits the SAME canonical
  // PlannedTimeBlock records the future Planning UI will read/write; never
  // a separate duplicate total. Local-only draft fields for the add form.
  const [blockTitle, setBlockTitle] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockCategoryId, setBlockCategoryId] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picks a default criterion when switching into WORK/HALF_DAY with none
  // chosen yet — prefers the user's default active criterion, same
  // convention Today's own auto-apply uses. Done directly in the status
  // button's click handler (below) rather than an effect, since it's a
  // response to a specific user action, not a value derived from props.
  function selectStatus(next: PlannableAttendanceStatus) {
    setStatus(next);
    if (requiresCriterion(next) && criterionId == null) {
      const activeCriteria = criteria.filter((c) => c.active);
      const preferred = activeCriteria.find((c) => c.isDefault) ?? activeCriteria[0];
      if (preferred) setCriterionId(preferred.id);
    }
  }

  const selectableCriteria = criteria.filter((c) => c.active || c.id === existingPlan?.startTimeCriterionId);

  const sortedBlocks = [...plannedBlocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const totalBlockMinutes = sortedBlocks.reduce((sum, b) => sum + blockMinutes(b), 0);
  const latestBlockEnd = sortedBlocks.reduce((latest, b) => (b.endAt > latest ? b.endAt : latest), sortedBlocks[0]?.endAt ?? "");

  const POPOVER_WIDTH = 320;
  const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - POPOVER_WIDTH - 8);
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 480);

  async function handleAddBlock() {
    const trimmedTitle = blockTitle.trim();
    if (!trimmedTitle) {
      setBlockError("업무 내용을 입력해 주세요.");
      return;
    }
    const startMinutes = parseTimeOfDayMinutes(blockStart);
    const endMinutes = parseTimeOfDayMinutes(blockEnd);
    if (startMinutes == null || endMinutes == null) {
      setBlockError("시간 형식이 올바르지 않습니다 (예: 09:30).");
      return;
    }
    if (endMinutes <= startMinutes) {
      setBlockError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }

    setAddingBlock(true);
    setBlockError(null);
    try {
      const created = await createPlannedBlock({
        title: trimmedTitle,
        startAt: toLocalDateTimeString(combineDateAndMinutes(date, startMinutes)),
        endAt: toLocalDateTimeString(combineDateAndMinutes(date, endMinutes)),
        categoryId: blockCategoryId,
        memo: null,
      });
      onBlockUpserted(created);
      setBlockTitle("");
      setBlockStart("");
      setBlockEnd("");
    } catch (err) {
      setBlockError(describeApiError(err, "업무 블록을 추가하지 못했습니다."));
    } finally {
      setAddingBlock(false);
    }
  }

  async function handleDeleteBlock(id: string) {
    setDeletingBlockId(id);
    setBlockError(null);
    try {
      await deletePlannedBlock(id);
      onBlockDeleted(id);
    } catch (err) {
      setBlockError(describeApiError(err, "업무 블록을 삭제하지 못했습니다."));
    } finally {
      setDeletingBlockId(null);
    }
  }

  async function handleSave() {
    if (requiresCriterion(status) && !criterionId) {
      setError("출근 기준을 선택해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertAttendancePlan(toApiDateKey(date), {
        plannedStatus: status,
        startTimeCriterionId: requiresCriterion(status) ? criterionId : null,
      });
      onSaved(saved);
    } catch (err) {
      setError(describeApiError(err, "계획을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAttendancePlan(toApiDateKey(date));
      onDeleted(date);
    } catch (err) {
      setError(describeApiError(err, "계획을 삭제하지 못했습니다."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="근무 계획"
      className="fixed z-50 flex flex-col gap-3 rounded-md border border-border-default bg-surface-default p-4 shadow-md"
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      <p className="text-sm font-semibold text-fg-default">{formatKoreanDateWithWeekday(date)}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">계획 상태</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStatus(s)}
              className={`h-8 rounded-md border px-2.5 text-xs font-medium ${
                status === s
                  ? "border-primary-emphasis bg-primary-subtle text-primary-fg"
                  : "border-control-border bg-surface-default text-fg-default hover:bg-canvas-subtle"
              } ${FOCUS_VISIBLE}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {requiresCriterion(status) && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-criterion" className="text-xs text-fg-muted">
            출근 기준
          </label>
          <select
            id="plan-criterion"
            value={criterionId ?? ""}
            onChange={(e) => setCriterionId(e.target.value === "" ? null : e.target.value)}
            className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          >
            <option value="">선택 안 함</option>
            {selectableCriteria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.startTime.slice(0, 5)}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-danger-fg">{error}</p>}

      {requiresCriterion(status) && (
        <div className="flex flex-col gap-2 border-t border-border-default pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">계획 업무 블록</span>
            {sortedBlocks.length > 0 && (
              <span className="text-xs font-medium text-fg-default">계획 업무시간 {formatHoursMinutes(totalBlockMinutes)}</span>
            )}
          </div>

          {sortedBlocks.length > 0 && (
            <>
              <p className="text-[11px] text-fg-muted">
                예정 시간 {sortedBlocks[0].startAt.slice(11, 16)} ~ {latestBlockEnd.slice(11, 16)}
              </p>
              <ul className="flex flex-col gap-1">
                {sortedBlocks.map((b) => {
                  const category = categories.find((c) => c.id === b.categoryId);
                  return (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border-default px-2 py-1 text-xs"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-fg-default">{b.title}</span>
                        <span className="text-fg-muted">
                          {b.startAt.slice(11, 16)}–{b.endAt.slice(11, 16)}
                          {category && ` · ${category.name}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(b.id)}
                        disabled={deletingBlockId === b.id}
                        aria-label={`${b.title} 블록 삭제`}
                        className={`shrink-0 rounded p-1 text-fg-muted hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                      >
                        <TrashIcon size={12} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              placeholder="업무 내용"
              aria-label="업무 블록 내용"
              className={`h-8 rounded-md border border-control-border bg-control-bg px-2 text-xs text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
            <div className="flex items-center gap-1.5">
              <TimeTextInput value={blockStart} onChange={setBlockStart} aria-label="블록 시작 시간" />
              <span className="text-xs text-fg-muted">~</span>
              <TimeTextInput value={blockEnd} onChange={setBlockEnd} aria-label="블록 종료 시간" />
            </div>
            <select
              value={blockCategoryId ?? ""}
              onChange={(e) => setBlockCategoryId(e.target.value === "" ? null : e.target.value)}
              aria-label="업무 블록 카테고리"
              className={`h-8 rounded-md border border-control-border bg-control-bg px-2 text-xs text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            >
              <option value="">카테고리 없음</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `— ${c.name}` : c.name}
                </option>
              ))}
            </select>
            {blockError && <p className="text-xs text-danger-fg">{blockError}</p>}
            <button
              type="button"
              onClick={handleAddBlock}
              disabled={addingBlock}
              className={`h-8 rounded-md border border-control-border bg-surface-default text-xs font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
            >
              {addingBlock ? "추가 중…" : "+ 블록 추가"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {existingPlan ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className={`h-8 rounded-md bg-primary-emphasis px-3 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
