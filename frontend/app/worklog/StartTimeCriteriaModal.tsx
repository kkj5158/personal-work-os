"use client";

import { useState } from "react";
import { PlusIcon } from "@primer/octicons-react";
import { createStartTimeCriterion, setDefaultStartTimeCriterion, updateStartTimeCriterion } from "@/lib/api/startTimeCriteria";
import { commitCriterionResult, planSaveAction, type DraftCriterion } from "./criteriaSave";
import { describeApiError } from "./errorMessages";
import { TimeTextInput } from "./TimeTextInput";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, parseTimeOfDayMinutes } from "./format";
import { mapCriterionFromDto, mapCriterionToInput } from "./mapping";
import { type StartTimeCriterion } from "./startTimeCriterion";

const TITLE_ID = "worklog-start-time-criteria-title";

interface RowErrors {
  name?: string;
  startTime?: string;
  graceMinutes?: string;
}

const MAX_GRACE_MINUTES = 120;

interface StartTimeCriteriaModalProps {
  criteria: StartTimeCriterion[];
  /** Called once every changed row has been persisted, with the full
   *  refreshed list (real ids for anything created this session). */
  onSaved: (criteria: StartTimeCriterion[]) => void;
  onClose: () => void;
}

function toDraft(criterion: StartTimeCriterion): DraftCriterion {
  return { ...criterion, isNew: false };
}

// Criteria-management modal: edits a local draft only — page.tsx's
// committed `criteria` list is untouched until 저장 persists every changed
// row against the real backend (create for a still-`isNew` row, update for
// anything else whose fields actually changed) and reports the refreshed
// list back via `onSaved`. Every other exit path (취소/Escape/overlay, all
// funneled through WorkLogModal's single onClose) simply unmounts this
// component, discarding draftCriteria along with it — nothing is persisted
// unless 저장 is explicitly clicked. This unit only manages the reusable
// criteria list itself: it never reads or writes any WorkLogRecord, so
// existing appliedStartTime snapshots (and the lateness they derive) are
// structurally unreachable from here — the backend's own snapshot rule is
// what keeps them from retroactively changing.
export function StartTimeCriteriaModal({ criteria, onSaved, onClose }: StartTimeCriteriaModalProps) {
  const [draftCriteria, setDraftCriteria] = useState<DraftCriterion[]>(() => criteria.map(toDraft));
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // What handleSave currently believes is already persisted, keyed by the
  // *current* row id — starts from the committed `criteria` prop but is
  // updated after every individual create/update succeeds, not just once
  // at the very end. handleSave saves sequentially (row A, then B, then
  // C, ...); if C fails after A and B already succeeded, this is what lets
  // a retry recognize A and B as already-done (A's temp id has already
  // been swapped for its real server id and isNew flipped false) instead
  // of re-sending A's create request and duplicating it.
  const [savedBaseline, setSavedBaseline] = useState<Map<string, StartTimeCriterion>>(
    () => new Map(criteria.map((c) => [c.id, c])),
  );

  function updateCriterion(id: string, patch: Partial<Pick<DraftCriterion, "name" | "startTime" | "graceMinutes">>) {
    setDraftCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function toggleActive(id: string) {
    setDraftCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  }

  // Only ever called on a row created by addCriterion this session — removes
  // the unsaved draft row itself, never a persisted criterion (spec: no
  // permanent deletion in this MVP; this is not that).
  function cancelNewCriterion(id: string) {
    setDraftCriteria((prev) => prev.filter((c) => c.id !== id));
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addCriterion() {
    setDraftCriteria((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", startTime: "", active: true, graceMinutes: 0, isDefault: false, isNew: true },
    ]);
  }

  // Default is set through its own immediate action (mirroring
  // ActivityCategory's set-default endpoint) rather than folded into the
  // batched create/update save — it has no bearing on any other field, and
  // requires an already-persisted, active row (a still-unsaved or inactive
  // row simply has no "기본으로 설정" button, see below).
  async function handleSetDefault(id: string) {
    setSaveError(null);
    try {
      await setDefaultStartTimeCriterion(id);
      setDraftCriteria((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
      setSavedBaseline((prev) => {
        const next = new Map(prev);
        for (const [key, value] of next) {
          next.set(key, { ...value, isDefault: key === id });
        }
        return next;
      });
    } catch (error) {
      setSaveError(describeApiError(error, "기본 출근 기준을 설정하지 못했습니다."));
    }
  }

  async function handleSave() {
    if (saving) return;
    const nextErrors: Record<string, RowErrors> = {};
    const validCriteria: DraftCriterion[] = [];

    for (const c of draftCriteria) {
      const rowErrors: RowErrors = {};
      const trimmedName = c.name.trim();
      if (trimmedName === "") rowErrors.name = "기준 이름을 입력해 주세요.";

      const minutes = parseTimeOfDayMinutes(c.startTime);
      if (minutes == null) rowErrors.startTime = "출근 시간을 입력해 주세요.";

      if (!Number.isInteger(c.graceMinutes) || c.graceMinutes < 0 || c.graceMinutes > MAX_GRACE_MINUTES) {
        rowErrors.graceMinutes = `0~${MAX_GRACE_MINUTES} 사이의 숫자를 입력해 주세요.`;
      }

      if (rowErrors.name || rowErrors.startTime || rowErrors.graceMinutes) {
        nextErrors[c.id] = rowErrors;
        continue;
      }

      validCriteria.push({ ...c, name: trimmedName });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaveError(null);
    setSaving(true);

    // Local mirrors of draftCriteria/savedBaseline, updated in lockstep
    // with the corresponding setState calls below — plain variables, not
    // state, so onSaved (at the end) and the next row's baseline lookup
    // (within this same call) always see this attempt's own just-committed
    // rows immediately, without waiting on a re-render.
    let working = draftCriteria;
    let baseline = savedBaseline;

    function commitRow(originalId: string, result: StartTimeCriterion) {
      ({ working, baseline } = commitCriterionResult(working, baseline, originalId, result));
      setDraftCriteria(working);
      setSavedBaseline(baseline);
    }

    try {
      for (const c of validCriteria) {
        const action = planSaveAction(c, baseline);
        if (action === "create") {
          const dto = await createStartTimeCriterion(
            mapCriterionToInput({ name: c.name, startTime: c.startTime, active: null, graceMinutes: c.graceMinutes }),
          );
          commitRow(c.id, mapCriterionFromDto(dto));
        } else if (action === "update") {
          const dto = await updateStartTimeCriterion(
            c.id,
            mapCriterionToInput({ name: c.name, startTime: c.startTime, active: c.active, graceMinutes: c.graceMinutes }),
          );
          commitRow(c.id, mapCriterionFromDto(dto));
        } else {
          commitRow(c.id, { id: c.id, name: c.name, startTime: c.startTime, active: c.active, graceMinutes: c.graceMinutes, isDefault: c.isDefault });
        }
      }
      onSaved(
        working.map((d) => ({ id: d.id, name: d.name, startTime: d.startTime, active: d.active, graceMinutes: d.graceMinutes, isDefault: d.isDefault })),
      );
    } catch (error) {
      setSaveError(
        describeApiError(
          error,
          "출근 기준을 저장하지 못했습니다. 이미 저장된 항목은 유지되며, 나머지 항목만 다시 저장해주세요.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="출근 기준 관리"
      onClose={onClose}
      size="wide"
      footer={
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            data-autofocus
            className={`rounded-md border border-control-border bg-surface-default h-9 px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`rounded-md bg-success-emphasis h-9 px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-fg-muted">근무 기록에 적용할 출근 기준을 관리합니다.</p>
      {saveError && <p className="mb-4 text-sm text-danger-fg">{saveError}</p>}

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["기준 이름", "출근 시간", "지각 유예", "상태", "관리"].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap border-b border-r border-border-default bg-canvas-subtle px-3 py-2.5 text-left text-xs font-medium text-fg-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draftCriteria.length === 0 && (
              <tr>
                <td colSpan={5} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
                  등록된 출근 기준이 없습니다.
                </td>
              </tr>
            )}
            {draftCriteria.map((c) => {
              const rowErrors = errors[c.id];
              const displayName = c.name.trim() || "새 기준";
              return (
                <tr key={c.id}>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <label className="sr-only" htmlFor={`criterion-name-${c.id}`}>
                      기준 이름
                    </label>
                    <input
                      id={`criterion-name-${c.id}`}
                      type="text"
                      value={c.name}
                      onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                      aria-invalid={!!rowErrors?.name}
                      aria-describedby={rowErrors?.name ? `criterion-name-error-${c.id}` : undefined}
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.name && (
                      <span id={`criterion-name-error-${c.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.name}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <div className="w-28">
                      <TimeTextInput
                        id={`criterion-time-${c.id}`}
                        value={c.startTime}
                        onChange={(startTime) => updateCriterion(c.id, { startTime })}
                        aria-label="출근 시간"
                        invalid={!!rowErrors?.startTime}
                        describedBy={rowErrors?.startTime ? `criterion-time-error-${c.id}` : undefined}
                      />
                    </div>
                    {rowErrors?.startTime && (
                      <span id={`criterion-time-error-${c.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.startTime}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <label className="sr-only" htmlFor={`criterion-grace-${c.id}`}>
                      지각 유예
                    </label>
                    <div className="flex h-9 items-center gap-1.5">
                      <input
                        id={`criterion-grace-${c.id}`}
                        type="number"
                        min={0}
                        max={MAX_GRACE_MINUTES}
                        inputMode="numeric"
                        value={c.graceMinutes}
                        onChange={(e) => {
                          const value = e.target.value === "" ? 0 : Number(e.target.value);
                          updateCriterion(c.id, { graceMinutes: Number.isNaN(value) ? 0 : value });
                        }}
                        aria-invalid={!!rowErrors?.graceMinutes}
                        aria-describedby={rowErrors?.graceMinutes ? `criterion-grace-error-${c.id}` : undefined}
                        className={`h-9 w-16 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                      />
                      <span className="whitespace-nowrap text-sm text-fg-muted">분</span>
                    </div>
                    {rowErrors?.graceMinutes && (
                      <span id={`criterion-grace-error-${c.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.graceMinutes}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top whitespace-nowrap">
                    <div className="flex h-9 items-center gap-2">
                      <span className={`text-sm font-medium ${c.active ? "text-success-fg" : "text-fg-muted"}`}>
                        {c.active ? "사용 중" : "비활성"}
                      </span>
                      {c.isDefault && (
                        <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary-fg">기본</span>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(c.id)}
                        aria-label={`${displayName} ${c.active ? "비활성화" : "활성화"}`}
                        className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                      >
                        {c.active ? "비활성화" : "활성화"}
                      </button>
                      {!c.isNew && c.active && !c.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(c.id)}
                          aria-label={`${displayName} 기본으로 설정`}
                          className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                        >
                          기본으로 설정
                        </button>
                      )}
                      {c.isNew && (
                        <button
                          type="button"
                          onClick={() => cancelNewCriterion(c.id)}
                          aria-label={`${displayName} 추가 취소`}
                          className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                        >
                          추가 취소
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addCriterion}
        className={`mt-3 flex items-center gap-1.5 rounded-md border border-control-border bg-surface-default h-9 px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        <PlusIcon size={16} aria-hidden="true" />
        기준 추가
      </button>
    </WorkLogModal>
  );
}
