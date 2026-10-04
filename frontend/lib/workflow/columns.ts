import type { WorkpadBlock as Block } from '../api/workflow';

export function columnOf(blocks: Block[], block: Block): { group: string; column: number } | null {
  const seen = new Set<string>();
  while (block.parentId && !seen.has(block.id)) {
    seen.add(block.id);
    const parent = blocks.find(b => b.id === block.parentId);
    if (!parent) break;
    block = parent;
  }
  return typeof block.metadata.columnGroup === 'string' && Number.isInteger(block.metadata.column)
    ? { group: block.metadata.columnGroup, column: Number(block.metadata.column) } : null;
}

export function siblingScope(blocks: Block[], block: Block): string {
  if (block.parentId) return block.parentId;
  const column = columnOf(blocks, block);
  return column ? `${column.group}:${column.column}` : 'flow';
}

export function withoutColumn(metadata: Block['metadata']): Block['metadata'] {
  const rest = {...metadata}; delete rest.columnGroup; delete rest.column;
  return rest;
}

/** Columns are a flat layout of existing root subtrees; no synthetic editor blocks. */
export function cleanColumns(blocks: Block[]): Block[] {
  const groups = new Map<string, Set<number>>();
  for (const block of blocks) {
    if (block.parentId) continue;
    const group = block.metadata.columnGroup, column = block.metadata.column;
    if (typeof group === 'string' && Number.isInteger(column) && Number(column) >= 0 && Number(column) <= 2) {
      const occupied = groups.get(group) ?? new Set<number>(); occupied.add(Number(column)); groups.set(group, occupied);
    }
  }
  return blocks.map(block => {
    const group = block.metadata.columnGroup, columns = typeof group === 'string' ? [...(groups.get(group) ?? [])].sort() : [];
    if (block.parentId || columns.length < 2 || !columns.includes(Number(block.metadata.column))) {
      return 'columnGroup' in block.metadata || 'column' in block.metadata ? { ...block, metadata: withoutColumn(block.metadata) } : block;
    }
    const column = columns.indexOf(Number(block.metadata.column));
    return column === block.metadata.column ? block : { ...block, metadata: { ...block.metadata, column } };
  });
}

export type LayoutSegment = { key: string; columns: Block[][] };
export function columnSegments(blocks: Block[]): LayoutSegment[] {
  const result: LayoutSegment[] = [], groups = new Map<string, LayoutSegment>();
  for (const block of blocks) {
    const column = columnOf(blocks, block);
    if (!column) { result.push({ key: block.id, columns: [[block]] }); continue; }
    let segment = groups.get(column.group);
    if (!segment) { segment = { key: column.group, columns: [] }; groups.set(column.group, segment); result.push(segment); }
    (segment.columns[column.column] ??= []).push(block);
  }
  return result;
}

/** Preserve logical column order and contiguous groups after every structural edit. */
export function canonicalColumns(blocks: Block[]): Block[] {
  return columnSegments(cleanColumns(blocks)).flatMap(segment => segment.columns.flat());
}
