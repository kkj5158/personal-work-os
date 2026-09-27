"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from "react";
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
    const value = new MoneyCache((key) => moneyApi.get(key));
    if (!isAuthRequired()) value.setScope("dev-fixed-owner");
    return value;
  });
  const generation = useSyncExternalStore(
    cache.subscribeScope,
    cache.scopeSnapshot,
    cache.scopeSnapshot,
  );
  useEffect(() => {
    if (!isAuthRequired()) {
      cache.setScope("dev-fixed-owner");
      return () => cache.setScope(null);
    }
    const client = createSupabaseBrowserClient();
    if (!client) return;
    return bindMoneySession(cache, client.auth);
  }, [cache]);
  return (
    <Context.Provider value={cache}>
      {cache.active ? (
        <Session key={generation}>{children}</Session>
      ) : (
        <p role="status">세션 확인 중…</p>
      )}
    </Context.Provider>
  );
}
// View preferences live in the same session boundary; never in browser storage.
const ViewContext = createContext<{
  values: Record<string, unknown>;
  update: (key: string, fn: (old: unknown) => unknown) => void;
} | null>(null);
function Session({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  return (
    <ViewContext.Provider
      value={{
        values,
        update: (key, fn) =>
          setValues((old) => ({ ...old, [key]: fn(old[key]) })),
      }}
    >
      {children}
    </ViewContext.Provider>
  );
}
export function useMoneyViewState<T>(
  key: string,
  initial: () => T,
): [T, (value: SetStateAction<T>) => void] {
  const context = useContext(ViewContext);
  const [fallback] = useState(initial);
  if (!context) throw new Error("MONEY session view state missing");
  return [
    (context.values[key] as T | undefined) ?? fallback,
    (value) =>
      context.update(key, (old) =>
        typeof value === "function"
          ? (value as (old: T) => T)((old as T | undefined) ?? fallback)
          : value,
      ),
  ];
}
