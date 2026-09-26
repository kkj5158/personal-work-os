"use client";
import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Quiet autosave for one in-context form: debounced, one request in flight,
 * later edits coalesced into the next save (the newest draft always wins),
 * and a failure keeps the local draft for retry — nothing is discarded.
 * `valid` gates saving (e.g. an empty name is never sent).
 */
export function useAutosave<T>(draft: T, save: (value: T) => Promise<void>, { valid = true, delay = 450 }: { valid?: boolean; delay?: number } = {}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const saved = useRef(JSON.stringify(draft));
  const latest = useRef({ draft, save, valid });
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { latest.current = { draft, save, valid }; });

  // Stable for the form's lifetime; it reads the latest draft from `latest` only when it runs.
  const [run] = useState(() => {
    const run = (): Promise<void> => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (running.current) return running.current.then(run);
      const { draft: value, save: persist, valid: ok } = latest.current;
      const snapshot = JSON.stringify(value);
      if (!ok || snapshot === saved.current) return Promise.resolve();
      setStatus("saving"); setError("");
      running.current = persist(value)
        .then(() => { saved.current = snapshot; setStatus(JSON.stringify(latest.current.draft) === snapshot ? "saved" : "saving"); })
        .catch((e: unknown) => { setStatus("error"); setError(e instanceof Error ? e.message : "저장하지 못했습니다."); throw e; })
        .finally(() => { running.current = null; });
      // A newer draft typed during the request is saved right after it.
      return running.current.then(() => (JSON.stringify(latest.current.draft) !== snapshot ? run() : undefined));
    };
    return run;
  });

  const snapshot = JSON.stringify(draft);
  useEffect(() => {
    if (snapshot === saved.current || !valid) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run().catch(() => {}); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [snapshot, valid, delay, run]);

  // Leaving the form (closing the panel / switching rows) flushes a pending edit instead of dropping it.
  useEffect(() => () => { if (timer.current) void run().catch(() => {}); }, [run]);

  return { status, error, flush: run, retry: () => void run().catch(() => {}) };
}

export function SaveState({ status, error, retry, invalid }: { status: SaveStatus; error: string; retry: () => void; invalid?: string }) {
  if (invalid) return <span className="cks-save cks-save-warn" role="status">{invalid}</span>;
  if (status === "error") return <span className="cks-save cks-save-error" role="alert">{error || "저장하지 못했습니다."} <button type="button" onClick={retry}>다시 시도</button></span>;
  return <span className="cks-save" role="status" aria-live="polite">{status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : ""}</span>;
}
