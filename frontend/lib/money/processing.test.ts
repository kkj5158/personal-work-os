import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MoneyCache, affectedBy} from './cache';
import {processingPath, visibleProcessingRows, type ProcessingRow, type ProcessingFilters} from './processing';

export const observation: ProcessingRow = {rawEventId:'raw-a', direction:'OUT', amount:12000, currency:'KRW', accountId:'a', accountName:'생활 계좌', bankProvider:'은행', counterparty:'새 거래처', occurredAt:'2026-10-14T00:00:00Z', status:'PROCESSING', reasonCode:null, reasonText:null};
export const filters: ProcessingFilters = {kind:'EXPENSE', search:'', accountIds:null, trackedAccountIds:['a'], minAmount:'', maxAmount:'', categoryFiltered:false, classificationState:'ALL', classificationOrigin:''};

test('processing projection respects existing direction, tracking, account, search and KRW amount filters', () => {
  const rows = [observation, {...observation, rawEventId:'income', direction:'IN' as const}, {...observation, rawEventId:'untracked', accountId:'b'}];
  assert.deepEqual(visibleProcessingRows(rows, filters, []), [observation]);
  assert.equal(visibleProcessingRows(rows, {...filters, accountIds:[]}, []).length, 0);
  assert.equal(visibleProcessingRows(rows, {...filters, search:'거래처', minAmount:'12000', maxAmount:'12000'}, []).length, 1);
  assert.equal(visibleProcessingRows(rows, {...filters, search:'없음'}, []).length, 0);
  assert.equal(visibleProcessingRows([{...observation,currency:'USD'}], {...filters,minAmount:'1'}, []).length, 0);
  for (const patch of [{categoryFiltered:true}, {classificationOrigin:'DIRECT'}, {classificationState:'RECENT_AUTO'}]) assert.equal(visibleProcessingRows(rows, {...filters,...patch}, []).length, 0);
});
test('canonical source identity removes only its processing row, including a stale projection or duplicate transport result', () => {
  const other = {...observation, rawEventId:'other'};
  assert.deepEqual(visibleProcessingRows([observation, observation, other], filters, [{sourceRawEventIds:['raw-a']}]), [other]);
  assert.deepEqual(visibleProcessingRows([observation, observation], filters, []), [observation]);
});
test('processing cache participates in financial invalidation and clears on owner change', async () => {
  const cache = new MoneyCache(async () => ({items:[observation],truncated:false}));
  cache.setScope('owner-a');
  const path = processingPath('2026-10-01','2026-10-31');
  await cache.load(path);
  assert.ok(cache.snapshot(path).data);
  assert.equal(affectedBy('transaction', path), true);
  assert.equal(affectedBy('review', path), true);
  cache.setScope('owner-b');
  assert.equal(cache.snapshot(path).data, null);
});
