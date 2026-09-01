"use client";

import { useState } from "react";
import { createChecklistItem, moveChecklistItem, scheduleChecklistItemVersion } from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto, ChecklistPriority } from "@/lib/api/types";
import { todayDateKey } from "./checklistLogic";
import { describeApiError } from "./errorMessages";
import { FOCUS_VISIBLE } from "./format";
import { WorkLogModal } from "./WorkLogModal";

const TITLE_ID = "worklog-checklist-item-form-title";

const QUICK_EMOJIS = [
  "✅", "📝", "📖", "🏃", "💧", "🧘", "😴", "🥗", "💻", "📚",
  "🎯", "🧹", "💰", "🙏", "🚭", "🚫", "🎧", "🖊️", "🧠", "☀️",
];

interface ItemFormState {
  name: string;
  emoji: string;
  priority: ChecklistPriority;
  categoryId: string | null;
  useDefaultGoal: boolean;
  customGoal: number;
  effectiveFrom: string;
}

function initialForm(mode: "create" | "edit", item: ChecklistItemDto | null, globalGoal: number): ItemFormState {
  if (mode === "edit" && item) {
    return {
      name: item.name,
      emoji: item.emoji,
      priority: item.priority,
      categoryId: item.categoryId,
      useDefaultGoal: item.goalOverridePercent == null,
      customGoal: item.goalOverridePercent ?? globalGoal,
      effectiveFrom: todayDateKey(),
    };
  }
  return {
    name: "",
    emoji: "✅",
    priority: "SECONDARY",
    categoryId: null,
    useDefaultGoal: true,
    customGoal: globalGoal,
    effectiveFrom: todayDateKey(),
  };
}

interface ChecklistItemFormModalProps {
  /** "create" opens the item-creation-only flow (§4 of the Settings
   *  consolidation); "edit" is reached from an existing row's overflow menu
   *  and requires `item`. Both share this one form — no separate creation
   *  vs. editing component — since the fields are identical apart from the
   *  edit-only effective-date picker (a past-dated field can't apply to a
   *  brand-new item). */
  mode: "create" | "edit";
  item: ChecklistItemDto | null;
  categories: ChecklistCategoryDto[];
  globalGoal: number;
  activeCount: { active: number; max: number };
  onClose: () => void;
  /** Caller re-fetches the item catalog after either create or edit — kept
   *  a plain refresh signal (no payload) so this form never has to guess at
   *  the server's authoritative effectiveGoalPercent/derived fields. */
  onSaved: () => void;
}

export function ChecklistItemFormModal({ mode, item, categories, globalGoal, activeCount, onClose, onSaved }: ChecklistItemFormModalProps) {
  const [form, setForm] = useState<ItemFormState>(() => initialForm(mode, item, globalGoal));
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  async function handleSubmit() {
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
      if (mode === "create") {
        if (activeCount.active >= activeCount.max) {
          setFormError(`활성 체크리스트 항목은 최대 ${activeCount.max}개까지 가능합니다.`);
          setFormSaving(false);
          return;
        }
        await createChecklistItem({
          name: trimmedName,
          emoji: form.emoji,
          priority: form.priority,
          categoryId: form.categoryId,
          goalOverridePercent: goalOverride,
        });
      } else if (item) {
        await scheduleChecklistItemVersion(item.id, {
          effectiveFrom: form.effectiveFrom,
          name: trimmedName,
          emoji: form.emoji,
          priority: form.priority,
          active: true,
          goalOverridePercent: goalOverride,
        });
        if (form.categoryId !== item.categoryId) {
          await moveChecklistItem(item.id, form.categoryId);
        }
      }
      onSaved();
    } catch (e) {
      setFormError(describeApiError(e, "저장하지 못했습니다."));
    } finally {
      setFormSaving(false);
    }
  }

  return (
    <WorkLogModal
      titleId={TITLE_ID}
      title={mode === "create" ? "체크리스트 추가" : "체크리스트 수정"}
      onClose={onClose}
      size="default"
      footer={
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={formSaving}
            data-autofocus
            className={`h-9 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_VISIBLE}`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
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

        {mode === "edit" && (
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
