"use client";
import { useCallback, useSyncExternalStore } from "react";
import { readWeekStart, weekStartPreferenceKey, type DisplayWeekStart } from "@/lib/money/workCalendarDisplay";
import { useMoneyCache } from "./MoneyDataProvider";

const memory = new Map<string, DisplayWeekStart>();
const listeners = new Set<() => void>();
const serverSnapshot = (): DisplayWeekStart => "SUNDAY";
/** Only a display enum is persisted. No financial data, session IDs or credentials. */
export function useWorkCalendarWeekStart(): [DisplayWeekStart, (mode: DisplayWeekStart) => void] {
  const owner = useMoneyCache().preferenceOwner;
  const subscribe = useCallback((notify: () => void) => {
    listeners.add(notify);
    const storageChanged = (event: StorageEvent) => { if (!event.key || owner && event.key === weekStartPreferenceKey(owner)) notify(); };
    window.addEventListener("storage", storageChanged);
    return () => { listeners.delete(notify); window.removeEventListener("storage", storageChanged); };
  }, [owner]);
  const snapshot = useCallback((): DisplayWeekStart => {
    if (!owner) return "SUNDAY";
    if (memory.has(owner)) return memory.get(owner)!;
    try { return readWeekStart(window.localStorage, owner); } catch { return "SUNDAY"; }
  }, [owner]);
  const mode = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [mode, value => {
    if (!owner) return;
    try { window.localStorage.setItem(weekStartPreferenceKey(owner), value); memory.delete(owner); }
    catch { memory.set(owner, value); }
    listeners.forEach(notify => notify());
  }];
}
