import assert from "node:assert/strict";
import { test } from "node:test";
import { Autosaver, type SaveState } from "./autosave";
const deferred = () => { let resolve!: () => void, reject!: (e: Error) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setTimeout(r, 0));

test("debounced edits coalesce into one save of the newest value", async () => {
  const sent: string[] = []; const states: SaveState[] = [];
  const a = new Autosaver<string>(async v => { sent.push(v); }, s => states.push(s), 5);
  a.edit("a"); a.edit("ab"); a.edit("abc");
  await new Promise(r => setTimeout(r, 20)); await tick();
  assert.deepEqual(sent, ["abc"]); assert.equal(a.state, "saved"); assert.ok(states.includes("saving"));
});
test("edits during an in-flight save are sent afterwards; an older response never wins", async () => {
  const sent: string[] = []; const first = deferred();
  const a = new Autosaver<string>(v => { sent.push(v); return sent.length === 1 ? first.promise : Promise.resolve(); }, () => {}, 1000);
  a.edit("old", true); await tick();
  a.edit("new", true); assert.equal(sent.length, 1, "only one request in flight");
  first.resolve(); await a.flush();
  assert.deepEqual(sent, ["old", "new"]); assert.equal(a.state, "saved"); assert.equal(a.unsaved, false);
});
test("failure keeps the unsaved value for an explicit retry", async () => {
  let fail = true; const sent: string[] = [];
  const a = new Autosaver<string>(async v => { sent.push(v); if (fail) throw new Error("기록이 변경되었습니다."); }, () => {}, 1000);
  a.edit("memo", true); await a.flush();
  assert.equal(a.state, "error"); assert.equal(a.error, "기록이 변경되었습니다."); assert.equal(a.unsaved, true);
  fail = false; await a.flush();
  assert.deepEqual(sent, ["memo", "memo"]); assert.equal(a.state, "saved"); assert.equal(a.unsaved, false);
});
test("reset discards pending work without saving", async () => {
  const sent: string[] = [];
  const a = new Autosaver<string>(async v => { sent.push(v); }, () => {}, 5);
  a.edit("draft"); a.reset(); await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(sent, []); assert.equal(a.unsaved, false);
});
