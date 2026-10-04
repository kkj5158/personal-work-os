import { columnOf } from './columns';
import { subtreeIds, type Block, type DropZone } from './workpad';

type DropRect = { left: number; top: number; width: number; height: number };

/** Keep the top/bottom quarters reserved for reorder, even at a horizontal edge. */
export function dropZoneAt(rect: DropRect, x: number, y: number, topLevel: boolean): DropZone {
  const ratio = (y - rect.top) / Math.max(1, rect.height);
  if (ratio < .25) return 'before';
  if (ratio > .75) return 'after';
  const sideWidth = Math.min(96, Math.max(52, rect.width * .18), rect.width / 3);
  if (topLevel && x < rect.left + sideWidth) return 'column-left';
  if (topLevel && x > rect.left + rect.width - sideWidth) return 'column-right';
  return x < rect.left + 45 ? 'sibling' : 'child';
}

/** Match createColumn's limit after the dragged subtree leaves its old column. */
export function columnDropState(blocks: Block[], ids: string[], target: Block): 'available' | 'full' | null {
  const tree = subtreeIds(blocks, ids);
  if (target.parentId || tree.has(target.id) || !ids.length) return null;
  const layout = columnOf(blocks, target);
  if (!layout) return 'available';
  const occupied = new Set(blocks.filter(b => !b.parentId && !tree.has(b.id) && b.metadata.columnGroup === layout.group).map(b => b.metadata.column));
  return occupied.size >= 3 ? 'full' : 'available';
}
