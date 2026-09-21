import type { DailyCheck } from "./types";

export const checkKey = (check: Pick<DailyCheck, "date" | "itemId">) => `${check.date}/${check.itemId}`;
type Pending = { confirmed?: DailyCheck; latest: DailyCheck; revision: number; tail: Promise<void> };

// Only writes to the same cell wait for one another. Different cells save concurrently.
export class CheckPersistence {
  private pending = new Map<string, Pending>();
  private changes = new Map<string, {version: number; value: DailyCheck}>();
  private sequence = 0;
  checkpoint() { return this.sequence; }
  constructor(private write: (check: DailyCheck) => Promise<unknown>,
    private update: (check: DailyCheck) => void,
    private failed: (message: string) => void, private pendingChanged: (count: number) => void = () => {}) {}

  overlay(checks: DailyCheck[], since = this.sequence) {
    const rows = new Map(checks.map(check => [checkKey(check), check]));
    for (const [key, change] of this.changes) if (change.version > since) rows.set(key, change.value);
    for (const [key, entry] of this.pending) rows.set(key, entry.latest);
    return [...rows.values()];
  }

  save(check: DailyCheck, previous?: DailyCheck): Promise<void> {
    const key = checkKey(check);
    const entry = this.pending.get(key) ?? { confirmed: previous, latest: check, revision: 0, tail: Promise.resolve() };
    const revision = ++entry.revision;
    entry.latest = check;
    this.pending.set(key, entry);
    this.pendingChanged(this.pending.size);
    this.changes.set(key, {version: ++this.sequence, value: check});
    this.update(check);
    const result = entry.tail.catch(() => {}).then(async () => {
      try {
        await this.write(check);
        entry.confirmed = check;
      } catch (error) {
        if (entry.revision === revision) {
          const restored = entry.confirmed ?? { date: check.date, itemId: check.itemId, state: "MISSING" as const, memo: "" };
          this.changes.set(key, {version: ++this.sequence, value: restored});
          this.update(restored);
          this.failed(`${check.date}: ${error instanceof Error ? error.message : "저장하지 못했습니다."} 다시 시도하세요.`);
        }
        throw error;
      } finally {
        if (entry.revision === revision) { this.pending.delete(key); this.pendingChanged(this.pending.size); }
      }
    });
    entry.tail = result;
    return result;
  }
}
