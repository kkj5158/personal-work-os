"use client";

import { useState } from "react";
import { GrabberIcon } from "@primer/octicons-react";
import { addDays, formatKoreanDate, formatKoreanWeekday, isSameDay, toDateKey } from "@/lib/date";
import { isFutureSeoulDate } from "@/lib/seoulDate";
import type { ChecklistItemDto, ChecklistMatrixColumnDto, ChecklistMatrixRowDto } from "@/lib/api/types";
import { AttendanceBadge } from "./AttendanceBadge";
import { mapStatusFromBackend } from "./mapping";
import { FOCUS_VISIBLE } from "./format";

interface ChecklistMatrixTableProps {
  monthStart: Date;
  monthEnd: Date;
  columns: ChecklistMatrixColumnDto[];
  matrixRows: ChecklistMatrixRowDto[];
  /** Full item catalog (including inactive/deleted), used only to resolve
   *  each draggable column's category sibling group — see onReorder. */
  items: ChecklistItemDto[];
  referenceDate: Date;
  onToggle: (entryId: string, achieved: boolean) => void;
  onReorder: (categoryId: string | null, orderedItemIds: string[]) => void;
}

const CELL = "border-b border-border-default px-3 py-3 align-middle text-sm";
const HEADER_CELL = "whitespace-nowrap border-b border-border-default bg-canvas-subtle px-3 py-2.5 text-left align-middle text-sm font-medium text-fg-muted";
const CONTEXT_HEADER_CELL = `${HEADER_CELL} sticky left-0 z-10 bg-canvas-subtle`;

// Checklist record table (REQ-05 §10.20 continuation) — one row per calendar
// date in the selected month, one column per checklist item that appears in
// at least one daily snapshot within that month (the union, not just the six
// currently-active items — see ChecklistDailyService.getMatrix). Column drag
// order calls the exact same reorderChecklistItems API the Checklist
// Management screen uses, scoped to the dragged item's own category (a flat
// cross-category order isn't expressible via that API without either a
// schema change or a surprising implicit category move, both rejected — see
// docs/backend/checklist.md), so management order and matrix column order
// are always the same persisted value, never two models to keep in sync.
export function ChecklistMatrixTable({
  monthStart,
  monthEnd,
  columns,
  matrixRows,
  items,
  referenceDate,
  onToggle,
  onReorder,
}: ChecklistMatrixTableProps) {
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const rowByDateKey = new Map(matrixRows.map((r) => [r.date, r]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const days: Date[] = [];
  for (let cursor = monthStart; cursor.getTime() <= monthEnd.getTime(); cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  function categoryIdFor(itemId: string): string | null | undefined {
    return itemById.get(itemId)?.categoryId;
  }

  // Full current sibling set for a category, in persisted order — exactly
  // ChecklistManagementModal's own `groups` computation, since the reorder
  // API requires the complete sibling set, not just the columns visible in
  // this particular month (see ChecklistItemService.reorder).
  function siblingIdsFor(categoryId: string | null): string[] {
    return items
      .filter((i) => !i.deleted && i.categoryId === categoryId)
      .sort((a, b) => a.position - b.position)
      .map((i) => i.id);
  }

  function handleDrop(targetItemId: string) {
    const draggedId = dragItemId;
    setDragItemId(null);
    if (!draggedId || draggedId === targetItemId) return;
    const categoryId = categoryIdFor(draggedId);
    if (categoryId === undefined || categoryId !== categoryIdFor(targetItemId)) return; // scoped within one category only

    const siblingIds = siblingIdsFor(categoryId);
    const from = siblingIds.indexOf(draggedId);
    const to = siblingIds.indexOf(targetItemId);
    if (from === -1 || to === -1) return;
    siblingIds.splice(to, 0, siblingIds.splice(from, 1)[0]);
    onReorder(categoryId, siblingIds);
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={CONTEXT_HEADER_CELL}>
              요일
            </th>
            <th scope="col" className={CONTEXT_HEADER_CELL}>
              날짜
            </th>
            <th scope="col" className={CONTEXT_HEADER_CELL}>
              출결
            </th>
            {columns.map((col) => {
              const draggable = !col.deleted && categoryIdFor(col.itemId) !== undefined;
              return (
                <th
                  key={col.itemId}
                  scope="col"
                  className={`${HEADER_CELL} min-w-[88px] ${dragItemId === col.itemId ? "opacity-50" : ""}`}
                  onDragOver={(e) => {
                    if (draggable && dragItemId) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(col.itemId);
                  }}
                >
                  <div className="flex items-center gap-1">
                    {draggable && (
                      <span
                        draggable
                        onDragStart={() => setDragItemId(col.itemId)}
                        onDragEnd={() => setDragItemId(null)}
                        className="cursor-grab text-fg-muted hover:text-fg-default active:cursor-grabbing"
                        aria-label={`${col.name} 열 순서 변경`}
                      >
                        <GrabberIcon size={12} aria-hidden="true" />
                      </span>
                    )}
                    <span className="truncate" title={col.deleted ? `${col.name} (삭제됨)` : col.name}>
                      {col.emoji} {col.name}
                    </span>
                    {col.deleted && <span className="whitespace-nowrap text-xs text-fg-muted">(삭제됨)</span>}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {days.map((date) => {
            const dateKey = toDateKey(date);
            const row = rowByDateKey.get(dateKey);
            const isToday = isSameDay(date, referenceDate);
            const rowHighlight = isToday ? "bg-primary-subtle/40" : "";

            if (!row) {
              const attendanceCell = isFutureSeoulDate(date, referenceDate) ? "–" : "미입력";
              return (
                <tr key={dateKey} className={rowHighlight}>
                  <td className={`${CELL} sticky left-0 z-10 whitespace-nowrap bg-surface-default text-fg-default ${rowHighlight}`}>
                    {formatKoreanWeekday(date)}
                  </td>
                  <td className={`${CELL} sticky left-0 z-10 whitespace-nowrap tabular-nums text-fg-default ${rowHighlight}`}>
                    {formatKoreanDate(date)}
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-fg-muted`}>{attendanceCell}</td>
                  {columns.map((col) => (
                    <td key={col.itemId} className={`${CELL} text-center text-fg-muted`}>
                      –
                    </td>
                  ))}
                </tr>
              );
            }

            const cellByItemId = new Map(row.cells.map((c) => [c.itemId, c]));
            const status = mapStatusFromBackend(row.status);

            return (
              <tr key={dateKey} className={rowHighlight}>
                <td className={`${CELL} sticky left-0 z-10 whitespace-nowrap bg-surface-default text-fg-default ${rowHighlight}`}>
                  {formatKoreanWeekday(date)}
                </td>
                <td className={`${CELL} sticky left-0 z-10 whitespace-nowrap tabular-nums text-fg-default ${rowHighlight}`}>
                  {formatKoreanDate(date)}
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <AttendanceBadge status={status} />
                </td>
                {columns.map((col) => {
                  if (!row.applicable) {
                    return (
                      <td key={col.itemId} className={`${CELL} text-center text-fg-muted`}>
                        —
                      </td>
                    );
                  }
                  const cell = cellByItemId.get(col.itemId);
                  if (!cell) {
                    // Item wasn't part of this date's checklist snapshot at
                    // all (didn't exist yet / wasn't active then) — not an
                    // unchecked failure, so never render a checkbox here.
                    return (
                      <td key={col.itemId} className={`${CELL} text-center text-fg-muted`}>
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={col.itemId} className={`${CELL} text-center`}>
                      <input
                        type="checkbox"
                        checked={cell.achieved}
                        onChange={() => onToggle(cell.entryId, !cell.achieved)}
                        aria-label={`${formatKoreanDate(date)} ${col.name}`}
                        className={`h-4 w-4 cursor-pointer ${FOCUS_VISIBLE}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
