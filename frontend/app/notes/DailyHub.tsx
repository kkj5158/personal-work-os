"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { notesApi } from "@/lib/api/notes";
import { dailyHubUrl, hasDailyContent, type DailyHubRecord } from "@/lib/notes/dailyHub";
import { dateLabel, emptyDaily, shiftDate, today } from "@/lib/notes/model";
import { validLocalDate } from "@/lib/localDateBridge";
import type { Note, Workspace } from "@/lib/notes/types";
import { NoteContext, useNoteEnvironment } from "./NoteContext";
import { NoteEditor } from "./editor/NoteEditor";
import { workspaceIcon } from "./WorkspaceIconPicker";

export function DailyHub({ workspaces, date, jump, flush, openOriginal, openWiki, settings, recent, scrollTarget }: {
  workspaces: Workspace[]; date: string; jump: (date: string) => void; flush: () => Promise<void>;
  openOriginal: (workspace: string) => void; openWiki: (workspace: string, title: string) => void;
  settings: () => void; recent: boolean; scrollTarget: { id: string; tick: number } | null;
}) {
  const env = useNoteEnvironment();
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [records, setRecords] = useState<DailyHubRecord[]>([]), [recentRecords, setRecentRecords] = useState<DailyHubRecord[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const membership = useRef(workspaces);
  // Membership/date changes remount this view. Workspace reordering preserves editor instances.
  useEffect(() => {
    let gone = false;
    Promise.all([notesApi.dailyHub(date), notesApi.dailyHubRecords(date), notesApi.dailyHubRecent()]).then(([rows, counts, latest]) => {
      if (gone) return;
      setNotes(Object.fromEntries(membership.current.map(w => [w.id, rows.find(n => n.workspaceId === w.id) ?? emptyDaily(w.id, date)])));
      setRecords(counts); setRecentRecords(latest); setError("");
    }).catch(e => { if (!gone) setError(e instanceof Error ? e.message : "기록을 불러오지 못했습니다."); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [date, retry]);
  useEffect(() => {
    if (!scrollTarget || loading) return;
    const frame = requestAnimationFrame(() => {
      setCollapsed(previous => { const next = new Set(previous); next.delete(scrollTarget.id); return next; });
      document.getElementById(`hub-workspace-${scrollTarget.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, loading]);
  const selectedCount = Object.values(notes).filter(n => hasDailyContent(n.content)).length;
  const dates = Array.from({ length: 14 }, (_, i) => shiftDate(date, -i));
  const count = (d: string) => d === date && !loading ? selectedCount : records.find(r => r.date === d)?.workspaceCount ?? 0;
  function recordLink(d: string, amount: number) {
    return <a key={d} href={dailyHubUrl(d)} className={d === date ? "selected" : ""} aria-current={d === date ? "date" : undefined} onClick={e => { e.preventDefault(); jump(d); }}><strong>{d.slice(5)}</strong><small>{amount ? `${amount}개 기록` : "기록 없음"}</small></a>;
  }
  return <div className={`daily-layout daily-hub-layout ${recent ? "show-recent" : ""}`}>
    <aside className="daily-index">
      <h2>{recent ? "최근 기록" : "데일리 허브"}</h2>
      <button className="primary" onClick={() => jump(today())}>오늘</button>
      <p className="note-muted">{recent ? "기록이 있는 최근 날짜" : date.slice(0, 7)}</p>
      {recent ? recentRecords.map(r => recordLink(r.date, r.date === date ? selectedCount : r.workspaceCount)) : dates.map(d => recordLink(d, count(d)))}
      {recent && !recentRecords.length && !loading && <p className="note-muted">아직 기록이 없습니다.</p>}
      {!recent && <button onClick={() => jump(shiftDate(date, -14))}>이전 14일 ↓</button>}
    </aside>
    <section className="daily-feed daily-hub-feed">
      <div className="module-tools daily-hub-tools"><h1>데일리 허브</h1>
        <button aria-label="이전 날짜" onClick={() => jump(shiftDate(date, -1))}>←</button>
        <button aria-label="다음 날짜" onClick={() => jump(shiftDate(date, 1))}>→</button>
        <button onClick={() => jump(today())}>오늘</button>
        <form className="daily-date-jump" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget).get("date"); if (typeof d === "string" && validLocalDate(d)) jump(d); }}>
          <input type="date" name="date" aria-label="날짜로 이동" defaultValue={date} required/><button>이동</button>
        </form>
      </div>
      <header className="daily-hub-date"><h2>{dateLabel(date)}</h2><a href={`/worklog?date=${date}`} onClick={e => { e.preventDefault(); if (env.navigate) env.navigate(`/worklog?date=${date}`); else void flush().then(() => router.push(`/worklog?date=${date}`)).catch(env.error); }}>WORK OS — 이 날짜 보기 ↗</a></header>
      {loading ? <p className="note-empty">기록 불러오는 중…</p> : error ? <div className="note-warning" role="alert">{error}<button onClick={() => { setLoading(true); setRetry(n => n + 1); }}>다시 시도</button></div> : !workspaces.length ? <div className="note-empty"><p>포함된 Workspace가 없습니다.</p><button onClick={settings}>데일리 허브 설정</button></div> : workspaces.map(w => {
        const note = notes[w.id];
        if (!note) return null;
        return <article className="daily-note daily-hub-section" id={`hub-workspace-${w.id}`} key={w.id}>
          <header><button className="daily-hub-collapse" aria-expanded={!collapsed.has(w.id)} aria-controls={`hub-editor-${w.id}`} onClick={() => { void flush().then(() => setCollapsed(previous => { const next = new Set(previous); if (next.has(w.id)) next.delete(w.id); else next.add(w.id); return next; })).catch(env.error); }}>
            {collapsed.has(w.id) ? <ChevronRight size={17}/> : <ChevronDown size={17}/>}<span>{workspaceIcon(w.icon)}</span><h2>{w.name}</h2>
          </button><a href={`/notes?workspace=${w.id}&module=DAILY_NOTES&date=${date}`} onClick={e => { e.preventDefault(); openOriginal(w.id); }}>원본 열기 ↗</a></header>
          <div id={`hub-editor-${w.id}`} hidden={collapsed.has(w.id)}>
            {!note.createdAt && <p className="note-muted">아직 기록이 없습니다. 이 날짜의 노트를 작성해 보세요.</p>}
            <NoteContext.Provider value={{ ...env, workspace: w.id, openWiki: title => openWiki(w.id, title) }}>
              <NoteEditor initial={note} compact bodyLabel={`${w.name} · ${date} 노트 본문`} onSaved={saved => {
                setNotes(previous => ({ ...previous, [w.id]: saved }));
                void notesApi.dailyHubRecent().then(setRecentRecords).catch(env.error);
              }}/>
            </NoteContext.Provider>
          </div>
        </article>;
      })}
    </section>
  </div>;
}
