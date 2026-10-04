import { test, expect, block } from './fixture.mjs';

test('workpad.dogfood', async ({ page, pad }, testInfo) => {
  test.setTimeout(480000);
  const plan = block('Release notebook', 'H1'), implementation = block('Implementation decisions', 'H2'), review = block('Validation log', 'H3');
  const steps = Array.from({ length: 18 }, (_, i) => block(`Step ${i + 1}: ${['inspect current behavior', 'write a focused change', 'review persisted state', 'check browser interactions', 'record deployment evidence', 'follow up on remaining work'][i % 6]}`));
  const bullet = block('Keep user work safe', 'BULLET'), numbered = block('Refresh integrated DEV', 'NUMBERED'), callout = block('Production follows validated DEV', 'CALLOUT'), divider = block('', 'DIVIDER');
  const url = block('Reference https://example.com/workpad-qa');
  const content = [plan, implementation, review, ...steps, bullet, numbered, callout, divider, url];
  const coverage = { existingImage: 'NOT_AVAILABLE', existingWikiNote: 'NOT_AVAILABLE', uploadLifecycle: 'NOT_RUN: no shared DEV image DELETE endpoint; focused editor tests cover upload rendering' };
  // Reuse an already stored image identity, reading a bounded set of existing days. No original day or media is written.
  const dates = await pad.api('/api/workflow/days');
  for (const date of dates.slice(0, 8)) {
    const day = await pad.api('/api/workflow/days/' + date);
    const existing = day.blocks.find(b => ['IMAGE', 'IMAGE_GROUP'].includes(b.type) && b.metadata.images?.length);
    if (existing) {
      const image = block('', 'IMAGE', { images: [{ ...existing.metadata.images[0], width: 100 }], layout: 'row' });
      content.push(image); coverage.existingImage = image.id; break;
    }
  }
  const notes = await pad.api('/api/workflow/notes?q=');
  const note = notes.find(n => n.title && !/[\[\]\r\n]/.test(n.title));
  if (note) {
    const wiki = block(`[[${note.title}]]`, 'TEXT', { wikiLinks: [{ name: note.title, ordinal: 0, noteId: note.id }] });
    content.push(wiki); coverage.existingWikiNote = wiki.id;
  }
  await pad.seed(content);
  const preference = await pad.api('/api/workflow/preferences');
  try {
    // Write an actual working narrative, moving between headings and todo-heavy sequences without reloads.
    await pad.focus(plan.id); await page.keyboard.press('Enter');
    await page.keyboard.type('Today we are preparing a Workpad release. The editor needs to retain the structure of a working document while its author switches between planning, implementation and verification. I want to write naturally, revise a thought after a heading, turn a decision into a task and complete it without losing the heading level. The saved document should match the visible page after each sequence.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('The next stage is browser verification. I will organize checks into columns, move items between them, collapse the reference panel for writing space, restore the panel when I need it, and revisit the saved document. Keyboard actions should keep the caret in the current column. Empty columns should disappear when their final item is removed.');
    for (let i = 0; i < steps.length; i++) {
      await pad.focus(steps[i].id);
      if (i % 4 === 0) await pad.root().getByLabel('Block type', { exact: true }).selectOption(['H1', 'H2', 'H3'][i % 3]);
      for (let n = 0; n < 3 + (i % 3); n++) await page.keyboard.press('Control+Enter');
      await page.keyboard.press('End'); await page.keyboard.type(i % 2 ? ' — reviewed' : ' — scheduled');
    }
    await pad.saved();
    // Mouse selection and native dragging mix with keyboard edits; movement must preserve the selected subtree.
    await pad.row(steps[1].id).locator('.wp-grip').click();
    await pad.row(steps[2].id).locator('.wp-grip').click({ modifiers: ['Control'] });
    await expect(pad.root().locator('.wp-selected')).toHaveCount(2);
    await pad.root().getByLabel('Move selected blocks down', { exact: true }).click();
    await pad.root().getByRole('button', { name: 'Clear', exact: true }).click();
    await pad.drag(review.id, implementation.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(2);
    await pad.drag(steps[0].id, review.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(3);
    await pad.drag(steps[1].id, implementation.id, 'after');
    await pad.drag(steps[2].id, review.id, 'after');
    await pad.drag(bullet.id, implementation.id, 'before');
    await pad.drag(numbered.id, review.id, 'after');
    await pad.drag(callout.id, implementation.id, 'after');
    await pad.drag(divider.id, review.id, 'after');
    await pad.drag(url.id, implementation.id, 'after');
    if (coverage.existingImage !== 'NOT_AVAILABLE') {
      await pad.drag(coverage.existingImage, review.id, 'after');
      const image = pad.row(coverage.existingImage).locator('img'); await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
      await pad.row(coverage.existingImage).getByRole('button', { name: 'Expand image', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Expanded image', exact: true })).toBeVisible(); await page.getByLabel('Close image', { exact: true }).click();
      coverage.existingImage = 'PASS: rendered/opened existing read-only media inside a column';
    }
    if (coverage.existingWikiNote !== 'NOT_AVAILABLE') {
      await pad.drag(coverage.existingWikiNote, review.id, 'after');
      await pad.row(coverage.existingWikiNote).locator('.wp-inline-wiki').click();
      await expect(page.locator('#dock-panel-linked .tiptap')).toBeVisible();
      coverage.existingWikiNote = 'PASS: existing read-only linked note opened from a column';
    }
    // Reorder within/between columns and edit a long paragraph; Enter, indent, outdent and boundary deletion mix.
    await pad.drag(steps[1].id, url.id, 'after');
    await pad.drag(steps[2].id, implementation.id, 'after');
    const before = await pad.saved(), column = before.blocks.find(x => x.id === steps[1].id).metadata;
    await pad.focus(steps[1].id); await page.keyboard.press('Enter'); await page.keyboard.type('A longer column note explains why the release remains safe. '.repeat(5));
    await page.keyboard.press('Enter'); await page.keyboard.type('Temporary scratch');
    await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
    await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    const edited = await pad.saved();
    const long = edited.blocks.find(x => x.content.includes('A longer column note'));
    expect(long.metadata.columnGroup).toBe(column.columnGroup); expect(long.metadata.column).toBe(column.column);
    // Remove the third column's sole item; then recreate it through the same native interaction.
    await pad.row(steps[0].id).locator('.wp-grip').click(); await pad.root().getByLabel('Delete selected blocks', { exact: true }).click();
    await expect(pad.root().locator('.wp-column')).toHaveCount(2);
    await pad.drag(steps[3].id, review.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(3);
    await pad.focus(steps[3].id); await page.keyboard.press('Control+Enter'); await page.keyboard.press('Control+Enter'); await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Enter'); await page.keyboard.type('Third column survives rapid editing');
    const beforeReload = await pad.assertReload();
    expect(beforeReload.blocks.some(x => x.content === 'Third column survives rapid editing')).toBe(true);
    // Broad editing is repeated with both panel states, then fresh navigation simulates re-entry.
    const dock = page.getByLabel('Right Dock', { exact: true });
    if (await dock.isVisible()) await page.getByRole('button', { name: 'Hide Right Dock', exact: true }).click();
    await pad.focus(steps[4].id); await page.keyboard.press('End'); await page.keyboard.type(' — final acceptance evidence saved');
    await pad.assertReload(); await expect(dock).toBeHidden();
    await page.getByRole('button', { name: 'Show Right Dock', exact: true }).click(); await expect(dock).toBeVisible();
    const final = await pad.saved();
    for (const original of content.filter(x => x.id !== steps[0].id)) {
      const retained = final.blocks.find(x => x.id === original.id);
      expect(retained, 'Original fixture block survived combined editing: ' + original.id).toBeTruthy();
      if (original.content) expect(retained.content).toContain(original.content);
    }
    await page.goto('/workflow/todo'); await pad.open();
    await expect(pad.input(steps[4].id)).toHaveText(final.blocks.find(x => x.id === steps[4].id).content);
    for (const type of ['BULLET', 'NUMBERED', 'CALLOUT', 'DIVIDER']) expect(final.blocks.some(x => x.type === type)).toBe(true);
    const screenshot = process.env.QA_RUN_DIR + '/workpad-dogfood-final.png';
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('dogfood-final', { path: screenshot, contentType: 'image/png' });
    await testInfo.attach('dogfood-coverage', { body: JSON.stringify({ ...coverage, blockCount: final.blocks.length, columnGroups: [...new Set(final.blocks.map(x => x.metadata.columnGroup).filter(Boolean))].length, persistedReentry: 'PASS' }), contentType: 'application/json' });
  } finally {
    await pad.api('/api/workflow/preferences', { method: 'PATCH', data: { workpadDockCollapsed: preference.workpadDockCollapsed === true } });
  }
});
