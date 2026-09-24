"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { checklistSysApi, type Catalog, type DailyRecord, type Item } from "@/lib/checklist-sys/api";
import { recordKey } from "@/lib/checklist-sys/model";
import { useChecklistMutations } from "@/components/checklist-core/useChecklistMutations";
import type { CellChange, ChecklistState } from "@/lib/checklist-core/types";
import { addDays } from "@/lib/checklist-core/dates";

const emptyCatalog: Catalog = { identities: [], areas: [], items: [], archivePeriods: [] };
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * CHECKLIST SYS adapter: catalog + records cache, with record writes going
 * through the shared checklist mutation path (optimistic, coalesced, no refetch).
 */
export function useChecklistSysStore() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [records, setRecords] = useState<Map<string, ChecklistState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef<{ from: string; to: string } | null>(null);
  const inflight = useRef(new Map<string, Promise<void>>());

  const reloadCatalog = useCallback(() => checklistSysApi.catalog()
    .then(next => { setCatalog(next); setError(""); })
    .catch(e => setError(message(e, "CHECKLIST SYS를 불러오지 못했습니다.")))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void reloadCatalog(); }, [reloadCatalog]);

  /** Loads records covering [from, to] once; later calls only fetch the uncovered span. */
  const ensureRange = useCallback(async (from: string, to: string) => {
    const current = loaded.current;
    // Only spans outside the loaded window are fetched, so a fetch never races a local write.
    const spans: [string, string][] = !current ? [[from, to]] : [
      ...(from < current.from ? [[from, addDays(current.from, -1)] as [string, string]] : []),
      ...(to > current.to ? [[addDays(current.to, 1), to] as [string, string]] : []),
    ];
    if (!spans.length) return;
    loaded.current = { from: current && current.from < from ? current.from : from, to: current && current.to > to ? current.to : to };
    await Promise.all(spans.map(async ([a, b]) => {
      const key = `${a}/${b}`;
      const running = inflight.current.get(key);
      if (running) return running;
      const task = checklistSysApi.records(a, b).then((rows: DailyRecord[]) => setRecords(previous => {
        const next = new Map(previous);
        for (const row of rows) next.set(recordKey(row.itemId, row.date), row.state);
        return next;
      })).catch(e => { loaded.current = current; setError(message(e, "기록을 불러오지 못했습니다.")); })
        .finally(() => inflight.current.delete(key));
      inflight.current.set(key, task);
      return task;
    }));
  }, []);

  const baseState = useCallback((rowId: string, date: string): ChecklistState => records.get(recordKey(rowId, date)) ?? "UNTOUCHED", [records]);
  const mutations = useChecklistMutations({
    baseState,
    persist: changes => checklistSysApi.saveRecords(changes.map(c => ({ itemId: c.rowId, date: c.date, state: c.state === "UNTOUCHED" ? null : c.state }))),
    commit: (changes: CellChange[]) => setRecords(previous => {
      const next = new Map(previous);
      for (const c of changes) {
        if (c.state === "UNTOUCHED") next.delete(recordKey(c.rowId, c.date));
        else next.set(recordKey(c.rowId, c.date), c.state);
      }
      return next;
    }),
  });

  /** Structural catalog mutation, then a (small) catalog reload — records are untouched. */
  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await operation(); await reloadCatalog(); }
    catch (e) { setError(message(e, "저장하지 못했습니다.")); throw e; }
    finally { setBusy(false); }
  }, [reloadCatalog]);

  /** Optimistic reorder inside one parent; reverts on failure. */
  const reorderItems = useCallback(async (areaId: string, ids: string[]) => {
    const previous = catalog;
    setCatalog(c => ({ ...c, items: c.items.map(i => (ids.includes(i.id) ? { ...i, sortOrder: ids.indexOf(i.id) } : i)) }));
    try { await checklistSysApi.orderItems(areaId, ids); await reloadCatalog(); }
    catch (e) { setCatalog(previous); setError(message(e, "순서를 저장하지 못했습니다.")); }
  }, [catalog, reloadCatalog]);

  const archiveItem = (item: Item) => mutate(() => checklistSysApi.archiveItem(item.id));
  const restoreItem = (item: Item) => mutate(() => checklistSysApi.restoreItem(item.id));

  return { catalog, records, loading, busy, error, setError, ensureRange, mutations, mutate, reorderItems, archiveItem, restoreItem, reloadCatalog };
}

export type ChecklistSysStore = ReturnType<typeof useChecklistSysStore>;
