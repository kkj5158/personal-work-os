import { test as base, expect } from '@playwright/test';
import { redact } from '../runtime/core.mjs';

export function collectErrors(page) {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: redact(message.text()) }); });
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: redact(error.message) }));
  page.on('response', response => { if (response.status() >= 500) errors.push({ type: 'http', status: response.status(), path: new URL(response.url()).pathname }); });
  return errors;
}
export const test = base.extend({
  runtimeErrors: [async ({ page }, use, testInfo) => {
    const errors = collectErrors(page);
    await use(errors);
    if (errors.length) await testInfo.attach('runtime-errors', { body: Buffer.from(JSON.stringify(errors, null, 2)), contentType: 'application/json' });
    expect(errors, 'Browser console/page/HTTP errors').toEqual([]);
  }, { auto: true }]
});
export { expect };

export async function expectApi(page, pathname, action) {
  const response = page.waitForResponse(r => r.url().startsWith(process.env.QA_API_URL + pathname) && r.request().method() === 'GET');
  await action();
  const value = await response;
  expect(value.ok()).toBeTruthy();
  return value.json();
}
