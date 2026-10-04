import { randomUUID } from 'node:crypto';
import { test, expect } from '../../helpers/browser.mjs';

// API writes below are synthetic fixtures in the adapter-owned schema only.
// The adapter owns schema teardown; this spec never resets shared DEV data.
test.describe.configure({ mode: 'serial' });
const token = randomUUID().slice(0, 8);
const now = new Date();
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const from = day.slice(0, 7) + '-01';
const to = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10);
const name = label => `Revision ${label} ${token}`;
const api = () => process.env.QA_API_URL + '/api/money';
async function call(request, endpoint, method = 'GET', data) {
  const response = await request.fetch(api() + endpoint, { method, data });
  expect(response.ok(), `${method} ${endpoint}: HTTP ${response.status()}`).toBe(true);
  return response.status() === 204 ? null : response.json();
}
const decision = item => ({ id: item.id, kind: item.kind, transactionVersion: item.transactionVersion ?? item.version, overrideVersion: item.overrideVersion, projectionVersion: item.projectionVersion, version: item.version });
const item = (request, id, kind = 'TRANSACTION') => call(request, `/ai/items/${id}?kind=${kind}`);
const bookRows = page => page.locator('.meaning-ledger tbody tr');
const reviewRow = (page, title) => page.locator('.money-ai-list tbody tr').filter({ hasText: title });
let account, root, child, inline, confirmed, changed, deferred, noise, raw, originalTracking;
const rangeTitle = name('range');
const merchant = name('confirmed merchant');

test.beforeAll(async ({ request }) => {
  expect(process.env.QA_SYSTEM, 'Requires the money-revision isolated-schema adapter').toBe('money-revision');
  account = await call(request, '/accounts', 'POST', { provider: 'CASH', displayName: name('review account'), role: 'CASH', maskedReference: null, suffix: null });
  await call(request, `/accounts/${account.id}/balance-checkpoints`, 'POST', { amount: 800000, verifiedAt: new Date(now.getTime() - 60000).toISOString(), note: 'Synthetic manual opening anchor', expectedVersion: account.version });
  root = await call(request, '/categories', 'POST', { name: name('food'), kind: 'EXPENSE', color: '#5277a5', archived: false, emoji: null, parentId: null, sortOrder: 0 });
  child = await call(request, '/categories', 'POST', { name: name('coffee'), kind: 'EXPENSE', color: '#5277a5', archived: false, emoji: null, parentId: root.id, sortOrder: 0 });
  const transaction = (amount, title, counterpartyText = name('unconfirmed merchant')) => call(request, '/transactions', 'POST', { type: 'EXPENSE', fromAccountId: account.id, toAccountId: null, amount, title, occurredAt: now.toISOString(), counterpartyText, categoryId: null, memo: 'Synthetic revision fixture', excluded: false });
  // Zero is a valid filter boundary, but not a fabricated zero-value transaction.
  for (const amount of [1, 9999, 10000, 49999, 50000]) await transaction(amount, `${rangeTitle} ${amount}`);
  inline = await transaction(777, name('inline'), name('inline merchant'));
  const history = await transaction(1234, name('history'), merchant);
  await call(request, '/ai/decisions', 'POST', { ...decision(await item(request, history.id)), action: 'CONFIRM', overrides: { categoryId: root.id } });
  confirmed = await transaction(2345, name('confirm'), merchant);
  changed = await transaction(3456, name('change'), merchant);
  deferred = await transaction(4567, name('defer'), name('deferred merchant'));
  noise = await transaction(4500, name('posted noise'), name('noise merchant'));
  const local = new Date(now.getTime() + 9 * 3600000).toISOString();
  const minute = local.slice(5, 10).replace('-', '/') + ' ' + local.slice(11, 16);
  raw = (await call(request, '/notifications', 'POST', { sourcePackage: 'com.ibk.android.ionebank', title: name('RAW'), text: `[출금] 12,345원 QAReview${token} 975-******-01-999 ${minute} / 잔액 50,000원`, postedAt: now.toISOString(), idempotencyKey: randomUUID(), notificationKey: randomUUID() })).notification;
  await expect.poll(async () => (await call(request, `/notifications/${raw.id}`)).state, { timeout: 30000 }).toBe('REVIEW_REQUIRED');
  originalTracking = await call(request, '/tracking');
  await call(request, '/tracking', 'PUT', { expense: [account.id], income: [], expectedVersion: originalTracking.version });
});

test.afterAll(async ({ request }) => {
  if (originalTracking) {
    const latest = await call(request, '/tracking');
    await call(request, '/tracking', 'PUT', { expense: originalTracking.expense, income: originalTracking.income, expectedVersion: latest.version });
  }
});

async function bookkeeping(page, search) {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto('/money/bookkeeping');
  await expect(page.getByLabel('가계부 검색')).toBeVisible();
  await page.getByLabel('가계부 검색').fill(search);
}
async function review(page, search) {
  await page.goto('/money/review');
  await expect(page.locator('[data-money-ai-screen="G"]')).toBeVisible();
  await page.getByLabel('거래·제안 검색').fill(search);
}

test('money.revision.bookkeeping-ranges', async ({ page, request }) => {
  await bookkeeping(page, rangeTitle);
  await expect(bookRows(page)).toHaveCount(5);
  const toolbar = await page.locator('.money-book-toolbar').boundingBox();
  const tracking = await page.locator('.money-book-toolbar').getByRole('button', { name: '추적 계좌 설정', exact: true }).boundingBox();
  expect(Math.abs(tracking.x + tracking.width - toolbar.x - toolbar.width)).toBeLessThan(3);
  for (const [label, min, max, expected] of [
    ['1만원 미만', '0', '9999', [1, 9999]],
    ['1만–5만원 미만', '10000', '49999', [10000, 49999]],
    ['5만원 이상', '50000', '', [50000]],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(bookRows(page)).toHaveCount(expected.length);
    for (const amount of expected) await expect(bookRows(page).filter({ hasText: `${rangeTitle} ${amount}` })).toBeVisible();
    const params = new URLSearchParams({ from, to, kind: 'EXPENSE', search: rangeTitle, minAmount: min, ...(max ? { maxAmount: max } : {}) });
    const full = await call(request, '/bookkeeping?' + params);
    expect(full.total).toBe(expected.length);
    expect(full.items.map(row => row.amount).sort((a, b) => a - b)).toEqual(expected);
  }
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await expect(bookRows(page)).toHaveCount(5);
  await page.getByLabel('최소 금액', { exact: true }).fill('50000');
  await page.getByLabel('최대 금액', { exact: true }).fill('10000');
  await page.getByRole('button', { name: '범위 적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최소 금액');
  await expect(bookRows(page)).toHaveCount(5);
  await page.getByLabel('최소 금액', { exact: true }).fill('10000');
  await page.getByLabel('최대 금액', { exact: true }).fill('50000');
  await page.getByRole('button', { name: '범위 적용', exact: true }).click();
  await expect(bookRows(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: '사용자 범위', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('최소 금액', { exact: true }).fill('0');
  await page.getByLabel('최대 금액', { exact: true }).fill('0');
  await page.getByRole('button', { name: '사용자 범위', exact: true }).click();
  await expect(bookRows(page)).toHaveCount(0);
});

test('money.revision.bookkeeping-inline-audit', async ({ page, request }) => {
  const before = await call(request, `/bookkeeping/${inline.id}`);
  const decisions = [], saves = [];
  page.on('request', req => {
    if (req.method() === 'POST' && req.url() === api() + '/ai/decisions') decisions.push(req.postDataJSON());
    if (req.method() === 'PUT' && req.url() === api() + `/bookkeeping/${inline.id}`) saves.push(req.postDataJSON());
  });
  await bookkeeping(page, inline.title);
  const row = bookRows(page).filter({ hasText: inline.title });
  const trigger = row.getByRole('button', { name: `${inline.title} 카테고리`, exact: true });
  await trigger.click();
  const popup = page.getByRole('dialog', { name: '분류 지정', exact: true });
  await expect(popup.locator('.money-tree-column')).toHaveCount(3);
  await expect(popup).toContainText('구조 전용');
  await popup.getByLabel('카테고리 검색').fill(root.name);
  const direct = popup.getByRole('button', { name: `${root.name} 직접 지정`, exact: true });
  await direct.focus(); await page.keyboard.press('Enter');
  await expect(popup).toHaveCount(0);
  await expect.poll(async () => (await call(request, `/bookkeeping/${inline.id}`)).categoryId).toBe(root.id);
  expect(saves[0]).toMatchObject({ expectedVersion: before.version, expectedTransactionVersion: before.transactionVersion, expectedProjectionVersion: before.projectionVersion, overrides: { categoryId: root.id } });
  await trigger.click(); await expect(popup.locator('small').filter({ hasText: '현재:' })).toContainText(root.name);
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  expect(await call(request, `/transactions/${inline.id}`)).toMatchObject({ amount: inline.amount, fromAccountId: account.id, type: 'EXPENSE', categoryId: null });
  expect((await call(request, `/meaning-history/${inline.id}`)).length).toBeGreaterThan(0);
  expect((await item(request, inline.id)).history.filter(event => event.kind === 'CONFIRM')).toHaveLength(0);
  expect(decisions).toHaveLength(0);
});

test('money.revision.review-confirm-change-undo', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  const proposal = await item(request, confirmed.id);
  expect(proposal.proposal).toMatchObject({ categoryId: root.id, basis: 'CONFIRMED_HISTORY' });
  await review(page, confirmed.title);
  const row = reviewRow(page, confirmed.title);
  await row.getByRole('button', { name: '확인', exact: true }).click();
  await expect.poll(async () => (await call(request, `/bookkeeping/${confirmed.id}`)).categoryId).toBe(root.id);
  const done = await item(request, confirmed.id);
  expect(done.state).toBe('COMPLETED');
  expect(done.history.filter(event => event.kind === 'CONFIRM' && event.active)).toHaveLength(1);
  expect(await call(request, `/transactions/${confirmed.id}`)).toMatchObject({ amount: confirmed.amount, fromAccountId: account.id, categoryId: null });
  await page.locator('.money-ai-toast').getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(async () => (await item(request, confirmed.id)).history.filter(event => event.kind === 'CONFIRM' && event.active).length).toBe(0);
  await page.getByLabel('거래·제안 검색').fill(changed.title);
  await reviewRow(page, changed.title).getByRole('button', { name: '변경', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '분류 지정', exact: true });
  await picker.getByLabel('카테고리 검색').fill(child.name);
  await picker.getByRole('button', { name: child.name, exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect.poll(async () => (await call(request, `/bookkeeping/${changed.id}`)).categoryId).toBe(child.id);
  expect((await item(request, changed.id)).history.filter(event => event.kind === 'CONFIRM' && event.active)).toHaveLength(1);
});

test('money.revision.review-raw-defer', async ({ page, request }) => {
  const total = (await call(request, '/transactions?limit=1')).total;
  const before = await call(request, `/transactions/${deferred.id}`);
  const rawItem = await item(request, raw.id, 'RAW');
  expect(rawItem.kind).toBe('RAW');
  await review(page, raw.title);
  const rawRow = reviewRow(page, raw.title);
  await expect(rawRow.getByRole('button', { name: '확인', exact: true })).toHaveCount(0);
  await expect(rawRow.getByRole('button', { name: '변경', exact: true })).toHaveCount(0);
  if (rawItem.reviewType === 'NOISE') await rawRow.getByLabel('추가 행동', { exact: true }).click();
  await rawRow.getByRole('button', { name: '금융 확인', exact: true }).click();
  await expect(page.locator('.money-dock')).toContainText('알림 금융 사실 확인');
  expect((await call(request, '/transactions?limit=1')).total).toBe(total);
  expect((await call(request, `/notifications/${raw.id}`)).state).toBe('REVIEW_REQUIRED');
  await page.getByLabel('패널 닫기', { exact: true }).click();
  await page.getByLabel('거래·제안 검색').fill(deferred.title);
  await reviewRow(page, deferred.title).getByRole('button', { name: '보류', exact: true }).click();
  await expect.poll(async () => (await item(request, deferred.id)).state).toBe('DEFERRED');
  expect(await call(request, `/transactions/${deferred.id}`)).toMatchObject({ version: before.version, amount: before.amount, fromAccountId: before.fromAccountId, excluded: before.excluded });
  expect((await item(request, deferred.id)).history.some(event => event.kind === 'CONFIRM')).toBe(false);
  await page.getByRole('tab', { name: '보류', exact: true }).click();
  await reviewRow(page, deferred.title).getByRole('button', { name: '다시 검토', exact: true }).click();
  await expect.poll(async () => (await item(request, deferred.id)).state).toBe('PENDING');
});

test('money.revision.review-posted-nontransaction', async ({ page, request }) => {
  await review(page, noise.title);
  const row = reviewRow(page, noise.title);
  await row.getByLabel('추가 행동', { exact: true }).click();
  const response = page.waitForResponse(r => r.url() === api() + '/review/non-transaction/preview' && r.request().method() === 'POST');
  await row.getByRole('button', { name: '비거래 검토', exact: true }).click();
  const impact = await (await response).json();
  expect(impact.canConfirm).toBe(true);
  expect(impact.accountImpacts.find(value => value.accountId === account.id).delta).toBe(4500);
  expect(impact.statisticsImpact).toMatchObject({ incomeDelta: 0, consumptionDelta: -4500 });
  const dialog = page.getByRole('dialog', { name: '기록된 거래의 비거래 처리 영향', exact: true });
  const confirm = dialog.getByRole('button', { name: '영향 확인 · 비거래로 처리', exact: true });
  await expect(confirm).toBeDisabled();
  await expect(dialog).toContainText('후속 잔액 기준점');
  await dialog.getByRole('textbox').fill('Synthetic duplicate notification confirmed');
  const saved = page.waitForRequest(r => r.url() === api() + '/ai/decisions' && r.method() === 'POST');
  await confirm.click();
  expect((await saved).postDataJSON()).toMatchObject({ id: noise.id, kind: 'TRANSACTION', action: 'NON_TRANSACTION', reason: 'Synthetic duplicate notification confirmed', impactFingerprint: impact.fingerprint });
  await expect.poll(async () => (await call(request, `/transactions/${noise.id}`)).excluded).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect((await item(request, noise.id)).history.some(event => event.kind === 'CONFIRM')).toBe(false);
  await page.locator('.money-ai-toast').getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(async () => (await call(request, `/transactions/${noise.id}`)).excluded).toBe(false);
});

test('money.revision.review-evidence-responsive', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  await review(page, confirmed.title);
  const main = page.locator('.money-ai-main-column');
  const rail = page.locator('.money-ai-evidence-rail');
  const before = await main.boundingBox();
  await expect(rail).toBeVisible();
  expect(Math.abs((await rail.boundingBox()).width - 384)).toBeLessThan(2);
  await reviewRow(page, confirmed.title).locator('.money-ai-row-button').click();
  await expect(rail).toContainText(confirmed.title);
  expect(Math.abs((await main.boundingBox()).width - before.width)).toBeLessThan(2);
  await rail.getByRole('button', { name: '판단 근거 닫기', exact: true }).click();
  await page.setViewportSize({ width: 480, height: 1000 });
  const origin = reviewRow(page, confirmed.title).locator('.money-ai-row-button');
  await origin.click();
  const drawer = page.getByRole('dialog', { name: '판단 근거', exact: true });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox()).width).toBeLessThanOrEqual(456);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  for (let at = 0; at < 8; at++) { await page.keyboard.press('Tab'); expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(origin).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
