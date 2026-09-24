import { cellKey } from "./types";

export type GridPoint = { row: number; col: number };

/** Rectangular range between two grid points (inclusive), as cell keys, skipping cells the predicate rejects. */
export function rectangleKeys(
  rows: readonly string[],
  dates: readonly string[],
  anchor: GridPoint,
  focus: GridPoint,
  selectable: (rowId: string, date: string) => boolean = () => true,
): Set<string> {
  const keys = new Set<string>();
  const [r0, r1] = anchor.row <= focus.row ? [anchor.row, focus.row] : [focus.row, anchor.row];
  const [c0, c1] = anchor.col <= focus.col ? [anchor.col, focus.col] : [focus.col, anchor.col];
  for (let r = Math.max(0, r0); r <= Math.min(rows.length - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(dates.length - 1, c1); c++) {
      if (selectable(rows[r], dates[c])) keys.add(cellKey(rows[r], dates[c]));
    }
  }
  return keys;
}

/** Keyboard navigation inside the grid, clamped to its bounds. */
export function movePoint(point: GridPoint, key: string, rowCount: number, colCount: number): GridPoint | null {
  const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const step = delta[key];
  if (!step) return null;
  return {
    row: Math.min(rowCount - 1, Math.max(0, point.row + step[0])),
    col: Math.min(colCount - 1, Math.max(0, point.col + step[1])),
  };
}
