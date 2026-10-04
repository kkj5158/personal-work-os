import { test, expect, block } from './fixture.mjs';

test('workpad.focused', async ({ page, pad }) => {
  test.setTimeout(240000);
  const a = block('Release plan'), b = block('Implementation'), c = block('Validation'), d = block('Promotion');
  await pad.seed([a, b, c, d]);
  const originalPreference = await pad.api('/api/workflow/preferences');
  try {
    // Heading and To-do are independent, including the third transition back to the original style.
    await pad.focus(a.id);
    for (const style of ['H1', 'H2', 'H3']) {
      await pad.root().getByLabel('Block type', { exact: true }).selectOption(style);
      for (const state of ['open', 'done', 'normal']) {
        await page.keyboard.press('Control+Enter');
        const current = (await pad.saved()).blocks.find(x => x.id === a.id);
        expect(current.content).toBe(a.content);
        expect(current.type).toBe(state === 'normal' ? style : 'CHECKLIST');
        expect(current.checked).toBe(state === 'done');
        if (state !== 'normal') expect(current.metadata.textStyle).toBe(style);
        await expect(pad.row(a.id)).toHaveClass(new RegExp('wp-' + style.toLowerCase()));
      }
    }
    await pad.root().getByLabel('Block type', { exact: true }).selectOption('TEXT');
    await page.keyboard.press('Control+Enter');
    await pad.root().getByLabel('Block type', { exact: true }).selectOption('H2');
    let current = (await pad.saved()).blocks.find(x => x.id === a.id);
    expect(current.type).toBe('CHECKLIST'); expect(current.metadata.textStyle).toBe('H2');
    // Completed Heading + To-do -> Enter: new paragraph, then rapid typing must land in that new block.
    await page.keyboard.press('Control+Enter'); await page.keyboard.press('Enter');
    await page.keyboard.type('First body'); await page.keyboard.press('Enter'); await page.keyboard.type('Second body');
    const afterEnter = await pad.saved(), extra = afterEnter.blocks.find(x => x.content === 'First body');
    expect(extra.type).toBe('TEXT');
    expect(afterEnter.blocks.find(x => x.content === 'Second body').type).toBe('TEXT');
    // Ordinary heading conversion + Enter, markdown/slash conversion and subsequent input.
    await pad.focus(b.id); await pad.root().getByLabel('Block type', { exact: true }).selectOption('H2');
    await page.keyboard.press('Enter'); await page.keyboard.type('## '); await page.keyboard.type('Fast heading');
    await page.keyboard.press('Enter'); await page.keyboard.type('/h3'); await page.keyboard.press('Enter'); await page.keyboard.type('Slash heading');
    await page.keyboard.press('Enter'); await page.keyboard.type('Typing remains stable');
    const fast = await pad.saved();
    expect(fast.blocks.find(x => x.content === 'Fast heading').type).toBe('H2');
    expect(fast.blocks.find(x => x.content === 'Slash heading').type).toBe('H3');
    expect(fast.blocks.find(x => x.content === 'Typing remains stable').type).toBe('TEXT');

    // Native draggable handles create the layout; normal vertical drops add/reorder inside it.
    await pad.drag(c.id, b.id, 'right'); await expect(pad.root().locator('.wp-columns .wp-column')).toHaveCount(2);
    await pad.drag(d.id, c.id, 'right'); await expect(pad.root().locator('.wp-columns .wp-column')).toHaveCount(3);
    const three = await pad.saved(), layout = three.blocks.filter(x => x.metadata.columnGroup).map(x => [x.id, x.metadata.columnGroup, x.metadata.column]);
    await pad.drag(a.id, b.id, 'left'); await expect(pad.root().locator('.wp-columns .wp-column')).toHaveCount(3);
    expect((await pad.saved()).blocks.filter(x => x.metadata.columnGroup).map(x => [x.id, x.metadata.columnGroup, x.metadata.column])).toEqual(layout);
    await pad.drag(extra.id, b.id, 'after');
    let saved = await pad.saved(), inside = saved.blocks.find(x => x.id === extra.id), anchor = saved.blocks.find(x => x.id === b.id);
    expect(inside.metadata.columnGroup).toBe(anchor.metadata.columnGroup); expect(inside.metadata.column).toBe(anchor.metadata.column);
    await pad.focus(extra.id); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    saved = await pad.saved(); expect(saved.blocks.find(x => x.id === extra.id).parentId).toBeNull();
    expect(saved.blocks.find(x => x.id === extra.id).metadata.columnGroup).toBe(anchor.metadata.columnGroup);
    await page.keyboard.press('Enter'); await page.keyboard.type('Column paragraph');
    const columnParagraph = (await pad.saved()).blocks.find(x => x.content === 'Column paragraph');
    expect(columnParagraph.metadata.columnGroup).toBe(anchor.metadata.columnGroup);
    expect(columnParagraph.metadata.column).toBe(anchor.metadata.column);
    for (let cycle = 0; cycle < 2; cycle++) for (let state = 0; state < 3; state++) await page.keyboard.press('Control+Enter');
    expect((await pad.saved()).blocks.find(x => x.id === columnParagraph.id).type).toBe('TEXT');
    // Desktop equal widths, narrow stacking is CSS only, preserving persisted metadata.
    const boxes = await pad.root().locator('.wp-columns .wp-column').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
    expect(Math.max(...boxes.map(x => x.width)) - Math.min(...boxes.map(x => x.width))).toBeLessThan(2);
    await page.setViewportSize({ width: 600, height: 950 });
    const narrow = await pad.root().locator('.wp-columns .wp-column').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    expect(Math.max(...narrow.map(x => x.x)) - Math.min(...narrow.map(x => x.x))).toBeLessThan(2);
    expect(narrow[1].y).toBeGreaterThan(narrow[0].y); await page.setViewportSize({ width: 1440, height: 1000 });
    await pad.assertReload();

    // Explicit collapse releases horizontal space, persists on reload, and is independent of columns.
    const dock = page.getByLabel('Right Dock', { exact: true });
    if (!(await dock.isVisible())) await page.getByRole('button', { name: 'Show Right Dock', exact: true }).click();
    const expanded = (await pad.root().boundingBox()).width;
    await page.getByRole('button', { name: 'Hide Right Dock', exact: true }).click();
    await expect(dock).toBeHidden(); expect((await pad.root().boundingBox()).width).toBeGreaterThan(expanded + 100);
    await expect.poll(async () => (await pad.api('/api/workflow/preferences')).workpadDockCollapsed).toBe(true);
    await page.reload(); await expect(page.getByRole('button', { name: 'Show Right Dock', exact: true })).toBeVisible(); await expect(dock).toBeHidden();
    await page.getByRole('button', { name: 'Show Right Dock', exact: true }).click(); await expect(dock).toBeVisible();
    await expect(pad.root().locator('.wp-columns .wp-column')).toHaveCount(3);
    await pad.drag(c.id, a.id, 'after'); await expect(pad.root().locator('.wp-columns .wp-column')).toHaveCount(2);
    await pad.drag(d.id, a.id, 'after'); await expect(pad.root().locator('.wp-columns')).toHaveCount(0);
    await pad.assertReload();
  } finally {
    await pad.api('/api/workflow/preferences', { method: 'PATCH', data: { workpadDockCollapsed: originalPreference.workpadDockCollapsed === true } });
  }
});
