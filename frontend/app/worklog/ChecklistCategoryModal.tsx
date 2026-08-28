"use client";

import { useState } from "react";
import { GrabberIcon, PlusIcon } from "@primer/octicons-react";
import {
  createChecklistCategory,
  deleteChecklistCategory,
  renameChecklistCategory,
  reorderChecklistCategories,
} from "@/lib/api/checklist";
import type { ChecklistCategoryDto } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-checklist-category-title";

interface ChecklistCategoryModalProps {
  categories: ChecklistCategoryDto[];
  onCategoriesChanged: (categories: ChecklistCategoryDto[]) => void;
  onClose: () => void;
}

const sortForDisplay = (a: ChecklistCategoryDto, b: ChecklistCategoryDto) => a.position - b.position || a.name.localeCompare(b.name, "ko");

// Single-level checklist category management (REQ-05 §10.5) — categories
// are for management organization only, not a historical/statistical
// identity, so changes here take effect immediately (no effective dating,
// unlike ChecklistItem). Deleting a category never deletes its items; the
// backend moves them to "Uncategorized" (categoryId: null).
export function ChecklistCategoryModal({ categories, onCategoriesChanged, onClose }: ChecklistCategoryModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ChecklistCategoryDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sorted = [...categories].sort(sortForDisplay);

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

  async function handleDrop(targetId: string) {
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || draggedId === targetId) return;
    const ids = sorted.map((c) => c.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    setError(null);
    try {
      const updated = await reorderChecklistCategories(ids);
      onCategoriesChanged(updated);
    } catch (e) {
      setError(describeApiError(e, "순서를 저장하지 못했습니다."));
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
          이 카테고리의 체크리스트 항목은 삭제되지 않고 미분류로 이동합니다.
        </p>
      </WorkLogModal>
    );
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="체크리스트 카테고리 관리"
      onClose={onClose}
      size="default"
      footer={
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          className={`ml-auto h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          닫기
        </button>
      }
    >
      {error && <p className="mb-3 text-sm text-danger-fg">{error}</p>}
      <div className="flex flex-col divide-y divide-border-default rounded-md border border-border-default">
        {sorted.length === 0 && <p className="px-3 py-3 text-sm text-fg-muted">등록된 카테고리가 없습니다.</p>}
        {sorted.map((category) => (
          <div
            key={category.id}
            className={`flex items-center gap-2 px-3 py-2.5 ${dragId === category.id ? "opacity-50" : ""}`}
            onDragOver={(e) => dragId && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(category.id);
            }}
          >
            <span
              draggable
              onDragStart={() => setDragId(category.id)}
              onDragEnd={() => setDragId(null)}
              className="cursor-grab text-fg-muted hover:text-fg-default active:cursor-grabbing"
            >
              <GrabberIcon size={14} aria-hidden="true" />
            </span>
            {editingId === category.id ? (
              <input
                type="text"
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitRename(category)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(category);
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
        ))}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
              placeholder="새 카테고리 이름"
              className={`h-9 w-48 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
            <button type="button" onClick={submitNew} disabled={pendingId === "new"} className={`h-8 rounded-md bg-success-emphasis px-2.5 text-xs font-medium text-white hover:opacity-90 ${FOCUS_VISIBLE}`}>
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
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`flex h-9 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            <PlusIcon size={16} aria-hidden="true" />
            카테고리 추가
          </button>
        )}
      </div>
    </WorkLogModal>
  );
}
