"use client";
import { useEffect, useState } from "react";
import { validLocalDate } from "@/lib/localDateBridge";
import { notesApi } from "@/lib/api/notes";
import { dateLabel, emptyDaily, shiftDate, today } from "@/lib/notes/model";
import type { Note, Workspace } from "@/lib/notes/types";
import { NoteEditor } from "./editor/NoteEditor";
import { useNoteEnvironment } from "./NoteContext";
export function DailyFeed({
  workspace,
  end,
  jump,
  flush,
}: {
  workspace: Workspace;
  end: string;
  jump: (date: string) => void;
  flush: () => Promise<void>;
}) {
  const env = useNoteEnvironment();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([end]));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let gone = false;
    setLoading(true);
    notesApi
      .daily(workspace.id, end)
      .then((rows) => {
        if (gone) return;
        const days = Array.from({ length: 14 }, (_, i) => shiftDate(end, -i));
        const mapped = Object.fromEntries(rows.map((n) => [n.journalDate!, n]));
        for (const d of days)
          if (!mapped[d]) mapped[d] = emptyDaily(workspace.id, d);
        setNotes(mapped);
        setDates(days);
        setExpanded(
          new Set([
            end,
            ...rows.filter((n) => n.content.trim()).map((n) => n.journalDate!),
          ]),
        );
      })
      .catch(env.error)
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [workspace.id, end]);
  async function more() {
    try {
      await flush();
      const nextEnd = shiftDate(dates[dates.length - 1], -1);
      const rows = await notesApi.daily(workspace.id, nextEnd);
      const days = Array.from({ length: 14 }, (_, i) => shiftDate(nextEnd, -i));
      const all = [...dates, ...days];
      const keep = all.slice(-42);
      const mapped = {
        ...notes,
        ...Object.fromEntries(rows.map((n) => [n.journalDate!, n])),
      };
      for (const d of days)
        if (!mapped[d]) mapped[d] = emptyDaily(workspace.id, d);
      setDates(keep);
      setNotes(Object.fromEntries(keep.map((d) => [d, mapped[d]])));
      setExpanded(
        (previous) =>
          new Set([
            ...previous,
            ...rows.filter((n) => n.content.trim()).map((n) => n.journalDate!),
          ]),
      );
    } catch (e) {
      env.error(e);
    }
  }
  return (
    <div className="daily-layout">
      <aside className="daily-index">
        <h2>데일리 노트</h2>
        <button className="primary" onClick={() => jump(today())}>
          + 오늘 노트 작성
        </button>
        <p className="note-muted">{end.slice(0, 7).replace("-", "년 ")}월</p>
        {dates.map((date) => (
          <a
            key={date}
            href={`#day-${date}`}
            className={date === end ? "selected" : ""}
          >
            <strong>{date.slice(5)}</strong>
            <small>
              {notes[date]?.content.trim() ? "● 기록 있음" : "기록 없음"}
            </small>
          </a>
        ))}
      </aside>
      <section className="daily-feed">
        <div className="module-tools">
          <h1>데일리 노트</h1>
          <button onClick={() => jump(today())}>오늘</button>
          <form
            className="daily-date-jump"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("date");
              if (typeof value === "string" && validLocalDate(value))
                jump(value);
            }}
          >
            <input
              type="date"
              name="date"
              aria-label="날짜로 이동"
              defaultValue={end}
              required
            />
            <button type="submit">이동</button>
          </form>
        </div>
        {loading ? (
          <p className="note-empty">기록 불러오는 중…</p>
        ) : (
          dates.map((date) => (
            <article id={`day-${date}`} className="daily-note" key={date}>
              <header>
                <h2>{dateLabel(date)}</h2>
                <a
                  href={`/worklog?date=${date}`}
                  onClick={(e) => {
                    e.preventDefault();
                    void flush()
                      .then(() => {
                        window.location.assign(`/worklog?date=${date}`);
                      })
                      .catch(env.error);
                  }}
                >
                  WORK_OS 이 날짜 보기 ↗
                </a>
              </header>
              {expanded.has(date) ? (
                <NoteEditor
                  key={notes[date].id}
                  initial={notes[date]}
                  compact
                  readonly={!!workspace.archivedAt}
                  onSaved={(n) =>
                    setNotes((previous) => ({ ...previous, [date]: n }))
                  }
                />
              ) : (
                <button
                  className="empty-day"
                  disabled={!!workspace.archivedAt}
                  onClick={() =>
                    setExpanded((previous) => new Set([...previous, date]))
                  }
                >
                  기록 없음 · 클릭하여 작성
                </button>
              )}
            </article>
          ))
        )}
        <button
          className="load-history"
          onClick={() => void more()}
          disabled={loading}
        >
          이전 14일 더 보기 ↓
        </button>
      </section>
      <aside className="daily-aside">
        <div className="note-panel">
          <h3>기록의 공간</h3>
          <p className="note-muted">
            하루의 생각을 기록하고
            <br />
            [[노트 제목]]으로 연결하세요.
          </p>
          <p>오늘 · {today()}</p>
        </div>
        <div className="note-panel">
          <h3>키보드</h3>
          <p>Ctrl / ⌘ K · 전체 검색</p>
          <p>Ctrl / ⌘ F · 현재 노트 검색</p>
          <p>[[ · Wiki Link</p>
        </div>
      </aside>
    </div>
  );
}
