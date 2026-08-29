"use client";

import { useEffect, useRef, useState } from "react";
import { deleteAttendancePlan, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import type { AttendancePlanDto, PlannableAttendanceStatus } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, formatKoreanDateWithWeekday } from "./format";
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

interface AttendancePlanPopoverProps {
  date: Date;
  existingPlan: AttendancePlanDto | null;
  criteria: StartTimeCriterion[];
  /** Viewport-relative anchor rect (the clicked cell) — the popover
   *  positions itself just below/beside it, clamped to stay on-screen. */
  anchorRect: DOMRect;
  onClose: () => void;
  onSaved: (plan: AttendancePlanDto) => void;
  onDeleted: (date: Date) => void;
}

// Quick Plan Popover (attendance management batch, §12) — deliberately
// small: no range planning, no recurring pattern builder. Opening it never
// writes anything; only Save/Delete persist. Existing plan preloads.
export function AttendancePlanPopover({ date, existingPlan, criteria, anchorRect, onClose, onSaved, onDeleted }: AttendancePlanPopoverProps) {
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

  const POPOVER_WIDTH = 280;
  const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - POPOVER_WIDTH - 8);
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 320);

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
