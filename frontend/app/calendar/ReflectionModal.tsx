"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { WorkLogModal } from "@/app/worklog/WorkLogModal";
import { Button } from "@/components/ui/Button";
import type { ReflectionEntryDto } from "@/lib/api/types";
import { completeReflection, createReflection, getReflection, reopenReflection, updateReflectionContent } from "@/lib/api/reflections";
import { ReflectionTimeline } from "./ReflectionTimeline";

interface ReflectionModalProps {
  open: boolean;
  date: string; // yyyy-MM-dd
  onClose: () => void;
}

const AUTOSAVE_DELAY_MS = 1200;

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** The single reusable WORK_OS Reflection surface — opened from Calendar
 *  and, via the same backend ReflectionProvider boundary, from NOTE
 *  SYSTEM's embedded Reflection popover (locked V1 policy §28). */
export function ReflectionModal({ open, date, onClose }: ReflectionModalProps) {
  const titleId = useId();
  const [entry, setEntry] = useState<ReflectionEntryDto | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let fetched = await getReflection(date);
      if (!fetched) {
        fetched = await createReflection(date);
      }
      setEntry(fetched);
      setContent(fetched.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "회고를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (open) {
      void load();
    }
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [open, load]);

  if (!open) return null;

  function scheduleAutosave(nextContent: string) {
    if (!entry || entry.status !== "EDITING") return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState("idle");
    autosaveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const updated = await updateReflectionContent(date, nextContent, entry.version);
        setEntry(updated);
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        setError(e instanceof Error ? e.message : "자동 저장에 실패했습니다.");
      }
    }, AUTOSAVE_DELAY_MS);
  }

  function handleContentChange(value: string) {
    setContent(value);
    scheduleAutosave(value);
  }

  async function handleComplete() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await completeReflection(date, entry.version);
      setEntry(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "회고를 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await reopenReflection(date, entry.version);
      setEntry(updated);
      setContent(updated.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정 모드로 전환하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const snapshot = entry?.snapshot ?? null;
  const totalPlanned = snapshot ? snapshot.workSummary.plannedMinutes + snapshot.lifeSummary.plannedMinutes : 0;
  const totalActual = snapshot ? snapshot.workSummary.actualMinutes + snapshot.lifeSummary.actualMinutes : 0;
  const delta = totalActual - totalPlanned;

  return (
    <WorkLogModal
      titleId={titleId}
      title={`${date} 회고`}
      onClose={onClose}
      size="xlarge"
      footer={
        <div className="flex w-full items-center justify-between">
          <Link href={`/calendar?date=${date}`} className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300">
            Calendar 전체 보기 →
          </Link>
          <div className="flex items-center gap-2">
            {saveState === "saving" && <span className="text-xs text-zinc-400">저장 중...</span>}
            {saveState === "saved" && <span className="text-xs text-zinc-400">저장됨</span>}
            {entry?.status === "EDITING" ? (
              <Button variant="primary" onClick={handleComplete} disabled={busy || loading}>
                회고 완료
              </Button>
            ) : (
              <Button variant="secondary" onClick={handleReopen} disabled={busy || loading}>
                수정
              </Button>
            )}
          </div>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-zinc-400">불러오는 중...</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                entry?.status === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {entry?.status === "COMPLETED" ? "완료됨" : "작성 중"}
            </span>
          </div>

          {snapshot ? (
            <>
              <ReflectionTimeline snapshot={snapshot} />

              <div className="grid grid-cols-4 gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <SummaryStat label="전체 계획" value={formatMinutes(totalPlanned)} />
                <SummaryStat label="전체 실제" value={formatMinutes(totalActual)} />
                <SummaryStat
                  label="차이"
                  value={`${delta >= 0 ? "+" : "-"}${formatMinutes(Math.abs(delta))}`}
                  accent={delta < 0 ? "text-red-600" : delta > 0 ? "text-emerald-600" : undefined}
                />
                <SummaryStat label="업무 실제" value={formatMinutes(snapshot.workSummary.actualMinutes)} />
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-400">회고를 완료하면 계획/실제/상태 스냅샷이 여기에 기록됩니다.</p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">오늘의 회고</label>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              disabled={entry?.status === "COMPLETED"}
              rows={6}
              placeholder="오늘 하루를 돌아보고, 더 나은 내일을 만들어 보세요."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </WorkLogModal>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span className={`text-base font-semibold ${accent ?? "text-zinc-900 dark:text-zinc-100"}`}>{value}</span>
    </div>
  );
}
