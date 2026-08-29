"use client";

import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, ChevronRightIcon, GrabberIcon, KebabHorizontalIcon, PlusIcon } from "@primer/octicons-react";
import { createCategory, deleteCategory, moveCategory, renameCategory, reorderCategories, setCategoryActive, setDefaultCategory } from "@/lib/api/categories";
import type { ActivityCategory } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-category-management-title";

interface WorkCategorySettingsSectionProps {
  categories: ActivityCategory[];
  onCategoryUpserted: (category: ActivityCategory) => void;
  onCategoryDeleted: (id: string) => void;
  onCategoriesReplaced: (categories: ActivityCategory[]) => void;
}

const sortForDisplay = (a: ActivityCategory, b: ActivityCategory) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");

// Inline "업무시간 카테고리 관리" (post-production iteration 1, batch 2) —
// replaces CategoryManagementModal as the primary category-management
// surface, living at the bottom of the Work Record page under "근무 기록
// 설정" instead of behind a top-toolbar modal button. Same backend contract
// as before (create/rename/activate/deactivate/set-default/delete/move/
// reorder — see docs/backend/activity-categories.md); the two changes here
// are purely presentational: (1) a single full-width parent->child
// hierarchy list instead of a modal, with compact per-row "⋯" overflow
// actions instead of a permanent button cluster, and (2) dnd-kit-based
// sortable drag instead of native HTML5 drag-and-drop, for the smoother
// optimistic-move/single-persist-on-drop/rollback-on-failure interaction
// quality this batch requires. Cross-parent relocation is still never a
// drag gesture — see handleDragEnd's same-parent-only check — only the
// explicit 이동 dialog changes a child's parent, per product policy
// (docs/product/work-log-policy.md).
export function WorkCategorySettingsSection({
  categories,
  onCategoryUpserted,
  onCategoryDeleted,
  onCategoriesReplaced,
}: WorkCategorySettingsSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(new Set());
  const [movingCategory, setMovingCategory] = useState<ActivityCategory | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<ActivityCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  // DragOverlay state (§1 visual-stability fix): the row/card left behind
  // in the list becomes a plain dimmed ghost (same DOM/content, so its
  // height/padding/alignment never change) while this floating, isolated
  // clone — sized to the measured list width so it never rewraps
  // differently than the real row — follows the pointer. This is what
  // keeps dragging from visually "squashing": the live list item is never
  // itself the thing being transformed to an arbitrary screen position.
  // Measured from the outer list container (not dnd-kit's own
  // `active.rect`, which isn't populated yet at the moment onDragStart
  // fires — its own measurement effect runs one render later) — a child
  // row spans the same full content width as a root card, so this one
  // measurement is accurate for both.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const roots = categories.filter((c) => c.parentId === null).sort(sortForDisplay);
  const childrenByParent = new Map<string, ActivityCategory[]>();
  for (const c of categories) {
    if (c.parentId === null) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c);
    childrenByParent.set(c.parentId, list);
  }
  for (const list of childrenByParent.values()) list.sort(sortForDisplay);

  // §3 child-row DnD fix, part two: a single DndContext holds the root-level
  // SortableContext AND every root's independently nested child
  // SortableContext at once, so dnd-kit's droppableContainers list spans
  // ALL of them together. Plain closestCenter compares the dragged item's
  // center against every registered droppable regardless of which list it
  // belongs to — dragging a root card (a tall block spanning its own
  // header + all its children) can end up "closest" to some unrelated
  // child row from a different root entirely, which then silently no-ops
  // the whole reorder (handleDragEnd's own parentId-mismatch guard rejects
  // it). Scoping the candidate set to the active item's own sibling group
  // before running closestCenter is what keeps root-vs-root and
  // child-vs-same-parent-child comparisons from ever bleeding into each
  // other.
  const collisionDetection: CollisionDetection = (args) => {
    const activeCategory = categories.find((c) => c.id === args.active.id);
    if (!activeCategory) return closestCenter(args);
    const scopedContainers = args.droppableContainers.filter((container) => {
      if (container.id === args.active.id) return true;
      const candidate = categories.find((c) => c.id === container.id);
      return candidate != null && candidate.parentId === activeCategory.parentId;
    });
    return closestCenter({ ...args, droppableContainers: scopedContainers });
  };

  async function runAction(id: string, action: () => Promise<ActivityCategory>) {
    setError(null);
    setPendingId(id);
    try {
      const updated = await action();
      onCategoryUpserted(updated);
    } catch (e) {
      setError(describeApiError(e, "카테고리를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPendingId(null);
    }
  }

  function startEditing(category: ActivityCategory) {
    setError(null);
    setOpenMenuId(null);
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function commitRename(category: ActivityCategory) {
    const trimmed = editingName.trim();
    setEditingId(null);
    if (trimmed === "" || trimmed === category.name) return;
    await runAction(category.id, () => renameCategory(category.id, trimmed));
  }

  async function submitNewRoot() {
    const trimmed = newRootName.trim();
    if (trimmed === "") return;
    setError(null);
    setPendingId("new-root");
    try {
      const created = await createCategory({ name: trimmed, parentId: null });
      onCategoryUpserted(created);
      setNewRootName("");
      setAddingRoot(false);
    } catch (e) {
      setError(describeApiError(e, "대분류를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPendingId(null);
    }
  }

  async function submitNewChild(parentId: string) {
    const trimmed = newChildName.trim();
    if (trimmed === "") return;
    setError(null);
    setPendingId(parentId);
    try {
      const created = await createCategory({ name: trimmed, parentId });
      onCategoryUpserted(created);
      setNewChildName("");
      setAddingChildFor(null);
    } catch (e) {
      setError(describeApiError(e, "중분류를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCategory || deleting) return;
    setDeleting(true);
    try {
      await deleteCategory(deletingCategory.id);
      onCategoryDeleted(deletingCategory.id);
      setDeletingCategory(null);
      setError(null);
    } catch (e) {
      setDeletingCategory(null);
      setError(describeApiError(e, "카테고리를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setDeleting(false);
    }
  }

  function openMoveDialog(category: ActivityCategory) {
    setError(null);
    setOpenMenuId(null);
    setMovingCategory(category);
    setMoveTargetId("");
  }

  async function handleConfirmMove() {
    if (!movingCategory || !moveTargetId || moving) return;
    setMoving(true);
    try {
      const updated = await moveCategory(movingCategory.id, moveTargetId);
      onCategoryUpserted(updated);
      setMovingCategory(null);
    } catch (e) {
      setError(describeApiError(e, "카테고리를 이동하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setMoving(false);
    }
  }

  function toggleCollapsed(rootId: string) {
    setCollapsedRootIds((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragWidth(listRef.current?.getBoundingClientRect().width ?? null);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  // Optimistic drag-and-drop reorder (§7 quality standard): moves the
  // dragged row in local state immediately, persists the final order ONCE
  // on drop, and rolls back to the pre-drag canonical order if that
  // persist fails. Same-parent siblings only — dnd-kit reports `over` as
  // whatever row is currently under the pointer, so a cross-parent drop
  // (different `parentId`) is silently ignored here rather than
  // reinterpreted as a move; changing a child's parent stays the explicit
  // 이동 action above, never a drag gesture (product policy).
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id || reordering) return;

    const activeCategory = categories.find((c) => c.id === active.id);
    const overCategory = categories.find((c) => c.id === over.id);
    if (!activeCategory || !overCategory) return;
    if (activeCategory.parentId !== overCategory.parentId) return;

    const parentId = activeCategory.parentId;
    const siblingIds = categories
      .filter((c) => c.parentId === parentId)
      .sort(sortForDisplay)
      .map((c) => c.id);
    const fromIndex = siblingIds.indexOf(activeCategory.id);
    const toIndex = siblingIds.indexOf(overCategory.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const reorderedIds = arrayMove(siblingIds, fromIndex, toIndex);

    const previousCategories = categories;
    const optimistic = categories.map((c) => {
      if (c.parentId !== parentId) return c;
      const position = reorderedIds.indexOf(c.id);
      return position === -1 ? c : { ...c, sortOrder: position };
    });
    onCategoriesReplaced(optimistic);

    setError(null);
    setReordering(true);
    try {
      const updated = await reorderCategories({ parentId, orderedIds: reorderedIds });
      onCategoriesReplaced(updated);
    } catch (e) {
      onCategoriesReplaced(previousCategories);
      setError(describeApiError(e, "순서를 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요."));
    } finally {
      setReordering(false);
    }
  }

  const activeCategory = activeId ? categories.find((c) => c.id === activeId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-fg-default">업무시간 카테고리 관리</h3>
        {!addingRoot && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAddingRoot(true);
            }}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <PlusIcon size={14} aria-hidden="true" />
            대분류 추가
          </button>
        )}
      </div>
      <p className="text-xs text-fg-muted">업무시간 기록에 사용할 대분류와 중분류를 관리합니다.</p>
      {error && <p className="text-sm text-danger-fg">{error}</p>}

      {/* closestCenter (rather than the DndContext default, rectIntersection)
          is dnd-kit's own recommended collision strategy for vertical
          sortable lists — it picks whichever sibling's center is nearest
          the pointer instead of requiring the pointer's rectangle to
          overlap a target's rectangle, which is what made dropping between
          the shorter/tighter child rows feel like it needed pixel-perfect
          placement. Scoped to the active item's own sibling group — see
          `collisionDetection` above — so it never matches across the
          root-level list and a nested child list. */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div ref={listRef} className="flex flex-col gap-3">
          <SortableContext items={roots.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {roots.map((root) => {
              const children = childrenByParent.get(root.id) ?? [];
              const collapsed = collapsedRootIds.has(root.id);
              return (
                <SortableCategoryCard key={root.id} id={root.id}>
                  {(drag) => (
                  <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-canvas-subtle px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(root.id)}
                      aria-label={collapsed ? `${root.name} 펼치기` : `${root.name} 접기`}
                      className={`rounded p-0.5 text-fg-muted hover:bg-canvas-default ${FOCUS_VISIBLE}`}
                    >
                      {collapsed ? <ChevronRightIcon size={14} aria-hidden="true" /> : <ChevronDownIcon size={14} aria-hidden="true" />}
                    </button>
                    <DragHandle label={`${root.name} 순서 변경`} attributes={drag.attributes} listeners={drag.listeners} />
                    <CategoryNameCell
                      category={root}
                      editing={editingId === root.id}
                      editingName={editingName}
                      onEditingNameChange={setEditingName}
                      onStartEditing={() => startEditing(root)}
                      onCommit={() => commitRename(root)}
                      onCancel={() => setEditingId(null)}
                      labelClassName="text-sm font-semibold text-fg-default"
                    />
                    <span className="text-xs text-fg-muted">대분류</span>
                    {!root.isActive && (
                      <span className="whitespace-nowrap rounded-full bg-canvas-default px-2 py-0.5 text-xs font-medium text-fg-muted">비활성</span>
                    )}
                    <div className="ml-auto">
                      <OverflowMenu
                        rowId={root.id}
                        openMenuId={openMenuId}
                        onOpenChange={setOpenMenuId}
                        items={[
                          {
                            label: root.isActive ? "비활성화" : "활성화",
                            onClick: () => runAction(root.id, () => setCategoryActive(root.id, !root.isActive)),
                          },
                          { label: "삭제", danger: true, onClick: () => setDeletingCategory(root) },
                        ]}
                        disabled={pendingId === root.id}
                      />
                    </div>
                  </div>

                  {!collapsed && (
                    // §3 child-row DnD fix: no `divide-y` here — that utility
                    // draws each divider as a static border tied to sibling
                    // DOM order, which doesn't move with a row's own
                    // dnd-kit transform during drag, so the line and the
                    // (visually shifted) row content drift apart mid-drag.
                    // Each SortableCategoryRow instead carries its own
                    // border-b directly, so the divider is part of the same
                    // box being transformed and always travels with its row.
                    <div className="flex flex-col">
                      {children.length === 0 && addingChildFor !== root.id && (
                        <p className="border-b border-border-default px-3 py-3 text-sm text-fg-muted">중분류가 없습니다.</p>
                      )}
                      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        {children.map((child) => {
                          const childPending = pendingId === child.id;
                          return (
                            <SortableCategoryRow key={child.id} id={child.id}>
                              {(drag) => (
                              <>
                              <DragHandle label={`${child.name} 순서 변경`} attributes={drag.attributes} listeners={drag.listeners} />
                              <CategoryNameCell
                                category={child}
                                editing={editingId === child.id}
                                editingName={editingName}
                                onEditingNameChange={setEditingName}
                                onStartEditing={() => startEditing(child)}
                                onCommit={() => commitRename(child)}
                                onCancel={() => setEditingId(null)}
                                labelClassName="text-sm text-fg-default"
                              />
                              {child.isDefault && (
                                <span className="whitespace-nowrap rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-fg">기본</span>
                              )}
                              {!child.isActive && (
                                <span className="whitespace-nowrap rounded-full bg-canvas-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">비활성</span>
                              )}
                              <div className="ml-auto">
                                <OverflowMenu
                                  rowId={child.id}
                                  openMenuId={openMenuId}
                                  onOpenChange={setOpenMenuId}
                                  disabled={childPending}
                                  items={[
                                    ...(child.isActive && !child.isDefault
                                      ? [{ label: "기본으로 설정", onClick: () => runAction(child.id, () => setDefaultCategory(child.id)) }]
                                      : []),
                                    {
                                      label: child.isActive ? "비활성화" : "활성화",
                                      onClick: () => runAction(child.id, () => setCategoryActive(child.id, !child.isActive)),
                                    },
                                    ...(roots.length > 1 ? [{ label: "이동", onClick: () => openMoveDialog(child) }] : []),
                                    { label: "삭제", danger: true, onClick: () => setDeletingCategory(child) },
                                  ]}
                                />
                              </div>
                              </>
                              )}
                            </SortableCategoryRow>
                          );
                        })}
                      </SortableContext>

                      {addingChildFor === root.id ? (
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <input
                            type="text"
                            autoFocus
                            value={newChildName}
                            onChange={(e) => setNewChildName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitNewChild(root.id);
                              if (e.key === "Escape") {
                                setAddingChildFor(null);
                                setNewChildName("");
                              }
                            }}
                            placeholder="새 중분류 이름"
                            className={`h-9 w-48 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                          />
                          <button
                            type="button"
                            onClick={() => submitNewChild(root.id)}
                            disabled={pendingId === root.id}
                            className={`h-8 rounded-md bg-success-emphasis px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                          >
                            추가
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingChildFor(null);
                              setNewChildName("");
                            }}
                            className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setAddingChildFor(root.id);
                              setNewChildName("");
                            }}
                            className={`flex h-8 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                          >
                            <PlusIcon size={14} aria-hidden="true" />
                            중분류 추가
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  </>
                  )}
                </SortableCategoryCard>
              );
            })}
          </SortableContext>

          {addingRoot && (
            <div className="flex items-center gap-2 rounded-md border border-border-default px-3 py-2.5">
              <input
                type="text"
                autoFocus
                value={newRootName}
                onChange={(e) => setNewRootName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewRoot();
                  if (e.key === "Escape") {
                    setAddingRoot(false);
                    setNewRootName("");
                  }
                }}
                placeholder="새 대분류 이름"
                className={`h-9 w-48 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
              <button
                type="button"
                onClick={submitNewRoot}
                disabled={pendingId === "new-root"}
                className={`h-8 rounded-md bg-success-emphasis px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingRoot(false);
                  setNewRootName("");
                }}
                className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeCategory && dragWidth != null && (
            <div style={{ width: dragWidth }}>
              {activeCategory.parentId === null ? (
                <RootDragPreview category={activeCategory} />
              ) : (
                <ChildDragPreview category={activeCategory} />
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {movingCategory && (
        <WorkLogModal
          key="move"
          titleId={TITLE_ID}
          title="중분류 이동"
          onClose={() => setMovingCategory(null)}
          size="compact"
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMovingCategory(null)}
                disabled={moving}
                data-autofocus
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                disabled={moving || !moveTargetId}
                className={`h-9 rounded-md bg-success-emphasis px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                {moving ? "이동 중…" : "이동"}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">현재 대분류</span>
              <span className="text-sm text-fg-default">
                {roots.find((r) => r.id === movingCategory.parentId)?.name ?? "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="move-target-select" className="text-xs text-fg-muted">
                이동할 대분류
              </label>
              <select
                id="move-target-select"
                value={moveTargetId}
                onChange={(e) => setMoveTargetId(e.target.value)}
                className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              >
                <option value="" disabled>
                  대분류 선택
                </option>
                {roots
                  .filter((r) => r.id !== movingCategory.parentId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-fg-muted">이동하면 대상 대분류의 맨 끝에 추가됩니다. 이후 드래그로 순서를 조정할 수 있습니다.</p>
          </div>
        </WorkLogModal>
      )}

      {deletingCategory && (
        <WorkLogModal
          key="delete"
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
            삭제된 카테고리는 복구할 수 없습니다.
          </p>
        </WorkLogModal>
      )}
    </div>
  );
}

type DragHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

// Sortable wrapper for a root category card. Only the grabber icon (passed
// `attributes`/`listeners` as a render prop) is draggable — the card itself
// is a plain positioned container — so clicking the name, collapse chevron,
// or overflow menu never risks starting a drag.
// §1 visual-stability fix: with a DragOverlay now carrying the "lifted"
// clone (see RootDragPreview/ChildDragPreview + the <DragOverlay> in the
// main render), the item left behind in the list must stay a byte-for-byte
// identical box while dragging — same border/background/padding/content —
// only dimmed via opacity. It must never gain its own shadow/elevated
// z-index/background swap, which is what previously made the row read as
// visually "squashed": those extra style changes altered the box's
// effective rendering independently of the (harmless) translate transform
// dnd-kit applies for the sibling-shift animation.
function SortableCategoryCard({ id, children }: { id: string; children: (drag: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="rounded-md border border-border-default"
    >
      {children({ attributes, listeners })}
    </div>
  );
}

function SortableCategoryRow({ id, children }: { id: string; children: (drag: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex flex-wrap items-center gap-2 border-b border-border-default px-3 py-2.5"
    >
      {children({ attributes, listeners })}
    </div>
  );
}

// Standalone grab handle (rather than making the whole row draggable) so
// clicking the name/menu never accidentally starts a drag — dnd-kit's drag
// `attributes`/`listeners` are attached only to this handle element,
// forwarded down from the row/card's own `useSortable()` call above.
function DragHandle({ label, attributes, listeners }: { label: string } & DragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={label}
      className={`cursor-grab rounded p-0.5 text-fg-muted hover:text-fg-default active:cursor-grabbing ${FOCUS_VISIBLE}`}
    >
      <GrabberIcon size={14} aria-hidden="true" />
    </button>
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

// Compact row-level "⋯" overflow action menu (task requirement: prefer this
// over a permanently visible button cluster on every row). Closes on
// outside click or Escape; only one row's menu is ever open at once
// (parent-owned `openMenuId`).
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
        className={`rounded-md p-1.5 text-fg-muted hover:bg-canvas-default disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_VISIBLE}`}
      >
        <KebabHorizontalIcon size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-md border border-border-default bg-surface-default py-1 shadow-md"
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

interface CategoryNameCellProps {
  category: ActivityCategory;
  editing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onStartEditing: () => void;
  onCommit: () => void;
  onCancel: () => void;
  labelClassName: string;
}

function CategoryNameCell({
  category,
  editing,
  editingName,
  onEditingNameChange,
  onStartEditing,
  onCommit,
  onCancel,
  labelClassName,
}: CategoryNameCellProps) {
  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={editingName}
        onChange={(e) => onEditingNameChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className={`h-8 w-48 rounded-md border border-control-border bg-control-bg px-2 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEditing}
      aria-label={`${category.name} 이름 수정`}
      className={`rounded px-1 py-0.5 text-left hover:bg-canvas-subtle ${labelClassName} ${FOCUS_VISIBLE}`}
    >
      {category.name}
    </button>
  );
}

// Static (non-interactive) visual clones rendered inside <DragOverlay> —
// deliberately a plain read-only snapshot of a root/child row's real
// markup (grabber/name/badges/overflow trigger), never the live
// interactive row itself, so the floating "lifted" clone can never
// misfire a click/menu/rename mid-drag. Geometry fidelity with the real
// row comes from reusing the exact same classNames, not from measuring —
// the parent sizes this via an explicit `width` wrapper (see the
// <DragOverlay> usage above) so it never rewraps differently than the row
// it was picked up from. Every icon-wrapping <span> here is explicitly
// `inline-flex items-center justify-center` — a plain `<span>` defaults to
// `display: inline`, and for inline elements vertical padding paints but
// does NOT count toward layout height (only line-height does), so a bare
// `<span className="p-1.5">` around an icon can size taller than its
// visible content — unlike the real row's equivalent `<button>`, which is
// `inline-block` by default and sizes correctly. Forcing inline-flex here
// sidesteps that entirely and guarantees the clone's height matches.
function RootDragPreview({ category }: { category: ActivityCategory }) {
  return (
    <div className="cursor-grabbing rounded-md border border-border-default bg-canvas-subtle shadow-overlay">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="inline-flex items-center justify-center rounded p-0.5 text-fg-muted">
          <ChevronDownIcon size={14} aria-hidden="true" />
        </span>
        <span className="inline-flex items-center justify-center rounded p-0.5 text-fg-default">
          <GrabberIcon size={14} aria-hidden="true" />
        </span>
        <span className="rounded px-1 py-0.5 text-left text-sm font-semibold text-fg-default">{category.name}</span>
        <span className="text-xs text-fg-muted">대분류</span>
        {!category.isActive && (
          <span className="whitespace-nowrap rounded-full bg-canvas-default px-2 py-0.5 text-xs font-medium text-fg-muted">비활성</span>
        )}
        <div className="ml-auto">
          <span className="inline-flex items-center justify-center rounded-md p-1.5 text-fg-muted">
            <KebabHorizontalIcon size={14} aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

function ChildDragPreview({ category }: { category: ActivityCategory }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-default px-3 py-2.5 shadow-overlay cursor-grabbing">
      <span className="inline-flex items-center justify-center rounded p-0.5 text-fg-default">
        <GrabberIcon size={14} aria-hidden="true" />
      </span>
      <span className="rounded px-1 py-0.5 text-left text-sm text-fg-default">{category.name}</span>
      {category.isDefault && (
        <span className="whitespace-nowrap rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-fg">기본</span>
      )}
      {!category.isActive && (
        <span className="whitespace-nowrap rounded-full bg-canvas-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">비활성</span>
      )}
      <div className="ml-auto">
        <span className="inline-flex items-center justify-center rounded-md p-1.5 text-fg-muted">
          <KebabHorizontalIcon size={14} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
