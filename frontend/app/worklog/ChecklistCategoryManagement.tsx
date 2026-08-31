"use client";

import { useState } from "react";
import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GrabberIcon, PlusIcon } from "@primer/octicons-react";
import { createChecklistCategory, deleteChecklistCategory, renameChecklistCategory, reorderChecklistCategories } from "@/lib/api/checklist";
import type { ChecklistCategoryDto } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-checklist-category-delete-title";

interface ChecklistCategoryManagementProps {
  categories: ChecklistCategoryDto[];
  onCategoriesChanged: (categories: ChecklistCategoryDto[]) => void;
}

const sortForDisplay = (a: ChecklistCategoryDto, b: ChecklistCategoryDto) => a.position - b.position || a.name.localeCompare(b.name, "ko");

// Category Management (§42) — kept INLINE in Settings, never a
// modal-launched-from-modal flow. Single-level, no effective dating
// (categories are management organization only, not a historical/
// statistical identity) — changes take effect immediately. dnd-kit reorder
// follows the same quality rules as item reorder (§41): optimistic local
// move, no API while dragging, exactly one persist call on drop, rollback
// on failure.
export function ChecklistCategoryManagement({ categories, onCategoriesChanged }: ChecklistCategoryManagementProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<ChecklistCategoryDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sorted = [...categories].sort(sortForDisplay);
  const activeDragCategory = activeDragId ? sorted.find((c) => c.id === activeDragId) ?? null : null;

  async function submitNew() {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    setError(null);
    setPendingId("new");
    try {
      const created = await createChecklistCategory(trimmed);
      onCategoriesChanged([...categories, created]);
      setNewName("");
      setAdding(false);
    } catch (e) {
      setError(describeApiError(e, "카테고리를 추가하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  async function commitRename(category: ChecklistCategoryDto) {
    const trimmed = editingName.trim();
    setEditingId(null);
    if (trimmed === "" || trimmed === category.name) return;
    setError(null);
    setPendingId(category.id);
    try {
      const updated = await renameChecklistCategory(category.id, trimmed);
      onCategoriesChanged(categories.map((c) => (c.id === updated.id ? updated : c)));
    } catch (e) {
      setError(describeApiError(e, "카테고리 이름을 변경하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id || reordering) return;

    const fromIndex = sorted.findIndex((c) => c.id === active.id);
    const toIndex = sorted.findIndex((c) => c.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const previous = categories;
    const optimistic = arrayMove(sorted, fromIndex, toIndex);
    onCategoriesChanged(optimistic);
    setError(null);
    setReordering(true);
    try {
      const updated = await reorderChecklistCategories(optimistic.map((c) => c.id));
      onCategoriesChanged(updated);
    } catch (e) {
      onCategoriesChanged(previous);
      setError(describeApiError(e, "순서를 저장하지 못했습니다."));
    } finally {
      setReordering(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCategory || deleting) return;
    setDeleting(true);
    try {
      await deleteChecklistCategory(deletingCategory.id);
      onCategoriesChanged(categories.filter((c) => c.id !== deletingCategory.id));
      setDeletingCategory(null);
    } catch (e) {
      setError(describeApiError(e, "카테고리를 삭제하지 못했습니다."));
      setDeletingCategory(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-md border border-border-default">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3 className="text-sm font-semibold text-fg-default">카테고리 관리</h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`flex h-8 items-center gap-1 rounded-md border border-control-border px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}>
            <PlusIcon size={14} aria-hidden="true" /> 카테고리 추가
          </button>
        )}
      </div>

      {error && <p className="px-4 pt-3 text-sm text-danger-fg">{error}</p>}

      {adding && (
        <div className="flex items-center gap-2 border-b border-border-default px-4 py-3">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNew();
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
            placeholder="새 카테고리 이름"
            className={`h-9 w-48 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
          <button type="button" onClick={() => void submitNew()} disabled={pendingId === "new"} className={`h-8 rounded-md bg-success-emphasis px-2.5 text-xs font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}>
            추가
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
        <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col divide-y divide-border-default">
            {sorted.length === 0 && <p className="px-4 py-3 text-sm text-fg-muted">등록된 카테고리가 없습니다.</p>}
            {sorted.map((category) => (
              <SortableCategoryRow key={category.id} id={category.id}>
                {({ attributes, listeners }) => (
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <button
                      type="button"
                      {...attributes}
                      {...listeners}
                      disabled={reordering}
                      aria-label={`${category.name} 순서 변경`}
                      className={`flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:text-fg-default active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                    >
                      <GrabberIcon size={14} aria-hidden="true" />
                    </button>
                    {editingId === category.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => void commitRename(category)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename(category);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className={`h-8 w-48 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                        disabled={pendingId === category.id}
                        className={`flex-1 rounded px-1 py-0.5 text-left text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                      >
                        {category.name}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeletingCategory(category)}
                      disabled={pendingId === category.id}
                      className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </SortableCategoryRow>
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeDragCategory && (
            <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-default px-3 py-2 text-sm shadow-md">
              <GrabberIcon size={14} className="text-fg-muted" aria-hidden="true" />
              <span className="font-medium text-fg-default">{activeDragCategory.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {deletingCategory && (
        <WorkLogModal
          titleId={TITLE_ID}
          title="카테고리를 삭제하시겠습니까?"
          onClose={() => setDeletingCategory(null)}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                disabled={deleting}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          }
        >
          <p className="text-sm text-fg-default">
            &ldquo;{deletingCategory.name}&rdquo; 카테고리를 삭제하시겠습니까?
            <br />
            이 카테고리의 체크리스트 항목은 삭제되지 않고 미분류로 이동합니다.
          </p>
        </WorkLogModal>
      )}
    </div>
  );
}

type DragHandleProps = { attributes: ReturnType<typeof useSortable>["attributes"]; listeners: ReturnType<typeof useSortable>["listeners"] };

function SortableCategoryRow({ id, children }: { id: string; children: (drag: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      {children({ attributes, listeners })}
    </div>
  );
}
