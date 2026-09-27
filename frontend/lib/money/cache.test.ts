import assert from "node:assert/strict";
import { test } from "node:test";
import { MoneyCache, affectedBy, resourceKey, FINANCIAL_TTL, REFERENCE_TTL, type MoneyMutation } from "./cache";
const deferred = () => { let resolve!: (v: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test("canonical keys dedupe concurrent reads and valid route returns", async () => {
  let calls = 0; const pending = deferred();
  const c = new MoneyCache(() => { calls++; return pending.promise; }); c.setScope("a");
  const a = c.load("/transactions?type=EXPENSE&limit=50"), b = c.load("/transactions?limit=50&type=EXPENSE");
  assert.equal(a, b); pending.resolve([1]); await a;
  assert.deepEqual(await c.load("/transactions?type=EXPENSE&limit=50"), [1]); assert.equal(calls, 1);
  assert.equal(resourceKey("/bookkeeping?search=a%20b&kind=INCOME"), "/bookkeeping?kind=INCOME&search=a+b");
});
test("failure is retryable; explicit refresh cannot be overwritten by an old response", async () => {
  let calls = 0; const c = new MoneyCache(async () => { if (++calls === 1) throw Error("offline"); return calls; }); c.setScope("a");
  await assert.rejects(c.load("/accounts")); assert.equal(c.snapshot("/accounts").error, "offline");
  assert.equal(await c.load("/accounts"), 2); c.invalidate(); assert.equal(await c.load("/accounts"), 3);
  const old = deferred(), fresh = deferred(); let next = 0;
  const race = new MoneyCache(() => (++next === 1 ? old : fresh).promise); race.setScope("a");
  const p = race.load("/overview"); await Promise.resolve(); race.invalidate(); const q = race.load("/overview");
  fresh.resolve("new"); await q; old.resolve("old"); await p; assert.equal(race.snapshot("/overview").data, "new");
});
test("freshness is bounded independently for projections and references", async () => {
  let now = 0, calls = 0; const c = new MoneyCache(async () => ++calls, () => now); c.setScope("a");
  await c.load("/accounts"); await c.load("/overview"); now = FINANCIAL_TTL;
  c.expire("/overview"); assert.equal(c.snapshot("/overview").expiresAt, 0);
  await c.load("/overview"); await c.load("/accounts"); assert.equal(calls, 3);
  now = REFERENCE_TTL; await c.load("/accounts"); assert.equal(calls, 4);
});
test("logout and owner/session change hide data and ignore outstanding old-owner responses", async () => {
  const old = deferred(); let calls = 0; const c = new MoneyCache(() => ++calls === 1 ? old.promise : Promise.resolve("owner B"));
  c.setScope("A:session1"); const p = c.load("/accounts"); await Promise.resolve();
  c.setScope(null); assert.equal(c.snapshot("/accounts").data, null); await assert.rejects(c.load("/accounts"));
  c.setScope("B:session2"); await c.load("/accounts"); old.resolve("owner A"); await p;
  assert.equal(c.snapshot("/accounts").data, "owner B"); c.setScope("B:session3"); assert.equal(c.snapshot("/accounts").data, null);
});
const resources = ["/accounts", "/accounts/a/detail?month=2026-09", "/categories", "/transactions?limit=50", "/transactions/a", "/transactions/a/corrections", "/bookkeeping?kind=EXPENSE", "/bookkeeping?kind=INCOME", "/bookkeeping/a", "/overview?from=2026-09-01", "/account-balances", "/loans", "/category-rules", "/review?limit=50", "/notifications/a", "/connection-status"];
const expected: Record<MoneyMutation, number[]> = {
  transaction: [1,3,4,5,6,7,8,9,10,11,13,15],
  book: [6,7,8,13],
  account: [0,1,3,4,5,6,7,8,9,10,13,14,15],
  loan: [9,11],
  category: [2,6,7,8,9,12,13],
  rule: [12],
  review: [1,3,4,5,6,7,8,9,10,11,13,14,15],
  reviewItem: [1,3,4,5,6,7,8,9,10,11,13,14,15],
  tracking: [6,7,8],
  classificationRule: [12],
  ruleHistory: [6,7,8,13,15],
  reviewMeaning: [6,7,8,13,15],
};
for (const kind of Object.keys(expected) as MoneyMutation[]) test(`${kind} mutation invalidates exactly its dependent resources`, async () => {
  let calls = 0; const c = new MoneyCache(async () => ++calls); c.setScope("a");
  for (const key of resources) await c.load(key);
  c.mutate(kind);
  resources.forEach((key, index) => {
    assert.equal(affectedBy(kind, key), expected[kind].includes(index), key);
    assert.equal(c.snapshot(key).expiresAt === 0, expected[kind].includes(index), key);
  });
  for (const key of resources) await c.load(key);
  assert.equal(calls, resources.length + expected[kind].length);
});
test("a slow earlier search cannot overwrite a different query", async () => {
  const slow = deferred(); const c = new MoneyCache(key => key.includes("old") ? slow.promise : Promise.resolve("final rows/totals")); c.setScope("a");
  const old = c.load("/bookkeeping?search=old"); await c.load("/bookkeeping?search=final"); slow.resolve("old rows"); await old;
  assert.equal(c.snapshot("/bookkeeping?search=final").data, "final rows/totals");
});

test("special financial facts invalidate flow, loan history and balance views without losing references", async () => {
  let calls=0;const cache=new MoneyCache(async()=>++calls);cache.setScope("owner:session");
  const financial=["/flow?relation=SAVINGS", "/loans/a/repayments", "/transactions/a/financial-detail", "/accounts/a/calculated-balance?asOf=2026-09-27"];
  for(const key of [...financial,"/accounts","/categories"])await cache.load(key);
  cache.mutate("transaction");
  for(const key of financial)assert.equal(cache.snapshot(key).expiresAt,0,key);
  for(const key of ["/accounts","/categories"])assert.ok(cache.snapshot(key).expiresAt>0,key);
});
