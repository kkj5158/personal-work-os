"use client";

import { useState } from "react";
import { deleteAttendancePlan, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import type { AttendancePlanDto, PlannableAttendanceStatus } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import type { StartTimeCriterion } from "./startTimeCriterion";
import { toApiDateKey } from "./mapping";

const STATUS_LABELS: Record<PlannableAttendanceStatus, string> = {
  WORK: "근무",
  HALF_DAY: "반차",
  PAID_LEAVE: "연차",
  DAY_OFF: "휴일",
};

const STATUS_ORDER: PlannableAttendanceStatus[] = ["WORK", "HALF_DAY", "PAID_LEAVE", "DAY_OFF"];

export function requiresCriterion(status: PlannableAttendanceStatus): boolean {
  return status === "WORK" || status === "HALF_DAY";
}

interface AttendancePlanSectionProps {
  date: Date;
  existingPlan: AttendancePlanDto | null;
  criteria: StartTimeCriterion[];
  /** false for a past date — historical AttendancePlan is read-only, no
   *  status buttons, no Save/Delete (§13 past-plan immutability). */
  editable: boolean;
  onSaved: (plan: AttendancePlanDto) => void;
  onDeleted: (date: Date) => void;
  /** Reports the live draft status up to the parent dialog so sibling
   *  sections (the block editor's "requires criterion" gate, the collapsed
   *  summary line) can stay in sync without lifting the whole draft. */
  onStatusChange?: (status: PlannableAttendanceStatus) => void;
}

// 출결 계획 section (§11.B) — extracted from the old Quick Plan Popover so
// the Date Detail Dialog can compose it alongside the actual-record summary
// and the planned-work-block editor. Source of truth is AttendancePlan;
// opening this section never writes anything, only Save/Delete persist.
export function AttendancePlanSection({ date, existingPlan, criteria, editable, onSaved, onDeleted, onStatusChange }: AttendancePlanSectionProps) {
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

  function selectStatus(next: PlannableAttendanceStatus) {
    setStatus(next);
    onStatusChange?.(next);
    if (requiresCriterion(next) && criterionId == null) {
      const activeCriteria = criteria.filter((c) => c.active);
      const preferred = activeCriteria.find((c) => c.isDefault) ?? activeCriteria[0];
      if (preferred) setCriterionId(preferred.id);
    }
  }

  const selectableCriteria = criteria.filter((c) => c.active || c.id === existingPlan?.startTimeCriterionId);
  const appliedCriterionName = existingPlan?.startTimeCriterionId
    ? (criteria.find((c) => c.id === existingPlan.startTimeCriterionId)?.name ?? "알 수 없는 기준")
    : null;

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

  if (!editable) {
    // Historical plan — read-only, never a create/edit/delete affordance
    // (§13). No plan ever having existed shows a plain "계획 없음" state,
    // never a button to retroactively create one.
    if (!existingPlan) {
      return <p className="text-sm text-fg-muted">계획 없음</p>;
    }
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-fg-default">{STATUS_LABELS[existingPlan.plannedStatus]}</span>
        {appliedCriterionName && <span className="text-xs text-fg-muted">출근 기준 · {appliedCriterionName}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
          <label htmlFor={`plan-criterion-${toApiDateKey(date)}`} className="text-xs text-fg-muted">
            출근 기준
          </label>
          <select
            id={`plan-criterion-${toApiDateKey(date)}`}
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
            {deleting ? "삭제 중…" : "계획 삭제"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting}
          className={`h-8 rounded-md bg-primary-emphasis px-3 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
        >
          {saving ? "저장 중…" : "계획 저장"}
        </button>
      </div>
    </div>
  );
}

export { STATUS_LABELS, STATUS_ORDER };
