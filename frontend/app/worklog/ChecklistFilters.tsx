"use client";

import { useEffect, useRef, useState } from "react";
import type { ChecklistCategoryDto, ChecklistPriority } from "@/lib/api/types";
import { DEFAULT_CHECKLIST_FILTERS, type ChecklistFilterState } from "./checklistLogic";
import { FOCUS_VISIBLE } from "./format";

interface ChecklistFiltersProps {
  categories: ChecklistCategoryDto[];
  filters: ChecklistFilterState;
  onChange: (next: ChecklistFilterState) => void;
  /** 미완료만 is Day-only (it depends on one specific date's cells) — Week/
   *  Month never show it, since "incomplete" isn't well-defined across many
   *  dates at once. */
  showIncompleteOnly: boolean;
}

// Record toolbar filter row (§10/§29): 코어만 / 미완료만 (quick toggles) +
// 상세 필터 (a draft-then-Apply panel) — placed between date navigation and
// 오늘 via WorkLogToolbar's `filters` slot. No 현재 활성만 quick toggle
// (§29 explicitly excludes it as redundant). Editing the detail draft never
// triggers a fetch by itself — only Apply commits it to `filters`, which is
// the only thing the caller's data-fetching effects depend on.
export function ChecklistFilters({ categories, filters, onChange, showIncompleteOnly }: ChecklistFiltersProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ChecklistFilterState>(filters);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openPanel() {
    setDraft(filters);
    setOpen(true);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  function reset() {
    setDraft(DEFAULT_CHECKLIST_FILTERS);
    onChange(DEFAULT_CHECKLIST_FILTERS);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange({ ...filters, coreOnly: !filters.coreOnly })}
        aria-pressed={filters.coreOnly}
        className={`h-9 rounded-md border px-3 text-sm font-medium ${FOCUS_VISIBLE} ${
          filters.coreOnly ? "border-primary-emphasis bg-primary-subtle text-primary-fg" : "border-border-default text-fg-default hover:bg-canvas-subtle"
        }`}
      >
        코어만
      </button>
      {showIncompleteOnly && (
        <button
          type="button"
          onClick={() => onChange({ ...filters, incompleteOnly: !filters.incompleteOnly })}
          aria-pressed={filters.incompleteOnly}
          className={`h-9 rounded-md border px-3 text-sm font-medium ${FOCUS_VISIBLE} ${
            filters.incompleteOnly ? "border-primary-emphasis bg-primary-subtle text-primary-fg" : "border-border-default text-fg-default hover:bg-canvas-subtle"
          }`}
        >
          미완료만
        </button>
      )}
      <div ref={panelRef} className="relative">
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`h-9 rounded-md border border-border-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          상세 필터
        </button>
        {open && (
          <div role="dialog" aria-label="상세 필터" className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-border-default bg-surface-default p-4 shadow-lg">
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-fg-muted">우선순위</p>
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value as "ALL" | ChecklistPriority })}
                  className="h-9 w-full rounded-md border border-control-border bg-control-bg px-2 text-sm"
                >
                  <option value="ALL">전체</option>
                  <option value="CORE">CORE</option>
                  <option value="SECONDARY">SECONDARY</option>
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-fg-muted">카테고리</p>
                <div className="flex max-h-32 flex-col gap-1 overflow-auto">
                  {[...categories, { id: "none", name: "미분류", position: 9999 }].map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.categoryIds.includes(c.id)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            categoryIds: e.target.checked ? [...draft.categoryIds, c.id] : draft.categoryIds.filter((x) => x !== c.id),
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-fg-muted">이력/적용 범위</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.includeNotApplicable} onChange={(e) => setDraft({ ...draft, includeNotApplicable: e.target.checked })} />
                  해당 없음 포함
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.includeDeleted} onChange={(e) => setDraft({ ...draft, includeDeleted: e.target.checked })} />
                  삭제된 항목 포함
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={reset} className={`h-8 rounded-md px-2.5 text-sm text-fg-muted hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
                  초기화
                </button>
                <button type="button" onClick={apply} className={`h-8 rounded-md bg-primary-emphasis px-3 text-sm font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}>
                  적용
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
