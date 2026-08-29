"use client";

import { useState } from "react";
import { GrabberIcon, PlusIcon } from "@primer/octicons-react";
import { createCategory, deleteCategory, moveCategory, renameCategory, reorderCategories, setCategoryActive, setDefaultCategory } from "@/lib/api/categories";
import type { ActivityCategory } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-category-management-title";

interface CategoryManagementModalProps {
  categories: ActivityCategory[];
  /** Called after every successful mutation with the single created/updated
   *  category — the caller (page.tsx) merges it into its own catalog so
   *  every open selector (WorkTimeEntryEditor, etc.) reflects the change
   *  immediately without a full refetch. */
  onCategoryUpserted: (category: ActivityCategory) => void;
  /** Called after a successful physical delete — the caller removes it from
   *  its own catalog so every open selector stops offering it immediately. */
  onCategoryDeleted: (id: string) => void;
  /** Called after a reorder, which returns the full refreshed catalog
   *  (unlike every other action here, which touches just one row). */
  onCategoriesReplaced: (categories: ActivityCategory[]) => void;
  onClose: () => void;
}

const sortForDisplay = (a: ActivityCategory, b: ActivityCategory) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");

// Minimal MVP category management (Requirement 3, later extended with
// physical delete in the pre-production final polish pass): create/rename/
// activate/deactivate/set-default/delete, exactly the backend's own
// contract — still no reordering, no depth beyond parent/child. Delete is
// backend-gated, not merely hidden here: a used category (referenced by a
// WorkTimeEntry or PlannedTimeBlock) or a root with remaining children is
// rejected server-side (400), regardless of what this UI does or doesn't
// show — see ActivityCategoryService.delete and
// docs/backend/activity-categories.md. Every action persists immediately
// (unlike StartTimeCriteriaModal's deferred draft-then-save), since these
// operations are individually simple, already idempotent/validated
// server-side, and interdependent in ways (deactivating the current default
// clears it; setting a default clears the previous one) that are safer to
// let the backend resolve one call at a time than to re-derive client-side
// across a batch.
export function CategoryManagementModal({
  categories,
  onCategoryUpserted,
  onCategoryDeleted,
  onCategoriesReplaced,
  onClose,
}: CategoryManagementModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Drag-and-drop reordering (REQ-06): `dragged` identifies the row picked
  // up; `parentId: null` means it's a root, otherwise a child of that root.
  // Cross-parent drops are ignored outright — moving a child to a different
  // parent is a deliberate separate action (movingCategory below), never a
  // drag gesture.
  const [dragged, setDragged] = useState<{ id: string; parentId: string | null } | null>(null);
  const [reordering, setReordering] = useState(false);
  // Explicit "move to a different parent" action (REQ-06.3) — a small
  // modal-within-the-modal, mirroring deletingCategory's full-body-replace
  // pattern, never a cross-parent drag gesture.
  const [movingCategory, setMovingCategory] = useState<ActivityCategory | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [newRootName, setNewRootName] = useState("");
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  // Physical-delete confirmation (pre-production final polish): holds the
  // category pending confirmation — nothing is deleted until the user
  // explicitly confirms. Deliberately a separate phase (replacing the whole
  // modal body, matching WorkLogRecordDetailModal's own confirmation
  // pattern) rather than an inline row confirm, so an accidental double-click
  // can never delete anything.
  const [deletingCategory, setDeletingCategory] = useState<ActivityCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roots = categories.filter((c) => c.parentId === null).sort(sortForDisplay);
  const childrenByParent = new Map<string, ActivityCategory[]>();
  for (const c of categories) {
    if (c.parentId === null) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c);
    childrenByParent.set(c.parentId, list);
  }
  for (const list of childrenByParent.values()) list.sort(sortForDisplay);

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

  // Reorders one sibling group (roots when parentId is null, otherwise one
  // root's children) by moving `draggedId` to just before `targetId`, then
  // persists the full resulting order immediately (no separate save step,
  // matching every other action in this modal).
  async function handleDrop(parentId: string | null, targetId: string) {
    const current = dragged;
    setDragged(null);
    if (!current || current.parentId !== parentId || current.id === targetId || reordering) return;

    const siblings = (parentId === null ? roots : (childrenByParent.get(parentId) ?? [])).map((c) => c.id);
    const fromIndex = siblings.indexOf(current.id);
    const toIndex = siblings.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    siblings.splice(toIndex, 0, siblings.splice(fromIndex, 1)[0]);

    setError(null);
    setReordering(true);
    try {
      const updated = await reorderCategories({ parentId, orderedIds: siblings });
      onCategoriesReplaced(updated);
    } catch (e) {
      setError(describeApiError(e, "순서를 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요."));
    } finally {
      setReordering(false);
    }
  }

  function openMoveDialog(category: ActivityCategory) {
    setError(null);
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

  if (movingCategory) {
    const targets = roots.filter((r) => r.id !== movingCategory.parentId);
    return (
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
              {targets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-fg-muted">이동하면 대상 대분류의 맨 끝에 추가됩니다. 이후 드래그로 순서를 조정할 수 있습니다.</p>
        </div>
      </WorkLogModal>
    );
  }

  if (deletingCategory) {
    return (
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
    );
  }

  return (
    <WorkLogModal
      key="list"
      titleId={TITLE_ID}
      title="카테고리 관리"
      onClose={onClose}
      size="wide"
      footer={
        <div className="ml-auto">
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            닫기
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-fg-muted">업무시간 기록에 사용할 대분류/중분류 카테고리를 관리합니다.</p>
      {error && <p className="mb-4 text-sm text-danger-fg">{error}</p>}

      <div className="flex flex-col gap-4">
        {roots.map((root) => {
          const children = childrenByParent.get(root.id) ?? [];
          const rootPending = pendingId === root.id;
          return (
            <div
              key={root.id}
              className={`rounded-md border border-border-default ${dragged?.id === root.id ? "opacity-50" : ""}`}
              onDragOver={(e) => {
                if (dragged && dragged.parentId === null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(null, root.id);
              }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-canvas-subtle px-3 py-2.5">
                <span
                  draggable
                  onDragStart={() => setDragged({ id: root.id, parentId: null })}
                  onDragEnd={() => setDragged(null)}
                  aria-label={`${root.name} 순서 변경`}
                  className="cursor-grab text-fg-muted hover:text-fg-default active:cursor-grabbing"
                >
                  <GrabberIcon size={14} aria-hidden="true" />
                </span>
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
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => runAction(root.id, () => setCategoryActive(root.id, !root.isActive))}
                    disabled={rootPending}
                    className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${
                      root.isActive ? "text-fg-default" : "text-fg-muted"
                    } ${FOCUS_VISIBLE}`}
                  >
                    {root.isActive ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingCategory(root)}
                    disabled={rootPending}
                    className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-border-default">
                {children.length === 0 && addingChildFor !== root.id && (
                  <p className="px-3 py-3 text-sm text-fg-muted">중분류가 없습니다.</p>
                )}
                {children.map((child) => {
                  const childPending = pendingId === child.id;
                  return (
                    <div
                      key={child.id}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${dragged?.id === child.id ? "opacity-50" : ""}`}
                      onDragOver={(e) => {
                        if (dragged && dragged.parentId === root.id) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(root.id, child.id);
                      }}
                    >
                      <span
                        draggable
                        onDragStart={() => setDragged({ id: child.id, parentId: root.id })}
                        onDragEnd={() => setDragged(null)}
                        aria-label={`${child.name} 순서 변경`}
                        className="cursor-grab text-fg-muted hover:text-fg-default active:cursor-grabbing"
                      >
                        <GrabberIcon size={14} aria-hidden="true" />
                      </span>
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
                        <span className="whitespace-nowrap rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-fg">
                          기본
                        </span>
                      )}
                      {!child.isActive && (
                        <span className="whitespace-nowrap rounded-full bg-canvas-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                          비활성
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {child.isActive && !child.isDefault && (
                          <button
                            type="button"
                            onClick={() => runAction(child.id, () => setDefaultCategory(child.id))}
                            disabled={childPending}
                            className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                          >
                            기본으로 설정
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => runAction(child.id, () => setCategoryActive(child.id, !child.isActive))}
                          disabled={childPending}
                          className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${
                            child.isActive ? "text-fg-default" : "text-fg-muted"
                          } ${FOCUS_VISIBLE}`}
                        >
                          {child.isActive ? "비활성화" : "활성화"}
                        </button>
                        {roots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => openMoveDialog(child)}
                            disabled={childPending}
                            className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                          >
                            이동
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingCategory(child)}
                          disabled={childPending}
                          className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}

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
            </div>
          );
        })}

        {addingRoot ? (
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
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAddingRoot(true);
            }}
            className={`flex h-9 w-fit items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <PlusIcon size={16} aria-hidden="true" />
            대분류 추가
          </button>
        )}
      </div>
    </WorkLogModal>
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
