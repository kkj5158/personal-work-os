import assert from "node:assert/strict";
import { validLocalDate } from "../localDateBridge.ts";
import { Autosave } from "./autosave.ts";
import { shiftDate, normalize, validRow, filterGraph } from "./model.ts";
import {
  embedOnce,
  unlinkEmbed,
  snapshotBounds,
  type ReflectionEntry,
} from "./reflection.ts";

assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
assert.ok(validLocalDate("2028-02-29"));
assert.ok(!validLocalDate("2026-02-29"));
assert.ok(!validLocalDate("2026-99-32"));
assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
assert.equal(normalize(" Ａ  Note "), "a note");
const row = {
  images: [
    {
      src: "media:12345678-1234-1234-1234-123456789012",
      caption: "",
      ratio: 100,
    },
  ],
  width: 100,
  align: "left",
};
assert.ok(validRow(row));
assert.ok(!validRow({ ...row, images: Array(4).fill(row.images[0]) }));
assert.ok(
  !validRow({ ...row, images: [{ ...row.images[0], src: "javascript:bad" }] }),
);
const graph = {
  nodes: [
    { id: "a", title: "day", type: "DAILY", connectedNotes: 1, orphan: false },
    {
      id: "b",
      title: "concept",
      type: "NOTE",
      connectedNotes: 1,
      orphan: false,
    },
    { id: "c", title: "alone", type: "NOTE", connectedNotes: 0, orphan: true },
  ],
  edges: [{ source: "a", target: "b", weight: 3 }],
};
assert.deepEqual(
  filterGraph(graph, false, false).nodes.map((n) => n.id),
  ["b"],
);
assert.equal(filterGraph(graph, true, false).edges[0].weight, 3);
const states: string[] = [],
  saved: string[] = [];
let release: (() => void) | undefined;
const queue = new Autosave<string>(
  async (value) => {
    saved.push(value);
    if (value === "old")
      await new Promise<void>((r) => {
        release = r;
      });
  },
  (s) => states.push(s),
  50000,
);
queue.set("old");
const first = queue.flush();
queue.set("new");
const second = queue.flush();
release!();
await Promise.all([first, second]);
assert.deepEqual(saved, ["old", "new"]);
assert.equal(queue.state, "saved");
assert.equal(queue.dirty(), false);
queue.composition(true);
queue.set("한글");
await assert.rejects(queue.flush());
assert.equal(saved.length, 2);
queue.composition(false);
await queue.flush();
assert.equal(saved.at(-1), "한글");
let fail = true;
const attempts: string[] = [];
const retry = new Autosave<string>(
  async (value) => {
    attempts.push(value);
    if (fail) throw new Error("offline");
  },
  () => {},
  50000,
);
retry.set("draft");
await assert.rejects(retry.flush());
assert.equal(retry.state, "error");
assert.equal(retry.dirty(), true);
fail = false;
await retry.flush();
assert.deepEqual(attempts, ["draft", "draft"]);
const entry: ReflectionEntry = {
  id: "reflection",
  date: "2026-09-06",
  content: "회고",
  version: 1,
  workOsRoute: "/worklog",
  snapshot: {
    date: "2026-09-06",
    generatedAt: "2026-09-06T12:00:00Z",
    plannedBlocks: [],
    actualBlocks: [],
    workSummary: { plannedMinutes: 0, actualMinutes: 0 },
    checklistSummary: { completed: 0, total: 0 },
  },
};
const embeds = embedOnce([], entry, "ACTUAL_ONLY");
assert.equal(embedOnce(embeds, entry, "COMPARE").length, 1);
assert.equal(unlinkEmbed(embeds, entry.id).length, 0);
assert.equal(entry.content, "회고");
assert.deepEqual(snapshotBounds(entry.snapshot), { start: 360, end: 1320 });
queue.stop();
retry.stop();
console.log(
  "Note model, graph filtering, media constraints, IME/serialized autosave, retry, reflection: passed",
);
