"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getChecklistMatrix,
  getChecklistForDate,
  listChecklistCategories,
  setChecklistEntryResultChanges,
  setChecklistEntryMemo,
} from "@/lib/api/checklist";
import type {
  ChecklistMatrixResponseDto,
  ChecklistDailyDto,
  ChecklistCategoryDto,
} from "@/lib/api/types";
import {
  indexMatrix,
  patchMatrix,
  toChecklistState,
  toEntryChanges,
  workAvailability,
} from "@/app/worklog/checklistAdapter";
import { useChecklistMutations } from "@/components/checklist-core/useChecklistMutations";
import { ChecklistDayList } from "@/components/checklist-core/ChecklistDayList";
import { useDietStore } from "@/app/diet/store";
import { toDietChanges } from "@/app/diet/ChecklistRecord";
import { dietActiveOn, today } from "@/lib/diet/model";
import type {
  CellAvailability,
  ChecklistState,
} from "@/lib/checklist-core/types";
import { useReviewAutosave } from "./useReviewAutosave";
import { useReviewGuard } from "./ReviewGuards";

export function WorkDayChecklist({ date }: { date: string }) {
  const [data, setData] = useState<{
      matrix: ChecklistMatrixResponseDto;
      detail: ChecklistDailyDto;
      categories: ChecklistCategoryDto[];
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([
      getChecklistMatrix(date, date),
      getChecklistForDate(date),
      listChecklistCategories(),
    ])
      .then(([matrix, detail, categories]) => {
        if (live) {
          setData({ matrix, detail, categories });
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "불러오기 실패");
      });
    return () => {
      live = false;
    };
  }, [date, retry]);
  const index = useMemo(() => indexMatrix(data?.matrix ?? null), [data]);
  const baseState = useCallback(
    (id: string, d: string): ChecklistState => {
      const cell = index.cells.get(`${id}|${d}`);
      return cell ? toChecklistState(cell.result) : "UNTOUCHED";
    },
    [index],
  );
  const mutations = useChecklistMutations({
    baseState,
    persist: async (changes) => {
      await setChecklistEntryResultChanges(toEntryChanges(index, changes));
    },
    commit: (changes) =>
      setData((v) =>
        v ? { ...v, matrix: patchMatrix(v.matrix, changes)! } : v,
      ),
  });
  useReviewGuard(mutations.flush);
  const now = today();
  const availability = (id: string, d: string) =>
    data?.matrix.columns.find((c) => c.itemId === id)?.deleted
      ? ("INACTIVE" as const)
      : workAvailability(index, id, d, now);
  const entries = new Map(data?.detail.entries.map((e) => [e.itemId, e]));
  const rows = (data?.matrix.columns ?? [])
    .filter((c) => index.cells.has(`${c.itemId}|${date}`))
    .sort((a, b) => a.position - b.position)
    .map((c) => {
      const entry = entries.get(c.itemId);
      return {
        id: c.itemId,
        label: `${c.emoji ?? ""} ${c.name}`,
        meta: (
          <>
            {data?.categories.find((g) => g.id === c.categoryId)?.name}{" "}
            <b>{c.priority}</b>
            {c.deleted && " · 보관됨"}
          </>
        ),
        aside: entry ? (
          <ItemMemo
            key={entry.id}
            label={`${c.name} 메모`}
            memo={entry.memo ?? ""}
            disabled={availability(c.itemId, date) !== "EDITABLE"}
            save={async (memo) => {
              await setChecklistEntryMemo(entry.id, memo);
            }}
          />
        ) : undefined,
      };
    });
  return (
    <section>
      {error ? (
        <p role="alert">
          근무 체크리스트: {error}
          <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button>
        </p>
      ) : !data ? (
        <p>근무 체크리스트 불러오는 중…</p>
      ) : (
        <>
          <ChecklistDayList
            title="근무 체크리스트"
            date={date}
            today={now}
            groups={[{ id: "work", label: "", rows }]}
            mutations={mutations}
            availability={availability}
          />
          {!data.detail.applicable && (
            <small>근무 체크리스트 적용 대상이 아닌 날짜입니다.</small>
          )}
        </>
      )}
    </section>
  );
}
export function DietDayChecklist({ date }: { date: string }) {
  const store = useDietStore(),
    now = today(),
    { data } = store;
  const checks = useMemo(
    () => new Map(data.checks.map((c) => [`${c.itemId}|${c.date}`, c])),
    [data.checks],
  );
  const baseState = useCallback(
    (id: string, d: string): ChecklistState => {
      const state = checks.get(`${id}|${d}`)?.state;
      return state === "SUCCESS" || state === "FAILURE"
        ? state
        : state === "UNRECORDED"
          ? "NOT_RECORDED"
          : "UNTOUCHED";
    },
    [checks],
  );
  const mutations = useChecklistMutations({
    baseState,
    persist: async (changes) => {
      await store.saveChecks!(toDietChanges(changes));
    },
    commit: () => {},
  });
  useReviewGuard(mutations.flush);
  const availability = (id: string, d: string): CellAvailability =>
    d > now
      ? "FUTURE"
      : data.items.some(
            (i) =>
              i.id === id &&
              dietActiveOn(i, d, data.archivePeriods ?? [], data.checks),
          )
        ? "EDITABLE"
        : "INACTIVE";
  const rows = data.items
    .filter(
      (i) =>
        dietActiveOn(i, date, data.archivePeriods ?? [], data.checks) ||
        checks.has(`${i.id}|${date}`),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({
      id: i.id,
      label: i.title,
      meta: <b title={i.keyPoint}>{i.importance}</b>,
      aside: (
        <ItemMemo
          key={`${date}:${i.id}`}
          label={`${i.title} 메모`}
          memo={checks.get(`${i.id}|${date}`)?.memo ?? ""}
          disabled={availability(i.id, date) !== "EDITABLE"}
          save={async (memo) => {
            await store.saveCheckMemo!(date, i.id, memo);
          }}
        />
      ),
    }));
  return (
    <section>
      {store.error && (
        <p role="alert">
          다이어트 체크리스트: {store.error}
          <button onClick={() => void store.reload()}>다시 시도</button>
        </p>
      )}
      {store.loading ? (
        <p>다이어트 체크리스트 불러오는 중…</p>
      ) : (
        <ChecklistDayList
          title="다이어트 체크리스트"
          date={date}
          today={now}
          groups={[{ id: "diet", label: "", rows }]}
          mutations={mutations}
          availability={availability}
        />
      )}
    </section>
  );
}
function ItemMemo({
  label,
  memo,
  disabled,
  save,
}: {
  label: string;
  memo: string;
  disabled: boolean;
  save: (value: string) => Promise<void>;
}) {
  const editor = useReviewAutosave<
    { memo: string },
    { memo: string; version: number }
  >({
    empty: { memo },
    load: async () => ({ memo, version: 0 }),
    save: async (value) => {
      await save(value.memo);
      return { ...value, version: 0 };
    },
  });
  return (
    <details className="cr-item-memo">
      <summary aria-label={label}>✎</summary>
      <div
        onCompositionStart={() => editor.queue.composition(true)}
        onCompositionEnd={() => editor.queue.composition(false)}
      >
        <textarea
          aria-label={label}
          value={editor.draft.memo}
          disabled={disabled || editor.loading}
          onChange={(e) => editor.change({ memo: e.target.value })}
          onBlur={() => void editor.retry()}
        />
        {editor.error && (
          <p role="alert">
            {editor.error}
            <button onClick={() => void editor.retry()}>재시도</button>
          </p>
        )}
      </div>
    </details>
  );
}
