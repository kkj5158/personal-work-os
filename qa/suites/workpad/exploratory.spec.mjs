import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { test, expect, block } from './fixture.mjs';

async function caretPoint(input, offset) {
  return input.evaluate((el, at) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {
      if (at <= node.textContent.length) {
        const range = document.createRange(); range.setStart(node, at); range.collapse(true);
        const rect = range.getBoundingClientRect(); return { x: rect.x + 1, y: rect.y + rect.height / 2 };
      }
      at -= node.textContent.length;
    }
    throw new Error('Missing caret position');
  }, offset);
}
async function mouseRange(page, pad, first, start, last, end) {
  await pad.input(first).scrollIntoViewIfNeeded();
  const a = await caretPoint(pad.input(first), start), z = await caretPoint(pad.input(last), end);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(z.x, z.y, { steps: 12 }); await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false);
}

test('workpad.exploratory', async ({ page, context, pad }, testInfo) => {
  test.setTimeout(360000);
  const group = randomUUID(), layout = column => ({ columnGroup: group, column });
  const a = block('Heading Alpha', 'H2', layout(0)), aa = block('Alpha paragraph', 'TEXT', layout(0));
  const b = block('Heading Beta', 'H3', layout(1)), bb = block('Beta paragraph', 'TEXT', layout(1));
  const flow = block('Outside columns');
  const initial = () => structuredClone([a, aa, b, bb, flow]);
  await pad.seed(initial());

  // Caret navigation does not dispatch focus on nested contenteditables: toolbar must still follow the live caret.
  await pad.focus(a.id, 'Home'); await page.keyboard.press('ArrowDown');
  const caretId = await page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('.wp-block')?.id.slice(3));
  expect(caretId).toBe(aa.id);
  await pad.root().getByLabel('Block type', { exact: true }).selectOption('H1');
  let saved = await pad.saved();
  expect.soft(saved.blocks.find(x => x.id === aa.id).type, 'Toolbar styles the block reached by ArrowDown').toBe('H1');
  expect.soft(saved.blocks.find(x => x.id === a.id).type, 'Arrow navigation leaves the previous heading unchanged').toBe('H2');

  // A real mouse range crosses a heading boundary, then a column boundary. Replacement stays at its first endpoint.
  await pad.seed(initial());
  await mouseRange(page, pad, a.id, 4, aa.id, 5); await page.keyboard.type('SAME_COLUMN');
  saved = await pad.saved();
  expect(saved.blocks.find(x => x.id === a.id).content).toContain('SAME_COLUMN');
  expect(saved.blocks.find(x => x.id === a.id).metadata.column).toBe(0);
  expect(saved.blocks.find(x => x.id === bb.id).content).toBe(bb.content);
  await pad.seed(initial());
  await mouseRange(page, pad, a.id, 4, b.id, 5); await page.keyboard.type('CROSS_COLUMN');
  saved = await pad.saved();
  expect.soft(saved.blocks.filter(x => x.content.includes('CROSS_COLUMN')).map(x => x.id)).toEqual([a.id]);
  expect.soft(saved.blocks.find(x => x.id === bb.id).content).toBe(bb.content);
  expect.soft(saved.blocks.find(x => x.id === bb.id).metadata.column).toBe(1);
  expect.soft(saved.blocks.find(x => x.id === flow.id).content).toBe(flow.content);

  // A numbered heading becomes a To-do without losing its number; a middle split preserves both styles.
  await pad.seed(initial()); await pad.focus(a.id); await pad.root().getByLabel('Numbered heading', { exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+Enter');
    await expect(pad.row(a.id).locator('.wp-heading-number')).toHaveText('1.');
  }
  await page.keyboard.press('Control+Enter'); await page.keyboard.press('Home');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); await page.keyboard.type('new ');
  saved = await pad.saved(); const tail = saved.blocks.find(x => x.content === 'new  Alpha');
  expect(tail).toBeTruthy(); expect(tail.type).toBe('CHECKLIST'); expect(tail.metadata.textStyle).toBe('H2'); expect(tail.metadata.column).toBe(0);
  expect(saved.blocks.find(x => x.id === a.id).content).toBe('Heading');
  // Rapid structural edits, a real Undo and retyping must retain original neighboring columns.
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter'); await page.keyboard.type('Scratch');
  await page.keyboard.press('Control+z'); await expect(pad.root().locator('.wp-main')).not.toHaveAttribute('inert', '');
  await page.keyboard.type('R'); saved = await pad.saved();
  expect.soft(saved.blocks.find(x => x.id === b.id).content).toBe(b.content);
  expect.soft(saved.blocks.find(x => x.id === bb.id).content).toBe(bb.content);
  expect.soft(saved.blocks.find(x => x.content.endsWith('R'))?.metadata.column).toBe(0);

  // Copy the whole group through native clipboard, duplicate in flow, then paste into a column. No nested groups.
  await pad.seed(initial());
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pad.row(a.id).locator('.wp-grip').click(); await pad.row(bb.id).locator('.wp-grip').click({ modifiers: ['Shift'] });
  await expect(pad.root().locator('.wp-selected')).toHaveCount(4);
  await pad.root().getByLabel('Copy selected blocks', { exact: true }).click();
  await expect(pad.root().getByText('4 blocks copied', { exact: true })).toBeVisible();
  await pad.focus(flow.id); await page.keyboard.press('Control+v'); saved = await pad.saved();
  expect.soft(new Set(saved.blocks.map(x => x.metadata.columnGroup).filter(Boolean)).size).toBe(2);
  await expect.soft(pad.root().locator('.wp-columns .wp-columns')).toHaveCount(0);
  const beforeIds = new Set(saved.blocks.map(x => x.id)); await pad.focus(a.id); await page.keyboard.press('Control+v'); saved = await pad.saved();
  const pasted = saved.blocks.filter(x => !beforeIds.has(x.id));
  expect(pasted).toHaveLength(4);
  for (const x of pasted) { expect(x.parentId).toBeNull(); expect(x.metadata.columnGroup).toBe(group); expect(x.metadata.column).toBe(0); }
  await expect(pad.root().locator('.wp-columns .wp-columns')).toHaveCount(0);

  // Shift-handle range deletion empties one whole column and returns this group to ordinary flow.
  await pad.seed(initial()); await pad.row(b.id).locator('.wp-grip').click(); await pad.row(bb.id).locator('.wp-grip').click({ modifiers: ['Shift'] });
  await expect(pad.root().locator('.wp-selected')).toHaveCount(2); await page.keyboard.press('Delete');
  saved = await pad.saved(); expect(saved.blocks.map(x => x.id)).toEqual([a.id, aa.id, flow.id]);
  await expect(pad.root().locator('.wp-columns')).toHaveCount(0); await pad.assertReload();
  const screenshot = path.join(process.env.QA_RUN_DIR, 'workpad-exploratory-final.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('exploratory-final', { path: screenshot, contentType: 'image/png' });
});
