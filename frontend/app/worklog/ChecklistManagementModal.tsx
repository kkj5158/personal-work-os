"use client";

import { useEffect, useState } from "react";
import { GrabberIcon, PlusIcon } from "@primer/octicons-react";
import {
  createChecklistItem,
  deleteChecklistItem,
  getChecklistActiveCount,
  getCurrentChecklistGoal,
  listChecklistCategories,
  listChecklistItems,
  moveChecklistItem,
  reorderChecklistItems,
  scheduleChecklistGoal,
  scheduleChecklistItemVersion,
} from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto, ChecklistPriority } from "@/lib/api/types";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";
import { ChecklistCategoryModal } from "./ChecklistCategoryModal";

const TITLE_ID = "worklog-checklist-management-title";

const QUICK_EMOJIS = [
  "✅", "📝", "📖", "🏃", "💧", "🧘", "😴", "🥗", "💻", "📚",
  "🎯", "🧹", "💰", "🙏", "🚭", "🚫", "🎧", "🖊️", "🧠", "☀️",
];

type Filter = "ALL" | "CORE" | "SECONDARY" | "INACTIVE";

interface ItemFormState {
  mode: "create" | "edit";
  itemId: string | null;
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  categoryId: string | null;
  useDefaultGoal: boolean;
  customGoal: number;
  effectiveFrom: string;
}

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyForm(defaultGoal: number): ItemFormState {
  return {
    mode: "create",
    itemId: null,
    name: "",
    emoji: "✅",
    priority: "SECONDARY",
    categoryId: null,
    useDefaultGoal: true,
    customGoal: defaultGoal,
    effectiveFrom: todayDateKey(),
  };
}

interface ChecklistManagementModalProps {
  onClose: () => void;
}

// Checklist manager (REQ-05 §10.19) — a practical, single-modal management
// screen, deliberately not the future unified Settings/admin architecture.
// Items are grouped by category (including "미분류"), with native
// drag-and-drop reordering within a group (matching CategoryManagementModal's
// pattern) and an inline category select for moving between groups — no
// separate move dialog is needed here since checklist categories are a flat
// single level, unlike ActivityCategory's root/child hierarchy.
export function ChecklistManagementModal({ onClose }: ChecklistManagementModalProps) {
  const [items, setItems] = useState<ChecklistItemDto[]>([]);
  const [categories, setCategories] = useState<ChecklistCategoryDto[]>([]);
  const [activeCount, setActiveCount] = useState({ active: 0, max: 6 });
  const [globalGoal, setGlobalGoal] = useState(80);
  const [globalGoalInput, setGlobalGoalInput] = useState("80");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [dragId, setDragId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deletingItem, setDeletingItem] = useState<ChecklistItemDto | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [itemDtos, categoryDtos, count, goal] = await Promise.all([
          listChecklistItems(),
          listChecklistCategories(),
          getChecklistActiveCount(),
          getCurrentChecklistGoal(),
        ]);
        setItems(itemDtos);
        setCategories(categoryDtos);
        setActiveCount(count);
        setGlobalGoal(goal.goalPercent);
        setGlobalGoalInput(String(goal.goalPercent));
      } catch (e) {
        setError(describeApiError(e, "체크리스트 정보를 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const visibleItems = items.filter((item) => {
    if (item.deleted) return false;
    if (filter === "INACTIVE") return !item.active;
    if (!item.active) return false;
    if (filter === "CORE") return item.priority === "CORE";
    if (filter === "SECONDARY") return item.priority === "SECONDARY";
    return true;
  });

  const groups = new Map<string | null, ChecklistItemDto[]>();
  for (const item of visibleItems) {
    const list = groups.get(item.categoryId) ?? [];
    list.push(item);
    groups.set(item.categoryId, list);
  }
  for (const list of groups.values()) list.sort((a, b) => a.position - b.position);

  const orderedGroupKeys: (string | null)[] = [
    ...categories.sort((a, b) => a.position - b.position).map((c) => c.id),
    null,
  ].filter((key) => (groups.get(key) ?? []).length > 0);

  function categoryName(id: string | null): string {
    if (id === null) return "미분류";
    return categories.find((c) => c.id === id)?.name ?? "미분류";
  }

  async function handleDrop(categoryId: string | null, targetId: string) {
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || draggedId === targetId) return;
    const siblingIds = (groups.get(categoryId) ?? []).map((i) => i.id);
    const from = siblingIds.indexOf(draggedId);
    const to = siblingIds.indexOf(targetId);
    if (from === -1 || to === -1) return;
    siblingIds.splice(to, 0, siblingIds.splice(from, 1)[0]);

    setError(null);
    try {
      const updated = await reorderChecklistItems(categoryId, siblingIds);
      setItems((prev) => {
        const byId = new Map(updated.map((u) => [u.id, u]));
        return prev.map((i) => byId.get(i.id) ?? i);
      });
    } catch (e) {
      setError(describeApiError(e, "순서를 저장하지 못했습니다."));
    }
  }

  async function handleMoveCategory(item: ChecklistItemDto, categoryId: string | null) {
    setPendingId(item.id);
    setError(null);
    try {
      const updated = await moveChecklistItem(item.id, categoryId);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      setError(describeApiError(e, "카테고리를 변경하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleActive(item: ChecklistItemDto) {
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
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: updated.active } : i)));
      const count = await getChecklistActiveCount();
      setActiveCount(count);
    } catch (e) {
      setError(describeApiError(e, "상태를 변경하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingItem) return;
    setPendingId(deletingItem.id);
    try {
      await deleteChecklistItem(deletingItem.id);
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      setDeletingItem(null);
      const count = await getChecklistActiveCount();
      setActiveCount(count);
    } catch (e) {
      setError(describeApiError(e, "항목을 삭제하지 못했습니다."));
      setDeletingItem(null);
    } finally {
      setPendingId(null);
    }
  }

  function openCreateForm() {
    setFormError(null);
    setForm(emptyForm(globalGoal));
  }

  function openEditForm(item: ChecklistItemDto) {
    setFormError(null);
    setForm({
      mode: "edit",
      itemId: item.id,
      name: item.name,
      emoji: item.emoji,
      priority: item.priority,
      categoryId: item.categoryId,
      useDefaultGoal: item.goalOverridePercent == null,
      customGoal: item.goalOverridePercent ?? globalGoal,
      effectiveFrom: todayDateKey(),
    });
  }

  async function handleSubmitForm() {
    if (!form) return;
    const trimmedName = form.name.trim();
    if (trimmedName === "") {
      setFormError("이름을 입력해 주세요.");
      return;
    }
    if (form.emoji.trim() === "") {
      setFormError("이모지를 선택해 주세요.");
      return;
    }
    const goalOverride = form.useDefaultGoal ? null : form.customGoal;

    setFormSaving(true);
    setFormError(null);
    try {
      if (form.mode === "create") {
        if (activeCount.active >= activeCount.max) {
          setFormError(`활성 체크리스트 항목은 최대 ${activeCount.max}개까지 가능합니다.`);
          setFormSaving(false);
          return;
        }
        const created = await createChecklistItem({
          name: trimmedName,
          emoji: form.emoji,
          priority: form.priority,
          categoryId: form.categoryId,
          goalOverridePercent: goalOverride,
        });
        setItems((prev) => [...prev, created]);
      } else if (form.itemId) {
        await scheduleChecklistItemVersion(form.itemId, {
          effectiveFrom: form.effectiveFrom,
          name: trimmedName,
          emoji: form.emoji,
          priority: form.priority,
          active: true,
          goalOverridePercent: goalOverride,
        });
        if (form.categoryId !== items.find((i) => i.id === form.itemId)?.categoryId) {
          await moveChecklistItem(form.itemId, form.categoryId);
        }
        const refreshed = await listChecklistItems();
        setItems(refreshed);
      }
      const count = await getChecklistActiveCount();
      setActiveCount(count);
      setForm(null);
    } catch (e) {
      setFormError(describeApiError(e, "저장하지 못했습니다."));
    } finally {
      setFormSaving(false);
    }
  }

  if (showCategoryModal) {
    return (
      <ChecklistCategoryModal
        categories={categories}
        onCategoriesChanged={setCategories}
        onClose={() => setShowCategoryModal(false)}
      />
    );
  }

  if (deletingItem) {
    return (
      <WorkLogModal
        titleId={TITLE_ID}
        title="체크리스트 항목을 삭제하시겠습니까?"
        onClose={() => setDeletingItem(null)}
        size="compact"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeletingItem(null)}
              data-autofocus
              className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={pendingId === deletingItem.id}
              className={`h-9 rounded-md border border-danger-fg bg-danger-subtle px-3 text-sm font-medium text-danger-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
            >
              삭제
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
    );
  }

  if (form) {
    return (
      <WorkLogModal
        titleId={TITLE_ID}
        title={form.mode === "create" ? "체크리스트 추가" : "체크리스트 수정"}
        onClose={() => setForm(null)}
        size="default"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm(null)}
              disabled={formSaving}
              data-autofocus
              className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmitForm}
              disabled={formSaving}
              className={`h-9 rounded-md bg-success-emphasis px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
            >
              {formSaving ? "저장 중…" : "저장"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="item-name" className="text-xs text-fg-muted">
              이름
            </label>
            <input
              id="item-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">이모지</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                maxLength={4}
                aria-label="이모지 직접 입력"
                className={`h-9 w-16 rounded-md border border-control-border bg-control-bg px-2 text-center text-lg focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm({ ...form, emoji })}
                    aria-label={`이모지 ${emoji} 선택`}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-canvas-subtle ${
                      form.emoji === emoji ? "bg-primary-subtle" : ""
                    } ${FOCUS_VISIBLE}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">중요도</span>
            <div className="flex h-9 w-fit rounded-md border border-control-border bg-control-bg p-0.5 text-xs font-medium">
              {(["CORE", "SECONDARY"] as ChecklistPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`rounded px-3 ${form.priority === p ? "bg-surface-default text-fg-default shadow-sm" : "text-fg-muted hover:text-fg-default"}`}
                >
                  {p === "CORE" ? "Core" : "Secondary"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="item-category" className="text-xs text-fg-muted">
              카테고리
            </label>
            <select
              id="item-category"
              value={form.categoryId ?? ""}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value === "" ? null : e.target.value })}
              className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
            >
              <option value="">미분류</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">달성 목표</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-fg-default">
                <input type="radio" checked={form.useDefaultGoal} onChange={() => setForm({ ...form, useDefaultGoal: true })} />
                기본값 사용 ({globalGoal}%)
              </label>
              <label className="flex items-center gap-1.5 text-sm text-fg-default">
                <input type="radio" checked={!form.useDefaultGoal} onChange={() => setForm({ ...form, useDefaultGoal: false })} />
                직접 지정
              </label>
              {!form.useDefaultGoal && (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.customGoal}
                  onChange={(e) => setForm({ ...form, customGoal: Number(e.target.value) })}
                  className={`h-8 w-20 rounded-md border border-control-border bg-control-bg px-2 text-center text-sm tabular-nums text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
                />
              )}
            </div>
          </div>

          {form.mode === "edit" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-effective-from" className="text-xs text-fg-muted">
                적용 시작일
              </label>
              <input
                id="item-effective-from"
                type="date"
                min={todayDateKey()}
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                className={`h-9 w-40 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
              <p className="text-xs text-fg-muted">오늘 이후 날짜를 선택하면 그 날부터 변경사항이 적용됩니다.</p>
            </div>
          )}

          {formError && <p className="text-sm text-danger-fg">{formError}</p>}
        </div>
      </WorkLogModal>
    );
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title="체크리스트 관리"
      onClose={onClose}
      size="wide"
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
      {loading ? (
        <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
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
                  onClick={handleSaveGlobalGoal}
                  className={`h-8 rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                >
                  저장
                </button>
              </div>
              <span className="text-xs font-medium text-fg-muted">
                활성 {activeCount.active} / {activeCount.max}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                카테고리 관리
              </button>
              <button
                type="button"
                onClick={openCreateForm}
                disabled={activeCount.active >= activeCount.max}
                title={activeCount.active >= activeCount.max ? `활성 항목은 최대 ${activeCount.max}개까지 가능합니다` : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-md bg-primary-emphasis px-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
              >
                <PlusIcon size={16} aria-hidden="true" />
                체크리스트 추가
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-border-default pb-3">
            {(["ALL", "CORE", "SECONDARY", "INACTIVE"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`h-8 rounded-md px-3 text-xs font-medium ${filter === f ? "bg-primary-subtle text-primary-fg" : "text-fg-muted hover:bg-canvas-subtle"} ${FOCUS_VISIBLE}`}
              >
                {f === "ALL" ? "전체" : f === "CORE" ? "Core" : f === "SECONDARY" ? "Secondary" : "비활성"}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-danger-fg">{error}</p>}

          <div className="flex flex-col gap-4">
            {orderedGroupKeys.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">표시할 항목이 없습니다.</p>}
            {orderedGroupKeys.map((key) => (
              <div key={key ?? "uncategorized"} className="rounded-md border border-border-default">
                <div className="border-b border-border-default bg-canvas-subtle px-3 py-2 text-xs font-semibold text-fg-muted">{categoryName(key)}</div>
                <div className="flex flex-col divide-y divide-border-default">
                  {(groups.get(key) ?? []).map((item) => (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${dragId === item.id ? "opacity-50" : ""}`}
                      onDragOver={(e) => dragId && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(key, item.id);
                      }}
                    >
                      <span draggable onDragStart={() => setDragId(item.id)} onDragEnd={() => setDragId(null)} className="cursor-grab text-fg-muted hover:text-fg-default active:cursor-grabbing">
                        <GrabberIcon size={14} aria-hidden="true" />
                      </span>
                      <span className="text-base">{item.emoji}</span>
                      <span className={`text-sm ${item.active ? "text-fg-default" : "text-fg-muted"}`}>{item.name}</span>
                      {item.priority === "CORE" && (
                        <span className="whitespace-nowrap rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary-fg">Core</span>
                      )}
                      {!item.active && <span className="whitespace-nowrap rounded-full bg-canvas-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">비활성</span>}
                      <span className="whitespace-nowrap text-xs text-fg-muted">목표 {item.effectiveGoalPercent}%</span>
                      <select
                        value={item.categoryId ?? ""}
                        onChange={(e) => handleMoveCategory(item, e.target.value === "" ? null : e.target.value)}
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
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(item)}
                          disabled={pendingId === item.id}
                          className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          disabled={pendingId === item.id}
                          className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_VISIBLE}`}
                        >
                          {item.active ? "비활성화" : "활성화"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          disabled={pendingId === item.id}
                          className={`h-8 whitespace-nowrap rounded-md border border-control-border bg-surface-default px-2.5 text-xs font-medium text-fg-muted hover:bg-canvas-subtle hover:text-danger-fg ${FOCUS_VISIBLE}`}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WorkLogModal>
  );
}
