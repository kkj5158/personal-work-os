"use client";

import { useEffect, useId, useState } from "react";
import { WorkLogModal } from "@/app/worklog/WorkLogModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { LifeCategoryDto } from "@/lib/api/types";

export interface LifeActualEditValue {
  title: string;
  lifeCategoryId: string | null;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  memo: string;
}

interface LifeActualEditDialogProps {
  open: boolean;
  mode: "create" | "edit";
  date: string;
  initialValue: LifeActualEditValue | null;
  lifeCategories: LifeCategoryDto[];
  onSave: (value: LifeActualEditValue) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/** Direct LIFE Actual creation/edit (locked V1 policy §24) — Execution
 *  mode never requires a PlanningBlock to exist first. Scheduling is
 *  optional here: leave start/end blank to save as Unscheduled Actual. */
export function LifeActualEditDialog({ open, mode, date, initialValue, lifeCategories, onSave, onDelete, onClose }: LifeActualEditDialogProps) {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [lifeCategoryId, setLifeCategoryId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [scheduled, setScheduled] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialValue) {
      setTitle(initialValue.title);
      setLifeCategoryId(initialValue.lifeCategoryId ?? "");
      setDurationMinutes(initialValue.durationMinutes);
      setScheduled(initialValue.startTime != null);
      setStartTime(initialValue.startTime ?? "09:00");
      setEndTime(initialValue.endTime ?? "09:30");
      setMemo(initialValue.memo);
      setError(null);
    } else if (open) {
      setTitle("");
      setLifeCategoryId("");
      setDurationMinutes(30);
      setScheduled(false);
      setStartTime("09:00");
      setEndTime("09:30");
      setMemo("");
      setError(null);
    }
  }, [initialValue, open]);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    if (scheduled && endTime <= startTime) {
      setError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }
    if (!durationMinutes || durationMinutes <= 0) {
      setError("소요 시간을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        lifeCategoryId: lifeCategoryId || null,
        durationMinutes,
        startTime: scheduled ? startTime : null,
        endTime: scheduled ? endTime : null,
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

  function handleStartChange(value: string) {
    setStartTime(value);
    if (durationMinutes > 0) {
      const [h, m] = value.split(":").map(Number);
      const total = (h * 60 + m + durationMinutes) % 1440;
      setEndTime(`${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`);
    }
  }

  return (
    <WorkLogModal titleId={titleId} title={mode === "create" ? "새 생활 기록" : "생활 기록 수정"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">{date}</p>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">제목</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 운동, 병원, 산책" autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">카테고리</label>
          <Select value={lifeCategoryId} onChange={(e) => setLifeCategoryId(e.target.value)}>
            <option value="">카테고리 없음</option>
            {lifeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">소요 시간(분)</label>
          <Input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
          시간대 지정 (해제하면 미지정 실제 기록으로 저장)
        </label>

        {scheduled && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">시작</label>
              <Input type="time" value={startTime} onChange={(e) => handleStartChange(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">종료</label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
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
          <div>
            {mode === "edit" && onDelete && (
              <Button variant="danger" onClick={handleDelete} disabled={saving} type="button">
                삭제
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
