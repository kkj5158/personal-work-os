import type { DisplayWeekStart } from "./workCalendarDisplay";
export type WorkCalendarPreferences = { version: number; weekStart: DisplayWeekStart; weekStartConfigured: boolean; defaultTemplateId: string | null };
type Transport = { get: () => Promise<WorkCalendarPreferences>; put: (field: "week-start" | "default-template", body: object) => Promise<WorkCalendarPreferences> };
type Changes = { weekStart?: DisplayWeekStart; defaultTemplateId?: string | null };
type Snapshot = { value: WorkCalendarPreferences | null; weekStart: DisplayWeekStart; loading: boolean; saving: boolean; error: string };
export const EMPTY_CALENDAR_PREFERENCES: Snapshot = { value: null, weekStart: "SUNDAY", loading: true, saving: false, error: "" };

/** One owner/session. Serialize writes and use server revisions to reject stale sessions. */
export class WorkCalendarPreferencesStore {
  private state = EMPTY_CALENDAR_PREFERENCES;
  private listeners = new Set<() => void>();
  private desired: Changes = {};
  private inFlight: Changes = {};
  private live = false;
  private reading = 0;
  private readPromise: Promise<void> | null = null;
  private refreshQueued = false;
  private migrationAttempted = false;
  constructor(private api: Transport, private legacy: { read: () => string | null; clear: () => void }) {}
  snapshot = () => this.state;
  subscribe = (notify: () => void) => { this.listeners.add(notify); return () => { this.listeners.delete(notify); }; };
  private emit(update: Partial<Snapshot>) {
    const next = { ...this.state, ...update };
    next.weekStart = this.desired.weekStart ?? this.inFlight.weekStart ?? next.value?.weekStart ?? "SUNDAY";
    this.state = next; this.listeners.forEach(fn => fn());
  }
  activate() { this.live = true; void this.refresh(); }
  dispose() { this.live = false; this.reading++; this.readPromise = null; this.desired = {}; }
  private accept(value: WorkCalendarPreferences) {
    if (!this.live || this.state.value && value.version < this.state.value.version) return;
    this.emit({ value, loading: false });
    if (value.weekStartConfigured) { try { this.legacy.clear(); } catch { /* Server remains authoritative. */ } }
  }
  refresh = (): Promise<void> => {
    if (!this.live) return Promise.resolve();
    if (this.state.saving) { this.refreshQueued = true; return Promise.resolve(); }
    if (this.readPromise) return this.readPromise;
    const read = ++this.reading;
    this.emit({ loading: !this.state.value });
    const task = this.api.get().then(value => {
      if (!this.live || read !== this.reading) return;
      this.accept(value); this.emit({ error: "" });
      if (!value.weekStartConfigured && !this.migrationAttempted) {
        this.migrationAttempted = true;
        let legacy: string | null = null; try { legacy = this.legacy.read(); } catch { /* Optional one-time migration. */ }
        if (legacy === "MONDAY" || legacy === "SUNDAY") this.setWeekStart(legacy);
      }
    }).catch(error => {
      if (this.live && read === this.reading) this.emit({ loading: false, error: error instanceof Error ? error.message : "달력 설정을 불러오지 못했습니다." });
    }).finally(() => { if (this.readPromise === task) this.readPromise = null; });
    this.readPromise = task; return task;
  };
  setWeekStart = (mode: DisplayWeekStart) => { if (this.state.value && this.live) { this.desired.weekStart = mode; this.emit({ error: "" }); void this.drain(); } };
  setDefaultTemplate = (id: string | null) => { if (this.state.value && this.live) { this.desired.defaultTemplateId = id; this.emit({ error: "" }); void this.drain(); } };
  private async drain() {
    if (this.state.saving || !this.state.value || !this.live) return;
    this.reading++; this.emit({ saving: true });
    try {
      while (this.live && Object.keys(this.desired).length) {
        const field = this.desired.weekStart !== undefined ? "weekStart" : "defaultTemplateId";
        const value = this.desired[field]; delete this.desired[field];
        if (value === this.state.value![field] && (field !== "weekStart" || this.state.value!.weekStartConfigured)) { this.emit({}); continue; }
        this.inFlight = { [field]: value }; this.emit({});
        const result = await this.api.put(field === "weekStart" ? "week-start" : "default-template", { expectedVersion: this.state.value!.version, [field]: value });
        if (!this.live) return;
        this.inFlight = {}; this.accept(result);
      }
    } catch (error) {
      this.desired = {}; this.inFlight = {}; this.refreshQueued = false;
      if (this.live) {
        try { this.accept(await this.api.get()); } catch { /* Keep the last acknowledged server value. */ }
        this.emit({ error: (error instanceof Error ? error.message : "달력 설정 저장 실패") + " 저장된 설정으로 되돌렸습니다. 다시 선택해 주세요." });
      }
    } finally {
      this.inFlight = {};
      if (this.live) {
        this.emit({ saving: false });
        if (this.refreshQueued) { this.refreshQueued = false; void this.refresh(); }
      }
    }
  }
}
