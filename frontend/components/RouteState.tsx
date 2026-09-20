"use client";
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Memory belongs to this signed-in shell lifetime. No editor content is written
// to browser storage and no inactive page tree stays mounted.
const Context = createContext<Map<string, unknown> | null>(null);
export function RouteStateProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map<string, unknown>());
  const pathname = usePathname();
  useEffect(() => { if (pathname === "/login") cache.clear(); }, [cache, pathname]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useRouteState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const cache = useContext(Context);
  const [value, setValue] = useState<T>(() => cache?.has(key) ? cache.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  useEffect(() => {
    if (!cache) return;
    cache.delete(key); cache.set(key, value);
    if (cache.size > 120) cache.delete(cache.keys().next().value!);
  }, [cache, key, value]);
  return [value, setValue];
}
function ScrollObserver({ element }: { element: React.RefObject<HTMLElement | null> }) {
  const pathname = usePathname(), params = useSearchParams(), cache = useContext(Context);
  const route = `${pathname}?${params}`;
  useLayoutEffect(() => {
    const main = element.current;
    if (!main || !cache) return;
    const key = `scroll:${route}`, top = (cache.get(key) as number | undefined) ?? 0;
    let restoring = true;
    const restore = () => { main.scrollTo({ top }); };
    restore();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (restoring) restore(); }) : null;
    for (const child of main.children) observer?.observe(child);
    const stop = () => { restoring = false; observer?.disconnect(); };
    const timer = window.setTimeout(stop, 2000);
    const remember = () => { if (!restoring) { cache.set(key, main.scrollTop); if (cache.size > 120) cache.delete(cache.keys().next().value!); } };
    main.addEventListener("scroll", remember);
    main.addEventListener("wheel", stop, { passive: true });
    main.addEventListener("touchstart", stop, { passive: true });
    main.addEventListener("pointerdown", stop);
    main.addEventListener("keydown", stop);
    return () => {
      window.clearTimeout(timer); stop();
      main.removeEventListener("scroll", remember); main.removeEventListener("wheel", stop);
      main.removeEventListener("touchstart", stop); main.removeEventListener("pointerdown", stop); main.removeEventListener("keydown", stop);
    };
  }, [cache, route, element]);
  return null;
}
export function RouteContent({ children }: { children: ReactNode }) {
  const element = useRef<HTMLElement>(null);
  return <main ref={element} className="min-w-0 flex-1 overflow-y-auto"><Suspense fallback={null}><ScrollObserver element={element}/></Suspense>{children}</main>;
}
