"use client";

import { useState } from "react";
import { PlusIcon } from "@primer/octicons-react";
import { createCategory, deleteCategory, renameCategory, setCategoryActive, setDefaultCategory } from "@/lib/api/categories";
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
  onClose: () => void;
}

const sortForDisplay = (a: ActivityCategory, b: ActivityCategory) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");

// Minimal MVP category management (Requirement 3): create/rename/activate/
// deactivate/set-default only, exactly the backend's own contract — no
// physical delete, no reordering, no depth beyond parent/child. Every action
// persists immediately (unlike StartTimeCriteriaModal's deferred draft-then-
// save), since these operations are individually simple, already
// idempotent/validated server-side, and interdependent in ways (deactivating
// the current default clears it; setting a default clears the previous one)
// that are safer to let the backend resolve one call at a time than to
// re-derive client-side across a batch.
export function CategoryManagementModal({ categories, onCategoryUpserted, onCategoryDeleted, onClose }: CategoryManagementModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
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

  if (deletingCategory) {
    return (
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
          삭제된 카테고리는 복구할 수 없습니다.
        </p>
      </WorkLogModal>
    );
  }

  return (
    <WorkLogModal
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
            <div key={root.id} className="rounded-md border border-border-default">
              <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-canvas-subtle px-3 py-2.5">
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
                    <div key={child.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
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
