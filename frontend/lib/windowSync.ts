/** Revision notifications only: the server remains the source of document data.
 * Editor selections, cursors and drafts never leave their owning window. */
export type EntityChange = {
  entityType: string;
  entityId: string;
  revision: number;
  windowInstanceId: string;
  eventId: string;
};
export type EntityRevision = Pick<EntityChange, "entityType" | "entityId" | "revision">;
const CHANNEL = "pos.entity-revisions.v1";
export const ENTITY_CHANGE_STORAGE_KEY = CHANNEL;
const instances = new WeakMap<Window, ReturnType<typeof createWindowSync>>();

export function isEntityChange(value: unknown): value is EntityChange {
  if (!value || typeof value !== "object") return false;
  const event = value as EntityChange;
  return [event.entityType, event.entityId, event.windowInstanceId, event.eventId].every(item => typeof item === "string" && item.length > 0 && item.length <= 240)
    && Number.isSafeInteger(event.revision) && event.revision >= 0;
}

/** Exported factory also permits isolated two-window tests. */
export function createWindowSync(target: Window) {
  // Do not persist in sessionStorage: browsers may clone it into a new window.
  const windowInstanceId = target.crypto.randomUUID();
  const listeners = new Set<(event: EntityChange) => void>();
  const seen = new Set<string>();
  let channel: BroadcastChannel | undefined;
  function deliver(value: unknown) {
    if (!isEntityChange(value) || seen.has(value.eventId)) return;
    seen.add(value.eventId);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    for (const listener of listeners) {
      try { listener(value); } catch { /* One consumer cannot invalidate an acknowledged save. */ }
    }
  }
  const storage = (event: StorageEvent) => {
    if (event.key !== CHANNEL || !event.newValue) return;
    try { deliver(JSON.parse(event.newValue)); } catch { /* Ignore unrelated/malformed storage data. */ }
  };
  function connect() {
    target.addEventListener("storage", storage);
    try {
      const Constructor = (target as Window & { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
      if (Constructor) {
        channel = new Constructor(CHANNEL);
        channel.onmessage = event => deliver(event.data);
      }
    } catch { /* Storage events remain available if channels are disabled. */ }
  }
  return {
    windowInstanceId,
    subscribe(listener: (event: EntityChange) => void) {
      if (!listeners.size) connect();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          channel?.close(); channel = undefined;
          target.removeEventListener("storage", storage);
        }
      };
    },
    publish(change: EntityRevision) {
      const event: EntityChange = { ...change, windowInstanceId, eventId: target.crypto.randomUUID() };
      if (!isEntityChange(event)) return;
      // Other editors in this same window (main/dock) receive the update too.
      deliver(event);
      try {
        if (channel) channel.postMessage(event);
        else {
          const Constructor = (target as Window & { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
          if (Constructor) { const sender = new Constructor(CHANNEL); sender.postMessage(event); sender.close(); }
        }
      } catch { /* Fall through to storage. */ }
      // Send both: a receiver may lack BroadcastChannel. eventId deduplicates.
      try { target.localStorage.setItem(CHANNEL, JSON.stringify(event)); target.localStorage.removeItem(CHANNEL); } catch { /* Focus refresh remains available. */ }
    },
  };
}
function current() {
  let instance = instances.get(window);
  if (!instance) { instance = createWindowSync(window); instances.set(window, instance); }
  return instance;
}
export const getWindowInstanceId = () => current().windowInstanceId;
export const publishEntityChange = (change: EntityRevision) => { if (typeof window !== "undefined") current().publish(change); };
export const subscribeEntityChanges = (listener: (event: EntityChange) => void) => typeof window === "undefined" ? () => {} : current().subscribe(listener);
