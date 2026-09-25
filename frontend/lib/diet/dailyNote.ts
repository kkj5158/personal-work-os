import { apiClient } from "@/lib/api/client";

/** One canonical Diet Daily Note per date (backend DietDailyNoteService, V57). version 0 = no note yet. */
export type DailyNote = { date: string; content: string; version: number; updatedAt: string | null };
export type NoteSyncSettings = { enabled: boolean; workspaceId: string | null; workspaceName: string | null };

export const dailyNotesApi = {
  range: (from: string, to: string) => apiClient.get<DailyNote[]>(`/api/diet/notes?from=${from}&to=${to}`),
  get: (date: string) => apiClient.get<DailyNote>(`/api/diet/notes/${date}`),
  save: (date: string, content: string, expectedVersion: number) => apiClient.put<DailyNote>(`/api/diet/notes/${date}`, { content, expectedVersion }),
  syncSettings: () => apiClient.get<NoteSyncSettings>("/api/diet/note-sync"),
  setSync: (enabled: boolean) => apiClient.put<{ settings: NoteSyncSettings; projected: number }>("/api/diet/note-sync", { enabled }),
};

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

/**
 * Debounced, serial autosave for one date. One request in flight; edits made
 * while saving are sent next with the new version. A failed save keeps the text
 * pending for retry; a version conflict never overwrites the newer note.
 */
export class DailyNoteAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: string | null = null;
  private running: Promise<void> | null = null;
  constructor(
    readonly date: string,
    private version: number,
    private readonly write: (date: string, content: string, expectedVersion: number) => Promise<DailyNote>,
    private readonly onState: (state: SaveState, saved?: DailyNote) => void,
    private readonly delay = 800,
  ) {}
  get dirty() { return this.pending != null || this.running != null; }
  edit(content: string) {
    this.pending = content;
    this.onState("dirty");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    while (this.running) await this.running;
    if (this.pending == null) return;
    const content = this.pending;
    this.pending = null;
    this.onState("saving");
    let retryLater = false;
    this.running = (async () => {
      try {
        const saved = await this.write(this.date, content, this.version);
        this.version = saved.version;
        this.onState(this.pending == null ? "saved" : "dirty", saved);
      } catch (error) {
        if (this.pending == null) this.pending = content;
        retryLater = true;
        this.onState((error as { status?: number })?.status === 409 ? "conflict" : "error");
      }
    })();
    try { await this.running; } finally { this.running = null; }
    if (!retryLater && this.pending != null) await this.flush();
  }
  retry() { return this.flush(); }
  dispose() { clearTimeout(this.timer); }
}
