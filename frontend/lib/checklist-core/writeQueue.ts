import { cellKey, type CellChange, type ChecklistState } from "./types";

export type PersistChanges = (changes: CellChange[]) => Promise<void>;

/**
 * Local-first checklist writes shared by every consumer.
 *
 * - Every change is visible immediately through {@link get} (optimistic overlay).
 * - One request is in flight at a time; changes made meanwhile are coalesced
 *   (latest state per cell) into the next single batch — rapid clicks never
 *   race, and N clicks never become N sequential round trips.
 * - After a successful write the consumer patches its own base data via
 *   `committed`, so no refetch is needed. On failure the affected cells fall
 *   back to the last confirmed state.
 */
export class ChecklistWriteQueue {
  private overlay = new Map<string, ChecklistState>();
  private baseline = new Map<string, ChecklistState>();
  private pending = new Map<string, CellChange>();
  private inflight: CellChange[] | null = null;
  private scheduled = false;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private persist: PersistChanges,
    private committed: (changes: CellChange[]) => void,
    private failed: (error: unknown, changes: CellChange[]) => void,
    private changed: () => void,
    private maxBatch = 2000,
  ) {}

  get(rowId: string, date: string): ChecklistState | undefined {
    return this.overlay.get(cellKey(rowId, date));
  }

  /** Cells not yet confirmed by the server. */
  get busyCount() {
    return this.pending.size + (this.inflight?.length ?? 0);
  }

  enqueue(changes: CellChange[], previous: (rowId: string, date: string) => ChecklistState) {
    if (!changes.length) return;
    for (const change of changes) {
      const key = cellKey(change.rowId, change.date);
      if (!this.baseline.has(key)) this.baseline.set(key, this.overlay.get(key) ?? previous(change.rowId, change.date));
      this.overlay.set(key, change.state);
      this.pending.set(key, change);
    }
    this.changed();
    this.schedule();
  }

  /** Resolves once nothing is pending or in flight (tests, navigation guards). */
  idle(): Promise<void> {
    if (!this.busyCount) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.push(resolve));
  }

  private schedule() {
    if (this.scheduled || this.inflight) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.flush();
    });
  }

  private async flush() {
    if (this.inflight || !this.pending.size) return;
    const batch = [...this.pending.values()].slice(0, this.maxBatch);
    for (const change of batch) this.pending.delete(cellKey(change.rowId, change.date));
    this.inflight = batch;
    let ok = false;
    try {
      await this.persist(batch);
      ok = true;
    } catch (error) {
      this.failed(error, batch);
    }
    if (ok) this.committed(batch);
    for (const change of batch) {
      const key = cellKey(change.rowId, change.date);
      if (this.pending.has(key)) {
        // A newer change for this cell is queued; its baseline follows what the server now holds.
        if (ok) this.baseline.set(key, change.state);
        continue;
      }
      this.overlay.delete(key);
      this.baseline.delete(key);
    }
    this.inflight = null;
    this.changed();
    if (this.pending.size) this.schedule();
    else if (!this.busyCount) this.idleWaiters.splice(0).forEach(resolve => resolve());
  }
}
