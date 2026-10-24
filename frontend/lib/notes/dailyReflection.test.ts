import assert from "node:assert/strict";
import { test } from "node:test";
import { DailyReflectionSession, dailyValue, DAILY_MOODS, type DailyTransport } from "./dailyReflection";
import type { ReflectionEntryDto } from "../api/types";
import type { DailyReflectionValue } from "../api/reflections";

function fixture() {
  let remote: ReflectionEntryDto = { id: "one", date: "2026-10-24", content: "NOTE content", status: "COMPLETED", version: 3, snapshot: null, workOsRoute: "/calendar", title: null, dayScore: null, moodLevel: null, memo: null };
  let writes = 0;
  const transport: DailyTransport = {
    load: async () => ({ ...remote }), open: async () => ({ ...remote }),
    save: async (value, version) => {
      writes++;
      if (version !== remote.version) throw { status: 409 };
      remote = { ...remote, ...value, version: version + 1 };
      return { ...remote };
    },
  };
  return { transport, remote: () => remote, change: (value: Partial<ReflectionEntryDto>) => { remote = { ...remote, ...value, version: remote.version + 1 }; }, writes: () => writes };
}
test("score zero, independent five moods, and optional clear remain exact", async () => {
  const f = fixture(), session = new DailyReflectionSession(f.transport, 60_000);
  await session.load();
  session.set("dayScore", 0);
  for (const mood of DAILY_MOODS) { session.set("moodLevel", mood.level); await session.flush(); assert.equal(f.remote().dayScore, 0); assert.equal(f.remote().moodLevel, mood.level); }
  session.set("moodLevel", null); await session.flush();
  assert.equal(f.remote().dayScore, 0); assert.equal(f.remote().moodLevel, null);
  session.set("dayScore", null); await session.flush();
  assert.equal(f.remote().dayScore, null);
  assert.equal(f.remote().content, "NOTE content"); assert.equal(f.remote().status, "COMPLETED");
});
test("new typing during an in-flight write is serialized using its returned version", async () => {
  const f = fixture();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const values: { value: DailyReflectionValue; version: number }[] = [];
  const save = f.transport.save;
  f.transport.save = async (value, version) => { values.push({ value, version }); if (values.length === 1) await held; return save(value, version); };
  const session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  session.set("title", "first"); const flight = session.flush();
  session.set("title", "latest"); session.set("memo", "new memo");
  release(); await flight;
  assert.equal(values.length, 2); assert.equal(values[0].version, 3); assert.equal(values[1].version, 4);
  assert.equal(f.remote().title, "latest"); assert.equal(f.remote().memo, "new memo"); assert.equal(session.getSnapshot().value.title, "latest");
  assert.equal(session.dirty(), false);
});
test("concurrent NOTE or untouched annotation edits merge without overwriting", async () => {
  const f = fixture(), session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  session.set("memo", "mine"); f.change({ content: "new NOTE", title: "other title", moodLevel: 5 }); await session.flush();
  assert.equal(f.remote().content, "new NOTE"); assert.equal(f.remote().title, "other title"); assert.equal(f.remote().moodLevel, 5); assert.equal(f.remote().memo, "mine");
  assert.equal(session.getSnapshot().value.title, "other title");
});
test("same-field concurrent edit preserves remote until explicit overwrite retry", async () => {
  const f = fixture(), session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  session.set("title", "mine"); f.change({ title: "theirs" });
  await assert.rejects(session.flush());
  assert.equal(f.remote().title, "theirs"); assert.equal(session.getSnapshot().value.title, "mine"); assert.equal(session.getSnapshot().conflict, true);
  await session.retry(true); assert.equal(f.remote().title, "mine"); assert.equal(session.getSnapshot().state, "saved");
});
test("offline failure keeps latest draft through navigation-like unsubscribe and retry", async () => {
  const f = fixture(); let offline = true; const save = f.transport.save;
  f.transport.save = async (value, version) => { if (offline) throw new Error("offline"); return save(value, version); };
  const session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  const unsubscribe = session.subscribe(() => {});
  session.set("memo", "retained draft"); unsubscribe(); await assert.rejects(session.flush(), /offline/);
  assert.equal(session.getSnapshot().value.memo, "retained draft"); assert.equal(session.dirty(), true);
  offline = false; await session.retry(); assert.equal(f.remote().memo, "retained draft");
});
test("date queues cannot cross-write and empty rows are read without creating", async () => {
  const a = fixture(), b = fixture(); let creates = 0;
  const empty = new DailyReflectionSession({ ...a.transport, load: async () => null, open: async () => { creates++; return a.transport.open(); } }, 60_000);
  await empty.load(); assert.equal(creates, 0); assert.equal(empty.getSnapshot().state, "saved");
  const other = new DailyReflectionSession(b.transport, 60_000); await other.load();
  empty.set("title", "date A"); other.set("title", "date B"); await Promise.all([empty.flush(), other.flush()]);
  assert.equal(a.remote().title, "date A"); assert.equal(b.remote().title, "date B"); assert.equal(creates, 1);
});
test("composition blocks partial saves; finishing composition saves complete Korean", async () => {
  const f = fixture(), session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  session.composition(true); session.set("title", "회"); await assert.rejects(session.flush(), /한글/); assert.equal(f.writes(), 0);
  session.set("title", "회고 완료"); session.composition(false); await session.flush(); assert.equal(f.remote().title, "회고 완료");
});
test("old clients missing annotation properties render null fields", () => {
  assert.deepEqual(dailyValue(null), { title: null, dayScore: null, moodLevel: null, memo: null });
});
test("focus refresh observes other-session writes and cannot replace dirty or newer saved input", async () => {
  const f = fixture(), session = new DailyReflectionSession(f.transport, 60_000); await session.load();
  f.change({ title: "other browser" }); await session.refresh();
  assert.equal(session.getSnapshot().value.title, "other browser");
  session.set("memo", "my draft"); f.change({ memo: "other memo" }); await session.refresh();
  assert.equal(session.getSnapshot().value.memo, "my draft");
  await assert.rejects(session.flush()); await session.retry(true);
  const load = f.transport.load;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  f.transport.load = async () => { const snapshot = await load(); await held; return snapshot; };
  const refresh = session.refresh();
  session.set("title", "saved after revalidation began"); await session.flush(); release(); await refresh;
  assert.equal(session.getSnapshot().value.title, "saved after revalidation began");
});
