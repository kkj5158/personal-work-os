import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DeskApi} from './api';
import {DeskStorage} from './storage';
import {FILE_LIMIT, fileDigest, verifiedDownload} from './files';
import type {DeskItem} from './model';

const reference = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function streamed(bytes: Uint8Array<ArrayBuffer>, sourceChunk = 64 * 1024) {
  let offset = 0, cancelled = false;
  return {
    size: bytes.length,
    arrayBuffer() {throw new Error('Full-file arrayBuffer is forbidden');},
    stream() {return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {if (offset === bytes.length) {controller.close(); return;} const next = Math.min(offset + sourceChunk, bytes.length); controller.enqueue(bytes.subarray(offset, next)); offset = next;},
      cancel() {cancelled = true;},
    }, {highWaterMark: 0});},
    get cancelled() {return cancelled;},
  };
}
test('100 MiB is hashed from64 KiB byte-stream chunks without ever materializing file.arrayBuffer', async () => {
  const chunk = new Uint8Array(64 * 1024).fill(0x61), expected = createHash('sha256'); let produced = 0, arrayBufferCalls = 0;
  const file = {
    size: FILE_LIMIT,
    arrayBuffer() {arrayBufferCalls++; throw new Error('No full-file allocation');},
    stream() {return new ReadableStream<Uint8Array<ArrayBuffer>>({pull(controller) {
      if (produced === FILE_LIMIT) {controller.close(); return;}
      expected.update(chunk); controller.enqueue(chunk); produced += chunk.length;
    }}, {highWaterMark: 0});},
  };
  const actual = await fileDigest(file);
  assert.equal(actual, 'cee41e98d0a6ad65cc0ec77a2ba50bf26d64dc9007f7f1c7d7df68b8b71291a6');
  assert.equal(actual, expected.digest('hex')); assert.equal(produced, FILE_LIMIT); assert.equal(arrayBufferCalls, 0);
});
test('stream hashing matches Node SHA-256 across block boundaries and large producer chunks', async () => {
  for (const size of [0, 1, 63, 64, 65, 65535, 65536, 65537, 4 * 65536 + 17]) {
    const bytes = Uint8Array.from({length: size}, (_, index) => (index * 131 + 17) % 256);
    for (const sourceChunk of [1, 63, 65537]) assert.equal(await fileDigest(streamed(bytes, sourceChunk)), reference(bytes), `size${size}/chunk${sourceChunk}`);
  }
});
test('large producer chunks yield to UI work and can be aborted during hashing', async () => {
  const controller = new AbortController(), bytes = new Uint8Array(4 * 1024 * 1024 + 17).fill(0x61), file = streamed(bytes, bytes.length);
  const running = fileDigest(file, controller.signal), timer = setTimeout(() => controller.abort(), 0);
  try {await assert.rejects(running, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');}
  finally {clearTimeout(timer);}
  assert.equal(file.cancelled, true);
});
test('abort cancels a pending stream read and releases its reader lock', async () => {
  const controller = new AbortController(); let started!: () => void, cancelled = false;
  const reading = new Promise<void>(resolve => {started = resolve;});
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({pull() {started();}, cancel() {cancelled = true;}}, {highWaterMark: 0});
  const running = fileDigest({size: 1, stream: () => stream}, controller.signal);
  await reading; controller.abort();
  await assert.rejects(running, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(cancelled, true); assert.equal(stream.locked, false);
});
test('pre-abort and over-limit claims are rejected before opening a stream; length mismatches cancel', async () => {
  const controller = new AbortController(); controller.abort(); let opened = false;
  const file = {size: 1, stream: () => {opened = true; return new ReadableStream<Uint8Array<ArrayBuffer>>();}};
  await assert.rejects(fileDigest(file, controller.signal), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  await assert.rejects(fileDigest({...file, size: FILE_LIMIT + 1})); assert.equal(opened, false);
  const tooLong = streamed(new Uint8Array(2));
  await assert.rejects(fileDigest({...tooLong, size: 1})); assert.equal(tooLong.cancelled, true);
  const short = streamed(new Uint8Array(1)); await assert.rejects(fileDigest({...short, size: 2}));
});
test('download verifies while reading and never re-reads the assembled Blob through arrayBuffer', async () => {
  const bytes = new TextEncoder().encode('다운로드\n\n마지막 줄\n'), digest = reference(bytes);
  const api = new DeskApi('test-owner', new DeskStorage('test'), () => true);
  api.download = async () => ({url: 'https://storage.invalid/synthetic', sha256: digest, sizeBytes: bytes.length, displayName: 'qa.txt'});
  const originalFetch = globalThis.fetch, originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const originalArrayBuffer = Blob.prototype.arrayBuffer, originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'), originalTimeout = globalThis.setTimeout;
  const timers: ReturnType<typeof setTimeout>[] = []; let saved: Blob | undefined, clicked = false;
  globalThis.fetch = async () => new Response(streamed(bytes, 3).stream());
  Blob.prototype.arrayBuffer = async () => {throw new Error('Second full-file buffer is forbidden');};
  URL.createObjectURL = blob => {saved = blob as Blob; return 'blob:synthetic-test';}; URL.revokeObjectURL = () => {};
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {createElement: () => ({click() {clicked = true;}})}});
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {const timer = originalTimeout(...args); timers.push(timer); return timer;}) as typeof setTimeout;
  try {
    await verifiedDownload(api, {id: 'file-id'} as DeskItem, new AbortController().signal);
    assert.equal(clicked, true); assert.equal(saved?.size, bytes.length);
    assert.deepEqual(new Uint8Array(await originalArrayBuffer.call(saved!)), bytes);
  } finally {
    globalThis.fetch = originalFetch; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; Blob.prototype.arrayBuffer = originalArrayBuffer;
    globalThis.setTimeout = originalTimeout; timers.forEach(timer => clearTimeout(timer));
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
