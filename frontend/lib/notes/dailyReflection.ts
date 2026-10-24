import type { DailyReflectionValue } from "../api/reflections";
import type { ReflectionEntryDto } from "../api/types";

export const DAILY_MOODS = [
  { level: 1, emoji: "😞", label: "매우 나쁨" },
  { level: 2, emoji: "🙁", label: "나쁨" },
  { level: 3, emoji: "😐", label: "보통" },
  { level: 4, emoji: "🙂", label: "좋음" },
  { level: 5, emoji: "😄", label: "매우 좋음" },
] as const;
export const EMPTY_DAILY: DailyReflectionValue = { title: null, dayScore: null, moodLevel: null, memo: null };
export function dailyValue(entry: ReflectionEntryDto | null): DailyReflectionValue {
  return { title: entry?.title ?? null, dayScore: entry?.dayScore ?? null, moodLevel: entry?.moodLevel ?? null, memo: entry?.memo ?? null };
}
type Key = keyof DailyReflectionValue;
type Change = { value: DailyReflectionValue[Key]; base: DailyReflectionValue[Key]; generation: number };
export type DailyState = { value: DailyReflectionValue; state: "loading" | "saved" | "pending" | "saving" | "error"; error: string | null; conflict: boolean };
export interface DailyTransport {
  load(): Promise<ReflectionEntryDto | null>;
  open(): Promise<ReflectionEntryDto>;
  save(value: DailyReflectionValue, version: number): Promise<ReflectionEntryDto>;
}
/** One queue per owner/date, retained during date/view navigation. Requests are
 * serialized; responses never replace newer typing. A 409 merges untouched
 * fields only. Same-field conflicts retain the draft until explicit retry. */
export class DailyReflectionSession {
  private entry: ReflectionEntryDto | null = null;
  private changes = new Map<Key, Change>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private flight?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private loading?: Promise<void>;
  private composing = false;
  private snapshot: DailyState = { value: { ...EMPTY_DAILY }, state: "loading", error: null, conflict: false };
  constructor(private transport: DailyTransport, private delay = 700) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit(state: DailyState["state"], error: string | null = null, conflict = false) {
    const value = dailyValue(this.entry);
    for (const [key, change] of this.changes) Object.assign(value, { [key]: change.value });
    this.snapshot = { value, state, error, conflict };
    this.listeners.forEach(listener => listener());
  }
  load() {
    if (!this.loading) this.loading = this.transport.load().then(entry => { this.entry = entry; this.emit("saved"); })
      .catch(() => { this.loading = undefined; this.emit("error", "회고를 불러오지 못했습니다. 다시 시도해 주세요."); });
    return this.loading;
  }
  async refresh() {
    if (this.dirty() || this.snapshot.state === "loading") return;
    const before = this.entry;
    try {
      const remote = await this.transport.load();
      // Ignore a late revalidation after typing or a completed write.
      if (this.dirty() || this.entry !== before) return;
      this.entry = remote;
      this.emit("saved");
    } catch { /* Keep the loaded value; the next focus/reconnect retries. */ }
  }
  set<K extends Key>(key: K, value: DailyReflectionValue[K], immediate = false) {
    const previous = this.changes.get(key);
    this.changes.set(key, { value, base: previous ? previous.base : dailyValue(this.entry)[key], generation: ++this.generation });
    clearTimeout(this.timer);
    this.emit("pending");
    if (!this.composing) this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, immediate ? 0 : this.delay);
  }
  composition(active: boolean) {
    this.composing = active;
    if (active) clearTimeout(this.timer);
    else if (this.dirty()) this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }
  dirty() { return this.changes.size > 0 || !!this.flight; }
  async retry(overwrite = false) {
    clearTimeout(this.timer);
    // A blur may still be failing when the user presses retry. Drain that
    // operation before loading a new revision; its rejection is already shown.
    if (this.flight) await this.flight.catch(() => {});
    if (!this.entry && !this.changes.size) return this.load();
    if (overwrite) {
      const remote = await this.transport.load();
      if (!remote) throw new Error("회고가 삭제되었습니다. 입력을 복사한 뒤 새로고침하세요.");
      this.entry = remote;
      for (const [key, change] of this.changes) change.base = dailyValue(remote)[key];
    }
    return this.flush();
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.composing) throw new Error("한글 입력을 완료한 뒤 이동하세요.");
    if (this.flight) { await this.flight; return this.flush(); }
    if (!this.changes.size) return;
    this.flight = this.save().catch(error => {
      this.emit("error", error instanceof Error ? error.message : "저장하지 못했습니다. 입력은 유지됩니다.", this.snapshot.conflict);
      throw error;
    }).finally(() => { this.flight = undefined; });
    await this.flight;
    if (this.changes.size) await this.flush();
  }
  private async save() {
    if (!this.entry) this.entry = await this.transport.open();
    const pending = new Map(this.changes);
    const initial = dailyValue(this.entry);
    if ([...pending].some(([key, change]) => initial[key] !== change.base && initial[key] !== change.value)) {
      this.emit("error", "다른 화면에서 같은 항목을 수정했습니다. 입력을 확인한 뒤 다시 저장하세요.", true);
      throw new Error("다른 화면에서 같은 항목을 수정했습니다. 입력은 유지됩니다.");
    }
    this.emit("saving");
    for (let attempt = 0; attempt < 3; attempt++) {
      const value = dailyValue(this.entry);
      for (const [key, change] of pending) Object.assign(value, { [key]: change.value });
      try {
        const saved = await this.transport.save(value, this.entry.version);
        this.entry = saved;
        for (const [key, change] of pending) {
          const current = this.changes.get(key);
          if (current?.generation === change.generation) this.changes.delete(key);
          else if (current) current.base = dailyValue(saved)[key];
        }
        this.emit(this.changes.size ? "pending" : "saved");
        return;
      } catch (error) {
        if (!(error && typeof error === "object" && "status" in error && error.status === 409)) throw error;
        const remote = await this.transport.load();
        if (!remote) throw new Error("회고가 삭제되었습니다. 입력을 복사한 뒤 새로고침하세요.");
        const remoteValue = dailyValue(remote);
        const conflict = [...pending].some(([key, change]) => remoteValue[key] !== change.base && remoteValue[key] !== change.value);
        if (conflict) {
          this.emit("error", "다른 화면에서 같은 항목을 수정했습니다. 입력을 확인한 뒤 다시 저장하세요.", true);
          throw new Error("다른 화면에서 같은 항목을 수정했습니다. 입력은 유지됩니다.");
        }
        this.entry = remote;
      }
    }
    throw new Error("회고가 계속 변경되고 있습니다. 잠시 뒤 다시 저장하세요.");
  }
}
