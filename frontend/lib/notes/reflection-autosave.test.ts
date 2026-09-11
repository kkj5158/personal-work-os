import assert from "node:assert/strict";
import { Autosave } from "./autosave";

// Reflection writes are versioned; completing/closing must drain the same queue.
async function main() {
  let version = 4;
  let body = "original";
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const writes: { content: string; expectedVersion: number }[] = [];
  const queue = new Autosave<string>(async (content) => {
    writes.push({ content, expectedVersion: version });
    if (writes.length === 1) await delayed;
    body = content;
    version++;
  }, () => {}, 60_000);
  queue.set("first edit");
  const backgroundSave = queue.flush();
  queue.set("latest body before complete");
  const complete = queue.flush().then(() => ({ body, version }));
  release();
  await backgroundSave;
  assert.deepEqual(await complete, { body: "latest body before complete", version: 6 });
  assert.deepEqual(writes, [
    { content: "first edit", expectedVersion: 4 },
    { content: "latest body before complete", expectedVersion: 5 },
  ]);
  assert.equal(queue.dirty(), false);
  queue.stop();

  let fail = true;
  let closed = false;
  const retry = new Autosave<string>(async (content) => {
    if (fail) throw new Error("offline");
    body = content;
  }, () => {}, 60_000);
  retry.set("retained after failed close");
  await assert.rejects(retry.flush().then(() => { closed = true; }), /offline/);
  assert.equal(closed, false);
  assert.equal(retry.dirty(), true);
  fail = false;
  await retry.flush().then(() => { closed = true; });
  assert.equal(body, "retained after failed close");
  assert.equal(closed, true);
  retry.stop();
  console.log("Reflection autosave: latest body/version flush and failed close retry passed");
}
void main();
