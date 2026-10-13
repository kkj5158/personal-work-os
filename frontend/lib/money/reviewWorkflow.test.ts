import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reviewActionLabel, reviewCurrency, reviewDirection, reviewMerchant, removeConfirmedReviewRows, type ReviewPage} from './reviewWorkflow';

test('review currency uses explicit original currency before server domestic default and never guesses unknown sources', () => {
  assert.equal(reviewCurrency({currency: 'USD', effectiveCurrency: 'KRW'}), 'USD');
  assert.equal(reviewCurrency({currency: null, effectiveCurrency: 'KRW'}), 'KRW');
  assert.equal(reviewCurrency({currency: null}), '통화 미확인');
});
test('merchant hierarchy preserves merchant text and rejects notification-title or package fallbacks', () => {
  assert.equal(reviewMerchant({merchant: '사조푸디스트(주)씨유(C', title: '입출금내역 알림'}), '사조푸디스트(주)씨유(C');
  assert.equal(reviewMerchant({merchant: '입출금내역 알림', title: '입출금내역 알림'}), '거래처 미확인');
  assert.equal(reviewMerchant({merchant: 'com.kakaobank.channel', title: '입출금내역 알림'}), '거래처 미확인');
  assert.equal(reviewMerchant({merchant: '카카오뱅크 알림', title: '입출금내역 알림'}), '거래처 미확인');
  assert.equal(reviewMerchant({merchant: '씨유(C', title: '씨유(C'}), '씨유(C');
  assert.equal(reviewMerchant({merchant: null, title: '출금 알림'}), '거래처 미확인');
});
test('transfer evidence remains explicit even when a candidate direction exists', () => {
  assert.equal(reviewDirection({type: 'EXPENSE'}), '출금 · 지출');
  assert.equal(reviewDirection({type: null, transferPartnerId: 'partner'}), '이체 확인');
  assert.equal(reviewDirection({type: null}), '방향 확인 필요');
});
test('frozen confirmed scope removes only successes and accounts for off-page rows once', () => {
  const page = {items: [{id: 'safe', kind: 'RAW'}, {id: 'failed', kind: 'RAW'}], total: 52} as ReviewPage;
  const saved = [{id: 'safe', kind: 'RAW', status: 'SAVED'}, {id: 'offpage', kind: 'RAW', status: 'SAVED'}];
  const next = removeConfirmedReviewRows(page, saved);
  assert.equal(next.total, 50);
  assert.deepEqual(next.items.map(row => row.id), ['failed']);
  assert.equal(page.total, 52);
  assert.deepEqual(['MOVE_TO_BOOKKEEPING', 'DEFER', 'NON_TRANSACTION'].map(action => reviewActionLabel(action as Parameters<typeof reviewActionLabel>[0])), ['가계부 이동', '보류', '비거래 처리']);
});
