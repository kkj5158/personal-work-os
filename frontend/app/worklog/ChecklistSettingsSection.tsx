"use client";

import { useState } from "react";
import { GrabberIcon, PlusIcon } from "@primer/octicons-react";
import type { ChecklistCategoryDto, ChecklistItemDto } from "@/lib/api/types";
import { FOCUS_VISIBLE } from "./format";
import { itemCategoryLabel } from "./checklistLogic";
import { ChecklistCategoryManagement } from "./ChecklistCategoryManagement";

interface Props {
  items: ChecklistItemDto[];
  historicalItems: ChecklistItemDto[];
  categories: ChecklistCategoryDto[];
  onManageItems: () => void;
  onCategoriesChanged: (categories: ChecklistCategoryDto[]) => void;
}

// Settings (§39-44): Category management is inline here (never a
// modal-launched-from-modal flow, §42) — see ChecklistCategoryManagement.
// Item management's grouped-by-category read summary lives here too, split
// into ACTIVE and INACTIVE (§44 — inactive items are never mixed into the
// main active list); the actual create/edit/reorder surface remains
// ChecklistManagementModal (dnd-kit canonical ordering, §41).
export function ChecklistSettingsSection({ items, historicalItems, categories, onManageItems, onCategoriesChanged }: Props) {
  const [showInactive, setShowInactive] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const activeItems = items.filter((i) => i.active);
  const inactiveItems = items.filter((i) => !i.active);
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name, position: c.position })), { id: null, name: "미분류", position: 9999 }]
    .map((c) => ({ ...c, items: activeItems.filter((i) => i.categoryId === c.id).sort((a, b) => a.position - b.position) }))
    .filter((g) => g.items.length > 0);
  const deleted = historicalItems.filter((i) => i.deleted);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-md border border-border-default">
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold text-fg-default">체크리스트 항목 관리</h3>
          <button onClick={onManageItems} className={`flex h-8 items-center gap-1 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
            <PlusIcon size={14} aria-hidden="true" /> 항목 추가·관리
          </button>
        </div>
        {groups.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-muted">등록된 활성 항목이 없습니다.</p>}
        {groups.map((g) => (
          <div key={g.id ?? "none"}>
            <div className="bg-canvas-subtle px-4 py-2 text-xs font-semibold text-fg-muted">
              {g.name} ({g.items.length})
            </div>
            {g.items.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border-t border-border-default px-4 py-2.5 text-sm">
                <GrabberIcon className="text-fg-muted" aria-hidden="true" />
                <span className="flex-1">
                  {i.emoji} {i.name}
                </span>
                <span className="text-[10px] font-medium text-fg-muted">{i.priority}</span>
                <span className="text-xs text-fg-muted">목표 {i.effectiveGoalPercent}%</span>
                <button onClick={onManageItems} aria-label={`${i.name} 관리`} className={`px-2 text-fg-muted hover:text-fg-default ${FOCUS_VISIBLE}`}>
                  ⋯
                </button>
              </div>
            ))}
          </div>
        ))}

        <div className="border-t border-border-default p-3">
          <button onClick={() => setShowInactive(!showInactive)} className={`h-8 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
            비활성 항목 보기 ({inactiveItems.length})
          </button>
          {showInactive && (
            <div className="mt-3 rounded-md border border-border-muted">
              {inactiveItems.length === 0 ? (
                <p className="p-3 text-xs text-fg-muted">비활성 항목이 없습니다.</p>
              ) : (
                inactiveItems.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 border-b border-border-muted px-3 py-2 text-sm last:border-0">
                    <span className="flex-1 text-fg-muted">
                      {i.emoji} {i.name} · {itemCategoryLabel(i, categories)}
                    </span>
                    <span className="text-[10px] font-medium text-fg-muted">{i.priority}</span>
                    <button onClick={onManageItems} aria-label={`${i.name} 관리`} className={`px-2 text-xs text-fg-muted hover:text-fg-default ${FOCUS_VISIBLE}`}>
                      재활성화
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="border-t border-border-default p-3">
          <button onClick={() => setShowDeleted(!showDeleted)} className={`h-8 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
            삭제된 항목 보기 ({deleted.length})
          </button>
          {showDeleted && (
            <div className="mt-3 rounded-md border border-border-muted">
              {deleted.length === 0 ? (
                <p className="p-3 text-xs text-fg-muted">삭제된 항목이 없습니다.</p>
              ) : (
                deleted.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 border-b border-border-muted px-3 py-2 text-sm last:border-0">
                    <span className="flex-1 text-fg-muted">
                      {i.emoji} {i.name} · {itemCategoryLabel(i, categories)}
                    </span>
                    <span className="rounded bg-canvas-subtle px-2 py-0.5 text-xs text-fg-muted">삭제됨</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <ChecklistCategoryManagement categories={categories} onCategoriesChanged={onCategoriesChanged} />
    </div>
  );
}
