"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChecklistWriteQueue } from "@/lib/checklist-core/writeQueue";
import type { CellChange, ChecklistState } from "@/lib/checklist-core/types";

export type UndoEntry = { label: string; changes: CellChange[] };

type Options = {
  /** The adapter's persisted state for a cell (no overlay). */
  baseState: (rowId: string, date: string) => ChecklistState;
  /** One atomic write for a batch of cells. */
  persist: (changes: CellChange[]) => Promise<void>;
  /** Patch the adapter's own data after a confirmed write — no refetch. */
  commit: (changes: CellChange[]) => void;
};

/**
 * The one checklist mutation path shared by CHECKLIST SYS, WORK OS and DIET
 * SYS: optimistic overlay, coalesced single-flight persistence, failure
 * rollback and a one-step Undo for the last logical operation.
 */
export function useChecklistMutations({ baseState, persist, commit }: Options) {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const latest = useRef({ baseState, persist, commit });
  useEffect(() => { latest.current = { baseState, persist, commit }; });
  // The callbacks read `latest` only when a write runs (async, outside render).
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState(() => new ChecklistWriteQueue(
    changes => latest.current.persist(changes),
    changes => latest.current.commit(changes),
    failure => setError(`${failure instanceof Error ? failure.message : "저장하지 못했습니다."} 변경을 되돌렸습니다. 다시 시도하세요.`),
    () => setVersion(v => v + 1),
  ));

  // `version` is part of the identity so memoized consumers re-read overlay values.
  const getState = useCallback(
    (rowId: string, date: string): ChecklistState => queue.get(rowId, date) ?? baseState(rowId, date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, baseState, version],
  );

  /** Applies one logical operation; returns false when nothing changed. */
  const apply = useCallback((changes: CellChange[], undoLabel?: string) => {
    const effective = changes.filter(change => getState(change.rowId, change.date) !== change.state);
    if (!effective.length) return false;
    const previous = effective.map(change => ({ ...change, state: getState(change.rowId, change.date) }));
    setError("");
    queue.enqueue(effective, latest.current.baseState);
    setUndo(undoLabel ? { label: undoLabel, changes: previous } : null);
    return true;
  }, [getState, queue]);

  const runUndo = useCallback(() => {
    if (!undo) return;
    queue.enqueue(undo.changes, latest.current.baseState);
    setUndo(null);
  }, [queue, undo]);

  return { getState, apply, undo, runUndo, dismissUndo: () => setUndo(null), error, clearError: () => setError(""), saving: queue.busyCount > 0, idle: () => queue.idle() };
}

export type ChecklistMutations = ReturnType<typeof useChecklistMutations>;
