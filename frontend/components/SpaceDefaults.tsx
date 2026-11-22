"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { getSpaceDefaults, putSpaceDefaults } from "@/lib/api/spaceDefaults";
import { INITIAL_SPACE_DEFAULTS, type SpaceDefaults } from "@/lib/spaceNavigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

type Preference = Awaited<ReturnType<typeof getSpaceDefaults>>;
type ReadResult = { generation: number; attempt: number; preference?: Preference; failed?: boolean };
type SaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict";
type Settings = {
  scope: number | null;
  defaults: SpaceDefaults;
  loading: boolean;
  entryPending: boolean;
  loadFailed: boolean;
  canSave: boolean;
  saveStatus: SaveStatus;
  save: (defaults: SpaceDefaults) => Promise<boolean>;
  reload: () => void;
};

const Context = createContext<Settings>({
  scope: null, defaults: INITIAL_SPACE_DEFAULTS, loading: false, entryPending: false, loadFailed: false, canSave: false,
  saveStatus: "idle", save: async () => false, reload: () => {},
});
export const useSpaceDefaults = () => useContext(Context);

export function SpaceDefaultsProvider({ children }: { children: ReactNode }) {
  const authenticatedRoute = usePathname() !== "/login";
  const requiresAuth = isAuthRequired();
  const [identity, setIdentity] = useState<{ owner: string; generation: number } | null>(
    requiresAuth ? null : { owner: "", generation: 0 },
  );
  const liveIdentity = useRef(identity);
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [write, setWrite] = useState<{ generation: number; attempt: number; status: SaveStatus } | null>(null);
  const writing = useRef<number | null>(null);
  const active = authenticatedRoute ? identity : null;

  useEffect(() => {
    if (!requiresAuth) return;
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const owner = session?.user.id;
      if (liveIdentity.current?.owner === owner) return;
      liveIdentity.current = owner ? { owner, generation: ++generation.current } : null;
      setIdentity(liveIdentity.current);
    });
    return () => subscription.unsubscribe();
  }, [requiresAuth]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Let StrictMode discard the first effect before starting a request.
    queueMicrotask(async () => {
      if (cancelled || liveIdentity.current !== active) return;
      try {
        const preference = await getSpaceDefaults(active.owner);
        if (!cancelled && liveIdentity.current === active) setRead({ ...active, attempt, preference });
      } catch {
        if (!cancelled && liveIdentity.current === active) setRead(previous => ({
          ...active, attempt, failed: true,
          preference: previous?.generation === active.generation ? previous.preference : undefined,
        }));
      }
    });
    return () => { cancelled = true; };
  }, [active, attempt]);

  const current = active && read?.generation === active.generation ? read : null;
  const loading = current?.attempt !== attempt;
  const saveStatus = active && write?.generation === active.generation && write.attempt === attempt ? write.status : "idle";
  const canSave = !!current?.preference && !loading && !current.failed && saveStatus !== "conflict";

  async function save(defaults: SpaceDefaults) {
    if (!active || liveIdentity.current !== active || !current?.preference || !canSave || writing.current === active.generation) return false;
    const operation = { generation: active.generation, attempt };
    writing.current = active.generation;
    setWrite({ ...operation, status: "saving" });
    try {
      const preference = await putSpaceDefaults(active.owner, { defaults, revision: current.preference.revision });
      if (liveIdentity.current !== active) return false;
      setRead({ ...active, attempt, preference });
      setWrite({ ...operation, status: "saved" });
      return true;
    } catch (error) {
      if (liveIdentity.current === active) setWrite({ ...operation, status: error instanceof ApiError && error.status === 409 ? "conflict" : "failed" });
      return false;
    } finally {
      if (writing.current === active.generation) writing.current = null;
    }
  }

  return <Context.Provider value={{
    scope: active?.generation ?? null,
    defaults: current?.preference?.defaults ?? INITIAL_SPACE_DEFAULTS,
    loading,
    entryPending: loading && !current?.preference,
    loadFailed: !loading && !!current?.failed,
    canSave,
    saveStatus,
    save,
    reload: () => { if (active && writing.current !== active.generation) setAttempt(value => value + 1); },
  }}>{children}</Context.Provider>;
}
