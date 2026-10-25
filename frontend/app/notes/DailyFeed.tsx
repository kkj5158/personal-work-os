"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { validLocalDate } from "@/lib/localDateBridge";
import { dailyHubUrl } from "@/lib/notes/dailyHub";
import { useRouter } from "next/navigation";
import { notesApi } from "@/lib/api/notes";
import { dateLabel, emptyDaily, shiftDate, today } from "@/lib/notes/model";
import { publishEntityChange, subscribeEntityChanges } from "@/lib/windowSync";
import type { Note, Summary, Workspace } from "@/lib/notes/types";
import { Modal } from "@/components/ui/Modal";
import { NoteEditor } from "./editor/NoteEditor";
import { OperationalNotes } from "./OperationalNotes";
import { useNoteEnvironment } from "./NoteContext";

export function DailyFeed({ workspace, end, jump, flush }: {
  workspace: Workspace; end: string; jump: (date: string) => void; flush: () => Promise<void>;
}) {
  const env = useNoteEnvironment(), router = useRouter();
  const envRef = useRef(env); useLayoutEffect(() => { envRef.current = env; }, [env]);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Summary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const selectionSequence = useRef(0), listSequence = useRef(0), dailySequence = useRef(0);
  const readonly = !!workspace.archivedAt;
  const reload = useCallback(async () => {
    const sequence = ++listSequence.current;
    try {
      const result = await notesApi.operationalNotes(workspace.id);
      if (sequence !== listSequence.current) return;
      setRows(result); setListError("");
    } catch (error) {
      if (sequence === listSequence.current) setListError(error instanceof Error ? error.message : "운영 노트를 불러오지 못했습니다.");
    } finally { if (sequence === listSequence.current) setListLoading(false); }
  }, [workspace.id]);
  useEffect(() => { let gone = false; void Promise.resolve().then(() => { if (!gone) return reload(); }); return () => { gone = true; }; }, [reload]);
  useEffect(() => subscribeEntityChanges(event => {
    if (event.entityType === "note" || (event.entityType === "operational-note-order" && event.entityId === workspace.id)) void reload();
  }), [reload, workspace.id]);
  useEffect(() => {
    const focus = () => void reload(); window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  useEffect(() => {
    dailySequence.current++;
    let gone = false; void Promise.resolve().then(() => { if (!gone) setLoading(true); });
    notesApi.daily(workspace.id, end).then(result => {
      if (gone) return;
      const days = Array.from({ length: 14 }, (_, i) => shiftDate(end, -i));
      const mapped = Object.fromEntries(result.map(note => [note.journalDate!, note]));
      for (const date of days) if (!mapped[date]) mapped[date] = emptyDaily(workspace.id, date);
      setNotes(mapped); setDates(days);
    }).catch(error => { if (!gone) envRef.current.error(error); }).finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [workspace.id, end]);
  async function more() {
    if (!dates.length || busy) return;
    const sequence = dailySequence.current;
    setBusy(true);
    try {
      const nextEnd = shiftDate(dates[dates.length - 1], -1);
      const result = await notesApi.daily(workspace.id, nextEnd);
      if (sequence !== dailySequence.current) return;
      const days = Array.from({ length: 14 }, (_, i) => shiftDate(nextEnd, -i));
      setDates(previous => [...previous, ...days]);
      setNotes(previous => {
        const next = { ...previous, ...Object.fromEntries(result.map(note => [note.journalDate!, note])) };
        for (const date of days) if (!next[date]) next[date] = emptyDaily(workspace.id, date);
        return next;
      });
    } catch (error) { env.error(error); } finally { setBusy(false); }
  }
  async function select(id: string | null) {
    if (busy) return;
    const sequence = ++selectionSequence.current; setBusy(true);
    try {
      await flush();
      if (!id || selected?.id === id) { setSelected(null); return; }
      const note = await notesApi.note(workspace.id, id);
      if (sequence === selectionSequence.current) {
        if (note.deletedAt) throw new Error("휴지통으로 이동한 노트입니다. 목록을 새로고침하세요.");
        setSelected(note);
      }
    } catch (error) { env.error(error); } finally { if (sequence === selectionSequence.current) setBusy(false); }
  }
  async function create() {
    if (busy || readonly || !name.trim()) return;
    setBusy(true); setCreateError("");
    try {
      await flush();
      const note = await notesApi.save(workspace.id, { id: crypto.randomUUID(), journalDate: null, title: name.trim(), content: "", version: 0 });
      if (!note) throw new Error("운영 노트를 만들지 못했습니다.");
      setSelected(note); setCreateOpen(false); setName(""); await reload(); env.changed();
    } catch (error) { setCreateError(error instanceof Error ? error.message : "운영 노트를 만들지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function reorder(next: Summary[]) {
    if (busy || readonly) return;
    const previous = rows; setRows(next); setBusy(true); setListError("");
    try {
      const saved = await notesApi.reorderOperationalNotes(workspace.id, next.map(n => n.id), previous.map(n => n.id));
      setRows(saved); publishEntityChange({ entityType: "operational-note-order", entityId: workspace.id, revision: Date.now() });
    } catch (error) {
      setRows(previous); setListError(error instanceof Error ? error.message : "순서 저장에 실패했습니다. 이전 순서로 복원했습니다.");
    } finally { setBusy(false); }
  }
  function operationalSaved(note: Note) {
    if (note.deletedAt) { setSelected(null); void reload(); }
    else { setSelected(note); setRows(previous => previous.map(row => row.id === note.id ? { ...row, title: note.title, updatedAt: note.updatedAt } : row)); }
  }
  const daily = notes[end];
  return <div className="daily-layout note-comparison-layout">
    <aside className="daily-index" aria-label="데일리 노트 날짜 목록">
      <h2>데일리 노트</h2>
      <button type="button" className="primary" onClick={() => jump(today())}>+ 오늘 노트 작성</button>
      <p className="note-muted">{end.slice(0, 7).replace("-", "년 ")}월</p>
      {dates.map(date => <a key={date} href={`?date=${date}`} aria-current={date === end ? "date" : undefined} className={date === end ? "selected" : ""} onClick={event => { event.preventDefault(); if (date !== end) jump(date); }}><strong>{date.slice(5)}</strong><small>{notes[date]?.createdAt && notes[date]?.content.trim() ? "● 기록 있음" : "기록 없음"}</small></a>)}
      <button type="button" className="load-history" disabled={loading || busy} onClick={() => void more()}>이전 14일 더 보기 ↓</button>
    </aside>
    <div className={`daily-workspace${selected ? " comparing" : ""}`} aria-label={selected ? "데일리 노트와 운영 노트 비교" : "데일리 노트 작업 공간"}>
      <section className="daily-pane" aria-label="선택한 데일리 노트">
        <div className="module-tools daily-comparison-tools"><h1>{dateLabel(end)}</h1><button type="button" onClick={() => jump(today())}>오늘</button><input type="date" aria-label="날짜로 이동" value={end} onChange={event => { if (validLocalDate(event.target.value)) jump(event.target.value); }}/><button type="button" aria-label="전날" onClick={() => jump(shiftDate(end, -1))}>‹</button><button type="button" aria-label="다음날" onClick={() => jump(shiftDate(end, 1))}>›</button></div>
        {loading ? <p className="note-empty">기록 불러오는 중…</p> : daily ? <article className="daily-note" id={`day-${end}`}>
          <NoteEditor key={daily.id} initial={daily} compact readonly={readonly} onSaved={note => setNotes(previous => ({ ...previous, [end]: note }))}/>
          <footer className="daily-related-links"><a href={dailyHubUrl(end)} onClick={event => { event.preventDefault(); if (env.navigate) env.navigate(dailyHubUrl(end)); else void flush().then(() => router.push(dailyHubUrl(end))).catch(env.error); }}>데일리 허브에서 보기 ↗</a><a href={`/worklog?date=${end}`} onClick={event => { event.preventDefault(); if (env.navigate) env.navigate(`/worklog?date=${end}`); else void flush().then(() => router.push(`/worklog?date=${end}`)).catch(env.error); }}>WORK_OS 이 날짜 보기 ↗</a></footer>
        </article> : <p className="note-empty">기록을 불러오지 못했습니다. 날짜를 다시 선택하세요.</p>}
      </section>
      {selected && <section className="operational-pane" aria-label="선택한 운영 노트"><header className="operational-pane-heading"><strong>운영 노트</strong><button type="button" aria-label="운영 노트 닫기" disabled={busy} onClick={() => void select(null)}>×</button></header><NoteEditor key={selected.id} initial={selected} readonly={readonly} bodyLabel={`${selected.title} 운영 노트 본문`} onSaved={operationalSaved}/></section>}
    </div>
    <OperationalNotes rows={rows} selectedId={selected?.id ?? null} loading={listLoading} busy={busy} readonly={readonly} error={listError} onSelect={id => void select(id)} onCreate={() => { setName(""); setCreateError(""); setCreateOpen(true); }} onReorder={next => void reorder(next)} onReload={() => void reload()}/>
    <Modal open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title="새 운영 노트">
      <form className="operational-create" onSubmit={event => { event.preventDefault(); void create(); }}><label>노트 제목<input autoFocus required maxLength={240} value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label>{createError && <p className="note-error" role="alert">{createError}</p>}<p className="note-muted">일지와 별도로 보관할 원칙과 계획을 작성합니다. 기존 노트의 제목·별칭과 같은 이름은 사용할 수 없습니다.</p><div><button type="button" disabled={busy} onClick={() => setCreateOpen(false)}>취소</button><button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? "만드는 중…" : "만들기"}</button></div></form>
    </Modal>
  </div>;
}
