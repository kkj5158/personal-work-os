import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const evidence = '.qa/diet-web-v8';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', W = '33333333-3333-4333-8333-333333333333', N = '44444444-4444-4444-8444-444444444444';
const base = (id, title, sortOrder = 0) => ({ id, title, sortOrder, homeSortOrder: sortOrder, role: 'CURRENT_FOCUS', type: 'MANUAL', status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-10-20', color: '#4279db', keyPoint: 'core', notes: ['challenge memo'], startWeight: null, targetWeight: null, itemIds: [], goalMode: 'RATE', includeMissing: true, currentValue: 1, targetValue: 10 });
async function fixture(page) {
  const data = { days: [{ date: '2026-10-14', morningWeight: 80 }], items: [{id:'66666666-6666-4666-8666-666666666666',title:'Checklist item',importance:'CORE',keyPoint:'',sortOrder:0,weeklyReference:null,monthlyReference:null,active:true,startDate:'2026-01-01'}], checks: [], challenges: [base(A, 'Alpha'), {...base(B, 'Beta', 1),type:'CHECKLIST',itemIds:['66666666-6666-4666-8666-666666666666']}], milestones: [], goals: [], settings: {}, archivePeriods: [] };
  const payload = { v: 1, date: '2026-10-14', measurements: { morningWeight: 80, morningMeasuredAt: '2026-10-14T07:01:12', bedtimeMeasuredAt: '2026-10-14T23:12:45' }, note: 'Daily Note 원본', focus: [], checklist: { total: 0, success: 0, failure: 0, unrecorded: 0, items: [] } };
  let note = { id: N, workspaceId: W, type: 'DAILY', journalDate: '2026-10-14', title: '2026-10-14', content: `:::diet ${JSON.stringify(payload)}\n:::\n\n**canonical note text**\n\n:::images ${JSON.stringify({ images: [{ src: 'media:55555555-5555-4555-8555-555555555555', caption: 'preserved attachment', ratio: 100 }], width: 100, align: 'left' })}\n:::\n\nend note`, version: 1, pinnedAt: null, deletedAt: null, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', aliases: [], tags: [] };
  const writes = []; let failB = false, loseA = false, delay = 0;
  const workspace = { id: W, name: '다이어트 기록', description: '', icon: 'notebook', archivedAt: null, sortOrder: 0, modules: ['DAILY_NOTES','ALL_NOTES','RECENT_NOTES','TAGS','CONNECTED_NOTES','GRAPH'].map((module, position) => ({ module, enabled:true, position, isDefault:position===0 })) };
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const send = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, body: JSON.stringify(json) });
    if (method === 'OPTIONS') return send({});
    if (path === '/api/diet') { if (delay) await new Promise(r => setTimeout(r, delay)); return send(data); }
    if (path.startsWith('/api/diet/challenges/') && method === 'PUT') {
      const c = req.postDataJSON(); writes.push(c.id);
      if (c.id === B && failB) return send({ message: 'isolated save failure' }, 503);
      data.challenges = data.challenges.map(old => old.id === c.id ? c : old);
      if (c.id === A && loseA) { loseA = false; return route.abort('failed'); }
      return send({});
    }
    if (path === '/api/diet/note-sync') return send({ enabled: true, workspaceId: W, workspaceName: '다이어트 기록' });
    if (path === '/api/diet/notes') return send([]);
    if (path === '/api/pos/preferences/system-order') return send({ systemIds: [] });
    if (path === '/api/note-system/workspaces') return send([workspace]);
    if (path === '/api/note-system/settings') return send({ autosaveDelay: 100, markdownAssistance: true, imagePaste: true, wikiAutocomplete: true, graphDaily: false, graphOrphans: false, searchLimit: 30 });
    if (path === '/api/note-system/daily-hub/settings') return send({ includedWorkspaceIds: [W], autoIncludeNewWorkspaces: false });
    if (path.includes('/media/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="#4279db"/></svg>', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (path.endsWith('/daily')) return send([note]);
    if (path.endsWith('/notes') && method === 'PUT') { const body = req.postDataJSON(); if (body.expectedVersion !== note.version) return send({ message: 'version conflict' }, 409); note = { ...note, ...body, version: note.version + 1 }; return send(note); }
    if (path.endsWith(`/notes/${N}`)) return send(note);
    if (path.endsWith('/notes')) return send({ items: [note], offset: 0, hasMore: false });
    if (path.endsWith('/reflection-provider')) return send({ available: false, reason: 'isolated fixture' });
    return send([]);
  });
  await fs.mkdir(evidence, { recursive: true });
  return { data, writes, note: () => note, fail: value => { failB = value; }, refresh: () => { note = {...note,version:note.version+1,content:note.content.replace(/:::diet [^\n]+/, `:::diet ${JSON.stringify({...payload,measurements:{...payload.measurements,morningWeight:79.5}})}`)}; }, lose: () => { loseA = true; }, delay: value => { delay = value; } };
}
const detail = page => page.locator('.dp-inline-editor');
const input = (page, label) => detail(page).getByLabel(label, { exact: true });
const lane = (page, id) => page.locator(`[data-lane-id="${id}"]`);
const bar = (page, id) => page.locator(`[data-range-id="${id}"]`);
async function open(page) { await page.goto('/diet/planner'); await expect(page.getByRole('button', { name: '주', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('button', { name: '+ 챌린지 추가' })).toBeEnabled(); }
async function drag(page, id, kind, days, cancel = false) {
  const target = kind === 'move' ? bar(page, id).locator('.range-move-target') : bar(page, id).locator(`.range-handle.${kind}`);
  await target.scrollIntoViewIfNeeded(); const r = await target.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + days * 13, r.y + r.height / 2, { steps: 10 });
  await expect(page.locator('.range-tooltip')).toBeVisible(); await expect(page.locator('.range-tooltip')).toContainText('Esc 취소');
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up(); await expect(page.locator('.range-tooltip')).toHaveCount(0);
}
test('six real pointer drags, tooltip, keyboard, Escape, per-ID drafts and exact bars', async ({ page }) => {
  await fixture(page); await open(page);
  await expect(page.locator('.dp-duration-row button').first()).toHaveCSS('height', '14px');
  await expect(page.locator('.dp-duration-row button').first()).toHaveCSS('min-height', '0px');
  for (const id of [B, A]) for (const kind of ['start', 'end', 'move']) { await drag(page, id, kind, 1); await expect(detail(page).getByLabel('챌린지 제목')).toHaveValue(id === A ? 'Alpha' : 'Beta'); }
  await input(page, '챌린지 제목').fill('Alpha draft'); const start = await input(page, '시작일').inputValue();
  await drag(page, A, 'move', 3, true); await expect(input(page, '시작일')).toHaveValue(start); await expect(input(page, '챌린지 제목')).toHaveValue('Alpha draft');
  await bar(page, B).locator('.range-handle.start').press('ArrowRight'); await expect(input(page, '시작일')).toHaveValue('2026-10-04');
  await page.screenshot({ path: `${evidence}/desktop-timeline.png`, fullPage: true });
  await page.getByRole('button', { name: '월', exact: true }).click(); await input(page, '핵심').fill('month retained'); await expect(page.getByRole('button', { name: '월', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '전체 취소', exact: true }).click(); await expect(lane(page, A)).not.toContainText('수정됨');
});
test('individual and partial batch saves, unresolved-only retry and lost response reconciliation', async ({ page }) => {
  const f = await fixture(page); await open(page);
  await input(page, '챌린지 제목').fill('Alpha one'); await detail(page).getByRole('button', { name: '저장', exact: true }).click(); await expect.poll(() => f.data.challenges[0].title).toBe('Alpha one'); await expect(detail(page).locator('.dp-dirty')).toHaveText('저장됨');
  await input(page, '챌린지 제목').fill('Alpha batch'); await lane(page, B).getByRole('button', { name: 'Beta', exact: true }).click(); await input(page, '챌린지 제목').fill('Beta batch');
  f.fail(true); await page.getByRole('button', { name: '모두 저장' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Beta batch:' })).toContainText('isolated save failure'); await expect(lane(page, A)).not.toContainText('수정됨'); await expect(lane(page, B)).toContainText('수정됨');
  f.fail(false); const before = f.writes.filter(id => id === A).length; await page.getByRole('button', { name: '모두 저장' }).click(); await expect(lane(page, B)).not.toContainText('수정됨'); expect(f.writes.filter(id => id === A).length).toBe(before);
  await lane(page, A).getByRole('button', { name: 'Alpha batch', exact: true }).click(); await input(page, '챌린지 제목').fill('Alpha response loss'); f.lose(); await detail(page).getByRole('button', { name: '저장', exact: true }).click(); await expect(detail(page).locator('.dp-dirty')).toHaveText('저장됨'); await expect(input(page, '챌린지 제목')).toHaveValue('Alpha response loss');
});
test('draft recovery through filters, Note navigation and reload; WEEK re-entry; pending save navigation', async ({ page }) => {
  const f = await fixture(page); await open(page); await input(page, '핵심').fill('recover me');
  await page.getByRole('button', { name: '월', exact: true }).click(); await page.getByRole('button', { name: '전체', exact: true }).click(); await expect(input(page, '핵심')).toHaveValue('recover me');
  await page.getByRole('button', { name: '다이어트 노트', exact: true }).click(); await expect(page).toHaveURL(/\/diet\/note/);
  await page.getByRole('button', { name: '플래너', exact: true }).click(); await expect(page.getByRole('button', { name: '주', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(input(page, '핵심')).toHaveValue('recover me');
  page.once('dialog', d => d.accept()); await page.reload(); await expect(input(page, '핵심')).toHaveValue('recover me'); await expect(page.getByRole('button', { name: '주', exact: true })).toHaveAttribute('aria-pressed', 'true');
  f.delay(300); await page.getByRole('button', { name: '모두 저장' }).click(); await page.getByRole('button', { name: '다이어트 노트', exact: true }).click(); await expect(page).toHaveURL(/\/diet\/note/); expect(f.data.challenges[0].keyPoint).toBe('recover me');
});
test('same-day, long range, real edge scrolling, day/week/month and narrow overflow', async ({ page }) => {
  await fixture(page); await open(page); await input(page, '종료일').fill('2026-10-01'); await expect(bar(page, A)).toHaveCSS('width', '13px');
  await drag(page, A, 'move', 2); await expect(input(page, '시작일')).toHaveValue('2026-10-03'); await expect(input(page, '종료일')).toHaveValue('2026-10-03');
  await input(page, '종료일').fill('2027-10-01'); await page.getByRole('button', { name: '월', exact: true }).click(); await expect.poll(async () => Number.parseFloat(await bar(page, A).evaluate(e => getComputedStyle(e).width))).toBeGreaterThan(1400);
  await page.getByRole('button', { name: '전체 맞춤' }).click(); await expect(bar(page, A)).toBeVisible();
  await page.getByRole('button', { name: '일', exact: true }).click(); const scroll = page.locator('.range-scroll'); await scroll.evaluate(e => { e.scrollLeft = 0; });
  const target = bar(page, A).locator('.range-handle.start'); await target.scrollIntoViewIfNeeded(); const r = await target.boundingBox(), v = await scroll.boundingBox(); await page.mouse.move(r.x + 7, r.y + 10); await page.mouse.down(); await page.mouse.move(v.x + v.width - 8, r.y + 10, { steps: 10 }); await page.waitForTimeout(350); await expect.poll(() => scroll.evaluate(e => e.scrollLeft)).toBeGreaterThan(0); await page.keyboard.press('Escape'); await page.mouse.up();
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${evidence}/narrow-planner.png`, fullPage: true });
});
test('shared NOTE two-surface editing, media and compact managed rows preserve canonical identity', async ({ page }) => {
  const f = await fixture(page); await page.goto(`/diet/note?workspace=${W}&date=2026-10-14`); await expect(page.getByRole('heading', { name: '다이어트 노트', exact: true })).toBeVisible();
  const editor = page.locator('.tiptap.ProseMirror').first(); await expect(editor).toContainText('canonical note text'); await expect(page.locator('.diet-day-measurements tbody tr')).toHaveCount(2); await expect(page.locator('.diet-day')).toContainText('해당 없음'); await expect(page.getByAltText('preserved attachment').first()).toBeVisible();
  await editor.getByText('end note', { exact: true }).click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' diet edit'); await expect.poll(() => f.note().content).toContain('diet edit');
  await page.goto(`/notes?workspace=${W}&date=2026-10-14`); const noteEditor = page.locator('.tiptap.ProseMirror').first(); await expect(noteEditor).toContainText('diet edit'); await noteEditor.getByText('end note diet edit', { exact: false }).click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' note edit'); await expect.poll(() => f.note().content).toContain('note edit');
  await page.goto(`/diet/note?workspace=${W}&date=2026-10-14`); await expect(page.locator('.tiptap.ProseMirror').first()).toContainText('note edit'); expect(f.note().content.match(/:::diet /g)).toHaveLength(1); expect(f.note().content).toContain('media:55555555'); expect(f.note().content).toContain('Daily Note 원본');
  f.refresh(); await page.reload(); await expect(page.locator('.diet-day')).toHaveCount(1); await expect(page.locator('.diet-day')).toContainText('79.5'); await expect(page.locator('.tiptap.ProseMirror').first()).toContainText('note edit'); await expect(page.getByAltText('preserved attachment').first()).toBeVisible();
  await page.screenshot({ path: `${evidence}/shared-note-desktop.png`, fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await expect.poll(() => page.evaluate(() => { const header=document.querySelector('.note-system-embedded .note-topbar').getBoundingClientRect(), content=document.querySelector('.note-system-embedded .note-content').getBoundingClientRect();return header.bottom <= content.top + 1; })).toBe(true); await page.screenshot({ path: `${evidence}/shared-note-narrow.png`, fullPage: true });
});
