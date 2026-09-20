"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiClient } from "@/lib/api/client";
import { SYSTEM_IDS, normalizeSystemOrder } from "@/lib/systemOrder";
import { usePathname } from "next/navigation";

type Preference = { systemIds: string[] };
type OrderContext = { order: string[]; loaded: boolean; saving: boolean; error: string; save: (ids: string[]) => void; retry: () => void };
const Context = createContext<OrderContext | null>(null);
const endpoint = "/api/pos/preferences/system-order";
export const useSystemOrder = () => useContext(Context);

export function SystemOrderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authenticatedRoute = pathname !== "/login";
  const [order, setOrder] = useState<string[]>([...SYSTEM_IDS]);
  const [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const pending = useRef<string[] | null>(null), running = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const requestedRevision = revision.current;
    try {
      const result = await apiClient.get<Preference>(endpoint);
      if (requestedRevision !== revision.current) return;
      if (!pending.current && !running.current) setOrder(normalizeSystemOrder(result.systemIds));
      setLoaded(true); setError("");
    } catch { setError("시스템 순서를 불러오지 못했습니다. 다시 시도하세요."); }
  }, []);
  // A single writer prevents rapid drags from persisting out of order. A failed
  // write retains the latest desired order for explicit retry, even after closing.
  const flush = useCallback(async () => {
    if (running.current) return;
    running.current = true; setSaving(true); setError("");
    try {
      while (pending.current) {
        const next = pending.current;
        await apiClient.put<Preference>(endpoint, { systemIds: next });
        if (pending.current === next) pending.current = null;
      }
    } catch { setError("순서를 저장하지 못했습니다. 현재 순서를 유지합니다. 다시 시도하세요."); }
    finally { running.current = false; setSaving(false); }
  }, []);
  useEffect(() => {
    if (!authenticatedRoute) return;
    queueMicrotask(() => { void refresh(); });
    const focus = () => { if (!pending.current && !running.current) void refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh, authenticatedRoute]);
  const save = (ids: string[]) => {
    if (!loaded) return;
    revision.current += 1;
    setOrder(normalizeSystemOrder(ids)); pending.current = ids; void flush();
  };
  return <Context.Provider value={{ order, loaded, saving, error, save, retry: () => { if (pending.current) void flush(); else void refresh(); } }}>{children}</Context.Provider>;
}
