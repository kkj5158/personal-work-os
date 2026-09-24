/** Workpad commands shown by the dock. Text and structural selection are distinct. */
export const WORKPAD_SHORTCUTS = [
  { group: 'Text editing', items: [
    ['Ctrl + A', 'Select the current block text; press again to select this date’s Workpad'],
    ['Ctrl + C / X', 'Copy / cut selected text, or structurally selected blocks'],
    ['Ctrl + V', 'Paste text or copied blocks'],
    ['Enter', 'Split into a new block'],
    ['Shift + Enter', 'Insert a line break inside the block'],
    ['Backspace at start', 'Outdent, remove block formatting, then merge with the previous block'],
    ['Delete at end', 'Merge with the next block'],
    ['Ctrl + Enter', 'Toggle checklist completion'],
    ['Ctrl + Shift + Enter', 'Promote the block to a task'],
    ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'],
  ] },
  { group: 'Block structure', items: [
    ['Block handle', 'Select a block and its subtree; use Ctrl / Shift for multiple blocks'],
    ['Tab / Shift + Tab', 'Indent / outdent the current or selected blocks'],
    ['Alt + ↑ / ↓', 'Move the current or selected blocks up / down'],
    ['Drag block handle', 'Move selected blocks and their subtrees'],
    ['Block menu → 날짜로 이동', 'Move selected blocks to tomorrow or another date'],
  ] },
  { group: 'Notes & navigation', items: [
    ['[[', 'Find or create a linked note'],
    ['Click note link', 'Edit the linked note in the right dock'],
    ['Ctrl + click note link', 'Open the linked note as the main document'],
  ] },
] as const;
