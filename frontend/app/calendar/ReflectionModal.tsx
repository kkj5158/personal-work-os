"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Autosave, type SaveState } from "@/lib/notes/autosave";
import { useShellNavigationGuard } from "@/components/GlobalTabs";
import { WorkLogModal } from "@/app/worklog/WorkLogModal";
import { Button } from "@/components/ui/Button";
import type { ReflectionEntryDto } from "@/lib/api/types";
import { completeReflection, openReflection, reopenReflection, updateReflectionContent } from "@/lib/api/reflections";
import { ReflectionTimeline } from "./ReflectionTimeline";
import { ReflectionMetrics } from "./ReflectionMetrics";
import type { CalendarCategory, CalendarPreferences } from "./appearance";

interface ReflectionModalProps {
  open: boolean;
  date: string; // yyyy-MM-dd
  onClose: () => void;
  context?: string;
  categories?: CalendarCategory[];
  prefs?: CalendarPreferences;
}

const AUTOSAVE_DELAY_MS = 1200;

/** Shared date-scoped Reflection surface for Calendar and NOTE SYS. */
export function ReflectionModal(props: ReflectionModalProps) {
  return props.open ? <ReflectionSession key={props.date} {...props} /> : null;
}

function ReflectionSession({ date, onClose, context, categories, prefs }: ReflectionModalProps) {
  const router = useRouter();
  const titleId = useId();
  const [entry, setEntry] = useState<ReflectionEntryDto | null>(null);
  const latestEntry = useRef<ReflectionEntryDto | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry,setRetry] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  // Autosave stores this callback; it only reads the ref when a save is requested.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState(() => new Autosave<string>(async (body) => {
    const current = latestEntry.current;
    if (!current || current.status !== "EDITING") throw new Error("회고를 불러온 뒤 다시 저장하세요.");
    const updated = await updateReflectionContent(date, body, current.version);
    latestEntry.current = updated;
    setEntry(updated);
  }, (state, cause) => {
    setSaveState(state);
    if (state === "error") setError(cause instanceof Error ? cause.message : "자동 저장에 실패했습니다. 입력 내용은 유지됩니다.");
    else if (state === "saved") setError(null);
  }, AUTOSAVE_DELAY_MS));

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const fetched = await openReflection(date);
        if (!active) return;
        latestEntry.current = fetched;
        setEntry(fetched);
        setContent(fetched.content);
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "회고를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.dirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      active = false;
      queue.stop();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [date, queue, retry]);

  useShellNavigationGuard(async proceed=>{
    try {await queue.flush();proceed();} catch(cause){setError(cause instanceof Error ? cause.message : "회고를 저장한 뒤 다시 시도하세요.");}
  });

  function handleContentChange(value: string) {
    setContent(value);
    queue.set(value);
  }

  async function transition(action: "complete" | "reopen" | "close" | "calendar") {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await queue.flush();
      const current = latestEntry.current;
      if (action === "close") onClose();
      else if (action === "calendar") {
        onClose();
        router.push(`/calendar?date=${date}`);
      } else if (current) {
        const updated = await (action === "complete" ? completeReflection : reopenReflection)(date, current.version);
        latestEntry.current = updated;
        setEntry(updated);
        setContent(updated.content);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장에 실패했습니다. 입력 내용은 유지됩니다.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  const snapshot = entry?.snapshot ?? null;
  return (
    <WorkLogModal
      titleId={titleId}
      title={`${date} 회고`}
      onClose={() => void transition("close")}
      size="xlarge"
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" disabled={busy} onClick={() => void transition("calendar")} className="text-xs text-zinc-500 underline hover:text-zinc-700">
            Calendar 전체 보기 →
          </button>
          <div className="flex items-center gap-2">
            {saveState === "saving" && <span className="text-xs text-zinc-400">저장 중...</span>}
            {saveState === "saved" && <span className="text-xs text-zinc-400">저장됨</span>}
            {entry?.status === "EDITING" ? (
              <Button variant="primary" onClick={() => void transition("complete")} disabled={busy || loading || !entry}>
                회고 완료
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void transition("reopen")} disabled={busy || loading || !entry}>
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
          {context && <p className="text-xs text-zinc-500">{context}</p>}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                entry?.status === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {entry?.status === "COMPLETED" ? "완료됨" : "작성 중"}
            </span>
          </div>

          {snapshot ? (
            <>
              <ReflectionTimeline snapshot={snapshot} categories={categories} prefs={prefs} />

              <ReflectionMetrics snapshot={snapshot}/>
            </>
          ) : (
            <p className="text-xs text-zinc-400">회고를 완료하면 계획/실제/상태 스냅샷이 여기에 기록됩니다.</p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-600">오늘의 회고</label>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              disabled={busy || !entry || entry.status === "COMPLETED"}
              onBlur={() => void queue.flush().catch(() => {})}
              onCompositionStart={() => queue.composition(true)}
              onCompositionEnd={() => queue.composition(false)}
              rows={6}
              placeholder="오늘 하루를 돌아보고, 더 나은 내일을 만들어 보세요."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>

          {error && <p role="alert" className="text-xs text-red-600">{error} {!entry && <button className="underline" onClick={()=>{setLoading(true);setRetry(n=>n+1);}}>다시 불러오기</button>} {saveState === "error" && <button className="underline" onClick={() => void queue.flush().catch(() => {})}>다시 저장</button>}</p>}
        </div>
      )}
    </WorkLogModal>
  );
}
