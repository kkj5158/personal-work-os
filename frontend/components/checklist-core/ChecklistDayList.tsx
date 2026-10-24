"use client";
import { ChecklistGrid, type GridGroup } from "./ChecklistGrid";
import type { ChecklistMutations } from "./useChecklistMutations";
import type { CellAvailability } from "@/lib/checklist-core/types";
export function ChecklistDayList({
  title,
  date,
  today,
  groups,
  mutations,
  availability,
}: {
  title: string;
  date: string;
  today: string;
  groups: GridGroup[];
  mutations: ChecklistMutations;
  availability: (id: string, date: string) => CellAvailability;
}) {
  const rows = groups.flatMap((g) => g.rows),
    eligible = rows.filter((r) => availability(r.id, date) === "EDITABLE"),
    success = eligible.filter(
      (r) => mutations.getState(r.id, date) === "SUCCESS",
    ).length;
  return (
    <details className="cr-checklist" open>
      <summary>
        {title}{" "}
        <span>
          {success}/{eligible.length}
        </span>
        {mutations.saving && <small>저장 중</small>}
      </summary>
      <ChecklistGrid
        singleDay
        label={title}
        groups={groups}
        dates={[{ date }]}
        today={today}
        mutations={mutations}
        availability={availability}
        asideHeader="메모"
      />
      {mutations.error && (
        <div role="alert">
          {mutations.error}
          <button onClick={mutations.retry}>재시도</button>
        </div>
      )}
      <small>
        클릭: 성공 / 초기화 · 우클릭, 1·2·3·0: 상태 · Shift/드래그: 선택 ·
        Ctrl+Z: 실행 취소
      </small>
    </details>
  );
}
