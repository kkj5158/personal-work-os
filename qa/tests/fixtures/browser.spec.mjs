import { test, expect } from '../../helpers/browser.mjs';

test('injected browser gate', async ({ page }) => {
  await page.goto('/');
  if (process.env.FIXTURE_BROWSER === 'console') await page.evaluate(() => console.error('injected console error'));
  if (process.env.FIXTURE_BROWSER === 'pageerror') {
    await page.evaluate(() => setTimeout(() => { throw new Error('injected page error'); }, 0));
    await expect.poll(async () => page.title()).toBe('QA fixture');
    await page.waitForTimeout(100);
  }
  expect(process.env.FIXTURE_BROWSER).not.toBe('failure');
});
