"use client";
import {
  getDailyReview,
  saveDailyReview,
  EMPTY_REVIEW,
} from "@/lib/api/calendarReviews";
import { getWorkRecord } from "@/lib/api/workRecords";
import { apiClient } from "@/lib/api/client";
import type { WorkRecordDto } from "@/lib/api/types";
import { reopenReflection } from "@/lib/api/reflections";
import { useReviewAutosave } from "./useReviewAutosave";
import { ReviewFields, SaveStatus } from "./ReviewFields";
import { DietDayChecklist, WorkDayChecklist } from "./DailyChecklists";
export function DailyInputCenter({
  date,
  onSaved,
}: {
  date: string;
  onSaved: () => void;
}) {
  const editor = useReviewAutosave({
    empty: EMPTY_REVIEW,
    load: () => getDailyReview(date),
    save: (body, version) => saveDailyReview(date, body, version),
    onSaved,
  });
  const completed = editor.record?.status === "COMPLETED";
  return (
    <aside className="cr-daily-input" aria-label={`${date} 입력 센터`}>
      <h2>
        하루 회고 <small>{date}</small>
      </h2>
      {editor.loading ? (
        <p>하루 회고 불러오는 중…</p>
      ) : (
        <div
          onCompositionStart={() => editor.queue.composition(true)}
          onCompositionEnd={() => editor.queue.composition(false)}
          onBlur={() => void editor.retry()}
        >
          <ReviewFields
            value={editor.draft}
            onChange={editor.change}
            disabled={completed || !editor.record}
          />
          {completed && (
            <p>
              완료된 회고 · 스냅샷을 보존하고 있습니다.{" "}
              <button
                onClick={async () => {
                  try {
                    await reopenReflection(date, editor.record!.version);
                    await editor.reload();
                  } catch {
                    await editor.reload();
                  }
                }}
              >
                수정
              </button>
            </p>
          )}
        </div>
      )}
      <SaveStatus {...editor} />
      {!editor.record && !editor.loading && (
        <button onClick={() => void editor.reload()}>회고 다시 불러오기</button>
      )}
      <DailyWorkScore key={date} date={date} onSaved={onSaved} />
      <WorkDayChecklist key={`work:${date}`} date={date} />
      <DietDayChecklist key={`diet:${date}`} date={date} />
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
