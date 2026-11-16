import test from "node:test";
import assert from "node:assert/strict";
import {
  AttachmentQueue,
  fileError,
  validateImage,
  type UploadPhase,
} from "./attachments";

const file = (
  name: string,
  type = "image/png",
  bytes: number[] = [137, 80, 78, 71, 13, 10, 26, 10],
) => new File([new Uint8Array(bytes)], name, { type, lastModified: 1 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

for (const count of [0, 1, 2, 3, 4, 20])
  test(`${count} attachments keep complete ordered IDs with at most two uploads`, async () => {
    let concurrent = 0,
      peak = 0;
    const queue = new AttachmentQueue(
      async (_file, key, phase) => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        phase("uploading");
        await settle();
        concurrent--;
        return key;
      },
      () => {},
    );
    queue.add(
      Array.from({ length: count }, (_, index) => file(`${index}.png`)),
    );
    assert.equal(queue.items.length, count);
    assert.equal(queue.blocked, count > 0);
    const keys = queue.items.map((item) => item.key);
    for (let i = 0; i < count + 2 && queue.blocked; i++) await settle();
    assert.deepEqual(queue.ids, keys);
    assert.equal(queue.blocked, false);
    assert.ok(peak <= 2);
    queue.dispose();
  });

test("sequential drops and picker selections append; duplicate, invalid, HEIC and overflow produce explicit feedback", async () => {
  const queue = new AttachmentQueue(
    async (_file, key) => key,
    () => {},
    4,
  );
  queue.add([file("one.png"), file("two.png")]);
  await settle();
  queue.add([
    file("one.png"),
    file("three.png"),
    file("bad.txt", "text/plain"),
    file("four.png"),
    file("five.png"),
    file("phone.heic", "image/heic"),
  ]);
  await settle();
  assert.equal(queue.items.length, 4);
  assert.deepEqual(
    queue.items.map((item) => item.file!.name),
    ["one.png", "two.png", "three.png", "four.png"],
  );
  assert.equal(queue.errors.length, 4);
  assert.match(queue.errors.join(" "), /이미 선택/);
  assert.match(queue.errors.join(" "), /최대 4장/);
  assert.match(queue.errors.join(" "), /HEIC/);
  queue.dispose();
});

test("failed upload retries the same reservation; reorder/removal preserve unchanged IDs", async () => {
  const attempts: string[] = [],
    phases: UploadPhase[] = [];
  let fail = true;
  const queue = new AttachmentQueue(
    async (_file, key, phase) => {
      attempts.push(key);
      phase("uploading");
      phases.push("uploading");
      if (fail) throw new Error("network interrupted");
      phase("finalizing");
      return key;
    },
    () => {},
  );
  queue.reset(["historical-a", "historical-b"]);
  queue.add([file("new.png")]);
  await settle();
  const key = queue.items[2].key;
  assert.equal(queue.blocked, true);
  assert.equal(queue.items[2].phase, "error");
  fail = false;
  queue.retry(key);
  await settle();
  assert.equal(queue.blocked, false);
  assert.deepEqual(attempts, [key, key]);
  queue.move(key, 0);
  assert.deepEqual(queue.ids, [key, "historical-a", "historical-b"]);
  queue.remove("historical-a");
  assert.deepEqual(queue.ids, [key, "historical-b"]);
  queue.dispose();
});

test("removed/canceled upload cannot leak late IDs and object URLs are revoked", async () => {
  const create = URL.createObjectURL,
    revoke = URL.revokeObjectURL,
    revoked: string[] = [];
  URL.createObjectURL = () => "blob:synthetic";
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  let resolve: ((id: string) => void) | undefined,
    signal: AbortSignal | undefined;
  const queue = new AttachmentQueue(
    async (_file, _key, _phase, abort) => {
      signal = abort;
      return new Promise<string>((done) => {
        resolve = done;
      });
    },
    () => {},
  );
  try {
    queue.add([file("pending.png")]);
    await settle();
    queue.remove(queue.items[0].key);
    assert.equal(signal?.aborted, true);
    resolve!("late-image");
    await settle();
    assert.deepEqual(queue.ids, []);
    assert.deepEqual(revoked, ["blob:synthetic"]);
    queue.add([file("cancel.png")]);
    await settle();
    queue.reset(["historical"]);
    resolve!("late-cancel");
    await settle();
    assert.deepEqual(queue.ids, ["historical"]);
    assert.equal(revoked.length, 2);
    queue.add([file("unmount.png")]);
    await settle();
    queue.dispose();
    assert.equal(revoked.length, 3);
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});

test("client rejects false MIME/magic, corrupt image, dimension bombs and oversized content", async () => {
  assert.match(
    fileError(new File([""], "empty.png", { type: "image/png" }))!,
    /MB/,
  );
  assert.match(
    fileError(
      new File([new Uint8Array(1025)], "large.png", { type: "image/png" }),
      1024,
    )!,
    /MB/,
  );
  await assert.rejects(
    validateImage(file("fake.png", "image/png", [1, 2, 3])),
    /실제 형식/,
  );
  const previous = globalThis.createImageBitmap;
  try {
    globalThis.createImageBitmap = (async () => {
      throw new Error("decoder rejected");
    }) as typeof createImageBitmap;
    await assert.rejects(validateImage(file("corrupt.png")), /손상/);
    let closed = false;
    globalThis.createImageBitmap = (async () => ({
      width: 10000,
      height: 10000,
      close() {
        closed = true;
      },
    })) as typeof createImageBitmap;
    await assert.rejects(validateImage(file("bomb.png")), /화소/);
    assert.equal(closed, true);
    globalThis.createImageBitmap = (async () => ({
      width: 10,
      height: 20,
      close() {},
    })) as typeof createImageBitmap;
    await validateImage(file("valid.png"));
  } finally {
    globalThis.createImageBitmap = previous;
  }
});
