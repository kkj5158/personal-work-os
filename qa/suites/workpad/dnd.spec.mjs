import path from 'node:path';
import { test, expect, block } from './fixture.mjs';

/** Start a native pointer drag, then inspect the actual guidance before choosing any side destination. */
async function beginDrag(page, pad, source, target) {
  const handle = pad.row(source).locator('.wp-grip'); await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox(); if (!start) throw new Error('Drag handle absent');
  const x = start.x + start.width / 2, y = start.y + start.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y + 8, { steps: 4 });
  await expect(pad.root().getByRole('status', { name: 'Block drag guidance', exact: true })).toBeVisible();
  await pad.row(target).scrollIntoViewIfNeeded();
  const bounds = await pad.row(target).boundingBox(); if (!bounds) throw new Error('Destination absent');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 14 });
  await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2);
  return bounds;
}

async function nativeDrop(page, pad, source, target, zone, options = {}) {
  try {
    const bounds = await beginDrag(page, pad, source, target);
    if (zone === 'left' || zone === 'right') {
      const targets = pad.row(target).locator('.wp-column-target');
      await expect(targets).toHaveCount(2);
      // The tester sees both possibilities at the center; their visible bounds choose the side, with no hidden-edge knowledge.
      for (const side of ['left', 'right']) await expect(pad.row(target).locator(`[data-drop-zone="column-${side}"]`)).toBeVisible();
      if (options.screenshot) await page.screenshot({ path: options.screenshot.replace('.png', '-before-side.png'), fullPage: true });
      const destination = pad.row(target).locator(`[data-drop-zone="column-${zone}"]`);
      await expect(destination).toHaveAttribute('aria-disabled', String(!!options.blocked));
      const box = await destination.boundingBox(); if (!box) throw new Error('Visible column target has no bounds');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
      await expect(destination).toHaveAttribute('data-active', 'true');
      if (options.blocked) await expect(destination).toContainText('3-column limit');
    } else if (zone !== 'self') {
      const x = options.nearSide ? bounds.x + 10 : bounds.x + bounds.width / 2;
      const y = zone === 'before' ? bounds.y + 2 : zone === 'after' ? bounds.y + bounds.height - 2 : bounds.y + bounds.height / 2;
      await page.mouse.move(x, y, { steps: 10 }); await page.mouse.move(x + 1, y);
      await expect(pad.row(target).locator('.wp-drop-' + zone)).toBeVisible();
      if (zone === 'before' || zone === 'after') await expect(pad.row(target).locator('.wp-column-target[data-active="true"]')).toHaveCount(0);
    }
    if (options.screenshot) await page.screenshot({ path: options.screenshot, fullPage: true });
  } finally { await page.mouse.up(); }
  await expect(pad.root().locator('.wp-drag-guidance')).toHaveCount(0);
}

// Text edits reconcile links into an empty array when none exist; absent and [] represent the same empty link set.
// Nonempty link identities and every other compatible formatting field remain strict preservation checks.
const cleanMetadata = metadata => Object.fromEntries(Object.entries(metadata).filter(([key, value]) => !['columnGroup','column'].includes(key) && !(key === 'wikiLinks' && Array.isArray(value) && value.length === 0)));
const domOrder = pad => pad.root().locator('.wp-block').evaluateAll(rows => rows.map(row => row.id.slice(3)));

test('workpad.dnd-discoverability', async ({ page, pad }, testInfo) => {
  test.setTimeout(240000);
  const before = block('Release context', 'H2'), first = block('Implementation decisions'), second = block('Browser validation checklist'), third = block('Production evidence'), outside = block('Follow-up notes');
  const original = await pad.api('/api/workflow/preferences');
  try {
    await pad.api('/api/workflow/preferences', { method: 'PATCH', data: { workpadDockCollapsed: false } });
    await pad.seed([before, first, second, third, outside]);
    await expect(pad.root().locator('.wp-column-target,.wp-drag-guidance')).toHaveCount(0);
    await expect(page.getByLabel('Right Dock', { exact: true })).toBeVisible();
    // Side targets must be discoverable before the pointer reaches an edge, and both left and right work.
    const guidanceShot = path.join(process.env.QA_RUN_DIR, 'workpad-dnd-guidance-expanded.png');
    await nativeDrop(page, pad, first.id, second.id, 'left', { screenshot: guidanceShot });
    await expect(pad.root().locator('.wp-column')).toHaveCount(2);
    await expect(page.getByLabel('Right Dock', { exact: true })).toBeVisible();
    await nativeDrop(page, pad, third.id, second.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(3);
    const three = await pad.saved();
    await nativeDrop(page, pad, outside.id, second.id, 'right', { blocked: true });
    expect((await pad.saved()).blocks).toEqual(three.blocks);
    // Moving near the left edge at the top/bottom remains vertical, rather than accidentally adding a column.
    await nativeDrop(page, pad, before.id, outside.id, 'before', { nearSide: true });
    await expect(pad.root().locator('.wp-column')).toHaveCount(3);
    await nativeDrop(page, pad, before.id, outside.id, 'after', { nearSide: true });
    await expect(pad.root().locator('.wp-column')).toHaveCount(3);
    await pad.assertReload();
    // Explicitly collapsed layout keeps the same visible drag affordances and never changes panel state itself.
    await page.getByRole('button', { name: 'Hide Right Dock', exact: true }).click();
    await expect.poll(async () => (await pad.api('/api/workflow/preferences')).workpadDockCollapsed).toBe(true);
    await nativeDrop(page, pad, first.id, outside.id, 'right', { screenshot: path.join(process.env.QA_RUN_DIR, 'workpad-dnd-guidance-collapsed.png') });
    await expect(page.getByLabel('Right Dock', { exact: true })).toBeHidden();
    await pad.assertReload();
    const desktop = await pad.saved();
    await page.setViewportSize({ width: 600, height: 950 });
    for (const group of await pad.root().locator('.wp-columns').all()) {
      const boxes = await group.locator('.wp-column').evaluateAll(columns => columns.map(column => { const r = column.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
      expect(Math.max(...boxes.map(box => box.x)) - Math.min(...boxes.map(box => box.x))).toBeLessThan(2);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i-1].y);
    }
    expect((await pad.saved()).blocks).toEqual(desktop.blocks);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await testInfo.attach('discoverability-expanded', { path: guidanceShot, contentType: 'image/png' });
  } finally { await pad.api('/api/workflow/preferences', { method: 'PATCH', data: { workpadDockCollapsed: original.workpadDockCollapsed === true } }); }
});

test('workpad.dnd-subtrees', async ({ page, pad }, testInfo) => {
  test.setTimeout(480000);
  const above = block('Before the release notebook'), parent = block('Release preparation', 'H2', { numbered: true });
  const paragraph = block('Record the reasoning and reference https://example.com/release', 'TEXT', { strike: true });
  const open = block('Complete implementation', 'CHECKLIST', { textStyle: 'H2' }), done = block('Capture validation evidence', 'CHECKLIST', { textStyle: 'H3' }); done.checked = true;
  const heading = block('Detailed follow-up', 'H3'), nested = block('Keep the nested context attached');
  for (const child of [paragraph, open, done, heading]) child.parentId = parent.id; nested.parentId = heading.id;
  const below = block('After the release notebook'), target = block('Reference column'), other = block('Unrelated normal-flow note');
  const secondParent = block('Release checklist', 'H1'), onlyChild = block('Verify deployment and authenticated smoke'); onlyChild.parentId = secondParent.id;
  const content = [above, parent, paragraph, open, done, heading, nested, below, target, other, secondParent, onlyChild];
  const units = new Map([[parent.id, [parent.id, paragraph.id, open.id, done.id, heading.id, nested.id]], [secondParent.id, [secondParent.id, onlyChild.id]], [heading.id, [heading.id, nested.id]]]);
  await pad.seed(content);
  const original = await pad.saved(), expected = new Map(original.blocks.map(row => [row.id, row]));
  const evidence = [];
  async function check(label, roots = [parent.id, secondParent.id]) {
    const snapshot = await pad.saved(), order = await domOrder(pad);
    expect(snapshot.blocks.map(row => row.id).sort()).toEqual([...expected.keys()].sort());
    expect(new Set(order).size).toBe(expected.size);
    for (const row of snapshot.blocks) {
      const prior = expected.get(row.id);
      expect({ type: row.type, content: row.content, checked: row.checked, parentId: row.parentId, workTaskId: row.workTaskId, metadata: cleanMetadata(row.metadata) }).toEqual({ type: prior.type, content: prior.content, checked: prior.checked, parentId: prior.parentId, workTaskId: prior.workTaskId, metadata: cleanMetadata(prior.metadata) });
      if (row.parentId) { expect(expected.has(row.parentId)).toBe(true); expect(row.metadata.columnGroup).toBeUndefined(); }
    }
    for (const root of roots) {
      const unit = units.get(root), positions = unit.map(id => order.indexOf(id));
      expect(order.filter(id => unit.includes(id))).toEqual(unit);
      expect(positions.at(-1) - positions[0] + 1).toBe(unit.length);
    }
    const beforeReloadOrder = [...order]; await pad.assertReload(); expect(await domOrder(pad)).toEqual(beforeReloadOrder);
    await page.goto('/workflow/todo'); await pad.open(); expect(await domOrder(pad)).toEqual(beforeReloadOrder);
    expect((await pad.saved()).blocks).toEqual(snapshot.blocks);
    evidence.push({ label, blocks: snapshot.blocks.length, columns: await pad.root().locator('.wp-column').count(), persisted: true });
    return snapshot;
  }
  // Direct child dragging moves its own descendant, not its parent. Restore the initial sibling order afterward.
  await nativeDrop(page, pad, heading.id, paragraph.id, 'before'); await check('nested child subtree moves upward', [heading.id, secondParent.id]);
  await nativeDrop(page, pad, heading.id, done.id, 'after'); await check('nested child subtree moves downward');
  // Global subtree semantics are proved first in ordinary flow, independently of column creation.
  await nativeDrop(page, pad, parent.id, above.id, 'before'); await check('mixed parent moves upward in normal flow');
  await expect(pad.root().locator('.wp-columns')).toHaveCount(0);
  await nativeDrop(page, pad, parent.id, below.id, 'after'); await check('mixed parent moves downward in normal flow');
  // Start a drag and see the full unit highlighted before choosing the rendered right target.
  await beginDrag(page, pad, parent.id, target.id);
  await expect(pad.root().locator('.wp-drag-source')).toHaveCount(units.get(parent.id).length);
  await expect(pad.root().getByRole('status', { name: 'Block drag guidance', exact: true })).toContainText(String(units.get(parent.id).length));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await nativeDrop(page, pad, parent.id, target.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(2); await check('mixed subtree creates second column');
  await nativeDrop(page, pad, secondParent.id, parent.id, 'right'); await expect(pad.root().locator('.wp-column')).toHaveCount(3); await check('one-child parent creates third column');
  const unchanged = await pad.saved();
  await nativeDrop(page, pad, parent.id, nested.id, 'self'); expect((await pad.saved()).blocks).toEqual(unchanged.blocks);
  await nativeDrop(page, pad, other.id, target.id, 'left', { blocked: true }); expect((await pad.saved()).blocks).toEqual(unchanged.blocks);
  await nativeDrop(page, pad, parent.id, secondParent.id, 'after'); await expect(pad.root().locator('.wp-column')).toHaveCount(2); await check('subtree moves between columns; empty third column removed');
  await nativeDrop(page, pad, parent.id, secondParent.id, 'before'); await check('subtree reorders inside the same column');
  for (const row of [parent, open, done, heading]) {
    await pad.focus(row.id); for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Enter');
  }
  await check('heading and open/completed child To-do cycles after column movement');
  await pad.focus(open.id); await page.keyboard.press('Enter'); await page.keyboard.type('Heading To-do child continues in its column');
  const continued = (await pad.saved()).blocks.find(row => row.content === 'Heading To-do child continues in its column');
  expect(continued.type).toBe('TEXT'); expect(continued.parentId).toBe(parent.id);
  const parentColumn = await pad.row(parent.id).evaluate(row => row.closest('.wp-column')?.dataset.column);
  expect(await pad.row(continued.id).evaluate(row => row.closest('.wp-column')?.dataset.column)).toBe(parentColumn);
  expected.set(continued.id, continued); units.get(parent.id).splice(units.get(parent.id).indexOf(open.id) + 1, 0, continued.id);
  await check('Heading plus To-do Enter follows the moved subtree column');
  await nativeDrop(page, pad, other.id, parent.id, 'after'); await check('normal-flow block joins a column');
  await nativeDrop(page, pad, other.id, below.id, 'after'); await check('normal block moves out again');
  await nativeDrop(page, pad, secondParent.id, below.id, 'after'); await check('one-child parent moves out of a column');
  await nativeDrop(page, pad, parent.id, below.id, 'after'); await expect(pad.root().locator('.wp-columns')).toHaveCount(0); await check('mixed subtree moves out; two columns become normal flow');
  // Subsequent keyboard use combines descendants, style changes and To-do cycles after every DnD path has completed.
  for (const row of [parent, paragraph, open, done, heading, onlyChild]) {
    await pad.focus(row.id);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Enter');
  }
  await check('post-movement normal/heading/descendant To-do cycles retain all content');
  await pad.focus(paragraph.id); await pad.root().getByLabel('Block type', { exact: true }).selectOption('H1');
  await pad.root().getByLabel('Block type', { exact: true }).selectOption('TEXT');
  await pad.focus(heading.id); await page.keyboard.press('Enter'); await page.keyboard.type('Heading child continues after its parent moved');
  const last = await pad.saved(), created = last.blocks.find(row => row.content === 'Heading child continues after its parent moved');
  expect(created.type).toBe('TEXT'); expect(created.parentId).toBe(parent.id);
  await pad.assertReload();
  await page.screenshot({ path: path.join(process.env.QA_RUN_DIR, 'workpad-dnd-subtrees-final.png'), fullPage: true });
  await testInfo.attach('global-subtree-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
});
