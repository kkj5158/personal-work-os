/**
 * Serialized autosave for bookkeeping meaning edits.
 * - Text edits are debounced; selections and blur flush immediately.
 * - Exactly one request is in flight; edits made meanwhile are sent afterwards with the newest value,
 *   so a slow older response can never overwrite a newer edit.
 * - A failed save keeps the unsaved value and stops; the caller decides whether to retry or reload.
 */
export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
export class Autosaver<T> {
  private latest: T | undefined;
  private dirty = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  state: SaveState = "idle";
  error = "";
  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly onChange: (state: SaveState, error: string) => void,
    private readonly delay = 700,
  ) {}
  private set(state: SaveState, error = "") {
    this.state = state;
    this.error = error;
    this.onChange(state, error);
  }
  /** Record a new value; saves after the debounce unless {@code immediate}. */
  edit(value: T, immediate = false) {
    this.latest = value;
    this.dirty = true;
    clearTimeout(this.timer);
    if (this.state !== "saving") this.set("pending");
    if (immediate) void this.flush();
    else this.timer = setTimeout(() => void this.flush(), this.delay);
  }
  get unsaved() {
    return this.dirty || this.state === "saving" || this.state === "error";
  }
  /** Save now (blur, row switch, retry). Resolves once everything edited so far is saved or has failed. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.dirty && this.state !== "error") return this.flush();
      return;
    }
    if (!this.dirty) return;
    const value = this.latest as T;
    this.dirty = false;
    this.set("saving");
    this.running = this.save(value).then(
      () => {
        this.running = null;
        if (this.dirty) return this.flush();
        this.set("saved");
      },
      (e: unknown) => {
        this.running = null;
        this.dirty = true;
        this.set("error", e instanceof Error ? e.message : "저장 실패");
      },
    );
    return this.running;
  }
  /** Forget unsaved work (explicit discard / reload from server). */
  reset() {
    clearTimeout(this.timer);
    this.dirty = false;
    this.latest = undefined;
    this.set("idle");
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
