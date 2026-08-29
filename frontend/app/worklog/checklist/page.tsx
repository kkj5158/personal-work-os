"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, ChecklistIcon, ChevronLeftIcon, ChevronRightIcon, TagIcon } from "@primer/octicons-react";
import { seoulToday } from "@/lib/seoulDate";
import {
  getChecklistMatrix,
  listChecklistCategories,
  listChecklistItems,
  reorderChecklistItems,
  setChecklistEntryAchieved,
} from "@/lib/api/checklist";
import type { ChecklistCategoryDto, ChecklistItemDto, ChecklistMatrixResponseDto } from "@/lib/api/types";
import { ChecklistMatrixTable } from "../ChecklistMatrixTable";
import { ChecklistManagementModal } from "../ChecklistManagementModal";
import { ChecklistCategoryModal } from "../ChecklistCategoryModal";
import { ChecklistAnalyticsContent } from "../ChecklistAnalyticsContent";
import { describeApiError } from "../errorMessages";
import { FOCUS_VISIBLE } from "../format";
import { toApiDateKey } from "../mapping";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

type PageModalState = { type: "none" } | { type: "checklistManagement" } | { type: "checklistCategory" };

// 근무 체크리스트 page (post-production iteration 1 continuation, REQ-05
// §10.20) — the sole place checklist completion happens now; the Work
// Record page (app/worklog/page.tsx) no longer offers any checklist entry
// UX. One vertically structured page: management controls, the checklist
// record matrix table (date × item), then the checklist analytics section
// (moved here from the retired ChecklistAnalyticsModal — see
// ChecklistAnalyticsContent) — never a second primary analytics entry
// point.
export default function ChecklistPage() {
  const today = seoulToday();
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(today));
  const [matrix, setMatrix] = useState<ChecklistMatrixResponseDto | null>(null);
  const [items, setItems] = useState<ChecklistItemDto[]>([]);
  const [categories, setCategories] = useState<ChecklistCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<PageModalState>({ type: "none" });

  async function reloadMatrix(anchor: Date) {
    setLoading(true);
    try {
      const [matrixDto, itemDtos] = await Promise.all([
        getChecklistMatrix(toApiDateKey(startOfMonth(anchor)), toApiDateKey(endOfMonth(anchor))),
        listChecklistItems(),
      ]);
      setMatrix(matrixDto);
      setItems(itemDtos);
      setError(null);
    } catch (e) {
      setError(describeApiError(e, "체크리스트 기록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await reloadMatrix(monthAnchor);
    })();
  }, [monthAnchor]);

  useEffect(() => {
    (async () => {
      try {
        setCategories(await listChecklistCategories());
      } catch {
        // The category modal re-fetches on its own if opened while this is
        // still empty; not worth a dedicated error banner.
      }
    })();
  }, []);

  async function handleToggle(entryId: string, achieved: boolean) {
    if (!matrix) return;
    const previous = matrix;
    setMatrix({
      ...matrix,
      rows: matrix.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => (cell.entryId === entryId ? { ...cell, achieved } : cell)),
      })),
    });
    try {
      await setChecklistEntryAchieved(entryId, achieved);
    } catch (e) {
      setMatrix(previous);
      setError(describeApiError(e, "체크리스트 항목을 저장하지 못했습니다."));
    }
  }

  async function handleReorder(categoryId: string | null, orderedItemIds: string[]) {
    try {
      await reorderChecklistItems(categoryId, orderedItemIds);
      await reloadMatrix(monthAnchor);
    } catch (e) {
      setError(describeApiError(e, "순서를 저장하지 못했습니다."));
    }
  }

  function closeModal() {
    setModalState({ type: "none" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas-default">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-16 px-8 py-8">
        {error && (
          <div className="flex items-center justify-between rounded-md border border-danger-fg bg-danger-subtle px-4 py-2 text-sm text-danger-fg">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className={`rounded px-2 py-0.5 text-xs font-medium hover:opacity-80 ${FOCUS_VISIBLE}`}>
              닫기
            </button>
          </div>
        )}

        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-fg-default">근무 체크리스트</h1>
              <p className="text-sm text-fg-muted">체크리스트 항목을 관리하고 일별 완료 현황을 기록·분석합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalState({ type: "checklistManagement" })}
                className={`flex h-9 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                <ChecklistIcon size={16} className="text-fg-muted" aria-hidden="true" />
                체크리스트 관리
              </button>
              <button
                type="button"
                onClick={() => setModalState({ type: "checklistCategory" })}
                className={`flex h-9 items-center gap-1.5 rounded-md border border-control-border bg-surface-default px-3 text-sm font-medium text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                <TagIcon size={16} className="text-fg-muted" aria-hidden="true" />
                카테고리 관리
              </button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">체크리스트 기록</h2>
            <p className="text-sm text-fg-muted">날짜별로 어떤 체크리스트 항목이 적용되었고 완료되었는지 확인합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center gap-1 rounded-md border border-border-default px-1">
              <button
                type="button"
                onClick={() => setMonthAnchor((prev) => addMonths(prev, -1))}
                className={`flex h-7 items-center gap-1 rounded px-2 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                <ChevronLeftIcon size={16} className="text-fg-muted" aria-hidden="true" />
                저번 달
              </button>
              <span className="whitespace-nowrap px-2 text-sm font-medium tabular-nums text-fg-default">{formatYearMonth(monthAnchor)}</span>
              <button
                type="button"
                onClick={() => setMonthAnchor((prev) => addMonths(prev, 1))}
                className={`flex h-7 items-center gap-1 rounded px-2 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
              >
                다음 달
                <ChevronRightIcon size={16} className="text-fg-muted" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMonthAnchor(startOfMonth(today))}
              className={`flex h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
            >
              이번 달
              <CalendarIcon size={16} className="text-fg-muted" aria-hidden="true" />
            </button>
          </div>

          {loading || !matrix ? (
            <p className="py-8 text-center text-sm text-fg-muted">불러오는 중…</p>
          ) : (
            <ChecklistMatrixTable
              monthStart={startOfMonth(monthAnchor)}
              monthEnd={endOfMonth(monthAnchor)}
              columns={matrix.columns}
              matrixRows={matrix.rows}
              items={items}
              referenceDate={today}
              onToggle={handleToggle}
              onReorder={handleReorder}
            />
          )}
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-fg-default">체크리스트 분석</h2>
            <p className="text-sm text-fg-muted">기간별 달성 추이와 항목별 성과를 확인합니다.</p>
          </div>
          <div className="border-t border-border-default" />
          <ChecklistAnalyticsContent />
        </section>
      </div>

      {modalState.type === "checklistManagement" && (
        <ChecklistManagementModal
          onClose={() => {
            closeModal();
            void reloadMatrix(monthAnchor);
          }}
        />
      )}

      {modalState.type === "checklistCategory" && (
        <ChecklistCategoryModal
          categories={categories}
          onCategoriesChanged={setCategories}
          onClose={() => {
            closeModal();
            void reloadMatrix(monthAnchor);
          }}
        />
      )}
    </div>
  );
}
