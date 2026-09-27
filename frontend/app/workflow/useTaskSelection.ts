'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * The selected Task lives in the URL (?task=<id>) so Global Tabs, reloads and new windows restore it.
 * replaceState integrates with the Next.js router, so other search params and scroll are untouched; a local
 * mirror makes the swap immediate even before the router re-renders (and outside a router, e.g. in tests).
 */
export function useTaskSelection(): [string | null, (id: string | null) => void] {
  const params = useSearchParams();
  const fromUrl = params ? params.get('task') : typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('task');
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  // A navigation that changes ?task (tab switch, back/forward) wins over the local mirror.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(undefined); }, [fromUrl]);
  const select = useCallback((id: string | null) => {
    setLocal(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('task', id); else url.searchParams.delete('task');
    window.history.replaceState(window.history.state, '', url);
  }, []);
  return [local !== undefined ? local : fromUrl, select];
}
