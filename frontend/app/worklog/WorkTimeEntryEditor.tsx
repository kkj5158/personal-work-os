"use client";

import { PlusIcon, TrashIcon } from "@primer/octicons-react";
import { buildChildOptions, buildRootOptions, getDefaultChildCategoryId, resolveCategoryLabel } from "./activityCategory";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes } from "./format";
import { isBlankWorkTimeDraftEntry, type WorkTimeDraftEntry, type WorkTimeRowErrors } from "./workTimeEntry";
import type { ActivityCategory } from "@/lib/api/types";

interface WorkTimeEntryEditorProps {
  entries: WorkTimeDraftEntry[];
  onChange: (next: WorkTimeDraftEntry[]) => void;
  errors: Record<string, WorkTimeRowErrors>;
  /** The canonical shared ActivityCategory catalog (mock-backed for now —
   *  see activityCategory.ts). Not owned by this component: no create/edit/
   *  delete affordance is ever rendered here, only selection. */
  categories: ActivityCategory[];
}

// Fully controlled work-time row editor (v3 unit: extracted so the same
// table/validation-display can be shared by both the unified record-edit
// modal and the 일 (daily) view, without either owning its own copy of the
// draft — the parent's draft is always the single source of truth, satisfying
// "no nested modal state, drafts
// never diverge"). Never displays 작업 블록 합계 (that concept is presented
// nowhere in Work Log any more) — only 실근무, the live sum of every row's
// own minutes.
export function WorkTimeEntryEditor({ entries, onChange, errors, categories }: WorkTimeEntryEditorProps) {
  const draftTotalMinutes = entries.reduce((sum, entry) => sum + (parseHoursMinutes(entry.timeText) ?? 0), 0);
  const rootOptions = buildRootOptions(categories);

  function updateEntry(id: string, patch: Partial<WorkTimeDraftEntry>) {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  function addEntry() {
    // No default parent/child (spec: never auto-select a parent for a new
    // row) — both start empty and the placeholder options carry the row
    // until the user picks a parent explicitly.
    onChange([...entries, { id: crypto.randomUUID(), parentCategoryId: "", categoryId: "", item: "", timeText: "", memo: "" }]);
  }

  // Parent change resets/replaces the child per the default-child policy:
  // the new parent's active default child if it has one valid, otherwise
  // empty — the previous child never survives a parent change even if it
  // would coincidentally still resolve to something.
  function handleParentChange(id: string, nextParentId: string) {
    if (nextParentId === "") {
      updateEntry(id, { parentCategoryId: "", categoryId: "" });
      return;
    }
    const defaultChildId = getDefaultChildCategoryId(nextParentId, categories);
    updateEntry(id, { parentCategoryId: nextParentId, categoryId: defaultChildId ?? "" });
  }

  function handleChildChange(id: string, nextChildId: string) {
    updateEntry(id, { categoryId: nextChildId });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border-default bg-canvas-subtle px-6 py-4">
        <span className="text-xs text-fg-muted">실근무</span>
        <div className="text-2xl font-semibold tabular-nums text-primary-fg">{formatHoursMinutes(draftTotalMinutes)}</div>
      </div>

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["카테고리", "항목", "시간", "메모", "관리"].map((header) => (
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
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
                  기록된 업무시간이 없습니다.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const rowErrors = errors[entry.id];
              const isBlank = isBlankWorkTimeDraftEntry(entry);

              const parentKnownActive = entry.parentCategoryId !== "" && rootOptions.some((o) => o.id === entry.parentCategoryId);
              const preservedParentLabel =
                entry.parentCategoryId !== "" && !parentKnownActive ? resolveCategoryLabel(entry.parentCategoryId, categories) : null;

              const childOptions = entry.parentCategoryId !== "" ? buildChildOptions(categories, entry.parentCategoryId) : [];
              const childKnownActive = entry.categoryId !== "" && childOptions.some((o) => o.id === entry.categoryId);
              const preservedChildLabel =
                entry.categoryId !== "" && !childKnownActive ? resolveCategoryLabel(entry.categoryId, categories) : null;

              return (
                <tr key={entry.id}>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="상위 카테고리"
                        value={entry.parentCategoryId}
                        onChange={(e) => handleParentChange(entry.id, e.target.value)}
                        aria-invalid={!!rowErrors?.category}
                        aria-describedby={rowErrors?.category ? `worktime-category-error-${entry.id}` : undefined}
                        className={`h-9 w-28 shrink-0 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                      >
                        <option value="" disabled>
                          상위 선택
                        </option>
                        {preservedParentLabel && <option value={entry.parentCategoryId}>{preservedParentLabel}</option>}
                        {rootOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="하위 카테고리"
                        value={entry.categoryId}
                        disabled={entry.parentCategoryId === ""}
                        onChange={(e) => handleChildChange(entry.id, e.target.value)}
                        aria-invalid={!!rowErrors?.category}
                        aria-describedby={rowErrors?.category ? `worktime-category-error-${entry.id}` : undefined}
                        className={`h-9 w-40 shrink-0 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                      >
                        <option value="" disabled>
                          하위 선택
                        </option>
                        {preservedChildLabel && <option value={entry.categoryId}>{preservedChildLabel}</option>}
                        {childOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {rowErrors?.category && (
                      <span id={`worktime-category-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.category}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="항목"
                      value={entry.item}
                      onChange={(e) => updateEntry(entry.id, { item: e.target.value })}
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.item && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.item}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="시간"
                      placeholder="예: 01:30"
                      value={entry.timeText}
                      onChange={(e) => updateEntry(entry.id, { timeText: e.target.value })}
                      className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.time && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.time}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="메모"
                      value={entry.memo}
                      onChange={(e) => updateEntry(entry.id, { memo: e.target.value })}
                      className={`h-9 w-full rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={isBlank ? "빈 기록 삭제" : `${entry.item || "업무시간"} 기록 삭제`}
                      className={`rounded-md p-2 text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                    >
                      <TrashIcon size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addEntry}
        className={`flex h-9 w-fit items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        <PlusIcon size={16} aria-hidden="true" />
        기록 추가
      </button>
    </div>
  );
}
