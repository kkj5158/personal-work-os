// Run against a disposable, loopback dev-profile API and its empty synthetic owner.
// The caller owns that database's lifecycle. No hosted credentials are used.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const url = new URL(process.argv[2]);
assert.equal(url.origin, 'http://127.0.0.1:' + url.port);
assert.equal(url.pathname, '/');
const api = url.origin + '/api/money';
async function call(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(api + path, {
    method, headers: {'Content-Type': 'application/json'}, redirect: 'error',
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, method + ' ' + path + ' HTTP ' + response.status);
  return response.json();
}

const initial = await call('/accounts');
assert.deepEqual(initial, [], 'run against a new, exclusively owned local test database');
const account = await call('/accounts', {provider: 'IBK', displayName: '합성 검증 계좌', role: 'SPENDING', includeInAssets: false});
const date = new Date().toISOString();
const period = new Date(Date.parse(date) + 9 * 3600_000).toISOString().slice(0, 10);
const ledger = '/account-ledger?accountId=' + account.id + '&from=' + period + '&to=' + period + '&limit=50';
const rows = [];
for (let i = 0; i < 50; ++i) {
  rows.push(await call('/transactions', {
    type: 'EXPENSE', fromAccountId: account.id, amount: 100 + i, occurredAt: date,
    title: '합성 거래장 ' + String(i + 1).padStart(2, '0'), counterpartyText: 'QA', excluded: false,
  }));
}
const duration = {};
async function measure(label, action) {
  const start = performance.now();
  const result = await action();
  (duration[label] ??= []).push(performance.now() - start);
  return result;
}
const change = (id, body) => call('/account-ledger/rows/' + id + '/financial-type', body, 'PATCH');
const before = await call(ledger);
assert.equal(before.total, 50);
const target = before.items[0];
let version = target.version;
for (let i = 0; i < 20; ++i) {
  const financialType = i % 2 === 0 ? 'UNRESOLVED' : 'EXPENSE';
  const input = {requestId: randomUUID(), expectedVersion: version, financialType};
  const receipt = await measure('singlePatch', () => change(target.id, input));
  assert.equal(receipt.intentSaved, true);
  assert.equal(receipt.declaredFinancialType, financialType);
  assert.equal(receipt.currentVersion, version + 1);
  if (i === 0) {
    const replay = await change(target.id, input);
    assert.equal(replay.currentVersion, receipt.currentVersion);
    assert.equal(replay.requestId, receipt.requestId);
  }
  version = receipt.currentVersion;
}
for (let i = 0; i < 20; ++i) {
  const result = await measure('list50', () => call(ledger));
  assert.equal(result.total, 50);
}
const selected = (await call(ledger)).items.map(({id,version}) => ({id,version}));
const bulkStart = performance.now();
let next = 0;
async function worker() {
  while (next < selected.length) {
    const {id, version} = selected[next++];
    const receipt = await change(id, {requestId: randomUUID(), expectedVersion: version, financialType: 'TRANSFER'});
    assert.equal(receipt.intentSaved, true);
    assert.equal(receipt.relationStatus, 'TRANSFER_PAIR_PENDING');
  }
}
await Promise.all(Array.from({length: 4}, worker));
const bulkMs = performance.now() - bulkStart;
const after = await call(ledger);
assert.deepEqual(after.summary.incoming, before.summary.incoming);
assert.deepEqual(after.summary.outgoing, before.summary.outgoing);
const facts = list => list.items.map(r => [r.id, r.from_account_id, r.to_account_id, r.amount, r.currency, r.occurred_at, r.sources]);
assert.deepEqual(facts(after), facts(before));
assert.ok(after.items.every(r => r.declaredFinancialType === 'TRANSFER'));
const samples = Object.fromEntries(Object.entries(duration).map(([key, values]) => {
  values.sort((a, b) => a - b);
  return [key, {n: values.length, p50: values[Math.ceil(values.length * .50) - 1], p95: values[Math.ceil(values.length * .95) - 1]}];
}));
console.log(JSON.stringify({status: 'PASS', boundary: 'Node performance.now, HTTP including JSON decode, loopback', samples, bulk: {count: 50, concurrency: 4, ms: bulkMs}, preservedCashRows: after.total}));
