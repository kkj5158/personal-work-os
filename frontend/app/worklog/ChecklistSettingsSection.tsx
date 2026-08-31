"use client";

import { useEffect, useRef, useState } from "react";
import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GrabberIcon, KebabHorizontalIcon, PlusIcon } from "@primer/octicons-react";
import {
  deleteChecklistItem,
  getChecklistActiveCount,
  getCurrentChecklistGoal,
  listChecklistItems,
  moveChecklistItem,
  reorderChecklistItems,
  scheduleChecklistGoal,
  scheduleChecklistItemVersion,
} from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto } from "@/lib/api/types";
import { FOCUS_VISIBLE } from "./format";
import { itemCategoryLabel, reconstructFullSiblingOrder, todayDateKey } from "./checklistLogic";
import { describeApiError } from "./errorMessages";
import { ChecklistCategoryManagement } from "./ChecklistCategoryManagement";
import { ChecklistItemFormModal } from "./ChecklistItemFormModal";
import { WorkLogModal } from "./WorkLogModal";

const DELETE_TITLE_ID = "worklog-checklist-item-delete-title";

interface Props {
  items: ChecklistItemDto[];
  historicalItems: ChecklistItemDto[];
  categories: ChecklistCategoryDto[];
  onItemsChanged: (items: ChecklistItemDto[]) => void;
  onCategoriesChanged: (categories: ChecklistCategoryDto[]) => void;
  /** Full catalog refetch (items + history + categories) — used only after
   *  a soft-delete, so the "삭제된 항목" read-only history list picks up the
   *  newly-deleted item immediately without hand-patching a second list. */
  onReload: () => void | Promise<void>;
}

type FormState = { mode: "create" } | { mode: "edit"; item: ChecklistItemDto };

// Settings (§39-44, revised): this section is now the SINGLE primary
// surface for managing existing Checklist Items — drag-and-drop reorder,
// edit, activate/deactivate, category reassignment, and delete all happen
// inline here, in the same compact-row style as ChecklistCategoryManagement
// (grab handle + "⋯" overflow menu for the low-frequency destructive/
// administrative actions, rather than a permanent button cluster). The
// former ChecklistManagementModal has been narrowed to ChecklistItemFormModal
// and is now reachable only for NEW item creation ("+ 항목 추가") or from a
// row's own "수정" action — never as a general item-browsing surface.
// Category management stays inline here too (§42, unchanged).
//
// DnD reuses the exact same canonical-sibling-reconstruction fix as the
// (now-retired) modal: the visible drag list is only the ACTIVE subset of a
// category's items, but the backend validates a reorder payload against the
// FULL non-deleted sibling set (ChecklistItemService.reorder) — see
// reconstructFullSiblingOrder in checklistLogic.ts. Inactive items are
// intentionally not draggable here (their canonical position has no
// visible effect until reactivated); reordering still preserves their
// slot exactly, so nothing is silently lost.
export function ChecklistSettingsSection({ items, historicalItems, categories, onItemsChanged, onCategoriesChanged, onReload }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [deletingItem, setDeletingItem] = useState<ChecklistItemDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeCount, setActiveCount] = useState({ active: 0, max: 6 });
  const [globalGoal, setGlobalGoal] = useState(80);
  const [globalGoalInput, setGlobalGoalInput] = useState("80");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    (async () => {
      try {
        const [count, goal] = await Promise.all([getChecklistActiveCount(), getCurrentChecklistGoal()]);
        setActiveCount(count);
        setGlobalGoal(goal.goalPercent);
        setGlobalGoalInput(String(goal.goalPercent));
      } catch (e) {
        setError(describeApiError(e, "체크리스트 관리 정보를 불러오지 못했습니다."));
      }
    })();
  }, []);

  const activeItems = items.filter((i) => i.active);
  const inactiveItems = items.filter((i) => !i.active);
  const deleted = historicalItems.filter((i) => i.deleted);

  const activeGroups = new Map<string | null, ChecklistItemDto[]>();
  for (const item of activeItems) {
    const list = activeGroups.get(item.categoryId) ?? [];
    list.push(item);
    activeGroups.set(item.categoryId, list);
  }
  for (const list of activeGroups.values()) list.sort((a, b) => a.position - b.position);

  const orderedGroupKeys: (string | null)[] = [...[...categories].sort((a, b) => a.position - b.position).map((c) => c.id), null].filter(
    (key) => (activeGroups.get(key) ?? []).length > 0,
  );

  const activeDragItem = activeDragId ? items.find((i) => i.id === activeDragId) ?? null : null;

  async function handleSaveGlobalGoal() {
    const value = Number(globalGoalInput);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setError("기본 목표는 0~100 사이의 정수로 입력해 주세요.");
      return;
    }
    setError(null);
    try {
      await scheduleChecklistGoal(todayDateKey(), value);
      setGlobalGoal(value);
    } catch (e) {
      setError(describeApiError(e, "기본 목표를 저장하지 못했습니다."));
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  // DnD quality rules (§41, unchanged from the modal): optimistic local
  // reorder, no API while dragging, exactly one persist call on drop,
  // rollback on failure, canonical ordering preserved.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id || reordering) return;
    const draggedItem = items.find((i) => i.id === active.id);
    if (!draggedItem) return;
    const categoryId = draggedItem.categoryId;

    const visibleIds = (activeGroups.get(categoryId) ?? []).map((i) => i.id);
    const fromIndex = visibleIds.indexOf(String(active.id));
    const toIndex = visibleIds.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    const reorderedVisibleIds = arrayMove(visibleIds, fromIndex, toIndex);

    // The active list is only a filtered subset of the category's full
    // sibling set — reconstruct the full canonical order, preserving
    // inactive siblings' exact slots (see reconstructFullSiblingOrder).
    const fullSiblingIds = items
      .filter((i) => !i.deleted && i.categoryId === categoryId)
      .sort((a, b) => a.position - b.position)
      .map((i) => i.id);
    const optimisticIds = reconstructFullSiblingOrder(fullSiblingIds, reorderedVisibleIds);

    const previous = items;
    const positionById = new Map(optimisticIds.map((id, index) => [id, index]));
    onItemsChanged(items.map((i) => (positionById.has(i.id) ? { ...i, position: positionById.get(i.id)! } : i)));
    setError(null);
    setReordering(true);
    try {
      const updated = await reorderChecklistItems(categoryId, optimisticIds);
      const byId = new Map(updated.map((u) => [u.id, u]));
      onItemsChanged(items.map((i) => byId.get(i.id) ?? i));
    } catch (e) {
      onItemsChanged(previous);
      setError(describeApiError(e, "순서를 저장하지 못했습니다."));
    } finally {
      setReordering(false);
    }
  }

  async function handleMoveCategory(item: ChecklistItemDto, categoryId: string | null) {
    setPendingId(item.id);
    setError(null);
    try {
      const updated = await moveChecklistItem(item.id, categoryId);
      onItemsChanged(items.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setError(describeApiError(e, "카테고리를 변경하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleActive(item: ChecklistItemDto) {
    setOpenMenuId(null);
    if (!item.active && activeCount.active >= activeCount.max) {
      setError(`활성 체크리스트 항목은 최대 ${activeCount.max}개까지 가능합니다.`);
      return;
    }
    setPendingId(item.id);
    setError(null);
    try {
      const updated = await scheduleChecklistItemVersion(item.id, {
        effectiveFrom: todayDateKey(),
        name: item.name,
        emoji: item.emoji,
        priority: item.priority,
        active: !item.active,
        goalOverridePercent: item.goalOverridePercent,
      });
      onItemsChanged(items.map((i) => (i.id === item.id ? { ...i, active: updated.active } : i)));
      const count = await getChecklistActiveCount();
      setActiveCount(count);
    } catch (e) {
      setError(describeApiError(e, "상태를 변경하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingItem || deleting) return;
    setDeleting(true);
    try {
      await deleteChecklistItem(deletingItem.id);
      setDeletingItem(null);
      setError(null);
      await onReload();
      const count = await getChecklistActiveCount();
      setActiveCount(count);
    } catch (e) {
      setDeletingItem(null);
      setError(describeApiError(e, "항목을 삭제하지 못했습니다."));
    } finally {
      setDeleting(false);
    }
  }

  async function handleFormSaved() {
    setFormState(null);
    try {
      const [refreshed, count] = await Promise.all([listChecklistItems(), getChecklistActiveCount()]);
      onItemsChanged(refreshed);
      setActiveCount(count);
    } catch (e) {
      setError(describeApiError(e, "체크리스트 설정을 불러오지 못했습니다."));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-md border border-border-default">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-4 py-3">
          <h3 className="text-sm font-semibold text-fg-default">체크리스트 항목 관리</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">기본 목표</span>
              <input
                type="number"
                min={0}
                max={100}
                value={globalGoalInput}
                onChange={(e) => setGlobalGoalInput(e.target.value)}
                className={`h-8 w-16 rounded-md border border-control-border bg-control-bg px-2 text-center text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
              <span className="text-xs text-fg-muted">%</span>
              <button
                type="button"
                onClick={() => void handleSaveGlobalGoal()}
                className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                저장
              </button>
            </div>
            <span className="text-xs font-medium text-fg-muted">
              활성 {activeCount.active} / {activeCount.max}
            </span>
            <button
              type="button"
              onClick={() => setFormState({ mode: "create" })}
              disabled={activeCount.active >= activeCount.max}
              title={activeCount.active >= activeCount.max ? `활성 항목은 최대 ${activeCount.max}개까지 가능합니다` : undefined}
              className={`flex h-8 items-center gap-1 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
            >
              <PlusIcon size={14} aria-hidden="true" /> 항목 추가
            </button>
          </div>
        </div>

        {error && <p className="px-4 pt-3 text-sm text-danger-fg">{error}</p>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
          {orderedGroupKeys.length === 0 && <p className="px-4 py-6 text-center text-sm text-fg-muted">등록된 활성 항목이 없습니다.</p>}
          {orderedGroupKeys.map((key) => {
            const groupItems = activeGroups.get(key) ?? [];
            const groupName = key === null ? "미분류" : categories.find((c) => c.id === key)?.name ?? "미분류";
            return (
              <div key={key ?? "none"}>
                <div className="bg-canvas-subtle px-4 py-2 text-xs font-semibold text-fg-muted">
                  {groupName} ({groupItems.length})
                </div>
                <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {groupItems.map((item) => (
                    <SortableItemRow key={item.id} id={item.id}>
                      {({ attributes, listeners }) => (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border-default px-4 py-2.5 text-sm">
                          <button
                            type="button"
                            {...attributes}
                            {...listeners}
                            disabled={reordering}
                            aria-label={`${item.name} 순서 변경`}
                            className={`flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:text-fg-default active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                          >
                            <GrabberIcon size={14} aria-hidden="true" />
                          </button>
                          <span className="flex-1">
                            {item.emoji} {item.name}
                          </span>
                          {item.priority === "CORE" && (
                            <span className="whitespace-nowrap rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary-fg">Core</span>
                          )}
                          <span className="whitespace-nowrap text-xs text-fg-muted">목표 {item.effectiveGoalPercent}%</span>
                          <select
                            value={item.categoryId ?? ""}
                            onChange={(e) => void handleMoveCategory(item, e.target.value === "" ? null : e.target.value)}
                            disabled={pendingId === item.id}
                            aria-label={`${item.name} 카테고리 변경`}
                            className={`h-7 rounded-md border border-control-border bg-control-bg px-1.5 text-xs text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                          >
                            <option value="">미분류</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <OverflowMenu
                            rowId={item.id}
                            openMenuId={openMenuId}
                            onOpenChange={setOpenMenuId}
                            disabled={pendingId === item.id}
                            items={[
                              { label: "수정", onClick: () => setFormState({ mode: "edit", item }) },
                              { label: "비활성화", onClick: () => void handleToggleActive(item) },
                              { label: "삭제", danger: true, onClick: () => setDeletingItem(item) },
                            ]}
                          />
                        </div>
                      )}
                    </SortableItemRow>
                  ))}
                </SortableContext>
              </div>
            );
          })}
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {activeDragItem && (
              <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-default px-3 py-2 text-sm shadow-md">
                <GrabberIcon size={14} className="text-fg-muted" aria-hidden="true" />
                <span>
                  {activeDragItem.emoji} {activeDragItem.name}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <div className="border-t border-border-default p-3">
          <button onClick={() => setShowInactive(!showInactive)} className={`h-8 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
            비활성 항목 보기 ({inactiveItems.length})
          </button>
          {showInactive && (
            <div className="mt-3 rounded-md border border-border-muted">
              {inactiveItems.length === 0 ? (
                <p className="p-3 text-xs text-fg-muted">비활성 항목이 없습니다.</p>
              ) : (
                inactiveItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 border-b border-border-muted px-3 py-2 text-sm last:border-0">
                    <span className="flex-1 text-fg-muted">
                      {item.emoji} {item.name} · {itemCategoryLabel(item, categories)}
                    </span>
                    {item.priority === "CORE" && <span className="text-[10px] font-medium text-fg-muted">CORE</span>}
                    <span className="whitespace-nowrap text-xs text-fg-muted">목표 {item.effectiveGoalPercent}%</span>
                    <OverflowMenu
                      rowId={item.id}
                      openMenuId={openMenuId}
                      onOpenChange={setOpenMenuId}
                      disabled={pendingId === item.id}
                      items={[
                        { label: "활성화", onClick: () => void handleToggleActive(item) },
                        { label: "수정", onClick: () => setFormState({ mode: "edit", item }) },
                        { label: "삭제", danger: true, onClick: () => setDeletingItem(item) },
                      ]}
                    />
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

      {formState && (
        <ChecklistItemFormModal
          mode={formState.mode}
          item={formState.mode === "edit" ? formState.item : null}
          categories={categories}
          globalGoal={globalGoal}
          activeCount={activeCount}
          onClose={() => setFormState(null)}
          onSaved={() => void handleFormSaved()}
        />
      )}

      {deletingItem && (
        <WorkLogModal
          titleId={DELETE_TITLE_ID}
          title="체크리스트 항목을 삭제하시겠습니까?"
          onClose={() => setDeletingItem(null)}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={deleting}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">
            &ldquo;{deletingItem.emoji} {deletingItem.name}&rdquo; 항목을 삭제하시겠습니까?
            <br />
            과거 기록은 보존되며, 삭제된 항목은 복구할 수 없습니다.
          </p>
        </WorkLogModal>
      )}
    </div>
  );
}

type DragHandleProps = { attributes: ReturnType<typeof useSortable>["attributes"]; listeners: ReturnType<typeof useSortable>["listeners"] };

function SortableItemRow({ id, children }: { id: string; children: (drag: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      {children({ attributes, listeners })}
    </div>
  );
}

interface OverflowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface OverflowMenuProps {
  rowId: string;
  openMenuId: string | null;
  onOpenChange: (id: string | null) => void;
  items: OverflowMenuItem[];
  disabled?: boolean;
}

// Compact row-level "⋯" overflow action menu (§2 row design: low-frequency
// destructive/administrative actions live here instead of a permanent
// button cluster) — same structure as WorkCategorySettingsSection's local
// OverflowMenu (Work Record module, not shared/imported from here since
// this task must not touch that unrelated module). Closes on outside click
// or Escape; only one row's menu is open at a time (parent-owned openMenuId).
function OverflowMenu({ rowId, openMenuId, onOpenChange, items, disabled }: OverflowMenuProps) {
  const open = openMenuId === rowId;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onOpenChange(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(open ? null : rowId)}
        disabled={disabled}
        aria-label="더 보기"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-md p-1.5 text-fg-muted hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_VISIBLE}`}
      >
        <KebabHorizontalIcon size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-border-default bg-surface-default py-1 shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(null);
                item.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-canvas-subtle ${item.danger ? "text-danger-fg" : "text-fg-default"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
