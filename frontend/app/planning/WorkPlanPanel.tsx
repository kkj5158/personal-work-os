"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  PLANNED_STATUSES,
  type EffectiveWorkSchedule,
  type PlannedStatus,
  type WorkScheduleOverride,
  type WorkScheduleOverrideInput,
} from "@/lib/api/types";

interface WorkPlanPanelProps {
  effective: EffectiveWorkSchedule | null;
  override: WorkScheduleOverride | null;
  loading: boolean;
  error: string | null;
  onSave: (input: WorkScheduleOverrideInput) => Promise<void>;
}

interface FieldState<T> {
  enabled: boolean;
  value: T;
}

export function WorkPlanPanel({ effective, override, loading, error, onSave }: WorkPlanPanelProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [status, setStatus] = useState<FieldState<PlannedStatus>>({ enabled: false, value: "WORK" });
  const [startTime, setStartTime] = useState<FieldState<string>>({ enabled: false, value: "09:00" });
  const [grace, setGrace] = useState<FieldState<string>>({ enabled: false, value: "0" });
  const [target, setTarget] = useState<FieldState<string>>({ enabled: false, value: "480" });
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!editing) return;
    setStatus({
      enabled: override?.plannedStatus != null,
      value: override?.plannedStatus ?? effective?.plannedStatus ?? "WORK",
    });
    setStartTime({
      enabled: override?.plannedStartTime != null,
      value: (override?.plannedStartTime ?? effective?.plannedStartTime ?? "09:00:00").slice(0, 5),
    });
    setGrace({
      enabled: override?.graceMinutes != null,
      value: String(override?.graceMinutes ?? effective?.graceMinutes ?? 0),
    });
    setTarget({
      enabled: override?.targetDurationMinutes != null,
      value: String(override?.targetDurationMinutes ?? effective?.targetDurationMinutes ?? 480),
    });
    setMemo(override?.memo ?? "");
    setSaveError(null);
  }, [editing, override, effective]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        plannedStatus: status.enabled ? status.value : null,
        plannedStartTime: startTime.enabled ? `${startTime.value}:00` : null,
        graceMinutes: grace.enabled ? Number(grace.value) : null,
        targetDurationMinutes: target.enabled ? Number(target.value) : null,
        memo: memo || null,
      });
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="border-b border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
        Loading work plan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b border-zinc-200 px-4 py-2 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-500">
        Work plan unavailable for this date — a WorkSettings row for this year may not exist yet. ({error})
      </div>
    );
  }

  if (!effective) {
    return null;
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{effective.plannedStatus}</span>
        {effective.plannedStartTime && <span>start {effective.plannedStartTime.slice(0, 5)}</span>}
        {effective.graceMinutes != null && <span>grace {effective.graceMinutes}m</span>}
        {effective.targetDurationMinutes != null && <span>target {effective.targetDurationMinutes}m</span>}
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Edit plan
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-end gap-3">
        <OverrideField label="Status" enabled={status.enabled} onToggle={(v) => setStatus((s) => ({ ...s, enabled: v }))}>
          <Select
            value={status.value}
            disabled={!status.enabled}
            onChange={(e) => setStatus((s) => ({ ...s, value: e.target.value as PlannedStatus }))}
          >
            {PLANNED_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </OverrideField>

        <OverrideField label="Start" enabled={startTime.enabled} onToggle={(v) => setStartTime((s) => ({ ...s, enabled: v }))}>
          <Input
            type="time"
            value={startTime.value}
            disabled={!startTime.enabled}
            onChange={(e) => setStartTime((s) => ({ ...s, value: e.target.value }))}
          />
        </OverrideField>

        <OverrideField label="Grace (min)" enabled={grace.enabled} onToggle={(v) => setGrace((s) => ({ ...s, enabled: v }))}>
          <Input
            type="number"
            min={0}
            max={1440}
            value={grace.value}
            disabled={!grace.enabled}
            onChange={(e) => setGrace((s) => ({ ...s, value: e.target.value }))}
            className="w-20"
          />
        </OverrideField>

        <OverrideField label="Target (min)" enabled={target.enabled} onToggle={(v) => setTarget((s) => ({ ...s, enabled: v }))}>
          <Input
            type="number"
            min={0}
            max={1440}
            value={target.value}
            disabled={!target.enabled}
            onChange={(e) => setTarget((s) => ({ ...s, value: e.target.value }))}
            className="w-20"
          />
        </OverrideField>

        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Note</label>
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="flex gap-2 pb-0.5">
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving} type="button">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {saveError && <p className="mt-1.5 text-xs text-red-600">{saveError}</p>}
    </div>
  );
}

function OverrideField({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[110px]">
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {children}
    </div>
  );
}
