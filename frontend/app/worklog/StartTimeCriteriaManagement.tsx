"use client";

import { useState } from "react";
import { PlusIcon } from "@primer/octicons-react";
import {
  createStartTimeCriterion,
  deleteStartTimeCriterion,
  setDefaultStartTimeCriterion,
  updateStartTimeCriterion,
} from "@/lib/api/startTimeCriteria";
import { commitCriterionResult, planSaveAction, type DraftCriterion } from "./criteriaSave";
import { describeApiError } from "./errorMessages";
import { TimeTextInput } from "./TimeTextInput";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, parseTimeOfDayMinutes } from "./format";
import { mapCriterionFromDto, mapCriterionToInput } from "./mapping";
import { type StartTimeCriterion } from "./startTimeCriterion";

interface RowErrors {
  name?: string;
  startTime?: string;
  graceMinutes?: string;
}

const MAX_GRACE_MINUTES = 120;

interface StartTimeCriteriaManagementProps {
  criteria: StartTimeCriterion[];
  /** Called once every changed row has been persisted, with the full
   *  refreshed list (real ids for anything created this session). */
  onSaved: (criteria: StartTimeCriterion[]) => void;
}

function toDraft(criterion: StartTimeCriterion): DraftCriterion {
  return { ...criterion, isNew: false };
}

// Start-time criteria management, relocated from the Work Record page's
// toolbar-opened modal (REQ-05 continuation / attendance management batch)
// into a page section on 출결 관리, per the confirmed page structure —
// StartTimeCriterion management is now attendance administration, not daily
// Work Record operation. Editing name/startTime/graceMinutes/memo is still
// a local draft, batch-saved on 저장 (unchanged proven logic from the old
// modal — see criteriaSave.ts); activate/deactivate, set-default, and
// delete remain immediate actions, same as before.
export function StartTimeCriteriaManagement({ criteria, onSaved }: StartTimeCriteriaManagementProps) {
  const [draftCriteria, setDraftCriteria] = useState<DraftCriterion[]>(() => criteria.map(toDraft));
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DraftCriterion | null>(null);
  const [savedBaseline, setSavedBaseline] = useState<Map<string, StartTimeCriterion>>(
    () => new Map(criteria.map((c) => [c.id, c])),
  );

  function updateCriterion(id: string, patch: Partial<Pick<DraftCriterion, "name" | "startTime" | "graceMinutes" | "memo">>) {
    setDraftCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function toggleActive(id: string) {
    setDraftCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  }

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
      { id: crypto.randomUUID(), name: "", startTime: "", active: true, graceMinutes: 0, isDefault: false, memo: null, isNew: true },
    ]);
  }

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

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    setSaveError(null);
    try {
      await deleteStartTimeCriterion(pendingDelete.id);
      setDraftCriteria((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      setSavedBaseline((prev) => {
        const next = new Map(prev);
        next.delete(pendingDelete.id);
        return next;
      });
      setPendingDelete(null);
    } catch (error) {
      setSaveError(describeApiError(error, "출근 기준을 삭제하지 못했습니다."));
    } finally {
      setDeletingId(null);
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
            mapCriterionToInput({ name: c.name, startTime: c.startTime, active: null, graceMinutes: c.graceMinutes, memo: c.memo }),
          );
          commitRow(c.id, mapCriterionFromDto(dto));
        } else if (action === "update") {
          const dto = await updateStartTimeCriterion(
            c.id,
            mapCriterionToInput({ name: c.name, startTime: c.startTime, active: c.active, graceMinutes: c.graceMinutes, memo: c.memo }),
          );
          commitRow(c.id, mapCriterionFromDto(dto));
        } else {
          commitRow(c.id, { id: c.id, name: c.name, startTime: c.startTime, active: c.active, graceMinutes: c.graceMinutes, isDefault: c.isDefault, memo: c.memo });
        }
      }
      onSaved(
        working.map((d) => ({ id: d.id, name: d.name, startTime: d.startTime, active: d.active, graceMinutes: d.graceMinutes, isDefault: d.isDefault, memo: d.memo })),
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">근무 기록에 적용할 출근 기준을 관리합니다.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addCriterion}
            className={`flex h-9 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <PlusIcon size={16} aria-hidden="true" />새 기준 추가
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`h-9 rounded-md bg-success-emphasis px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {saveError && <p className="text-sm text-danger-fg">{saveError}</p>}

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["기준 이름", "출근 시간", "지각 유예", "메모", "상태", "관리"].map((header) => (
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
                <td colSpan={6} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
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
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <label className="sr-only" htmlFor={`criterion-memo-${c.id}`}>
                      메모
                    </label>
                    <input
                      id={`criterion-memo-${c.id}`}
                      type="text"
                      value={c.memo ?? ""}
                      onChange={(e) => updateCriterion(c.id, { memo: e.target.value === "" ? null : e.target.value })}
                      placeholder="선택 입력"
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
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
                      {c.isNew ? (
                        <button
                          type="button"
                          onClick={() => cancelNewCriterion(c.id)}
                          aria-label={`${displayName} 추가 취소`}
                          className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                        >
                          추가 취소
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(c)}
                          disabled={deletingId === c.id}
                          aria-label={`${displayName} 삭제`}
                          className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                        >
                          삭제
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
      <p className="text-xs text-fg-muted">사용 이력이 있는 기준은 삭제할 수 없으며 비활성 처리됩니다. 비활성 기준은 다시 활성화할 수 있습니다.</p>

      {pendingDelete && (
        <WorkLogModal
          titleId="worklog-criterion-delete-title"
          title="출근 기준을 삭제하시겠습니까?"
          onClose={() => setPendingDelete(null)}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === pendingDelete.id}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                삭제
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">
            &ldquo;{pendingDelete.name}&rdquo; 기준을 삭제하시겠습니까?
            <br />
            사용 이력이 없으면 완전히 삭제되고, 사용 이력이 있으면 비활성 상태로 보관되어 기존 기록에는 계속 표시됩니다.
          </p>
        </WorkLogModal>
      )}
    </div>
  );
}
