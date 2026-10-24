"use client";
import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_WEEK,
  getWeeklyReview,
  saveWeeklyReview,
  getReviewRange,
  type ReviewRange,
  type WeeklyFields,
  type DayMetrics,
} from "@/lib/api/calendarReviews";
import {
  addDays,
  daysBetween,
  monthDates,
  moodEmoji,
  weekStart,
  weeklyMetrics,
  workDuration,
} from "./reviewModel";
import { ReviewFields, SaveStatus } from "./ReviewFields";
import { useReviewAutosave } from "./useReviewAutosave";
import { TimeGrid } from "./TimeGrid";
import { categoryAppearance, type CalendarCategory } from "./appearance";
import type { CalendarRangeResponse } from "@/lib/api/types";
import type { GridBlock } from "./gridTypes";

function useRange(from: string, to: string, revision: number) {
  const key = `${from}:${to}:${revision}`;
  const [loaded, setLoaded] = useState<{
      key: string;
      data: ReviewRange;
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const data = await getReviewRange(from, to);
      setLoaded({ key, data });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 불러오지 못했습니다.");
    }
  }, [from, to, key]);
  useEffect(() => {
    let live = true;
    getReviewRange(from, to)
      .then((data) => {
        if (live) {
          setLoaded({ key, data });
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "조회 실패");
      });
    return () => {
      live = false;
    };
  }, [from, to, key, retry]);
  return {
    data: loaded?.key === key ? loaded.data : null,
    error,
    refresh,
    retry: () => setRetry((n) => n + 1),
  };
}
function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <p role="alert">
      {message}
      <button onClick={retry}>다시 시도</button>
    </p>
  );
}
function Kpis({
  days,
  monday,
  compare = false,
}: {
  days: DayMetrics[];
  monday: string;
  compare?: boolean;
}) {
  const current = weeklyMetrics(days, monday),
    previous = weeklyMetrics(days, addDays(monday, -7));
  return (
    <div className="cr-kpis">
      {(
        [
          ["work", "통합 근무시간"],
          ["workScore", "평균 업무 점수"],
          ["mood", "평균 감정 상태"],
          ["score", "평균 하루 점수"],
        ] as const
      ).map(([key, label]) => {
        const now = current[key],
          before = previous[key];
        const comparable = now.count >= 3 && before.count === now.count;
        return (
          <div key={key}>
            <small>{label}</small>
            <strong>
              {key === "work"
                ? workDuration(now.value)
                : now.value == null
                  ? "—"
                  : `${key === "mood" ? moodEmoji(now.value) + " " : ""}${now.value.toFixed(1)}`}
            </strong>
            {compare && (
              <small>
                {comparable
                  ? `${now.value! - before.value! >= 0 ? "+" : "−"}${key === "work" ? workDuration(Math.abs(now.value! - before.value!)) : Math.abs(now.value! - before.value!).toFixed(1)} · 전주 대비`
                  : "비교 자료 부족"}{" "}
                · {now.count}/7 기록
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function CalendarMonth({
  date,
  revision,
  onDay,
  onWeek,
}: {
  date: string;
  revision: number;
  onDay: (date: string) => void;
  onWeek: (date: string) => void;
}) {
  const dates = monthDates(date),
    first = dates[0],
    last = dates.at(-1)!,
    weeks = dates.filter((_, i) => i % 7 === 0),
    range = useRange(first, last, revision),
    byDate = new Map(range.data?.days.map((d) => [d.date, d]));
  return (
    <div className="cr-month">
      {range.error && <LoadError message={range.error} retry={range.retry} />}
      <section className="cr-month-calendar" aria-label="월 캘린더">
        <div className="cr-month-head">
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div
          className="cr-month-days"
          style={{
            gridTemplateRows: `repeat(${weeks.length},minmax(95px,1fr))`,
          }}
        >
          {dates.map((d) => {
            const row = byDate.get(d);
            return (
              <button
                key={d}
                className={`${d.slice(0, 7) !== date.slice(0, 7) ? "outside " : ""}${d === date ? "selected" : ""}`}
                onClick={() => onDay(d)}
                aria-label={`${d} 일 보기`}
              >
                <span>{Number(d.slice(8))}</span>
                <strong>{workDuration(row?.workMinutes)}</strong>
                <hr />
                <small>
                  {moodEmoji(row?.reflection?.mood)}{" "}
                  <span>{row?.reflection?.score ?? "—"}</span>
                </small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="cr-month-weeks" aria-label="월 주간 회고">
        <h2>
          {Number(date.slice(0, 4))}년 {Number(date.slice(5, 7))}월 – 주간 회고
        </h2>
        {!range.data && !range.error && <p>기록 불러오는 중…</p>}
        {weeks.map((w) => {
          const review = range.data?.weeks.find((r) => r.weekStart === w);
          return (
            <article
              key={w}
              className={weekStart(date) === w ? "selected" : ""}
            >
              <button className="cr-week-open" onClick={() => onWeek(w)}>
                <strong>
                  {w.slice(5).replace("-", "/")}–
                  {addDays(w, 6).slice(5).replace("-", "/")}
                </strong>
                <span>{review ? "주간 회고 수정" : "주간 회고 작성"} →</span>
              </button>
              <Kpis days={range.data?.days ?? []} monday={w} />
              <div className="cr-week-preview">
                <b>{review?.title || "주간 회고 작성"}</b>
                <span>
                  {review?.score ?? "—"} /100 · {moodEmoji(review?.mood)}
                </span>
                <p>{review?.memo || "아직 작성한 회고가 없습니다."}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
export function CalendarWeeklyReview({
  date,
  projection,
  categories,
  revision,
  onSaved,
}: {
  date: string;
  projection: CalendarRangeResponse;
  categories: CalendarCategory[];
  revision: number;
  onSaved: () => void;
}) {
  const monday = weekStart(date),
    range = useRange(addDays(monday, -7), addDays(monday, 6), revision),
    [tab, setTab] = useState<"summary" | "pattern">("summary");
  return (
    <section className="cr-week">
      <Kpis days={range.data?.days ?? []} monday={monday} compare />
      {range.error && <LoadError message={range.error} retry={range.retry} />}
      <div className="cr-week-columns">
        <section className="cr-records">
          <header>
            <h2>이번 주 기록</h2>
            <div role="group" aria-label="주간 기록 보기">
              <button
                aria-pressed={tab === "summary"}
                onClick={() => setTab("summary")}
              >
                요약
              </button>
              <button
                aria-pressed={tab === "pattern"}
                onClick={() => setTab("pattern")}
              >
                패턴
              </button>
            </div>
          </header>
          {!range.data && !range.error && <p>기록 불러오는 중…</p>}
          {tab === "summary" ? (
            <>
              <div>
                {daysBetween(monday, addDays(monday, 6)).map((d) => {
                  const row = range.data?.days.find((r) => r.date === d);
                  return (
                    <details className="cr-day-record" key={d}>
                      <summary>
                        <span>
                          {d.slice(5).replace("-", "/")}{" "}
                          {
                            ["일", "월", "화", "수", "목", "금", "토"][
                              new Date(`${d}T00:00:00Z`).getUTCDay()
                            ]
                          }
                        </span>
                        <strong>{workDuration(row?.workMinutes)}</strong>
                        <span>{moodEmoji(row?.reflection?.mood)}</span>
                        <span>{row?.reflection?.score ?? "—"}</span>
                      </summary>
                      <h3>{row?.reflection?.title || "작성한 제목 없음"}</h3>
                      <p>
                        {row?.reflection?.memo || "작성한 메모가 없습니다."}
                      </p>
                    </details>
                  );
                })}
              </div>
              <ScoreTrend
                days={range.data?.days.filter((d) => d.date >= monday) ?? []}
              />
            </>
          ) : (
            <Pattern
              monday={monday}
              projection={projection}
              categories={categories}
            />
          )}
        </section>
        <WeeklyEditor key={monday} monday={monday} onSaved={onSaved} />
      </div>
    </section>
  );
}
function WeeklyEditor({
  monday,
  onSaved,
}: {
  monday: string;
  onSaved: () => void;
}) {
  const editor = useReviewAutosave<
    WeeklyFields,
    WeeklyFields & { version: number }
  >({
    empty: EMPTY_WEEK,
    load: async () =>
      (await getWeeklyReview(monday)) ?? { ...EMPTY_WEEK, version: -1 },
    save: (body, version) => saveWeeklyReview(monday, body, version),
    onSaved,
  });
  return (
    <section className="cr-week-editor">
      <h2>
        주간 회고{" "}
        <small>
          {monday}–{addDays(monday, 6)}
        </small>
      </h2>
      <div
        onCompositionStart={() => editor.queue.composition(true)}
        onCompositionEnd={() => editor.queue.composition(false)}
        onBlur={() => void editor.retry()}
      >
        <ReviewFields
          weekly
          value={editor.draft}
          onChange={editor.change}
          disabled={editor.loading || !editor.record}
        />
        <details className="cr-deep">
          <summary>심층 회고 (선택)</summary>
          {(
            [
              ["strengths", "잘한 점"],
              ["regrets", "아쉬운 점"],
              ["nextWeekDirection", "다음 주의 방향"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                aria-label={label}
                maxLength={50000}
                rows={3}
                value={editor.draft[key]}
                disabled={editor.loading || !editor.record}
                onChange={(e) => editor.change({ [key]: e.target.value })}
              />
            </label>
          ))}
        </details>
      </div>
      <SaveStatus {...editor} />
      {!editor.record && !editor.loading && (
        <button onClick={() => void editor.reload()}>회고 다시 불러오기</button>
      )}
    </section>
  );
}
function Pattern({
  monday,
  projection,
  categories,
}: {
  monday: string;
  projection: CalendarRangeResponse;
  categories: CalendarCategory[];
}) {
  const blocks = projection.actualBlocks.map((b) => ({ ...b, id: b.sourceId }));
  const appearance = (b: GridBlock) =>
    categoryAppearance(
      b.domainType,
      b.domainType === "WORK" ? b.activityCategoryId : b.lifeCategoryId,
      categories,
    );
  const present = categories.filter((c) =>
    blocks.some(
      (b) =>
        b.domainType === c.domain &&
        (b.domainType === "WORK" ? b.activityCategoryId : b.lifeCategoryId) ===
          c.id,
    ),
  );
  return (
    <div className="cr-pattern" aria-label="주간 Actual 패턴">
      <TimeGrid
        readOnly
        minuteScale={0.44}
        overview
        days={daysBetween(monday, addDays(monday, 6)).map(
          (d) => new Date(`${d}T00:00:00`),
        )}
        blocks={blocks}
        colorMode="ACTIVITY"
        phases={[]}
        projects={[]}
        interactionMode="actual"
        onBlockClick={() => {}}
        onBlockTimeChange={() => {}}
        appearance={appearance}
        maxHeightVh={60}
      />
      <div className="cr-legend">
        {present.map((c) => (
          <span key={`${c.domain}:${c.id}`}>
            <i
              style={{
                background: categoryAppearance(c.domain, c.id, categories).body,
              }}
            />
            {c.name}
          </span>
        ))}
      </div>
      <small>Actual 기록 · 00:00–24:00 · 읽기 전용</small>
    </div>
  );
}
function ScoreTrend({ days }: { days: DayMetrics[] }) {
  return (
    <div className="cr-trend" aria-label="하루 점수 추이">
      <small>하루 점수</small>
      <svg
        viewBox="0 0 300 70"
        role="img"
        aria-label="하루 점수 추이 · 미입력은 공백"
      >
        <path d="M12 58H288" stroke="#ddd" />
        {days.map((d, i) => {
          const score = d.reflection?.score,
            prev = days[i - 1]?.reflection?.score;
          return score == null ? null : (
            <g key={d.date}>
              {prev != null && (
                <line
                  x1={12 + (i - 1) * 46}
                  y1={58 - prev * 0.45}
                  x2={12 + i * 46}
                  y2={58 - score * 0.45}
                  stroke="#4b7cbd"
                />
              )}
              <circle
                cx={12 + i * 46}
                cy={58 - score * 0.45}
                r={3}
                fill="#4b7cbd"
              >
                <title>
                  {d.date}: {score}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
