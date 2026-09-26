/** MONEY-only, memory-only request cache. No credentials or financial data in storage. */
export type MoneyMutation = "transaction" | "book" | "account" | "loan" | "category" | "rule" | "review";
export function resourceKey(path: string): string {
  const [name, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.sort();
  return name + (params.size ? "?" + params.toString() : "");
}
export function affectedBy(mutation: MoneyMutation, key: string): boolean {
  const path = key.split("?")[0];
  const family = path.split("/")[1];
  // Deliberately conservative within financial projections; references remain independent.
  // All transaction fields (including inherited title/memo/category) share this matrix.
  const financial = ["transactions", "bookkeeping", "overview", "account-balances", "review", "connection-status"];
  const accountDetail = path.startsWith("/accounts/");
  switch (mutation) {
    case "transaction": return financial.includes(family) || accountDetail;
    case "book": return family === "bookkeeping"; // Sparse override AND reset; never ledger KPIs.
    case "account": return family === "accounts" || financial.includes(family) || family === "notifications";
    case "loan": return family === "loans" || family === "overview";
    case "category": return ["categories", "bookkeeping", "overview", "category-rules"].includes(family);
    case "rule": return family === "category-rules"; // Existing API is future-only.
    case "review": return financial.includes(family) || accountDetail || family === "notifications";
  }
}
export const FINANCIAL_TTL = 30_000;
export const REFERENCE_TTL = 120_000;
export type Snapshot = { data: unknown; error: string; loading: boolean; expiresAt: number };
export const EMPTY: Snapshot = Object.freeze({ data: null, error: "", loading: false, expiresAt: 0 });
type Entry = { snapshot: Snapshot; promise?: Promise<unknown> };
export class MoneyCache {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<() => void>>();
  private scopeListeners = new Set<() => void>();
  private scope: string | null = null;
  private generation = 0;
  constructor(private fetcher: (key: string) => Promise<unknown>, private now = Date.now) {}
  get active() { return this.scope !== null; }
  scopeSnapshot = () => this.generation;
  subscribeScope = (listener: () => void) => { this.scopeListeners.add(listener); return () => { this.scopeListeners.delete(listener); }; };
  setScope(scope: string | null) {
    if (scope === this.scope) return;
    this.scope = scope;
    this.generation++;
    this.entries.clear(); // Old in-flight entry identities can no longer write back.
    this.listeners.forEach(group => group.forEach(fn => fn()));
    this.scopeListeners.forEach(fn => fn());
  }
  snapshot = (key: string): Snapshot => this.entries.get(resourceKey(key))?.snapshot ?? EMPTY;
  subscribe(key: string, listener: () => void) {
    key = resourceKey(key);
    const group = this.listeners.get(key) ?? new Set();
    group.add(listener); this.listeners.set(key, group);
    return () => { group.delete(listener); if (!group.size) this.listeners.delete(key); };
  }
  private emit(key: string) { this.listeners.get(key)?.forEach(fn => fn()); }
  load(key: string): Promise<unknown> {
    key = resourceKey(key);
    if (!this.active) return Promise.reject(new Error("MONEY session unavailable"));
    const current = this.entries.get(key);
    if (current?.promise) return current.promise;
    if (current && current.snapshot.expiresAt > this.now()) return Promise.resolve(current.snapshot.data);
    const entry: Entry = { snapshot: { data: current?.snapshot.data ?? null, error: "", loading: true, expiresAt: 0 } };
    this.entries.set(key, entry);
    const promise = Promise.resolve().then(() => this.fetcher(key)).then(data => {
      if (this.entries.get(key) === entry) {
        const ttl = ["/accounts", "/categories", "/category-rules"].includes(key) ? REFERENCE_TTL : FINANCIAL_TTL;
        entry.snapshot = { data, error: "", loading: false, expiresAt: this.now() + ttl };
        entry.promise = undefined; this.emit(key);
      }
      return data;
    }, error => {
      if (this.entries.get(key) === entry) {
        entry.snapshot = { ...EMPTY, error: error instanceof Error ? error.message : "불러오지 못했습니다." };
        entry.promise = undefined; this.emit(key);
      }
      throw error;
    });
    entry.promise = promise;
    this.emit(key);
    // Bound retained inactive queries. Mounted/pending resources aren't evicted.
    for (const [oldKey, old] of this.entries) {
      if (this.entries.size <= 128) break;
      if (!old.promise && !this.listeners.has(oldKey)) this.entries.delete(oldKey);
    }
    return promise;
  }
  invalidate(predicate: (key: string) => boolean = () => true) {
    for (const [key, entry] of this.entries) if (predicate(key)) {
      this.entries.set(key, { snapshot: { ...EMPTY, data: entry.snapshot.data } });
      this.emit(key);
    }
  }
  mutate(kind: MoneyMutation) { this.invalidate(key => affectedBy(kind, key)); }
  expire(key: string) {
    const snapshot = this.snapshot(key);
    if (!snapshot.loading && snapshot.expiresAt && snapshot.expiresAt <= this.now()) this.invalidate(k => k === resourceKey(key));
  }
}
