import { randomUUID, randomInt } from 'node:crypto';
import { test as base, expect } from '../../helpers/browser.mjs';
import { FixtureScope, apiJson } from '../../helpers/api.mjs';

export const block = (content, type = 'TEXT', metadata = {}) => ({ id: randomUUID(), parentId: null, order: 0, type, content, checked: false, workTaskId: null, sourceBlockId: null, sourceDate: null, metadata });
export const test = base.extend({
  pad: async ({ page, request }, use, testInfo) => {
    const scope = new FixtureScope(), owned = new Set();
    const api = (path, options) => apiJson(request, process.env.QA_API_URL, path, options);
    let date, initial;
    for (let attempt = 0; attempt < 12; attempt++) {
      date = `${2090 + randomInt(10)}-${String(randomInt(1, 13)).padStart(2, '0')}-${String(randomInt(1, 29)).padStart(2, '0')}`;
      initial = await api('/api/workflow/days/' + date);
      if (!initial.blocks.length) break;
      initial = undefined;
    }
    if (!initial) throw new Error('No empty disposable Workpad day found; existing data preserved');
    const endpoint = '/api/workflow/days/' + date, root = () => page.locator('#worklog-' + date);
    // Register before the first write. Browser-created UUIDs are owned only when this page sends them to this exact date.
    page.on('request', req => {
      if (req.method() === 'PUT' && new URL(req.url()).pathname === endpoint) {
        for (const b of req.postDataJSON()?.blocks ?? []) owned.add(b.id);
      }
    });
    scope.own(async () => {
      if (!page.isClosed()) await page.goto('about:blank');
      const latest = await api(endpoint);
      if (latest.blocks.some(b => !owned.has(b.id))) throw new Error('WORKPAD_CLEANUP_UNKNOWN_BLOCK: preserving concurrent data on ' + date);
      await api(endpoint, { method: 'PUT', data: { revision: latest.revision, blocks: [] } });
      expect((await api(endpoint)).blocks).toEqual([]);
      await testInfo.attach('owned-fixture-cleanup', { body: JSON.stringify({ date, status: 'CLEARED_OWNED_BLOCKS', count: owned.size }), contentType: 'application/json' });
    });
    const pad = {
      date, api, root,
      async open() { await page.goto('/workflow/today?date=' + date); await expect(root().locator('.wp-editor')).toHaveAttribute('aria-busy', 'false'); },
      async seed(blocks) {
        const latest = await api(endpoint);
        if (latest.blocks.some(b => !owned.has(b.id))) throw new Error('Fixture ownership changed before reseed');
        blocks.forEach((b, i) => { b.order = i; owned.add(b.id); });
        await api(endpoint, { method: 'PUT', data: { revision: latest.revision, blocks } });
        await this.open();
      },
      input(id) { return root().locator('#wp-' + id + ' .wp-text-input'); },
      row(id) { return root().locator('#wp-' + id); },
      async focus(id, where = 'End') { await this.input(id).click(); await page.keyboard.press(where); },
      async saved() { await expect(root().locator('.wp-save-state')).toHaveText('All changes saved'); return api(endpoint); },
      async drag(source, target, zone) {
        const destination = this.row(target); await destination.scrollIntoViewIfNeeded();
        const box = await destination.boundingBox(); if (!box) throw new Error('Drop target absent');
        const targetPosition = zone === 'right' ? { x: box.width - 5, y: box.height / 2 } : zone === 'left' ? { x: 5, y: box.height / 2 } : { x: Math.max(50, box.width / 2), y: zone === 'before' ? 3 : box.height - 3 };
        await this.row(source).locator('.wp-grip').dragTo(destination, { targetPosition });
      },
      async assertReload() {
        const before = await this.saved(); await page.reload(); await expect(root().locator('.wp-editor')).toHaveAttribute('aria-busy', 'false');
        for (const b of before.blocks) {
          await expect(this.row(b.id)).toBeVisible();
          if (!['IMAGE', 'IMAGE_GROUP', 'DIVIDER'].includes(b.type)) await expect(this.input(b.id)).toHaveText(b.content);
        }
        expect((await api(endpoint)).blocks).toEqual(before.blocks);
        return before;
      }
    };
    try { await use(pad); } finally { await scope.close(); }
  }
});
export { expect };
