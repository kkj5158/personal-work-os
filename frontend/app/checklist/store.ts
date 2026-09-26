"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { checklistSysApi, type Area, type Catalog, type DailyRecord, type Identity, type Item } from "@/lib/checklist-sys/api";
import { moveAreaIn, recordKey, reorderSubset } from "@/lib/checklist-sys/model";
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

  /**
   * Optimistic reorder of one sibling level (Identities, Areas of one Identity,
   * Items of one Area). Mirrors the backend slot algorithm, so no reload is needed;
   * a failure reverts only the touched rows and reports it.
   */
  const reorder = useCallback(async (level: "identities" | "areas" | "items", parentId: string | null, ids: string[]) => {
    type Ordered = { id: string; sortOrder: number };
    const siblingsOf = (c: Catalog): Ordered[] => level === "identities" ? c.identities
      : level === "areas" ? c.areas.filter(a => a.identityId === parentId) : c.items.filter(i => i.areaId === parentId);
    let before = new Map<string, number>();
    setCatalog(c => {
      const siblings = siblingsOf(c);
      before = new Map(siblings.map(s => [s.id, s.sortOrder]));
      const order = reorderSubset(siblings, ids);
      const apply = <T extends { id: string; sortOrder: number }>(rows: T[]) => rows.map(r => (order.has(r.id) ? { ...r, sortOrder: order.get(r.id)! } : r));
      return { ...c, [level]: apply(c[level] as { id: string; sortOrder: number }[]) };
    });
    try {
      if (level === "identities") await checklistSysApi.orderIdentities(ids);
      else if (level === "areas") await checklistSysApi.orderAreas(parentId!, ids);
      else await checklistSysApi.orderItems(parentId!, ids);
    } catch (e) {
      const revert = <T extends { id: string; sortOrder: number }>(rows: T[]) => rows.map(r => (before.has(r.id) ? { ...r, sortOrder: before.get(r.id)! } : r));
      setCatalog(c => ({ ...c, [level]: revert(c[level] as { id: string; sortOrder: number }[]) }));
      setError(message(e, "순서를 저장하지 못했습니다."));
    }
  }, []);

  /**
   * Area drag into another (or the same) Identity: one atomic request, optimistic
   * locally, and a failure restores the exact previous Areas (never a half move).
   */
  const moveArea = useCallback(async (areaId: string, identityId: string, ids: string[]) => {
    let before: Area[] = [];
    setCatalog(c => { before = c.areas; return { ...c, areas: moveAreaIn(c.areas, areaId, identityId, ids) }; });
    try { await checklistSysApi.moveArea(areaId, identityId, ids); }
    catch (e) {
      const previous = new Map(before.map(b => [b.id, b]));
      setCatalog(c => ({ ...c, areas: c.areas.map(a => { const b = previous.get(a.id); return b ? { ...a, identityId: b.identityId, sortOrder: b.sortOrder } : a; }) }));
      setError(message(e, "Area를 이동하지 못했습니다."));
    }
  }, []);

  /** Next slot among siblings, matching the backend's `nextOrder`. */
  const nextSlot = (rows: { sortOrder: number }[]) => rows.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);

  /**
   * In-context saves: persist, then patch the one changed row locally (no catalog
   * reload, so later local edits are never overwritten by a stale response).
   * Errors are thrown to the caller, which keeps the draft and shows the error in place.
   */
  const saveIdentity = useCallback(async (identity: Identity) => {
    await checklistSysApi.saveIdentity(identity);
    setCatalog(c => c.identities.some(i => i.id === identity.id)
      ? { ...c, identities: c.identities.map(i => (i.id === identity.id ? { ...i, name: identity.name.trim(), description: identity.description.trim(), color: identity.color } : i)) }
      : { ...c, identities: [...c.identities, { ...identity, name: identity.name.trim(), description: identity.description.trim(), sortOrder: nextSlot(c.identities) }] });
  }, []);

  const saveArea = useCallback(async (area: Area) => {
    await checklistSysApi.saveArea(area);
    setCatalog(c => {
      const current = c.areas.find(a => a.id === area.id);
      const slot = !current || current.identityId !== area.identityId ? nextSlot(c.areas.filter(a => a.identityId === area.identityId)) : current.sortOrder;
      const saved = { ...area, name: area.name.trim(), description: area.description.trim(), sortOrder: slot };
      return { ...c, areas: current ? c.areas.map(a => (a.id === area.id ? saved : a)) : [...c.areas, saved] };
    });
  }, []);

  const saveItem = useCallback(async (item: Item) => {
    await checklistSysApi.saveItem(item);
    setCatalog(c => {
      const current = c.items.find(i => i.id === item.id);
      const slot = !current || current.areaId !== item.areaId ? nextSlot(c.items.filter(i => i.areaId === item.areaId)) : current.sortOrder;
      const saved = { ...item, name: item.name.trim(), description: item.description.trim(), sortOrder: slot, archivedOn: current?.archivedOn ?? null, lastRecordOn: current?.lastRecordOn ?? null };
      return { ...c, items: current ? c.items.map(i => (i.id === item.id ? saved : i)) : [...c.items, saved] };
    });
  }, []);

  /** Delete = archive / restore the same item id; archive intervals change, so the catalog is reloaded. */
  const setItemArchived = useCallback(async (item: Item, archived: boolean) => {
    await (archived ? checklistSysApi.archiveItem(item.id) : checklistSysApi.restoreItem(item.id));
    await reloadCatalog();
  }, [reloadCatalog]);

  const deleteIdentity = useCallback(async (id: string) => {
    await checklistSysApi.deleteIdentity(id);
    setCatalog(c => ({ ...c, identities: c.identities.filter(i => i.id !== id) }));
  }, []);

  const deleteArea = useCallback(async (id: string) => {
    await checklistSysApi.deleteArea(id);
    setCatalog(c => ({ ...c, areas: c.areas.filter(a => a.id !== id) }));
  }, []);

  return { catalog, records, loading, busy, error, setError, ensureRange, mutations, mutate, reorder, moveArea, saveIdentity, saveArea, saveItem, setItemArchived, deleteIdentity, deleteArea, reloadCatalog };
}

export type ChecklistSysStore = ReturnType<typeof useChecklistSysStore>;
