"use client";
import type { ReviewFields as Fields } from "@/lib/api/calendarReviews";
import { moodEmoji } from "./reviewModel";
import type { SaveState } from "@/lib/notes/autosave";
export function ReviewFields({
  value,
  onChange,
  weekly = false,
  disabled = false,
}: {
  value: Fields;
  onChange: (patch: Partial<Fields>) => void;
  weekly?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="cr-fields">
      <label>
        {weekly ? "한 줄 제목" : "하루 한줄 요약"}
        <input
          aria-label={weekly ? "한 줄 제목" : "하루 한줄 요약"}
          maxLength={240}
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label>
        {weekly ? "주간 점수" : "하루 점수"}
        <input
          aria-label={weekly ? "주간 점수" : "하루 점수"}
          type="number"
          min={0}
          max={100}
          step={1}
          value={value.score ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            if (n === null || (Number.isInteger(n) && n >= 0 && n <= 100))
              onChange({ score: n });
          }}
        />
        <small>/ 100 · 선택 입력</small>
      </label>
      <div>
        <span>{weekly ? "주간 감정" : "감정 상태"}</span>
        <div
          role="group"
          aria-label={weekly ? "주간 감정" : "감정 상태"}
          className="cr-moods"
        >
          {[1, 2, 3, 4, 5].map((n, i) => (
            <button
              key={n}
              type="button"
              aria-label={`${moodEmoji(n)} ${["매우 나쁨", "나쁨", "보통", "좋음", "매우 좋음"][i]}`}
              aria-pressed={value.mood === n}
              onClick={() => onChange({ mood: value.mood === n ? null : n })}
            >
              {moodEmoji(n)}
            </button>
          ))}
          <button type="button" onClick={() => onChange({ mood: null })}>
            해제
          </button>
        </div>
      </div>
      <label>
        {weekly ? "종합 회고" : "메모"}
        <textarea
          aria-label={weekly ? "종합 회고" : "메모"}
          maxLength={100000}
          rows={weekly ? 6 : 4}
          value={value.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
export function SaveStatus({
  state,
  error,
  conflict,
  remote,
  retry,
  rebase,
}: {
  state: SaveState;
  error: string;
  conflict: boolean;
  remote?: { title?: string; memo?: string; score?: number | null } | null;
  retry: () => void;
  rebase: () => void;
}) {
  return (
    <div className="cr-save" role={error ? "alert" : "status"}>
      {error ? (
        <>
          {error} <button onClick={retry}>오류 · 재시도</button>
          {conflict && (
            <button onClick={rebase}>
              {remote ? "확인한 버전에 내 입력 다시 저장" : "최신 기록 보기"}
            </button>
          )}
          {remote && (
            <details open>
              <summary>다른 화면에서 저장한 기록</summary>
              <b>{remote.title}</b>
              <p
                style={{
                  whiteSpace: "pre-wrap",
                  maxHeight: 140,
                  overflow: "auto",
                }}
              >
                {remote.memo}
              </p>
              <span>점수: {remote.score ?? "—"} · 현재 입력은 유지됩니다.</span>
            </details>
          )}
        </>
      ) : state === "saved" ? (
        "저장됨"
      ) : (
        "저장 중"
      )}
    </div>
  );
}
