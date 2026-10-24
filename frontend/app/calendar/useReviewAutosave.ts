"use client";
import { useEffect, useRef, useState } from "react";
import { Autosave, type SaveState } from "@/lib/notes/autosave";
import { ApiError } from "@/lib/api/client";
import { useReviewGuard } from "./ReviewGuards";
type Versioned = { version: number };
export function useReviewAutosave<T, R extends Versioned>({
  empty,
  load,
  save,
  onSaved,
}: {
  empty: T;
  load: () => Promise<R>;
  save: (body: T, version: number) => Promise<R>;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(empty),
    [record, setRecord] = useState<R | null>(null),
    [state, setState] = useState<SaveState>("saved"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [conflict, setConflict] = useState(false);
  const [remote, setRemote] = useState<R | null>(null);
  const latest = useRef<R | null>(null),
    draftRef = useRef(empty),
    active = useRef(false),
    options = useRef({ load, save, onSaved });
  useEffect(() => {
    options.current = { load, save, onSaved };
  });
  // Queue callbacks execute only after mount and read the latest persisted revision.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState(
    () =>
      new Autosave<T>(
        async (body) => {
          if (!latest.current) throw Error("기록을 불러온 뒤 다시 시도하세요.");
          const saved = await options.current.save(
            body,
            latest.current.version,
          );
          latest.current = saved;
          if (active.current) {
            setRecord(saved);
            options.current.onSaved?.();
          }
        },
        (next, cause) => {
          if (!active.current) return;
          setState(next);
          if (next === "error") {
            setError(cause instanceof Error ? cause.message : "저장 오류");
            setConflict(cause instanceof ApiError && cause.status === 409);
          } else if (next === "saved") {
            setError("");
            setConflict(false);
          }
        },
        650,
      ),
  );
  async function reload() {
    try {
      const value = await options.current.load();
      if (active.current) {
        latest.current = value;
        setRecord(value);
        draftRef.current = value as unknown as T;
        setDraft(draftRef.current);
        setError("");
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      if (active.current) setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void reload();
    const unload = (event: BeforeUnloadEvent) => {
      if (queue.dirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      active.current = false;
      queue.stop();
      window.removeEventListener("beforeunload", unload);
    };
  }, [queue]); // eslint-disable-line react-hooks/exhaustive-deps
  useReviewGuard(() => queue.flush());
  function change(patch: Partial<T>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    queue.set(next);
  }
  async function retry() {
    try {
      await queue.flush();
    } catch {
      /* error is rendered by the queue */
    }
  }
  // Explicit conflict resolution preserves the draft, then retries against the reviewed revision.
  async function rebase() {
    try {
      if (!remote) {
        setRemote(await options.current.load());
        return;
      }
      latest.current = remote;
      setRecord(remote);
      setConflict(false);
      await queue.flush();
      setRemote(null);
    } catch (e) {
      setRemote(null);
      setError(e instanceof Error ? e.message : "재시도 오류");
    }
  }
  return {
    draft,
    record,
    loading,
    state,
    error,
    conflict,
    remote,
    change,
    retry,
    rebase,
    reload,
    queue,
  };
}
