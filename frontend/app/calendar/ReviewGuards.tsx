"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Guard = () => Promise<void>;
const Context = createContext<{
  register: (guard: Guard) => () => void;
  flush: Guard;
}>({ register: () => () => {}, flush: async () => {} });
export function ReviewGuards({ children }: { children: ReactNode }) {
  const [guards] = useState(() => new Set<Guard>());
  const register = useCallback(
    (guard: Guard) => {
      guards.add(guard);
      return () => {
        guards.delete(guard);
      };
    },
    [guards],
  );
  const flush = useCallback(async () => {
    for (const guard of guards) await guard();
  }, [guards]);
  return <Context value={{ register, flush }}>{children}</Context>;
}
export const useReviewGuards = () => useContext(Context);
export function useReviewGuard(guard: Guard) {
  const { register } = useContext(Context);
  const latest = useRef(guard);
  useEffect(() => {
    latest.current = guard;
  });
  useEffect(() => register(() => latest.current()), [register]);
}
