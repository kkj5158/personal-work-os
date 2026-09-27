import assert from "node:assert/strict";
import { test } from "node:test";
import { MoneyCache } from "./cache";
import { bindMoneySession } from "./session";
const session = (owner: string, id: string) => ({ user: { id: owner }, access_token: 'x.' + btoa(JSON.stringify({ session_id: id })) + '.x' });
test("auth subscription handles initial read race, refresh, replacement, owner change and logout", async () => {
  let emit!: (event: string, s: ReturnType<typeof session> | null) => void;
  let initial!: (r: { data: { session: ReturnType<typeof session> | null }; error: null }) => void;
  let unsubscribed = false;
  const c = new MoneyCache(async () => "private");
  const stop = bindMoneySession(c, {
    onAuthStateChange(cb) { emit = cb; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    getSession: () => new Promise(r => { initial = r; }),
  });
  assert.equal(c.active, false);
  emit('SIGNED_IN', session('a','1')); await c.load('/accounts'); const generation = c.scopeSnapshot();
  emit('TOKEN_REFRESHED', session('a','1')); assert.equal(c.scopeSnapshot(), generation); assert.equal(c.snapshot('/accounts').data, 'private');
  emit('SIGNED_IN', session('a','2')); assert.equal(c.snapshot('/accounts').data, null);
  await c.load('/accounts'); emit('SIGNED_IN', session('b','3')); assert.equal(c.snapshot('/accounts').data, null);
  await c.load('/accounts'); emit('SIGNED_OUT', null); assert.equal(c.snapshot('/accounts').data, null);
  initial({ data: { session: session('a','1') }, error: null }); await Promise.resolve(); assert.equal(c.active, false);
  stop(); assert.equal(unsubscribed, true); emit('SIGNED_IN',session('a','1')); assert.equal(c.active, false);
});
