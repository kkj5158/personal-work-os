import { imageBlob } from "./api";

// Authenticated bytes and blob URLs live only while this owner's/profile's images are mounted.
// Sharing a post image with its lightbox (or an avatar with feed cards) must not download it again.
type Entry = { refs: number; url: string; promise: Promise<string> };
const entries = new Map<string, Entry>();
export function acquireImage(owner: string, profile: string, id: string) {
  const key = `${owner}:${profile}:${id}`;
  let entry = entries.get(key);
  if (!entry) {
    const created: Entry = { refs: 0, url: "", promise: Promise.resolve("") };
    created.promise = imageBlob(owner, profile, id).then((blob) => {
      const url = URL.createObjectURL(blob);
      if (!created.refs) {
        URL.revokeObjectURL(url);
        return "";
      }
      created.url = url;
      return url;
    });
    entry = created;
    entries.set(key, entry);
  }
  entry.refs++;
  let released = false;
  const held = entry;
  return {
    url: held.promise,
    release: () => {
      if (released) return;
      released = true;
      held.refs--;
      if (!held.refs) {
        if (held.url) URL.revokeObjectURL(held.url);
        if (entries.get(key) === held) entries.delete(key);
      }
    },
  };
}
