"use client";

import { useEffect, useId, useState } from "react";
import { WorkLogModal } from "@/app/worklog/WorkLogModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ActivityCategory, LifeCategoryDto, PhaseWithProjectDto, PlanDomainType } from "@/lib/api/types";
import { formatDayHeader } from "@/lib/date";
import { PhaseSelector } from "./PhaseSelector";

export interface PlanBlockEditValue {
  domainType: PlanDomainType;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  activityCategoryId: string | null;
  lifeCategoryId: string | null;
  phaseId: string | null;
  memo: string;
}

interface CalendarBlockEditDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValue: PlanBlockEditValue | null;
  activityCategories: ActivityCategory[];
  lifeCategories: LifeCategoryDto[];
  phases: PhaseWithProjectDto[];
  onSave: (value: PlanBlockEditValue) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDuplicate?: (newDate: Date) => Promise<void>;
  onClose: () => void;
}

/** Planning block create/edit — WORK/LIFE domain toggle, category matched
 *  to the selected domain, optional Phase (WORK only). Planning memo is
 *  intentionally editable only here, never shown on the calendar card
 *  itself (locked V1 policy). */
export function CalendarBlockEditDialog({
  open,
  mode,
  initialValue,
  activityCategories,
  lifeCategories,
  phases,
  onSave,
  onDelete,
  onDuplicate,
  onClose,
}: CalendarBlockEditDialogProps) {
  const titleId = useId();
  const [domainType, setDomainType] = useState<PlanDomainType>("WORK");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [activityCategoryId, setActivityCategoryId] = useState("");
  const [lifeCategoryId, setLifeCategoryId] = useState("");
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialValue) {
      setDomainType(initialValue.domainType);
      setTitle(initialValue.title);
      setStartTime(initialValue.startTime);
      setEndTime(initialValue.endTime);
      setActivityCategoryId(initialValue.activityCategoryId ?? "");
      setLifeCategoryId(initialValue.lifeCategoryId ?? "");
      setPhaseId(initialValue.phaseId);
      setMemo(initialValue.memo);
      setError(null);
    }
  }, [initialValue]);

  if (!open || !initialValue) return null;

  async function handleSave() {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    if (endTime <= startTime) {
      setError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        domainType,
        title: title.trim(),
        date: initialValue!.date,
        startTime,
        endTime,
        activityCategoryId: domainType === "WORK" ? activityCategoryId || null : null,
        lifeCategoryId: domainType === "LIFE" ? lifeCategoryId || null : null,
        phaseId: domainType === "WORK" ? phaseId : null,
        memo,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!onDuplicate || !initialValue) return;
    setSaving(true);
    setError(null);
    try {
      await onDuplicate(initialValue.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkLogModal titleId={titleId} title={mode === "create" ? "새 계획 블록" : "계획 블록 수정"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">{formatDayHeader(initialValue.date)}</p>

        <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800">
          {(["WORK", "LIFE"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDomainType(d)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                domainType === d
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {d === "WORK" ? "업무" : "생활"}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">제목</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="무엇을 계획하시나요?" autoFocus />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">시작</label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">종료</label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">카테고리</label>
          {domainType === "WORK" ? (
            <Select value={activityCategoryId} onChange={(e) => setActivityCategoryId(e.target.value)}>
              <option value="">카테고리 없음</option>
              {activityCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `— ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select value={lifeCategoryId} onChange={(e) => setLifeCategoryId(e.target.value)}>
              <option value="">카테고리 없음</option>
              {lifeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {domainType === "WORK" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Phase</label>
            <PhaseSelector phases={phases} value={phaseId} onChange={setPhaseId} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="mt-1 flex items-center justify-between">
          <div className="flex gap-2">
            {mode === "edit" && onDelete && (
              <Button variant="danger" onClick={handleDelete} disabled={saving} type="button">
                삭제
              </Button>
            )}
            {mode === "edit" && onDuplicate && (
              <Button variant="ghost" onClick={handleDuplicate} disabled={saving} type="button">
                같은 날짜에 복제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>
              취소
            </Button>
            <Button variant="primary" onClick={handleSave} type="button" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </div>
    </WorkLogModal>
  );
}
