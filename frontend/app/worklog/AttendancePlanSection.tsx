"use client";

import { useState } from "react";
import { deleteAttendancePlan, upsertAttendancePlan } from "@/lib/api/attendancePlans";
import type { AttendancePlanDto, PlannableAttendanceStatus } from "@/lib/api/types";
import { requiresCriterion } from "./attendance";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE, parseHoursMinutes } from "./format";
import type { StartTimeCriterion } from "./startTimeCriterion";
import { toApiDateKey } from "./mapping";

const STATUS_LABELS: Record<PlannableAttendanceStatus, string> = {
  WORK: "근무",
  HALF_DAY: "반차",
  PAID_LEAVE: "연차",
  DAY_OFF: "휴일",
};

const STATUS_ORDER: PlannableAttendanceStatus[] = ["WORK", "HALF_DAY", "PAID_LEAVE", "DAY_OFF"];

// Canonical predicate re-exported for existing call sites
// (DateDetailDialog/AttendanceCalendar) — the real definition now lives in
// attendance.ts alongside its isWorkdayStatus sibling, so plain-Node test
// scripts (which can't parse this file's own JSX) can import it directly.
export { requiresCriterion };

function minutesToInputText(minutes: number | null): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
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
//
// Attendance follow-up QA round 2 (§8-11): planned 실근무 (plannedNetWorkMinutes)
// lives here as a local draft that is NEVER reset just because the user
// toggles the status buttons within the same open session — only the
// *visibility* of the field (and of the sibling PlannedTimeBlock editor) is
// status-driven, via requiresCriterion. Save always resends whatever the
// draft currently holds, even while it's hidden (dormant) behind a
// non-work status, so a work → 연차 → save round-trip never destroys it —
// the backend stores plannedNetWorkMinutes verbatim regardless of status.
export function AttendancePlanSection({ date, existingPlan, criteria, editable, onSaved, onDeleted, onStatusChange }: AttendancePlanSectionProps) {
  const initialStatus = existingPlan?.plannedStatus ?? "WORK";
  const [status, setStatus] = useState<PlannableAttendanceStatus>(initialStatus);
  const [criterionId, setCriterionId] = useState<string | null>(() => {
    if (existingPlan?.startTimeCriterionId != null) return existingPlan.startTimeCriterionId;
    if (!requiresCriterion(initialStatus)) return null;
    const activeCriteria = criteria.filter((c) => c.active);
    return (activeCriteria.find((c) => c.isDefault) ?? activeCriteria[0])?.id ?? null;
  });
  // Dormant-safe draft — initialized from whatever is currently stored
  // (even if the saved status is non-work, i.e. dormant) and never cleared
  // by a status toggle. Text field, matching the established Work OS
  // duration-input convention (WorkTimeEntryEditor's "HH:MM" free-text
  // pattern via parseHoursMinutes) rather than a pair of number spinners.
  const [netWorkText, setNetWorkText] = useState(() => minutesToInputText(existingPlan?.plannedNetWorkMinutes ?? null));
  const [netWorkError, setNetWorkError] = useState<string | null>(null);
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
  const allowsWorkPlanning = requiresCriterion(status);

  async function handleSave() {
    if (allowsWorkPlanning && !criterionId) {
      setError("출근 기준을 선택해 주세요.");
      return;
    }
    const trimmedNetWork = netWorkText.trim();
    const plannedNetWorkMinutes = trimmedNetWork === "" ? null : parseHoursMinutes(trimmedNetWork);
    if (trimmedNetWork !== "" && plannedNetWorkMinutes == null) {
      setNetWorkError("시간 형식이 올바르지 않습니다 (예: 06:00).");
      return;
    }
    setSaving(true);
    setError(null);
    setNetWorkError(null);
    try {
      const saved = await upsertAttendancePlan(toApiDateKey(date), {
        plannedStatus: status,
        startTimeCriterionId: allowsWorkPlanning ? criterionId : null,
        // Sent verbatim regardless of `status` — a non-work save must still
        // round-trip whatever dormant value is currently in the draft,
        // never force it to null just because the field is hidden right now.
        plannedNetWorkMinutes,
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
    // never a button to retroactively create one. Dormant net-work-time
    // data (a non-work status that happens to have a stored value) is not
    // shown here either — read-only display follows the same
    // effective-vs-dormant rule as the editable form.
    if (!existingPlan) {
      return <p className="text-sm text-fg-muted">계획 없음</p>;
    }
    const wasWorkPlanning = requiresCriterion(existingPlan.plannedStatus);
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-fg-default">{STATUS_LABELS[existingPlan.plannedStatus]}</span>
        {appliedCriterionName && <span className="text-xs text-fg-muted">출근 기준 · {appliedCriterionName}</span>}
        {wasWorkPlanning && existingPlan.plannedNetWorkMinutes != null && (
          <span className="text-xs text-fg-muted">계획 실근무 · {minutesToInputText(existingPlan.plannedNetWorkMinutes)}</span>
        )}
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

      {allowsWorkPlanning && (
        <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`plan-net-work-${toApiDateKey(date)}`} className="text-xs text-fg-muted">
              계획 실근무
            </label>
            <input
              id={`plan-net-work-${toApiDateKey(date)}`}
              type="text"
              inputMode="numeric"
              placeholder="예: 06:00"
              value={netWorkText}
              onChange={(e) => {
                setNetWorkText(e.target.value);
                setNetWorkError(null);
              }}
              aria-invalid={!!netWorkError}
              aria-describedby={netWorkError ? `plan-net-work-error-${toApiDateKey(date)}` : undefined}
              className={`h-9 rounded-md border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${
                netWorkError ? "border-danger-fg" : "border-control-border"
              } ${FOCUS_VISIBLE}`}
            />
            {netWorkError && (
              <span id={`plan-net-work-error-${toApiDateKey(date)}`} className="text-xs text-danger-fg">
                {netWorkError}
              </span>
            )}
          </div>
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
