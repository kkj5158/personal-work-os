"use client";

import { useState } from "react";
import { PlusIcon } from "@primer/octicons-react";
import { WorkLogModal } from "./WorkLogModal";
import { FOCUS_VISIBLE, parseTimeOfDayMinutes } from "./format";
import { type StartTimeCriterion } from "./startTimeCriterion";

const TITLE_ID = "worklog-start-time-criteria-title";

interface DraftCriterion extends StartTimeCriterion {
  /** True only for a row added via 기준 추가 during this modal session and
   *  not yet saved — controls whether 추가 취소 is offered instead of a
   *  delete action (persisted criteria are never deletable in this MVP). */
  isNew: boolean;
}

interface RowErrors {
  name?: string;
  startTime?: string;
}

interface StartTimeCriteriaModalProps {
  criteria: StartTimeCriterion[];
  onSave: (criteria: StartTimeCriterion[]) => void;
  onClose: () => void;
}

function toDraft(criterion: StartTimeCriterion): DraftCriterion {
  return { ...criterion, isNew: false };
}

// Criteria-management modal (lateness-foundation follow-up unit): edits a
// local draft only — page.tsx's committed `criteria` list is untouched until
// 저장 explicitly calls onSave. Every other exit path (취소/Escape/overlay,
// all funneled through WorkLogModal's single onClose) simply unmounts this
// component, discarding draftCriteria along with it — no separate "revert"
// logic needed, mirroring the draftEntries pattern used elsewhere (e.g.
// DailyWorkLogView). This
// unit only manages the reusable criteria list itself: it never reads or
// writes any WorkLogRecord, so existing appliedStartTime snapshots (and the
// lateness they derive) are structurally unreachable from here.
export function StartTimeCriteriaModal({ criteria, onSave, onClose }: StartTimeCriteriaModalProps) {
  const [draftCriteria, setDraftCriteria] = useState<DraftCriterion[]>(() => criteria.map(toDraft));
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});

  function updateCriterion(id: string, patch: Partial<Pick<DraftCriterion, "name" | "startTime">>) {
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
    setDraftCriteria((prev) => [...prev, { id: crypto.randomUUID(), name: "", startTime: "", active: true, isNew: true }]);
  }

  function handleSave() {
    const nextErrors: Record<string, RowErrors> = {};
    const validCriteria: StartTimeCriterion[] = [];

    for (const c of draftCriteria) {
      const rowErrors: RowErrors = {};
      const trimmedName = c.name.trim();
      if (trimmedName === "") rowErrors.name = "기준 이름을 입력해 주세요.";

      const minutes = parseTimeOfDayMinutes(c.startTime);
      if (minutes == null) rowErrors.startTime = "출근 시간을 입력해 주세요.";

      if (rowErrors.name || rowErrors.startTime) {
        nextErrors[c.id] = rowErrors;
        continue;
      }

      validCriteria.push({ id: c.id, name: trimmedName, startTime: c.startTime, active: c.active });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    onSave(validCriteria);
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
            data-autofocus
            className={`rounded-md border border-control-border bg-surface-default h-9 px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`rounded-md bg-success-emphasis h-9 px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}
          >
            저장
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-fg-muted">근무 기록에 적용할 출근 기준을 관리합니다.</p>

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["기준 이름", "출근 시간", "상태", "관리"].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-r border-border-default bg-canvas-subtle px-3 py-2.5 text-left text-xs font-medium text-fg-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draftCriteria.length === 0 && (
              <tr>
                <td colSpan={4} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
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
                    <label className="sr-only" htmlFor={`criterion-time-${c.id}`}>
                      출근 시간
                    </label>
                    <input
                      id={`criterion-time-${c.id}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="HH:mm"
                      value={c.startTime}
                      onChange={(e) => updateCriterion(c.id, { startTime: e.target.value })}
                      aria-invalid={!!rowErrors?.startTime}
                      aria-describedby={rowErrors?.startTime ? `criterion-time-error-${c.id}` : undefined}
                      className={`h-9 w-24 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.startTime && (
                      <span id={`criterion-time-error-${c.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.startTime}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top whitespace-nowrap">
                    <span className={`flex h-9 items-center text-sm font-medium ${c.active ? "text-success-fg" : "text-fg-muted"}`}>
                      {c.active ? "사용 중" : "비활성"}
                    </span>
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
