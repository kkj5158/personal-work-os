"use client";

import { useEffect, useId, useState } from "react";
import { WorkLogModal } from "@/app/worklog/WorkLogModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { BatchActualItemInput, BatchActualItemResult, CalendarPlanBlockDto } from "@/lib/api/types";
import { commitBatchActual } from "@/lib/api/calendar";
import { toDateKey } from "@/lib/date";

interface DraftRow extends BatchActualItemInput {
  included: boolean;
  categoryLabel: string;
}

interface BatchActualEditorProps {
  open: boolean;
  date: Date;
  sourcePlans: CalendarPlanBlockDto[];
  categoryLabelFor: (domainType: "WORK" | "LIFE", categoryId: string | null) => string;
  onClose: () => void;
  onCommitted: () => void;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "오늘 계획 전체 실행으로 가져오기" — a convenience/prefill workflow, never
 *  a persistent Plan<->Actual link (locked V1 policy §22/§23). Nothing is
 *  persisted until every included row validates; 전체 저장 commits atomically. */
export function BatchActualEditor({ open, date, sourcePlans, categoryLabelFor, onClose, onCommitted }: BatchActualEditorProps) {
  const titleId = useId();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [results, setResults] = useState<Map<number, BatchActualItemResult>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(
        sourcePlans.map((plan) => {
          const categoryId = plan.domainType === "WORK" ? plan.activityCategoryId : plan.lifeCategoryId;
          return {
            included: true,
            planningBlockId: plan.id,
            domainType: plan.domainType,
            title: plan.title,
            categoryId,
            phaseId: plan.phaseId,
            startTime: plan.startAt.slice(11, 16),
            endTime: plan.endAt.slice(11, 16),
            durationMinutes: Math.round((toMinutes(plan.endAt.slice(11, 16)) - toMinutes(plan.startAt.slice(11, 16)) + 1440) % 1440),
            memo: null,
            categoryLabel: categoryLabelFor(plan.domainType, categoryId),
          };
        }),
      );
      setResults(new Map());
      setError(null);
    }
  }, [open, sourcePlans, categoryLabelFor]);

  if (!open) return null;

  const includedCount = rows.filter((r) => r.included).length;

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  }

  function handleTimeChange(index: number, field: "startTime" | "endTime", value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const startTime = field === "startTime" ? value : row.startTime;
        const endTime = field === "endTime" ? value : row.endTime;
        const durationMinutes = startTime && endTime ? Math.max(toMinutes(endTime) - toMinutes(startTime), 0) : row.durationMinutes;
        return { ...row, [field]: value, durationMinutes };
      }),
    );
  }

  async function handleCommit() {
    setSaving(true);
    setError(null);
    try {
      const included = rows.filter((r) => r.included);
      const response = await commitBatchActual({
        date: toDateKey(date),
        items: included.map((row) => ({
          planningBlockId: row.planningBlockId,
          domainType: row.domainType,
          title: row.title,
          categoryId: row.categoryId,
          phaseId: row.phaseId,
          startTime: row.startTime,
          endTime: row.endTime,
          durationMinutes: row.durationMinutes,
          memo: row.memo,
        })),
      });
      if (!response.committed) {
        const byIncludedIndex = new Map<number, BatchActualItemResult>();
        response.results.forEach((r) => byIncludedIndex.set(r.index, r));
        const originalIndexOfIncluded = rows.reduce<number[]>((acc, row, i) => {
          if (row.included) acc.push(i);
          return acc;
        }, []);
        const mapped = new Map<number, BatchActualItemResult>();
        byIncludedIndex.forEach((result, includedIdx) => {
          mapped.set(originalIndexOfIncluded[includedIdx], result);
        });
        setResults(mapped);
        setError("일부 항목에 문제가 있어 저장되지 않았습니다. 아래 항목을 확인해 주세요.");
        return;
      }
      onCommitted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkLogModal titleId={titleId} title="오늘 계획 전체 실행으로 가져오기" onClose={onClose} size="wide">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          {toDateKey(date)}에 계획된 일정을 실제 기록으로 가져옵니다. 시간을 수정하거나 선택을 해제한 후 저장하세요.
        </p>

        <div className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const result = results.get(index);
            return (
              <div
                key={row.planningBlockId ?? index}
                className={`rounded-md border p-2.5 ${
                  result && !result.valid ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(e) => updateRow(index, { included: e.target.checked })}
                    className="mt-1.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.title}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800">
                        {row.domainType === "WORK" ? "업무" : "생활"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        value={row.startTime ?? ""}
                        disabled={!row.included}
                        onChange={(e) => handleTimeChange(index, "startTime", e.target.value)}
                        className="w-28"
                      />
                      <span className="text-zinc-400">~</span>
                      <Input
                        type="time"
                        value={row.endTime ?? ""}
                        disabled={!row.included}
                        onChange={(e) => handleTimeChange(index, "endTime", e.target.value)}
                        className="w-28"
                      />
                      <span className="text-xs text-zinc-400">{row.durationMinutes}분</span>
                      <span className="text-xs text-zinc-400">· {row.categoryLabel}</span>
                    </div>
                    {result && !result.valid && (
                      <p className="mt-1.5 text-xs text-red-600">{result.errorMessage}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="px-1 text-sm text-zinc-400">가져올 계획 항목이 없습니다.</p>}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="mt-1 flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">{includedCount}개 항목이 선택되었습니다.</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} type="button" disabled={saving}>
              취소
            </Button>
            <Button variant="primary" onClick={handleCommit} type="button" disabled={saving || includedCount === 0}>
              {saving ? "저장 중..." : `전체 저장 (${includedCount}개)`}
            </Button>
          </div>
        </div>
      </div>
    </WorkLogModal>
  );
}
