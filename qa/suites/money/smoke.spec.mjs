import { test, expect, expectApi } from '../../helpers/browser.mjs';

test('money.routes', async ({ page }) => {
  for (const [route, title] of [['', 'Overview'], ['/transactions', 'Transactions'], ['/flow', 'Overview'], ['/review', 'Review Required'], ['/settings', 'Settings']]) {
    await expectApi(page, '/api/money/accounts', () => page.goto('/money' + route));
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('.money-main [role="alert"]')).toHaveCount(0);
    await expect(page.locator('.money-main').getByText('가계부를 불러오는 중…')).toHaveCount(0);
  }
});

test('money.filters-reload', async ({ page }) => {
  await expectApi(page, '/api/money/transactions?', () => page.goto('/money/transactions'));
  const query = `qa-no-match-${process.env.QA_RUN_ID}`;
  const filtered = await expectApi(page, '/api/money/transactions?', () => page.getByLabel('거래 검색').fill(query));
  expect(filtered.items).toEqual([]);
  await page.getByLabel('거래 검색').fill('');
  const reloaded = await expectApi(page, '/api/money/transactions?', () => page.reload());
  expect(Array.isArray(reloaded.items)).toBeTruthy();
  const categories = await page.request.get(process.env.QA_API_URL + '/api/money/categories');
  expect(categories.ok()).toBeTruthy();
  // Verify persisted backend values appear in browser after a fresh page load; no shared DEV mutations.
  const stored = await categories.json();
  for (const category of stored.filter(c => !c.archived)) await expect(page.getByLabel('거래 카테고리', { exact: true }).locator('option', { hasText: category.name })).toHaveCount(1);
});

test('money.account-dialog', async ({ page }) => {
  await expectApi(page, '/api/money/account-balances', () => page.goto('/money/accounts'));
  await page.getByRole('button', { name: '+ 계좌 추가', exact: true }).last().click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.getByRole('complementary').getByPlaceholder('생활비').fill('QA unsaved draft');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '패널 닫기', exact: true }).click();
  await expect(page.getByRole('complementary')).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('QA unsaved draft', { exact: true })).toHaveCount(0);
});
