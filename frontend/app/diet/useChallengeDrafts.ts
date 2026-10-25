"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Challenge, DietData, DietStore } from "@/lib/diet/types";
import { challengeEqual, draftChanged, saveChallengeDrafts, type ChallengeDraftMap } from "@/lib/diet/challengeDrafts";
import { guardNoteHistory } from "@/lib/notes/historyGuard";

export function useChallengeDrafts(store: DietStore, registerFlush?: (flush: () => Promise<void>) => () => void) {
  const [drafts, setDrafts] = useState<ChallengeDraftMap>({}), [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [storageError, setStorageError] = useState("");
  const current = useRef(drafts), key = useRef(""), locked = useRef(false);
  const pending = useRef<Promise<void> | null>(null), persisted = useRef(true);
  const update = (next: ChallengeDraftMap) => {
    current.current = next; setDrafts(next);
    if (!key.current) return;
    try { localStorage.setItem(key.current, JSON.stringify(next)); persisted.current = true; setStorageError(""); window.dispatchEvent(new CustomEvent("diet-challenge-drafts", { detail: { key: key.current, value: next } })); }
    catch { persisted.current = false; setStorageError("초안을 브라우저에 보관할 수 없습니다. 페이지를 닫기 전에 저장하세요."); }
  };
  useEffect(() => {
    const flush = async () => { await pending.current; if (!persisted.current && Object.values(current.current).some(draftChanged)) throw new Error("초안을 보관할 수 없습니다. 변경을 저장하거나 취소한 뒤 이동하세요."); };
    const unregister = registerFlush?.(flush);
    const history = guardNoteHistory(flush, () => locked.current || (!persisted.current && Object.values(current.current).some(draftChanged)), error => setStorageError(error instanceof Error ? error.message : "저장 확인 실패"));
    return () => { unregister?.(); history.dispose(); };
  }, [registerFlush]);
  useEffect(() => {
    let live = true;
    const receive = (event: Event) => {
      const custom = event as CustomEvent<{ key: string; value: ChallengeDraftMap }>;
      const storage = event as StorageEvent;
      if (!key.current || (custom.detail?.key ?? storage.key) !== key.current) return;
      try {
        const next = custom.detail?.value ?? JSON.parse(storage.newValue ?? "{}");
        if (!next || typeof next !== "object" || Array.isArray(next) || Object.values(next as ChallengeDraftMap).some(d => !d?.value?.id || !Array.isArray(d.value.notes) || !Array.isArray(d.value.itemIds) || !("base" in d))) return;
        if (!custom.detail) {
          let conflict = false;
          for (const [id, local] of Object.entries(current.current)) {
            if (draftChanged(local) && JSON.stringify(local) !== JSON.stringify(next[id])) { next[id] = local; conflict = true; }
          }
          if (conflict) { persisted.current = false; setStorageError("다른 창에서 초안이 변경되었습니다. 현재 입력은 유지했습니다. 저장하거나 취소한 뒤 이동하세요."); }
        }
        current.current = next; setDrafts(next);
      } catch { /* A corrupt external draft must not replace a live editor. */ }
    };
    window.addEventListener("diet-challenge-drafts", receive);
    window.addEventListener("storage", receive);
    const supabase = createSupabaseBrowserClient();
    (supabase ? supabase.auth.getSession().then(r => r.data.session?.user.id ?? "anonymous") : Promise.resolve("loopback-dev")).then(owner => {
      if (!live) return;
      key.current = `diet-challenge-drafts:v1:${owner}`;
      try {
        const parsed = JSON.parse(localStorage.getItem(key.current) ?? "{}") as ChallengeDraftMap;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some(d => !d?.value?.id || !Array.isArray(d.value.notes) || !Array.isArray(d.value.itemIds) || !("base" in d))) throw new Error();
        current.current = parsed; setDrafts(parsed);
      } catch { setStorageError("보관된 초안을 읽지 못했습니다. 기존 보관 내용은 덮어쓰지 않았습니다."); key.current = ""; persisted.current = false; }
      setReady(true);
    }).catch(() => { if (live) setStorageError("초안 계정을 확인하지 못했습니다. 다시 불러오세요."); });
    const warn = (e: BeforeUnloadEvent) => { if (Object.values(current.current).some(draftChanged)) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { live = false; window.removeEventListener("beforeunload", warn); window.removeEventListener("diet-challenge-drafts", receive); window.removeEventListener("storage", receive); };
  }, []);
  const change = (value: Challenge) => {
    if (!ready || locked.current) return;
    const previous = current.current[value.id];
    update({ ...current.current, [value.id]: { base: previous ? previous.base : store.data.challenges.find(c => c.id === value.id) ?? null, value: structuredClone(value) } });
  };
  const cancel = (ids: string[]) => { if (locked.current) return; const next = { ...current.current }; ids.forEach(id => delete next[id]); update(next); };
  const save = async (ids: string[]) => {
    if (locked.current || !ready || store.busy) return;
    locked.current = true; setSaving(true);
    try {
      pending.current = saveChallengeDrafts(ids, structuredClone(current.current), {
        load: () => apiClient.get<DietData>("/api/diet"),
        save: async value => {
          const plans = await apiClient.get<{ value: Challenge; version: string }[]>("/api/diet/mobile/plans");
          const plan = plans.find(p => p.value.id === value.id), base = current.current[value.id]?.base;
          if (base ? !plan || !challengeEqual(plan.value, base) : !!plan) throw new Error("다른 화면에서 변경되었습니다. 초안을 보관했습니다. 최신 값과 비교 후 다시 편집하세요.");
          const result = await apiClient.put<{ value: Challenge; version: string }>(`/api/diet/mobile/plans/${value.id}`, { value: plan ? { ...value, sortOrder: plan.value.sortOrder, homeSortOrder: plan.value.homeSortOrder } : value, expectedVersion: plan?.version ?? "new" });
          store.acceptChallenge?.(result.value);
        },
        committed: (id, value) => { store.acceptChallenge?.(value); const next = { ...current.current }; delete next[id]; update(next); window.dispatchEvent(new Event("diet-challenges-changed")); },
        failed: (id, error) => { const d = current.current[id]; if (d) update({ ...current.current, [id]: { ...d, error } }); },
      });
      await pending.current;
    } finally { pending.current = null; locked.current = false; setSaving(false); }
  };
  const changedIds = Object.keys(drafts).filter(id => draftChanged(drafts[id]));
  const remove = async (value: Challenge) => {
    if (locked.current || !ready || store.busy) throw new Error("진행 중인 저장을 기다려 주세요.");
    locked.current = true; setSaving(true);
    try {
      pending.current = (async () => {
        const plans = await apiClient.get<{ value: Challenge; version: string }[]>("/api/diet/mobile/plans");
        const plan = plans.find(p => p.value.id === value.id);
        if (!plan || !challengeEqual(plan.value, value)) throw new Error("챌린지가 다른 화면에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 삭제하세요.");
        await apiClient.delete(`/api/diet/mobile/plans/${value.id}?expectedVersion=${encodeURIComponent(plan.version)}`);
        const next = { ...current.current }; delete next[value.id]; update(next);
        await (store as DietStore & { reload?: () => Promise<void> }).reload?.();
        window.dispatchEvent(new Event("diet-challenges-changed"));
      })();
      await pending.current;
    } finally { pending.current = null; locked.current = false; setSaving(false); }
  };
  return { drafts, change, cancel, save, remove, changedIds, ready, saving, storageError, canPersist: () => persisted.current };
}
