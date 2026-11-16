import test from "node:test";
import assert from "node:assert/strict";
import { publishDraft, uploadImage } from "./api";

test("POST acknowledgement followed by draft read failure replays the same post instead of creating another", async () => {
  const previous = globalThis.fetch;
  const stored = new Map<string, unknown>(),
    ids: string[] = [];
  let failDraft = true;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/posts")) {
      const payload = JSON.parse(String(init?.body));
      ids.push(payload.id);
      if (!stored.has(payload.id))
        stored.set(payload.id, { ...payload, revision: 1 });
      return Response.json(stored.get(payload.id));
    }
    if (failDraft) throw new TypeError("connection lost after committed POST");
    return Response.json({ text: "", images: [], revision: 3 });
  };
  const payload = {
    id: crypto.randomUUID(),
    text: "persisted",
    images: ["photo"],
    draftRevision: 2,
  };
  try {
    await assert.rejects(
      publishDraft("owner", "profile", payload),
      /connection lost/,
    );
    assert.equal(stored.size, 1);
    failDraft = false;
    const result = await publishDraft("owner", "profile", payload);
    assert.deepEqual(ids, [payload.id, payload.id]);
    assert.equal(stored.size, 1);
    assert.equal(result.post.id, payload.id);
    assert.deepEqual(result.draft, { text: "", images: [], revision: 3 });
  } finally {
    globalThis.fetch = previous;
  }
});

test("a retry with a READY reservation skips bytes and completion and keeps the supplied reservation ID", async () => {
  const previous = {
    fetch: globalThis.fetch,
    createImageBitmap: globalThis.createImageBitmap,
  };
  globalThis.createImageBitmap = (async () => ({
    width: 1,
    height: 1,
    close() {},
  })) as typeof createImageBitmap;
  const requests: string[] = [],
    id = crypto.randomUUID();
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(JSON.parse(String(init?.body)).id, id);
    return Response.json({ id, ready: true });
  };
  try {
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "photo.png",
      { type: "image/png" },
    );
    assert.equal(await uploadImage("owner", "profile", file, { id }), id);
    assert.equal(requests.length, 1);
  } finally {
    Object.assign(globalThis, previous);
  }
});
