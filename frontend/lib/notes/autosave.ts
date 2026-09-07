export type SaveState = "saved" | "pending" | "saving" | "error";
/** One queue per mounted note. A rejected request retains the draft and blocks
 * navigation; no response ever replaces a newer editor document. */
export class Autosave<T> {
  private pending: T | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<void> | undefined;
  private composing = false;
  private failed: unknown;
  state: SaveState = "saved";
  constructor(
    private save: (value: T) => Promise<void>,
    private changed: (state: SaveState, error?: unknown) => void,
    private delay = 800,
  ) {}
  private emit(state: SaveState, error?: unknown) {
    this.state = state;
    this.changed(state, error);
  }
  set(value: T) {
    this.pending = value;
    clearTimeout(this.timer);
    this.emit("pending");
    if (!this.composing)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, this.delay);
  }
  composition(value: boolean) {
    this.composing = value;
    if (value) clearTimeout(this.timer);
    else if (this.pending !== undefined) this.set(this.pending);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.composing) throw new Error("한글 입력을 완료한 뒤 이동하세요.");
    if (this.flight) {
      await this.flight;
      if (this.pending !== undefined) await this.flush();
      return;
    }
    if (this.pending === undefined) {
      if (this.failed) throw this.failed;
      return;
    }
    const value = this.pending;
    this.pending = undefined;
    this.failed = undefined;
    this.emit("saving");
    this.flight = this.save(value)
      .then(() => {
        this.emit(this.pending === undefined ? "saved" : "pending");
      })
      .catch((error) => {
        if (this.pending === undefined) this.pending = value;
        this.failed = error;
        this.emit("error", error);
        throw error;
      })
      .finally(() => {
        this.flight = undefined;
      });
    await this.flight;
    if (this.pending !== undefined) await this.flush();
  }
  dirty() {
    return this.pending !== undefined || !!this.flight;
  }
  stop() {
    clearTimeout(this.timer);
  }
}
