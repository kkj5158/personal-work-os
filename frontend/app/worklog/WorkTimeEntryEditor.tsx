"use client";

import { useMemo } from "react";
import { PlusIcon, TrashIcon } from "@primer/octicons-react";
import { buildChildOptions, buildRootOptions, resolveCategoryLabel } from "./activityCategory";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes } from "./format";
import { aggregateWorkMinutesByCategory, scheduledWorkMinutes, isBlankWorkTimeDraftEntry, type WorkTimeDraftEntry, type WorkTimeRowErrors } from "./workTimeEntry";
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
// "no nested modal state, drafts never diverge"). Never displays 작업 블록
// 합계 (that concept is presented nowhere in Work Log any more). The combined
// 실근무 (정규 + 보강) total card lives one level up (ActualWorkSummaryCard) —
// this component only shows its own 정규근무 section total, since the
// Supplemental Work section (SupplementalWorkEntryEditor) is a sibling, not
// a child, of this one.
export function WorkTimeEntryEditor({ entries, onChange, errors, categories }: WorkTimeEntryEditorProps) {
  const draftTotalMinutes = entries.reduce((sum, entry) => sum + (scheduledWorkMinutes(entry) ?? parseHoursMinutes(entry.timeText) ?? 0), 0);
  const rootOptions = buildRootOptions(categories);
  const categoryTotals = useMemo(() => aggregateWorkMinutesByCategory(entries.map(entry => ({ categoryId: entry.categoryId || entry.parentCategoryId, minutes: scheduledWorkMinutes(entry) ?? parseHoursMinutes(entry.timeText) ?? 0 })), categories), [entries, categories]);

  function updateEntry(id: string, patch: Partial<WorkTimeDraftEntry>) {
    onChange(entries.map(e => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      const minutes = scheduledWorkMinutes(next);
      if (minutes != null) next.timeText = String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
      return next;
    }));
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

  // Selecting a parent records that parent directly until a child is chosen.
  function handleParentChange(id: string, nextParentId: string) {
    if (nextParentId === "") {
      updateEntry(id, { parentCategoryId: "", categoryId: "" });
      return;
    }
    updateEntry(id, { parentCategoryId: nextParentId, categoryId: nextParentId });
  }

  function handleChildChange(id: string, nextChildId: string) {
    updateEntry(id, { categoryId: nextChildId });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-fg-default">정규근무</h4>
        <span className="text-xs text-primary-fg">총 {formatHoursMinutes(draftTotalMinutes)}</span>
      </div>

      {rootOptions.some(root => (categoryTotals.get(root.id) ?? 0) > 0) && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">{rootOptions.filter(root => (categoryTotals.get(root.id) ?? 0) > 0).map(root => <span key={root.id}>{root.label} {formatHoursMinutes(categoryTotals.get(root.id) ?? 0)}</span>)}</div>}

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {["대분류", "중분류 (선택)", "항목", "시간", "시작 / 종료 (선택)", "메모", "관리"].map((header) => (
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
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
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
                entry.categoryId !== "" && entry.categoryId !== entry.parentCategoryId && !childKnownActive ? resolveCategoryLabel(entry.categoryId, categories) : null;

              // The validator produces one combined category message per row
              // (workTimeEntry.ts's `rowErrors.category`) — this only decides
              // which of the two independent columns renders it. "상위 카테고리를
              // 선택하세요" is the sole 대분류-level message; every other
              // category message (missing/invalid/mismatched child) is a
              // 중분류-level concern. The underlying validation rule and text
              // are unchanged, only where each message is displayed.
              const parentErrorMessage = rowErrors?.category === "상위 카테고리를 선택하세요" ? rowErrors.category : undefined;
              const childErrorMessage =
                rowErrors?.category && rowErrors.category !== "상위 카테고리를 선택하세요" ? rowErrors.category : undefined;

              return (
                <tr key={entry.id}>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <select
                      aria-label="대분류"
                      value={entry.parentCategoryId}
                      onChange={(e) => handleParentChange(entry.id, e.target.value)}
                      aria-invalid={!!parentErrorMessage}
                      aria-describedby={parentErrorMessage ? `worktime-parent-error-${entry.id}` : undefined}
                      className={`h-9 w-24 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    >
                      <option value="" disabled>
                        대분류 선택
                      </option>
                      {preservedParentLabel && <option value={entry.parentCategoryId}>{preservedParentLabel}</option>}
                      {rootOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {parentErrorMessage && (
                      <span id={`worktime-parent-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
                        {parentErrorMessage}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <select
                      aria-label="중분류"
                      value={entry.categoryId}
                      disabled={entry.parentCategoryId === ""}
                      onChange={(e) => handleChildChange(entry.id, e.target.value)}
                      aria-invalid={!!childErrorMessage}
                      aria-describedby={childErrorMessage ? `worktime-child-error-${entry.id}` : undefined}
                      className={`h-9 w-40 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                    >
                      <option value={entry.parentCategoryId}>대분류로 기록</option>
                      {preservedChildLabel && <option value={entry.categoryId}>{preservedChildLabel}</option>}
                      {childOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {childErrorMessage && (
                      <span id={`worktime-child-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
                        {childErrorMessage}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="항목"
                      value={entry.item}
                      onChange={(e) => updateEntry(entry.id, { item: e.target.value })}
                      className={`h-9 w-full min-w-[150px] rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.item && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.item}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <input
                      type="text"
                      aria-label="시간"
                      placeholder="예: 01:30"
                      value={entry.timeText}
                      readOnly={!!entry.startText || !!entry.endText}
                      title={entry.startText || entry.endText ? "시작/종료 시간에서 자동 계산됩니다" : undefined}
                      onChange={(e) => updateEntry(entry.id, { timeText: e.target.value })}
                      className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.time && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.time}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <div className="flex gap-1">
                      <input type="time" step={300} aria-label="시작 시간" value={entry.startText ?? ""} onChange={e => updateEntry(entry.id, { startText: e.target.value })} className="h-9 w-28 rounded-md border border-control-border bg-control-bg px-2 text-sm focus-visible:outline-2" />
                      <input type="time" step={300} aria-label="종료 시간" value={entry.endText ?? ""} onChange={e => updateEntry(entry.id, { endText: e.target.value })} className="h-9 w-28 rounded-md border border-control-border bg-control-bg px-2 text-sm focus-visible:outline-2" />
                    </div>
                    {rowErrors?.interval && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.interval}</span>}
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
