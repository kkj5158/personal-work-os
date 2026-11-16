export const DEFAULT_IMAGE_LIMIT = 20;
export const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export type UploadPhase =
  | "queued"
  | "validating"
  | "uploading"
  | "finalizing"
  | "ready"
  | "error";
export type Attachment = {
  key: string;
  id?: string;
  file?: File;
  preview?: string;
  phase: UploadPhase;
  error?: string;
  fingerprint?: string;
};
export function fileError(
  file: File,
  maxBytes = MAX_IMAGE_BYTES,
): string | null {
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type))
    return "HEIC·HEIF 사진은 지원하지 않습니다. JPEG·PNG·WebP로 변환해주세요.";
  if (!IMAGE_TYPES.includes(file.type))
    return "PNG·JPEG·WebP 사진만 지원합니다.";
  if (!file.size || file.size > maxBytes)
    return `${Math.floor(maxBytes / 1024 / 1024)}MB 이하의 사진만 첨부할 수 있습니다.`;
  return null;
}
export async function validateImage(file: File, maxBytes = MAX_IMAGE_BYTES) {
  const error = fileError(file, maxBytes);
  if (error) throw new Error(error);
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        ? "image/png"
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (mime !== file.type)
    throw new Error("사진의 실제 형식이 올바르지 않습니다.");
  let width: number, height: number;
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } else {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        width = image.naturalWidth;
        height = image.naturalHeight;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    throw new Error("손상되었거나 읽을 수 없는 사진입니다.");
  }
  if (
    !width ||
    !height ||
    width > 20000 ||
    height > 20000 ||
    width * height > 40_000_000
  )
    throw new Error("사진은 가로·세로 20,000px 및 4천만 화소 이하여야 합니다.");
}
export type AttachmentUploader = (
  file: File,
  key: string,
  phase: (phase: UploadPhase) => void,
  signal: AbortSignal,
) => Promise<string>;

/** Memory-only bounded queue. A stable key is also the server reservation ID on every retry. */
export class AttachmentQueue {
  items: Attachment[] = [];
  errors: string[] = [];
  private running = new Map<string, AbortController>();
  private stopped = false;
  constructor(
    private upload: AttachmentUploader,
    private changed: () => void,
    public limit = DEFAULT_IMAGE_LIMIT,
    public maxBytes = MAX_IMAGE_BYTES,
  ) {}
  get blocked() {
    return this.items.some((item) => item.phase !== "ready");
  }
  get ids() {
    return this.items.flatMap((item) => (item.id ? [item.id] : []));
  }
  configure(limit: number, maxBytes: number) {
    this.limit = limit;
    this.maxBytes = maxBytes;
  }
  reset(ids: string[]) {
    this.running.forEach((controller) => controller.abort());
    this.items.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
    this.items = ids.map((id) => ({ key: id, id, phase: "ready" }));
    this.errors = [];
    this.changed();
  }
  add(files: Iterable<File>) {
    if (this.stopped) return;
    this.errors = [];
    for (const file of files) {
      const error = fileError(file, this.maxBytes);
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      if (error) {
        this.errors.push(`${file.name}: ${error}`);
        continue;
      }
      if (this.items.some((item) => item.fingerprint === fingerprint)) {
        this.errors.push(`${file.name}: 이미 선택한 사진입니다.`);
        continue;
      }
      if (this.items.length >= this.limit) {
        this.errors.push(
          `${file.name}: 한 글에는 최대 ${this.limit}장까지 첨부할 수 있습니다.`,
        );
        continue;
      }
      this.items.push({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        phase: "queued",
        fingerprint,
      });
    }
    this.changed();
    this.pump();
  }
  remove(key: string) {
    this.running.get(key)?.abort();
    const item = this.items.find((entry) => entry.key === key);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    this.items = this.items.filter((entry) => entry.key !== key);
    this.changed();
    this.pump();
  }
  move(key: string, to: number) {
    const from = this.items.findIndex((item) => item.key === key);
    if (from < 0 || to < 0 || to >= this.items.length) return;
    const next = [...this.items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    this.items = next;
    this.changed();
  }
  retry(key: string) {
    const item = this.items.find((entry) => entry.key === key);
    if (!item || item.phase !== "error") return;
    item.phase = "queued";
    item.error = undefined;
    this.changed();
    this.pump();
  }
  dispose() {
    this.stopped = true;
    this.running.forEach((controller) => controller.abort());
    this.items.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
  }
  resume() {
    this.stopped = false;
    this.pump();
  }
  private pump() {
    if (this.stopped) return;
    for (const item of this.items) {
      if (this.running.size >= 2) return;
      if (item.phase !== "queued" || this.running.has(item.key) || !item.file)
        continue;
      const controller = new AbortController();
      this.running.set(item.key, controller);
      item.phase = "validating";
      this.changed();
      const current = () =>
        !this.stopped &&
        !controller.signal.aborted &&
        this.items.includes(item);
      void this.upload(
        item.file,
        item.key,
        (phase) => {
          if (current()) {
            item.phase = phase;
            this.changed();
          }
        },
        controller.signal,
      )
        .then((id) => {
          if (current()) {
            item.id = id;
            item.phase = "ready";
            this.changed();
          }
        })
        .catch((error: unknown) => {
          if (current()) {
            item.phase = "error";
            item.error =
              error instanceof Error
                ? error.message
                : "사진 전송에 실패했습니다.";
            this.changed();
          }
        })
        .finally(() => {
          this.running.delete(item.key);
          this.pump();
        });
    }
  }
}
