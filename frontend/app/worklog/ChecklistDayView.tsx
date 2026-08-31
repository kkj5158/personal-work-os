"use client";

import type { ChecklistCategoryDto, ChecklistDailyDto, ChecklistDailyEntryDto, ChecklistItemDto, ChecklistMatrixResponseDto, WorkAttendanceStatus } from "@/lib/api/types";
import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import { mapStatusFromBackend } from "./mapping";
import { AttendanceBadge } from "./AttendanceBadge";
import { computeWeekProgressForItem, groupByPriority, itemCategoryLabel, type ChecklistFilterState } from "./checklistLogic";
import { ChecklistMemoEditor } from "./ChecklistMemoEditor";

interface ChecklistDayViewProps {
  date: Date;
  status: WorkAttendanceStatus | null;
  detail: ChecklistDailyDto | null;
  weekMatrix: ChecklistMatrixResponseDto | null;
  items: ChecklistItemDto[];
  categories: ChecklistCategoryDto[];
  filters: ChecklistFilterState;
  onToggle: (entryId: string, achieved: boolean) => void;
  onMemoSave: (entryId: string, memo: string | null) => Promise<void>;
}

const PRIORITY_HEADER_LABEL: Record<"core" | "secondary", string> = { core: "CORE", secondary: "SECONDARY" };

// The Day view (§11-20) — an execution-focused Feed, never a one-row table.
// CORE/SECONDARY is the only section grouping; Category is muted metadata
// beneath the item name, never a second grouping layer (§12). Completed
// items stay in canonical position (no reorder, no strikethrough, no
// auto-collapse, no move-to-bottom, §16) — only a slight opacity change
// marks completion. No DnD here at all (§17); ordering is purely consumed
// from the canonical matrix column order.
export function ChecklistDayView({ date, status, detail, weekMatrix, items, categories, filters, onToggle, onMemoSave }: ChecklistDayViewProps) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  if (!detail?.applicable) {
    return <div className="rounded-md border border-border-default py-14 text-center text-sm text-fg-muted">체크리스트 적용 대상이 아닙니다.</div>;
  }

  let entries = detail.entries;
  if (filters.coreOnly) entries = entries.filter((e) => e.priority === "CORE");
  if (filters.priority !== "ALL") entries = entries.filter((e) => e.priority === filters.priority);
  if (filters.incompleteOnly) entries = entries.filter((e) => !e.achieved);

  const total = entries.length;
  const done = entries.filter((e) => e.achieved).length;
  const { core, secondary } = groupByPriority(entries);
  const groups: ["core" | "secondary", ChecklistDailyEntryDto[]][] = [];
  if (core.length > 0) groups.push(["core", core]);
  if (secondary.length > 0) groups.push(["secondary", secondary]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold text-fg-default">
          {formatKoreanDate(date)} ({formatKoreanWeekday(date).slice(0, 1)})
          {status && <AttendanceBadge status={mapStatusFromBackend(status)} />}
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          오늘 체크리스트 · {done} / {total} 완료 {total > 0 && `· ${Math.round((done / total) * 100)}%`}
        </p>
      </div>

      {total === 0 ? (
        <p className="rounded-md border border-border-default py-10 text-center text-sm text-fg-muted">표시할 항목이 없습니다.</p>
      ) : (
        groups.map(([kind, items]) => (
          <div key={kind} className="flex flex-col gap-1">
            <div className="flex items-center justify-between border-b border-border-default pb-1.5">
              <span className="text-xs font-medium tracking-wide text-fg-muted">{PRIORITY_HEADER_LABEL[kind]}</span>
              <span className="text-xs text-fg-muted">
                {items.filter((i) => i.achieved).length} / {items.length}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-border-default">
              {items.map((item) => {
                const progress = computeWeekProgressForItem(item.itemId, weekMatrix);
                return (
                  <div key={item.id} className={`flex items-start gap-3 py-3 ${item.achieved ? "opacity-70" : ""}`}>
                    <input
                      type="checkbox"
                      checked={item.achieved}
                      onChange={() => onToggle(item.id, !item.achieved)}
                      aria-label={`${item.name} 완료`}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-control-border"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-sm font-medium text-fg-default">
                          {item.emoji} {item.name}
                        </span>
                        {progress && (
                          <span className="text-xs text-fg-muted">
                            이번 주 {progress.achieved} / {progress.applicable}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-fg-muted">{itemCategoryLabel(itemById.get(item.itemId), categories)}</span>
                      <ChecklistMemoEditor entryId={item.id} memo={item.memo} onSave={onMemoSave} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
