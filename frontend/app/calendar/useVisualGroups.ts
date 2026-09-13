"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as visualGroupApi from "@/lib/api/visualGroups";
import { newVisualGroup, validateVisualGroup, visualGroupInput, type CalendarVisualGroup, type VisualGroupInput } from "./visualGroups";
import type { CalendarToast } from "./useCalendarEditor";

export type VisualGroupApi = typeof visualGroupApi;
type Draft = { group: CalendarVisualGroup; key: string; dirty: boolean };
const message = (error: unknown) => error instanceof Error ? error.message : "그룹 블록을 저장하지 못했습니다.";

/** Like the Activity editor, one serialized writer drains edits before leaving.
 * The separate endpoint keeps presentation groups out of all activity totals. */
export function useVisualGroups(from: string, to: string, notify: (toast: CalendarToast) => void, api: VisualGroupApi = visualGroupApi) {
  const [groups, setGroups] = useState<CalendarVisualGroup[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const current = useRef<Draft | null>(null), persisted = useRef(new Map<string, CalendarVisualGroup>());
  const [status, setStatus] = useState(""), [error, setError] = useState<string | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [guard, setGuard] = useState(false);
  const writer = useRef<Promise<boolean> | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), pendingLeave = useRef<(() => void) | null>(null);
  const notifyRef = useRef(notify), loadSequence = useRef(0);
  useEffect(() => { notifyRef.current = notify; }, [notify]);
  const assign = useCallback((next: Draft | null) => { current.current = next; setDraft(next); }, []);
  const cancelTimer = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const accept = useCallback((group: CalendarVisualGroup) => {
    persisted.current.set(group.id, group);
    setGroups(rows => rows.some(row => row.id === group.id) ? rows.map(row => row.id === group.id ? group : row) : [...rows, group]);
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const rows = await api.listVisualGroups(from, to);
      if (sequence !== loadSequence.current) return;
      persisted.current = new Map(rows.map(row => [row.id, row]));
      setGroups(rows); setLoadError(null);
    } catch (e) { if (sequence === loadSequence.current) setLoadError(message(e)); }
  }, [api, from, to]);
  const invalidateLoad = useCallback(() => { loadSequence.current++; }, []);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void refresh(); }); return () => { cancelled = true; invalidateLoad(); }; }, [refresh, invalidateLoad]);

  const flush = useCallback(async (): Promise<boolean> => {
    cancelTimer();
    if (writer.current && !await writer.current) return false;
    if (!current.current?.dirty) return true;
    const initial = current.current;
    const validation = validateVisualGroup(initial.group);
    if (validation) { setError(validation); setStatus("입력 확인"); return false; }
    const run = async () => {
      setBusy(true);
      try {
        while (current.current?.key === initial.key && current.current.dirty) {
          const snapshot = current.current;
          const invalid = validateVisualGroup(snapshot.group);
          if (invalid) { setError(invalid); setStatus("입력 확인"); return false; }
          setStatus("저장 중…"); setError(null);
          const input = visualGroupInput(snapshot.group);
          const saved = snapshot.group.id ? await api.updateVisualGroup(snapshot.group.id, input) : await api.createVisualGroup(input);
          accept(saved);
          const latest = current.current;
          if (latest?.key === snapshot.key) assign({ ...latest, group: latest === snapshot ? saved : { ...latest.group, id: saved.id }, dirty: latest !== snapshot });
        }
        setStatus("저장됨"); return true;
      } catch (e) { setError(message(e)); setStatus("저장 실패"); return false; }
      finally { setBusy(false); }
    };
    writer.current = run(); const result = await writer.current; writer.current = null; return result;
  }, [accept, api, assign, cancelTimer]);
  const change = useCallback((patch: Partial<VisualGroupInput>) => {
    const old = current.current; if (!old) return;
    const next = { ...old, group: { ...old.group, ...patch }, dirty: true };
    assign(next); cancelTimer(); setError(null); setStatus(validateVisualGroup(next.group) ? "입력 중" : "");
    if (!validateVisualGroup(next.group)) {
      if (!next.group.id) void flush();
      else timer.current = setTimeout(() => { void flush(); }, 550);
    }
  }, [assign, cancelTimer, flush]);
  const leave = useCallback(async (proceed: () => void) => {
    if (!await flush()) { pendingLeave.current = proceed; setGuard(true); return; }
    assign(null); setError(null); setStatus(""); proceed();
  }, [assign, flush]);
  const select = useCallback((group: CalendarVisualGroup) => { void leave(() => assign({ group, key: group.id || crypto.randomUUID(), dirty: false })); }, [assign, leave]);
  const create = useCallback((date: string, start?: number, end?: number) => select(newVisualGroup(date, start, end)), [select]);
  const discard = useCallback(() => { cancelTimer(); assign(null); setError(null); setStatus(""); setGuard(false); const next = pendingLeave.current; pendingLeave.current = null; next?.(); }, [assign, cancelTimer]);
  const continueEditing = useCallback(() => { setGuard(false); pendingLeave.current = null; }, []);
  const retry = useCallback(async () => { if (await flush()) { setGuard(false); const next = pendingLeave.current; pendingLeave.current = null; if (next) { assign(null); next(); } } }, [assign, flush]);

  const commitMutation = useCallback(async (id: string, transform: (latest: CalendarVisualGroup) => CalendarVisualGroup): Promise<boolean> => {
    if (!await flush()) return false;
    const previous = persisted.current.get(id);
    if (!previous) return false;
    const next = transform(previous);
    const invalid = validateVisualGroup(next);
    if (invalid) { notifyRef.current({ message: invalid }); return false; }
    setGroups(rows => rows.map(row => row.id === next.id ? next : row));
    const run = async () => {
      setBusy(true);
      try {
        const selection = current.current;
        const saved = await api.updateVisualGroup(next.id, visualGroupInput(next)); accept(saved);
        const latest = current.current;
        if (latest?.group.id === next.id && selection?.key === latest.key) {
          // A title/color edit during the request must retain the saved gesture's
          // dates and times, while any explicitly changed editor field wins.
          const changed = Object.fromEntries(Object.entries(visualGroupInput(latest.group)).filter(([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(visualGroupInput(selection.group)[key as keyof VisualGroupInput])));
          assign({ ...latest, group: { ...saved, ...changed }, dirty: latest !== selection });
        }
        return true;
      } catch (e) { accept(previous); notifyRef.current({ message: message(e) }); return false; }
      finally { setBusy(false); }
    };
    writer.current = run(); const result = await writer.current; writer.current = null; return result;
  }, [accept, api, assign, flush]);
  const commit = useCallback((next: CalendarVisualGroup) => commitMutation(next.id, latest => ({ ...latest, startDate: next.startDate, endDate: next.endDate, startTime: next.startTime, endTime: next.endTime, weekdays: next.weekdays, days: next.days })), [commitMutation]);
  const remove = useCallback(async () => {
    // Wait for an in-flight first creation to obtain its persistent identity;
    // deleting an invalid draft does not require making that draft valid first.
    cancelTimer(); if (writer.current) await writer.current;
    const old = current.current; if (!old) return;
    if (!old.group.id) { assign(null); return; }
    const saved = persisted.current.get(old.group.id) ?? old.group;
    assign(null); setGroups(rows => rows.filter(row => row.id !== saved.id)); setBusy(true);
    try {
      const deleted = await api.deleteVisualGroup(saved.id); persisted.current.delete(saved.id);
      notifyRef.current({ message: "그룹 블록을 삭제했습니다.", undo: async () => { accept(await api.undoVisualGroup(deleted.undoToken)); } });
    } catch (e) { accept(saved); assign(old); setError(message(e)); }
    finally { setBusy(false); }
  }, [accept, api, assign, cancelTimer]);
  useEffect(() => () => { cancelTimer(); }, [cancelTimer]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current?.dirty || writer.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload);
  }, []);
  return { groups, value: draft?.group ?? null, dirty: draft?.dirty ?? false, status, error, loadError, busy, guard, refresh, change, flush, leave, select, create, commit, commitMutation, remove, discard, continueEditing, retry };
}
