"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { bindMoneySession } from "@/lib/money/session";
import { MoneyCache } from "@/lib/money/cache";
import { moneyApi } from "@/lib/money/model";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

const Context = createContext<MoneyCache | null>(null);
export function useMoneyCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error("MONEY data provider missing");
  return cache;
}
export function MoneyDataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => {
    const value = new MoneyCache(key => moneyApi.get(key));
    if (!isAuthRequired()) value.setScope("dev-fixed-owner");
    return value;
  });
  const generation = useSyncExternalStore(cache.subscribeScope, cache.scopeSnapshot, cache.scopeSnapshot);
  useEffect(() => {
    if (!isAuthRequired()) { cache.setScope("dev-fixed-owner"); return () => cache.setScope(null); }
    const client = createSupabaseBrowserClient();
    if (!client) return;
    return bindMoneySession(cache, client.auth);
  }, [cache]);
  return <Context.Provider value={cache}>{cache.active ? <Session key={generation}>{children}</Session> : <p role="status">세션 확인 중…</p>}</Context.Provider>;
}
function Session({ children }: { children: ReactNode }) { return children; }
