"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CalendarUnscheduledActualDto } from "@/lib/api/types";

interface ScheduleTimeDialogProps {
  item: CalendarUnscheduledActualDto | null;
  onSave: (startTime: string, endTime: string) => Promise<void>;
  onClose: () => void;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes + 1440) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

export function ScheduleTimeDialog({ item, onSave, onClose }: ScheduleTimeDialogProps) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;

  function handleStartChange(value: string) {
    setStartTime(value);
    setEndTime(addMinutesToTime(value, item!.durationMinutes));
  }

  async function handleSave() {
    if (endTime <= startTime) {
      setError("종료 시간은 시작 시간 이후여야 합니다.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(startTime, endTime);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title={`"${item.title}" 시간 지정`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">소요 시간 {item.durationMinutes}분 · 시작 시간을 정하면 종료 시간이 자동 계산됩니다.</p>
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
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSave} type="button" disabled={saving}>
            {saving ? "저장 중..." : "시간 지정"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
