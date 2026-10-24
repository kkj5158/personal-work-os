"use client";
import { getWorkRecord } from "@/lib/api/workRecords";
import { apiClient } from "@/lib/api/client";
import type { WorkRecordDto } from "@/lib/api/types";
import { useReviewAutosave } from "./useReviewAutosave";
import { SaveStatus } from "./ReviewFields";
import { DietDayChecklist, WorkDayChecklist } from "./DailyChecklists";
import { DailyReflection } from "./DailyReflection";
import { useReviewGuards } from "./ReviewGuards";
export function DailyInputCenter({
  date,
  onSaved,
}: {
  date: string;
  onSaved: () => void;
}) {
  const { register } = useReviewGuards();
  return (
    <aside className="cr-daily-input" aria-label={date + " 입력 센터"}>
      <h2>
        하루 회고 <small>{date}</small>
      </h2>
      <DailyReflection dates={[date]} view="day" inline register={register} />
      <DailyWorkScore key={date} date={date} onSaved={onSaved} />
      <WorkDayChecklist key={"work:" + date} date={date} />
      <DietDayChecklist key={"diet:" + date} date={date} />
    </aside>
  );
}
function DailyWorkScore({
  date,
  onSaved,
}: {
  date: string;
  onSaved: () => void;
}) {
  type Record = {
    score: number | null;
    status: string | null;
    version: number;
  };
  const map = (r: WorkRecordDto | null): Record => ({
    score: r?.workScore ?? null,
    status: r?.status ?? null,
    version: r?.version ?? -1,
  });
  const editor = useReviewAutosave<{ score: number | null }, Record>({
    empty: { score: null },
    load: async () => map(await getWorkRecord(date)),
    save: async (body, version) =>
      map(
        await apiClient.put<WorkRecordDto>(`/api/work-records/${date}/score`, {
          score: body.score,
          expectedVersion: version,
        }),
      ),
    onSaved,
  });
  const applicable =
    !!editor.record?.status &&
    ["WORK", "EARLY_LEAVE", "HALF_DAY"].includes(editor.record.status);
  return (
    <div className="cr-work-score" onBlur={() => void editor.retry()}>
      <label>
        업무 점수{" "}
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          disabled={editor.loading || !applicable}
          value={editor.draft.score ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            if (n === null || (Number.isInteger(n) && n >= 0 && n <= 100))
              editor.change({ score: n });
          }}
        />
      </label>
      {!applicable && (
        <small>
          {editor.loading
            ? "업무 기록 확인 중…"
            : "저장된 근무일 기록이 있어야 입력할 수 있습니다."}
        </small>
      )}
      <SaveStatus {...editor} />
    </div>
  );
}
