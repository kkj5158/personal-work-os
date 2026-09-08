import { notesApi } from "../api/notes";

// A mounted workspace owns this cache. Reordering node views preserves asset identity.
const assets = new Map<string, { url?: string; promise: Promise<string> }>();
export function cachedMedia(workspace: string, src: string) {
  return assets.get(`${workspace}/${src}`)?.url ?? "";
}
export function loadMedia(workspace: string, src: string) {
  const key = `${workspace}/${src}`;
  const existing = assets.get(key);
  if (existing) return existing.promise;
  const entry: { url?: string; promise: Promise<string> } = {
    promise: notesApi
      .media(workspace, src.slice(6))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (assets.get(key) !== entry) {
          URL.revokeObjectURL(url);
          throw new Error("Workspace closed");
        }
        entry.url = url;
        return url;
      })
      .catch((error: unknown) => {
        if (assets.get(key) === entry) assets.delete(key);
        throw error;
      }),
  };
  assets.set(key, entry);
  return entry.promise;
}
export function clearMediaCache() {
  for (const entry of assets.values())
    if (entry.url) URL.revokeObjectURL(entry.url);
  assets.clear();
}
