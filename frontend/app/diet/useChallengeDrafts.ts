"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Challenge, DietData, DietStore } from "@/lib/diet/types";
import { draftChanged, saveChallengeDrafts, type ChallengeDraftMap } from "@/lib/diet/challengeDrafts";
import { guardNoteHistory } from "@/lib/notes/historyGuard";

export function useChallengeDrafts(store: DietStore, registerFlush?: (flush: () => Promise<void>) => () => void) {
  const [drafts, setDrafts] = useState<ChallengeDraftMap>({}), [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [storageError, setStorageError] = useState("");
  const current = useRef(drafts), key = useRef(""), locked = useRef(false);
  const pending = useRef<Promise<void> | null>(null), persisted = useRef(true);
  const update = (next: ChallengeDraftMap) => {
    current.current = next; setDrafts(next);
    if (!key.current) return;
    try { localStorage.setItem(key.current, JSON.stringify(next)); persisted.current = true; setStorageError(""); }
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
    return () => { live = false; window.removeEventListener("beforeunload", warn); };
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
        save: value => store.save("challenges", value),
        committed: (id, value) => { store.acceptChallenge?.(value); const next = { ...current.current }; delete next[id]; update(next); },
        failed: (id, error) => { const d = current.current[id]; if (d) update({ ...current.current, [id]: { ...d, error } }); },
      });
      await pending.current;
    } finally { pending.current = null; locked.current = false; setSaving(false); }
  };
  const changedIds = Object.keys(drafts).filter(id => draftChanged(drafts[id]));
  return { drafts, change, cancel, save, changedIds, ready, saving, storageError };
}
