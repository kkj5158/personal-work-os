"use client";

import { PlusIcon, TrashIcon } from "@primer/octicons-react";
import { buildChildOptions, buildRootOptions, getDefaultChildCategoryId, resolveCategoryLabel } from "./activityCategory";
import { FOCUS_VISIBLE, formatHoursMinutes, parseHoursMinutes, parseTimeOfDayMinutes } from "./format";
import { TimeTextInput } from "./TimeTextInput";
import { isBlankSupplementalWorkDraftEntry, type SupplementalWorkDraftEntry, type SupplementalWorkRowErrors } from "./supplementalWorkEntry";
import type { ActivityCategory } from "@/lib/api/types";

interface SupplementalWorkEntryEditorProps {
  entries: SupplementalWorkDraftEntry[];
  onChange: (next: SupplementalWorkDraftEntry[]) => void;
  errors: Record<string, SupplementalWorkRowErrors>;
  /** The canonical shared ActivityCategory catalog — same catalog
   *  WorkTimeEntryEditor uses, never a Supplemental-only category type. */
  categories: ActivityCategory[];
}

// Supplemental Work ("보강근무") table editor — the Plan A layout's second
// table, always available regardless of Attendance status (unlike
// WorkTimeEntryEditor's regular-work table, which only applies to a workday
// status). Mirrors WorkTimeEntryEditor's structure/styling exactly, with two
// differences: 총시간/시작/종료 columns (instead of one 시간 column) and
// row-level overlap validation (`errors[id].interval`).
export function SupplementalWorkEntryEditor({ entries, onChange, errors, categories }: SupplementalWorkEntryEditorProps) {
  const draftTotalMinutes = entries.reduce((sum, entry) => sum + (parseHoursMinutes(entry.timeText) ?? 0), 0);
  const rootOptions = buildRootOptions(categories);

  function updateEntry(id: string, patch: Partial<SupplementalWorkDraftEntry>) {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  function addEntry() {
    onChange([
      ...entries,
      { id: crypto.randomUUID(), parentCategoryId: "", categoryId: "", item: "", timeText: "", startText: "", endText: "", memo: "" },
    ]);
  }

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

  // Start/end auto-prefill (confirmed policy): the moment both start and end
  // are present AND the total-duration field is still empty, prefill it with
  // end-start once. Once the field holds any value (auto-filled or
  // user-typed), further start/end edits never touch it again — only a
  // manual clear-then-refill re-triggers this.
  function handleTimeFieldChange(id: string, field: "startText" | "endText", value: string) {
    const entry = entries.find((e) => e.id === id);
    const patch: Partial<SupplementalWorkDraftEntry> = { [field]: value };
    if (entry && entry.timeText.trim() === "") {
      const nextStart = field === "startText" ? value : entry.startText;
      const nextEnd = field === "endText" ? value : entry.endText;
      const startMinutes = parseTimeOfDayMinutes(nextStart);
      const endMinutes = parseTimeOfDayMinutes(nextEnd);
      if (startMinutes != null && endMinutes != null && endMinutes > startMinutes) {
        patch.timeText = formatHoursMinutes(endMinutes - startMinutes);
      }
    }
    updateEntry(id, patch);
  }

  const headers = ["대분류", "중분류", "항목", "총시간", "시작", "종료", "메모", "관리"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-fg-default">보강근무</h4>
        <span className="text-xs text-primary-fg">총 {formatHoursMinutes(draftTotalMinutes)}</span>
      </div>

      <div className="overflow-x-auto rounded-md border-l border-t border-border-default">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {headers.map((header) => (
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
                <td colSpan={headers.length} className="border-b border-r border-border-default px-3 py-3 text-center text-sm text-fg-muted">
                  기록된 보강근무가 없습니다.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const rowErrors = errors[entry.id];
              const isBlank = isBlankSupplementalWorkDraftEntry(entry);

              const parentKnownActive = entry.parentCategoryId !== "" && rootOptions.some((o) => o.id === entry.parentCategoryId);
              const preservedParentLabel =
                entry.parentCategoryId !== "" && !parentKnownActive ? resolveCategoryLabel(entry.parentCategoryId, categories) : null;

              const childOptions = entry.parentCategoryId !== "" ? buildChildOptions(categories, entry.parentCategoryId) : [];
              const childKnownActive = entry.categoryId !== "" && childOptions.some((o) => o.id === entry.categoryId);
              const preservedChildLabel =
                entry.categoryId !== "" && !childKnownActive ? resolveCategoryLabel(entry.categoryId, categories) : null;

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
                      aria-describedby={parentErrorMessage ? `supplemental-parent-error-${entry.id}` : undefined}
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
                      <span id={`supplemental-parent-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
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
                      aria-describedby={childErrorMessage ? `supplemental-child-error-${entry.id}` : undefined}
                      className={`h-9 w-40 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                    >
                      <option value="" disabled>
                        중분류 선택
                      </option>
                      {preservedChildLabel && <option value={entry.categoryId}>{preservedChildLabel}</option>}
                      {childOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {childErrorMessage && (
                      <span id={`supplemental-child-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
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
                      aria-label="총시간"
                      placeholder="예: 01:30"
                      value={entry.timeText}
                      onChange={(e) => updateEntry(entry.id, { timeText: e.target.value })}
                      className={`h-9 w-28 rounded-md border border-control-border bg-control-bg px-2.5 text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                    />
                    {rowErrors?.time && <span className="mt-1 block text-xs text-danger-fg">{rowErrors.time}</span>}
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <TimeTextInput
                      aria-label="시작"
                      value={entry.startText}
                      onChange={(value) => handleTimeFieldChange(entry.id, "startText", value)}
                      className="w-24"
                      invalid={!!rowErrors?.interval}
                    />
                  </td>
                  <td className="border-b border-r border-border-default px-3 py-2 align-top">
                    <TimeTextInput
                      aria-label="종료"
                      value={entry.endText}
                      onChange={(value) => handleTimeFieldChange(entry.id, "endText", value)}
                      className="w-24"
                      invalid={!!rowErrors?.interval}
                      describedBy={rowErrors?.interval ? `supplemental-interval-error-${entry.id}` : undefined}
                    />
                    {rowErrors?.interval && (
                      <span id={`supplemental-interval-error-${entry.id}`} className="mt-1 block text-xs text-danger-fg">
                        {rowErrors.interval}
                      </span>
                    )}
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
                      aria-label={isBlank ? "빈 기록 삭제" : `${entry.item || "보강근무"} 기록 삭제`}
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
        보강근무 추가
      </button>
    </div>
  );
}
