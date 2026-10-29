import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkCalendarPreferencesStore, type WorkCalendarPreferences } from "./workCalendarPreferences";
const initial = (): WorkCalendarPreferences => ({ version: 0, weekStart: "SUNDAY", weekStartConfigured: false, defaultTemplateId: null });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settled(store: WorkCalendarPreferencesStore) { for (let i = 0; i < 30; i++) { await tick(); if (!store.snapshot().saving && !store.snapshot().loading) return; } throw Error("Not settled"); }
function fixture(saved = initial(), legacy: string | null = null) {
  let value = saved, legacyCleared = false;
  const writes: object[] = [];
  const api = { get: async () => ({ ...value }), put: async (_field: string, input: object) => {
    const body = input as Partial<WorkCalendarPreferences> & { expectedVersion: number };
    assert.equal(body.expectedVersion, value.version); writes.push(body);
    value = { ...value, ...body, version: value.version + 1, weekStartConfigured: value.weekStartConfigured || body.weekStart !== undefined }; return { ...value };
  } };
  const make = () => new WorkCalendarPreferencesStore(api, { read: () => legacyCleared ? null : legacy, clear: () => { legacyCleared = true; } });
  return { api, make, writes, get value() { return value; } };
}
test("saved server preference wins over stale localStorage; reload/new sessions read the backend", async () => {
  const f = fixture({ ...initial(), version: 8, weekStart: "MONDAY", weekStartConfigured: true }, "SUNDAY");
  const a = f.make(); a.activate(); await settled(a); assert.equal(a.snapshot().weekStart, "MONDAY"); assert.equal(f.writes.length, 0);
  a.setWeekStart("SUNDAY"); await settled(a); a.dispose(); const b = f.make(); b.activate(); await settled(b); assert.equal(b.snapshot().weekStart, "SUNDAY");
  b.setWeekStart("MONDAY"); await settled(b); const c = f.make(); c.activate(); await settled(c); assert.equal(c.snapshot().weekStart, "MONDAY"); a.dispose(); b.dispose(); c.dispose();
});
test("only an absent server choice imports the old owner's preference, once", async () => {
  const f = fixture(initial(), "MONDAY"), store = f.make(); store.activate(); await settled(store);
  assert.equal(store.snapshot().weekStart, "MONDAY"); assert.equal(f.value.weekStartConfigured, true); assert.equal(f.writes.length, 1);
  await store.refresh(); assert.equal(f.writes.length, 1); store.dispose();
});
test("rapid MON SUN MON toggles serialize revisions, coalesce queued choices and do not duplicate the final save", async () => {
  const f = fixture({ ...initial(), weekStartConfigured: true }); let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; }), original = f.api.put;
  f.api.put = async (field, body) => { await blocked; return original(field, body); };
  const store = f.make(); store.activate(); await settled(store);
  store.setWeekStart("MONDAY"); store.setWeekStart("SUNDAY"); store.setWeekStart("MONDAY");
  assert.equal(store.snapshot().weekStart, "MONDAY"); release(); await settled(store);
  assert.equal(f.value.weekStart, "MONDAY"); assert.equal(f.writes.length, 1); store.dispose();
});
test("returning to SUN while MON is in flight saves SUN last; independent default changes preserve week selection", async () => {
  const f = fixture({ ...initial(), weekStartConfigured: true }), store = f.make(); store.activate(); await settled(store);
  store.setWeekStart("MONDAY"); store.setWeekStart("SUNDAY"); store.setDefaultTemplate("template-b"); await settled(store);
  assert.equal(f.value.weekStart, "SUNDAY"); assert.equal(f.value.defaultTemplateId, "template-b"); assert.equal(f.writes.length, 3); store.dispose();
});
test("another session's newer revision survives a conflict; a failed save shows an error and restores last saved value", async () => {
  const f = fixture({ ...initial(), weekStartConfigured: true }); const a = f.make(), b = f.make(); a.activate(); b.activate(); await settled(a); await settled(b);
  a.setWeekStart("MONDAY"); await settled(a); b.setDefaultTemplate("stale-b"); await settled(b);
  assert.equal(b.snapshot().weekStart, "MONDAY"); assert.equal(b.snapshot().value!.defaultTemplateId, null); assert.match(b.snapshot().error, /되돌렸습니다/);
  f.api.put = async () => { throw Error("offline"); }; const c = f.make(); c.activate(); await settled(c); c.setWeekStart("SUNDAY"); await settled(c);
  assert.equal(c.snapshot().weekStart, "MONDAY"); assert.match(c.snapshot().error, /offline/); a.dispose(); b.dispose(); c.dispose();
});
test("StrictMode cleanup and delayed reads never resurrect an earlier owner/session", async () => {
  const f = fixture(), store = f.make(); store.activate(); store.dispose(); store.activate(); await settled(store);
  assert.ok(store.snapshot().value); store.dispose(); store.setWeekStart("MONDAY"); await tick(); assert.equal(f.writes.length, 0);
});
test("archival or foreground refresh during a save revalidates after that save, keeping the newer cleared default", async () => {
  let value = initial(), release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const store = new WorkCalendarPreferencesStore({ get: async () => ({ ...value }), put: async () => {
    value = { ...value, version: 1, defaultTemplateId: "a" }; const reply = { ...value }; await blocked; return reply;
  } }, { read: () => null, clear() {} });
  store.activate(); await settled(store); store.setDefaultTemplate("a"); await store.refresh();
  value = { ...value, version: 2, defaultTemplateId: null }; release(); await settled(store);
  assert.equal(store.snapshot().value!.defaultTemplateId, null); assert.equal(store.snapshot().value!.version, 2); store.dispose();
});
