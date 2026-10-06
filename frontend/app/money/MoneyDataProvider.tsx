"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from "react";
import { bindMoneySession } from "@/lib/money/session";
import { MoneyCache } from "@/lib/money/cache";
import { MoneyRowCoordinator } from "@/lib/money/rowCoordinator";
import type { BookRow } from "./MoneyWebData";
import { moneyApi } from "@/lib/money/model";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

const Context = createContext<MoneyCache | null>(null);
const RowContext=createContext<MoneyRowCoordinator|null>(null);
class ScrollSession {
  readonly positions=new Map<string,{x:number;y:number}>();
  private handler:(()=>void)|null=null;
  capture(){this.handler?.();}
  register(handler:()=>void){this.handler=handler;return()=>{if(this.handler===handler)this.handler=null;};}
}
const ScrollContext=createContext<ScrollSession|null>(null);
export function useMoneyScrollCapture(){const memory=useContext(ScrollContext);return useCallback(()=>memory?.capture(),[memory]);}
/** Restore investigation position only after its current query has rendered. Session changes discard this map. */
export function useMoneyScroll(key:string,ready:boolean){
  const memory=useContext(ScrollContext);
  if(!memory)throw new Error('MONEY scroll session missing');
  useLayoutEffect(()=>{
    if(!ready)return;
    const positions=memory.positions,previous=positions.get(key);let restoring=true,leaving=false,frame=0;
    const remember=()=>{if(!restoring&&!leaving)positions.set(key,{x:window.scrollX,y:window.scrollY});};
    const capture=()=>{remember();leaving=true;},unregister=memory.register(capture);
    frame=requestAnimationFrame(()=>{window.scrollTo(previous?.x??0,previous?.y??0);frame=requestAnimationFrame(()=>{restoring=false;remember();});});
    window.addEventListener('scroll',remember,{passive:true});
    window.addEventListener('popstate',capture);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',remember);window.removeEventListener('popstate',capture);unregister();};
  },[key,ready,memory]);
}
export function useMoneyRows(){const value=useContext(RowContext);if(!value)throw Error('MONEY row coordinator missing');return value;}
export function useMoneyRow(row:BookRow){const rows=useMoneyRows();const subscribe=useCallback((fn:()=>void)=>rows.subscribe(row.id,fn),[rows,row.id]);const snapshot=useCallback(()=>rows.snapshot(row.id),[rows,row.id]);useSyncExternalStore(subscribe,snapshot,()=>null);return rows.latest(row);}
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
  const [rows]=useState(()=>new MoneyRowCoordinator(moneyApi));
  const [scroll]=useState(()=>new ScrollSession());
  useEffect(()=>{rows.activate();return()=>rows.dispose();},[rows]);
  return (
    <ScrollContext.Provider value={scroll}><RowContext.Provider value={rows}>
    <ViewContext.Provider
      value={{
        values,
        update: (key, fn) =>
          setValues((old) => ({ ...old, [key]: fn(old[key]) })),
      }}
    >
      {children}
    </ViewContext.Provider>
    </RowContext.Provider></ScrollContext.Provider>
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
