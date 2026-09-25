import { randomUUID } from 'node:crypto';
import { test, expect } from '../../helpers/browser.mjs';

// Secret-bearing requests are never traced, screenshotted or attached. The
// managed adapter owns an isolated schema and removes it even after a failure.
test.describe.configure({ mode: 'serial' });
const api = () => process.env.QA_API_URL + '/api/money';
const installId = randomUUID();
let credential, priorToken, rawId, payload, deviceId;
async function call(request, path, method = 'GET', data, token) {
  return request.fetch(api() + path, { method, data, headers: token ? { Authorization: 'Bearer ' + token } : {} });
}
async function enroll(request) {
  const r = await call(request, '/bridge/enrollments', 'POST', {});
  expect(r.status()).toBe(200); expect(r.headers()['cache-control']).toContain('no-store');
  return (await r.json()).code;
}
async function exchange(request, code) {
  const r = await call(request, '/bridge/exchange', 'POST', { code, installId });
  expect(r.status()).toBe(200); expect(r.headers()['cache-control']).toContain('no-store');
  const c = await r.json();
  expect(/^mb1_[A-Za-z0-9_-]{43}$/.test(c.token)).toBe(true);
  expect(c.installId === installId).toBe(true);
  return c;
}
async function open(page) {
  await page.goto('/money/settings');
  await page.getByRole('button', { name: '연결 상태', exact: true }).click();
  const area = page.getByRole('region', { name: 'Android Bridge' });
  await expect(area).toBeVisible(); return area;
}
async function issueUI(page, area) {
  const pending = page.waitForResponse(r => r.url() === api() + '/bridge/enrollments' && r.request().method() === 'POST');
  await area.getByRole('button', { name: '휴대폰 등록 코드 발급' }).click();
  expect((await pending).status()).toBe(200);
  await expect(area.getByLabel('일회용 등록 코드')).toBeVisible();
}

test('money.bridge.area', async ({ page }) => {
  const area = await open(page);
  await expect(area.getByRole('heading', { name: 'Android MONEY Bridge' })).toBeVisible();
  await expect(area.getByRole('button', { name: '상태 새로고침' })).toBeVisible();
});
test('money.bridge.create-code', async ({ page }) => {
  const area = await open(page); await issueUI(page, area);
  expect(/^me1_[A-Za-z0-9_-]{43}$/.test(await area.getByLabel('일회용 등록 코드').inputValue())).toBe(true);
});
test('money.bridge.code-lifecycle', async ({ page }) => {
  await page.clock.install();
  const area = await open(page); await issueUI(page, area);
  await area.getByRole('button', { name: '코드 숨기기' }).click();
  await expect(area.getByLabel('일회용 등록 코드')).toHaveCount(0);
  await issueUI(page, area);
  await page.clock.fastForward(301000);
  await expect(area.getByLabel('일회용 등록 코드')).toHaveCount(0);
  await page.clock.setFixedTime(new Date());
  await issueUI(page, area);
  // Exercise the browser visibility event; no platform-specific window focus assumption.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(area.getByLabel('일회용 등록 코드')).toHaveCount(0);
  await page.reload(); await expect(page.getByLabel('일회용 등록 코드')).toHaveCount(0);
});
test('money.bridge.exchange', async ({ request }) => {
  const code = await enroll(request); credential = await exchange(request, code);
  expect((await call(request, '/bridge/exchange', 'POST', { code, installId })).status()).toBe(401);
});
test('money.bridge.devices', async ({ page, request }) => {
  const r = await call(request, '/bridge/devices'); expect(r.status()).toBe(200);
  const device = (await r.json()).find(d => d.installId === installId);
  expect(Boolean(device)).toBe(true); deviceId = device.id;
  const area = await open(page); await expect(area.getByText(new RegExp(installId.slice(0, 8)))).toBeVisible();
});
test('money.bridge.identity-binding', async ({ request }) => {
  payload = { deviceId: installId, idempotencyKey: 'money-bridge:' + randomUUID(),
    sourcePackage: 'com.kakaobank.channel', notificationKey: 'qa:' + randomUUID(),
    postedAt: new Date().toISOString(), title: 'SYNTHETIC CENTRAL QA', text: 'Bridge diagnostic, not a financial transaction' };
  expect((await call(request, '/notifications', 'POST', { ...payload, deviceId: randomUUID() }, credential.token)).status()).toBe(400);
  expect((await call(request, '/notifications', 'POST', { ...payload, sourcePackage: 'com.example.unlisted' }, credential.token)).status()).toBe(400);
  expect((await call(request, '/bridge/devices', 'GET', undefined, credential.token)).status()).toBe(403);
});
test('money.bridge.idempotency', async ({ request }) => {
  const a = await call(request, '/notifications', 'POST', payload, credential.token); expect(a.status()).toBe(201);
  rawId = (await a.json()).notification.id;
  const b = await call(request, '/notifications', 'POST', payload, credential.token); expect(b.status()).toBe(200);
  expect((await b.json()).notification.id === rawId).toBe(true);
  expect((await call(request, '/notifications', 'POST', { ...payload, text: 'Different synthetic body' }, credential.token)).status()).toBe(409);
});
test('money.bridge.revoke', async ({ page, request }) => {
  const area = await open(page);
  page.once('dialog', dialog => dialog.accept());
  await area.locator('div').filter({ hasText: installId.slice(0, 8) }).getByRole('button', { name: '연결 해제' }).click();
  await expect(area.getByText(new RegExp('설치 ' + installId.slice(0, 8) + '.*해제됨'))).toBeVisible();
  expect((await call(request, '/notifications', 'POST', payload, credential.token)).status()).toBe(401);
});
test('money.bridge.rotation', async ({ request }) => {
  credential = await exchange(request, await enroll(request)); priorToken = credential.token;
  credential = await exchange(request, await enroll(request));
  expect(priorToken !== credential.token).toBe(true);
  expect((await call(request, '/notifications', 'POST', payload, priorToken)).status()).toBe(401);
  const r = await call(request, '/notifications', 'POST', payload, credential.token); expect(r.status()).toBe(200);
  expect((await r.json()).notification.id === rawId).toBe(true);
  const devices = await (await call(request, '/bridge/devices')).json();
  expect(devices.filter(d => d.installId === installId).length).toBe(1);
});
test('money.bridge.invalid-auth', async ({ request }) => {
  for (const token of ['mb1_' + 'x'.repeat(43), priorToken])
    expect((await call(request, '/notifications', 'POST', payload, token)).status()).toBe(401);
});
test('money.bridge.owner-isolation', async ({ request }) => {
  // Token cannot select/read/manage another owner. DB tests in adapter setup also
  // verify an independent owner service sees no device and cannot revoke it.
  expect((await call(request, '/accounts?userId=' + randomUUID(), 'GET', undefined, credential.token)).status()).toBe(403);
  expect((await call(request, '/bridge/devices/' + deviceId, 'DELETE', undefined, credential.token)).status()).toBe(403);
  expect((await call(request, '/bridge/devices/' + randomUUID(), 'DELETE')).status()).toBe(404);
});
test('money.bridge.web-auth', async ({ page, request }) => {
  // DEV browser remains on the existing DEV identity. Actual PROD JWT chain,
  // anonymous rejection and Web-owner enrollment are tested by MoneyBridgeSecurityTest.
  expect((await call(request, '/accounts')).status()).toBe(200);
  expect((await call(request, '/bridge/enrollments', 'POST', {}, credential.token)).status()).toBe(403);
  const area = await open(page); await expect(area.getByRole('button', { name: '휴대폰 등록 코드 발급' })).toBeEnabled();
});
test('money.bridge.nearby-routes', async ({ page }) => {
  for (const [route, heading] of [['/transactions', 'Transactions'], ['/review', 'Review Required'], ['/settings', 'Settings']]) {
    await page.goto('/money' + route); await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
  }
});
test('money.bridge.canonical-ingest', async ({ request }) => {
  const r = await call(request, '/notifications/' + rawId); expect(r.status()).toBe(200);
  const raw = await r.json();
  expect(raw.deviceId === installId && raw.sourcePackage === payload.sourcePackage && raw.notificationKey === payload.notificationKey).toBe(true);
  const all = await (await call(request, '/notifications?limit=50')).json();
  expect(all.filter(n => n.id === rawId).length).toBe(1);
});
test('money.bridge.scheduler', async ({ request, page }) => {
  await expect.poll(async () => (await (await call(request, '/notifications/' + rawId)).json()).state, { timeout: 20000 }).toBe('REVIEW_REQUIRED');
  const attempts = await (await call(request, '/notifications/' + rawId + '/parse-attempts')).json();
  expect(attempts.length).toBeGreaterThan(0);
  const tx = await (await call(request, '/transactions?limit=50')).json(); expect(tx.items.length).toBe(0);
  const area = await open(page);
  await expect(area.getByText(/신규 1 \/ 재전송 확인 2/)).toBeVisible();
});
