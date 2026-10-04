import { test, expect } from '../../helpers/browser.mjs';
import { apiJson } from '../../helpers/api.mjs';
import path from 'node:path';

// This suite writes only inside the run-owned MONEY schema supplied by the revision
// adapter. That adapter must remove the entire owned schema after runtime shutdown;
// categories and their immutable history deliberately have no hard-delete API.
test.describe.configure({ mode: 'serial' });
const prefix = `QA 분류 ${Date.now().toString(36)}`;
const api = () => `${process.env.QA_API_URL}/api/money`;
const call = (request, endpoint, method = 'GET', data) => apiJson(request, api(), endpoint, { method, data });
const dock = page => page.locator('.money-dock:not(.money-dock-idle)');
const rows = page => page.locator('.money-main tbody tr');
const popup = (page, name = '분류 필터') => page.getByRole('dialog', { name, exact: true });
const column = (scope, index) => scope.locator('.money-tree-column').nth(index);
const managementNode = (scope, index, name) => column(scope, index).locator('.money-tree-row > button:first-child').filter({ hasText: name });
let groupA, groupB, rootA, rootB, childA, childB, archivedChild, unmapped, account, facts;

async function open(page, route) {
  await page.goto(`/money${route}`);
  await expect(page.getByText('불러오는 중…', { exact: true })).toHaveCount(0);
  await expect(page.locator('.money-main')).toBeVisible();
}
async function capture(page, testInfo, name) {
  const target = process.env.QA_RUN_DIR ? path.join(process.env.QA_RUN_DIR, `${name}-synthetic.png`) : testInfo.outputPath(`${name}-synthetic.png`);
  await page.screenshot({ path: target, fullPage: false });
  await testInfo.attach(name, { path: target, contentType: 'image/png' });
}
async function openFilters(page) {
  await page.locator('.category-filters').getByRole('button', { name: /변경|전체 분류 · 선택/ }).click();
  await expect(popup(page)).toBeVisible();
  return popup(page);
}
async function apply(page) {
  await popup(page).getByRole('button', { name: '필터 적용', exact: true }).click();
  await expect(popup(page)).toHaveCount(0);
}
async function resetFilter(page) {
  const filter = await openFilters(page);
  await filter.getByRole('button', { name: '전체 해제', exact: true }).click();
  return filter;
}

test.beforeAll(async ({ request }) => {
  const makeCategory = (name, parentId = null, archived = false) => call(request, '/categories', 'POST', {
    name: `${prefix} ${name}`, parentId, kind: 'EXPENSE', color: '#D86F72', emoji: '☕', sortOrder: 0, archived,
  });
  groupA = await call(request, '/category-groups', 'POST', { name: `${prefix} 일상`, kind: 'EXPENSE' });
  groupB = await call(request, '/category-groups', 'POST', { name: `${prefix} 이동`, kind: 'EXPENSE' });
  rootA = await makeCategory('식비 A'); rootB = await makeCategory('교통 B');
  childA = await makeCategory('카페 A', rootA.id); childB = await makeCategory('버스 B', rootB.id);
  archivedChild = await makeCategory('보관 A', rootA.id); unmapped = await makeCategory('미배치');
  rootA = await call(request, `/categories/${rootA.id}/group`, 'PUT', { groupId: groupA.id, expectedVersion: rootA.version });
  rootB = await call(request, `/categories/${rootB.id}/group`, 'PUT', { groupId: groupB.id, expectedVersion: rootB.version });
  account = await call(request, '/accounts', 'POST', { provider: 'IBK', displayName: `${prefix} 계좌`, role: 'SPENDING', suffix: '7094' });
  const tracking = await call(request, '/tracking');
  expect(tracking.expense.length, 'Revision adapter must leave capacity for this owned tracking fixture').toBeLessThan(5);
  await call(request, '/tracking', 'PUT', { expense: [...tracking.expense, account.id], income: tracking.income, expectedVersion: tracking.version });
  // Use this month's first day in the owner's timezone, avoiding a UTC/month edge.
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date());
  const occurredAt = new Date(`${month}-01T12:00:00+09:00`).toISOString();
  facts = {};
  for (const [key, categoryId, amount] of [['direct', rootA.id, 1100], ['child', childA.id, 2200], ['other', childB.id, 3300], ['archived', archivedChild.id, 4400], ['null', null, 5500], ['unmapped', unmapped.id, 6600]]) {
    facts[key] = await call(request, '/transactions', 'POST', { type: 'EXPENSE', fromAccountId: account.id, toAccountId: null, categoryId, amount, occurredAt, title: `${prefix} ${key}`, counterpartyText: 'Synthetic category revision', memo: 'Owned QA fixture only', excluded: false });
  }
  // Historical inactive assignments must be created while active, then archived;
  // the fixture never bypasses the production assignment guard.
  archivedChild = await call(request, `/categories/${archivedChild.id}`, 'PUT', { ...archivedChild, archived: true, expectedVersion: archivedChild.version });
});

test('money.revision.category.manage-icons', async ({ page, request }, testInfo) => {
  await open(page, '/classification');
  const tabs = page.getByRole('tablist', { name: '분류 관리' });
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  await tabs.getByRole('tab', { name: '카테고리', exact: true }).click();
  const manager = page.locator('.money-category-manager');
  await expect(managementNode(manager, 1, unmapped.name)).toBeVisible();
  await managementNode(manager, 0, groupA.name).click();
  await managementNode(manager, 1, rootA.name).click();
  await expect(managementNode(manager, 2, childA.name)).toBeVisible();
  await expect(dock(page).getByLabel('상위 카테고리')).toBeDisabled();
  await capture(page, testInfo, 'H-classification-three-column');

  // Exercise the mapping control, then use the refreshed inspector version to save
  // an icon immediately. This catches stale editor data after a mapping mutation.
  const mapping = manager.locator('.money-group-mapping select');
  await mapping.selectOption(groupB.id);
  await expect(mapping).toHaveValue(groupB.id);
  await expect.poll(async () => (await call(request, '/categories')).find(c => c.id === rootA.id).structuralGroupId).toBe(groupB.id);
  await dock(page).getByRole('button', { name: '아이콘 변경', exact: false }).click();
  const icons = popup(page, '아이콘 선택'), search = icons.getByLabel('아이콘 한글 영어 검색');
  let reference;
  for (const query of ['커피', '카페', 'coffee', 'cafe']) {
    await search.fill(query);
    const names = await icons.locator('.money-icon-results button').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
    expect(names.length).toBe(8); if (reference) expect(names).toEqual(reference); else reference = names;
  }
  await expect(icons.getByRole('button', { name: '이미지 · 추후 지원', exact: true })).toBeDisabled();
  await capture(page, testInfo, 'H-icon-picker-coffee-alias');
  await icons.getByRole('button', { name: '아이콘', exact: true }).click();
  await icons.locator('.money-icon-results').getByRole('button', { name: '카페 · Coffee', exact: true }).click();
  await expect(icons).toHaveCount(0);
  await dock(page).getByRole('button', { name: '저장', exact: true }).click();
  await expect(dock(page)).toHaveCount(0);
  const updated = (await call(request, '/categories')).find(c => c.id === rootA.id);
  expect(updated).toMatchObject({ id: rootA.id, parentId: null, structuralGroupId: groupB.id, iconType: 'ICON', iconValue: 'Coffee', emoji: null });
  expect((await call(request, `/transactions/${facts.direct.id}`)).categoryId).toBe(rootA.id);
  rootA = await call(request, `/categories/${rootA.id}/group`, 'PUT', { groupId: groupA.id, expectedVersion: updated.version });
});

test('money.revision.category.filter', async ({ page }, testInfo) => {
  await open(page, '/transactions');
  await page.getByLabel('거래 검색').fill(prefix); await expect(rows(page)).toHaveCount(6);
  let filter = await openFilters(page);
  await column(filter, 0).getByRole('button', { name: new RegExp(groupA.name) }).click();
  await column(filter, 0).getByRole('button', { name: new RegExp(groupB.name) }).click();
  await column(filter, 1).getByRole('button', { name: new RegExp(rootA.name) }).click();
  await column(filter, 1).getByRole('button', { name: new RegExp(rootB.name) }).click();
  await column(filter, 2).getByRole('button', { name: new RegExp(childA.name) }).click();
  await column(filter, 2).getByRole('button', { name: new RegExp(childB.name) }).click();
  await capture(page, testInfo, 'B-category-filter-multiple-groups');
  await apply(page); await expect(rows(page)).toHaveCount(2);
  filter = await openFilters(page);
  await column(filter, 0).getByRole('button', { name: new RegExp(groupB.name) }).click();
  await expect(filter.getByRole('status')).toContainText('범위 밖 하위 조건');
  await expect(column(filter, 1).getByRole('button', { name: new RegExp(rootB.name) })).toHaveCount(0);
  await expect(column(filter, 2).getByRole('button', { name: new RegExp(childB.name) })).toHaveCount(0);
  await apply(page); await expect(rows(page)).toHaveCount(1); await expect(rows(page)).toContainText(`${prefix} child`);
  filter = await openFilters(page);
  await column(filter, 2).getByRole('button', { name: '해제', exact: true }).click();
  await apply(page); await expect(rows(page)).toHaveCount(3); // Includes the historic inactive child.
  filter = await openFilters(page);
  await column(filter, 2).getByRole('button', { name: new RegExp(`${rootA.name} · 직접 지정`) }).click();
  await apply(page); await expect(rows(page)).toHaveCount(1); await expect(rows(page)).toContainText(`${prefix} direct`);
  filter = await resetFilter(page);
  await filter.getByLabel('미분류 포함', { exact: true }).check();
  await apply(page); await expect(rows(page)).toHaveCount(1); await expect(rows(page)).toContainText(`${prefix} null`);
  filter = await resetFilter(page);
  await column(filter, 2).getByRole('button', { name: new RegExp(archivedChild.name) }).click();
  await apply(page); await expect(rows(page)).toHaveCount(1); await expect(rows(page)).toContainText(`${prefix} archived`);
  await resetFilter(page); await apply(page); await expect(rows(page)).toHaveCount(6);
});

test('money.revision.category.edit', async ({ page, request }, testInfo) => {
  await open(page, '/bookkeeping');
  await page.getByLabel('가계부 검색').fill(`${prefix} child`); await expect(rows(page)).toHaveCount(1);
  const trigger = page.getByRole('button', { name: `${prefix} child 카테고리`, exact: true });
  const writes = [];
  page.on('request', r => { if (r.method() === 'PUT' && new URL(r.url()).pathname === `/api/money/bookkeeping/${facts.child.id}`) writes.push(r.postDataJSON()); });
  await trigger.click(); let edit = popup(page, '분류 지정');
  await expect(edit).toContainText(`현재: ${groupA.name} / ${rootA.name} / ${childA.name}`);
  await expect(edit.getByRole('checkbox')).toHaveCount(0);
  await edit.getByRole('button', { name: `${groupB.name} ›`, exact: true }).click();
  expect(writes).toHaveLength(0); // L1 navigation cannot write an assignment.
  await page.keyboard.press('Escape'); await expect(edit).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); edit = popup(page, '분류 지정');
  await capture(page, testInfo, 'C-inline-single-final-picker');
  const rootFinal = edit.getByRole('button', { name: `${rootA.name} 직접 지정`, exact: true });
  await rootFinal.focus(); await page.keyboard.press('Enter');
  await expect(edit).toHaveCount(0);
  await expect.poll(async () => (await call(request, `/bookkeeping/${facts.child.id}`)).categoryId).toBe(rootA.id);
  await expect(rows(page).locator('.money-inline-cell[data-state="saved"]')).toContainText('저장됨');
  await trigger.click(); edit = popup(page, '분류 지정');
  await edit.getByLabel('카테고리 검색', { exact: true }).fill(childA.name);
  await edit.getByRole('button', { name: childA.name, exact: true }).click();
  await expect.poll(async () => (await call(request, `/bookkeeping/${facts.child.id}`)).categoryId).toBe(childA.id);
  await expect(edit).toHaveCount(0);
  expect(writes).toHaveLength(2); expect(writes.map(w => w.categoryId)).toEqual([rootA.id, childA.id]);
  expect((await call(request, `/transactions/${facts.child.id}`))).toMatchObject({ categoryId: childA.id, amount: 2200, fromAccountId: account.id, type: 'EXPENSE' });
});

test('money.revision.category.narrow', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 480, height: 1000 });
  await open(page, '/bookkeeping'); await page.getByLabel('가계부 검색').fill(`${prefix} child`);
  const trigger = page.getByRole('button', { name: `${prefix} child 카테고리`, exact: true });
  await trigger.click(); const edit = popup(page, '분류 지정');
  const bounds = await edit.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(11); expect(bounds.x + bounds.width).toBeLessThanOrEqual(469);
  await expect(edit.getByRole('button', { name: 'L1 그룹', exact: true })).toBeVisible();
  await expect(column(edit, 0)).toBeVisible(); await expect(column(edit, 1)).not.toBeVisible();
  await edit.getByRole('button', { name: 'L2 분류', exact: true }).click();
  await expect(column(edit, 1)).toBeVisible(); await expect(column(edit, 0)).not.toBeVisible();
  await capture(page, testInfo, 'C-inline-picker-narrow-step');
  await page.locator('.money-header h1').click(); await expect(edit).toHaveCount(0);
  expect((await call(request, `/bookkeeping/${facts.child.id}`)).categoryId).toBe(childA.id);
});
