"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { moneyApi } from "@/lib/money/model";
import { weekStartPreferenceKey } from "@/lib/money/workCalendarDisplay";
import { EMPTY_CALENDAR_PREFERENCES, WorkCalendarPreferencesStore, type WorkCalendarPreferences } from "@/lib/money/workCalendarPreferences";
import { useMoneyCache } from "./MoneyDataProvider";

export function useWorkCalendarPreferences(enabled = true) {
  const owner = useMoneyCache().preferenceOwner;
  const store = useMemo(() => new WorkCalendarPreferencesStore({
    get: () => moneyApi.get<WorkCalendarPreferences>("/calendar/preferences"),
    put: (field, body) => moneyApi.put<WorkCalendarPreferences>("/calendar/preferences/" + field, body),
  }, {
    read: () => owner ? window.localStorage.getItem(weekStartPreferenceKey(owner)) : null,
    clear: () => { if (owner) window.localStorage.removeItem(weekStartPreferenceKey(owner)); },
  }), [owner]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY_CALENDAR_PREFERENCES);
  useEffect(() => {
    if (!enabled || !owner) return;
    store.activate();
    const refresh = () => { if (document.visibilityState !== "hidden") void store.refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { store.dispose(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [store, owner, enabled]);
  return { ...state, setWeekStart: store.setWeekStart, setDefaultTemplate: store.setDefaultTemplate, refresh: store.refresh };
}
