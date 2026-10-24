"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { dailyReflectionTransport } from "@/lib/api/reflections";
import { DAILY_MOODS, DailyReflectionSession } from "@/lib/notes/dailyReflection";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import "./dailyReflection.css";

// Memory-only recovery: private annotation text never enters browser storage.
// Queues outlive a date/view change and remain bound to the original account.
const sessions = new Map<string, DailyReflectionSession>();
function sessionFor(owner: string, date: string) {
  const key = `${owner}:${date}`;
  let session = sessions.get(key);
  if (!session) { session = new DailyReflectionSession(dailyReflectionTransport(date, owner)); sessions.set(key, session); }
  return session;
}
function ownerSessions(owner: string) { return [...sessions].filter(([key]) => key.startsWith(`${owner}:`)).map(([, session]) => session); }

/** Date-owned reflection, independent of the Calendar Actual/Plan filter. */
export function DailyReflection({ dates, view = dates.length === 1 ? "day" : "week", register }: { dates: string[]; view?: "day" | "week"; register?: (flush: () => Promise<void>) => () => void }) {
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const client = createSupabaseBrowserClient();
    let active = true;
    if (!client) { setOwner("dev"); return; }
    void client.auth.getSession().then(({ data }) => { if (active) setOwner(data.session?.user.id ?? null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (active) setOwner(session?.user.id ?? null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => register?.(async () => {
    if (owner) await Promise.all(ownerSessions(owner).map(session => session.flush()));
  }), [owner, register]);
  useEffect(() => {
    if (!owner) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (ownerSessions(owner).some(session => session.dirty())) { event.preventDefault(); event.returnValue = ""; }
    };
    const online = () => { ownerSessions(owner).forEach(session => { void session.flush().catch(() => {}); }); };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("online", online); };
  }, [owner]);
  return <section className={`daily-reflections daily-reflections--${view}`} aria-label="날짜별 하루 회고">
    <div className="daily-reflections__label">하루 회고</div>
    <div className="daily-reflections__cells" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
      {dates.map(date => owner ? <DailyCell key={`${owner}:${date}`} date={date} session={sessionFor(owner, date)} />
        : <div className="daily-reflection" key={date}>불러오는 중…</div>)}
    </div>
  </section>;
}

function DailyCell({ date, session }: { date: string; session: DailyReflectionSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [editing, setEditing] = useState(false);
  const [scoreError, setScoreError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { if (editing && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [editing]);
  useEffect(() => {
    void session.load();
    return () => { void session.flush().catch(() => {}); };
  }, [session]);
  const mood = DAILY_MOODS.find(mood => mood.level === state.value.moodLevel);
  const status = state.state === "saving" ? "저장 중…" : state.state === "pending" ? "저장 대기" : state.state === "error" ? "저장 오류" : state.state === "loading" ? "불러오는 중…" : "저장됨";
  const close = async () => { try { await session.flush(); setEditing(false); } catch { /* preserve editor */ } };
  return <div className={`daily-reflection${editing ? " daily-reflection--editing" : ""}`}>
    <button type="button" className="daily-reflection__summary" aria-label={`${date} 하루 회고 편집`} aria-expanded={editing} onClick={() => { if (editing) void close(); else setEditing(true); }} disabled={state.state === "loading"}>
      <span className="daily-reflection__title">{state.value.title || "하루 회고 남기기"}</span>
      <span className="daily-reflection__metrics">{state.value.dayScore !== null ? `${state.value.dayScore}/100` : "—/100"} <span title={mood?.label}>{mood?.emoji ?? "○"}</span></span>
      <span className="daily-reflection__memo">{state.value.memo || "제목 · 점수 · 기분 · 메모"}</span>
    </button>
    <span className={`daily-reflection__status${state.state === "error" ? " is-error" : ""}`} role="status">{status}</span>
    {state.state === "error" && <div className="daily-reflection__error" role="alert">{state.error}<button type="button" onClick={() => { void session.retry(state.conflict).catch(() => {}); }}>{state.conflict ? "내 입력으로 다시 저장" : "다시 시도"}</button></div>}
    {editing && <dialog ref={dialog} className="daily-reflection__editor" aria-label={`${date} 하루 회고 입력`} onCancel={event => { event.preventDefault(); void close(); }}>
      <div className="daily-reflection__editor-header"><strong>{date} 하루 회고</strong><button type="button" onClick={() => { void close(); }}>닫기</button></div>
      <label htmlFor={`${id}-title`}>한 줄 제목</label>
      <input autoFocus id={`${id}-title`} value={state.value.title ?? ""} maxLength={100} placeholder="오늘을 한 줄로" onChange={event => session.set("title", event.target.value || null)} onCompositionStart={() => session.composition(true)} onCompositionEnd={() => session.composition(false)} />
      <div className="daily-reflection__score-mood">
        <label>하루 점수 <span className="daily-reflection__score-input"><input aria-label={`${date} 하루 점수`} type="number" min={0} max={100} step={1} value={state.value.dayScore ?? ""} aria-invalid={scoreError} onChange={event => {
          const raw = event.target.value;
          const valid = raw === "" || (Number.isInteger(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100);
          setScoreError(!valid);
          if (valid) session.set("dayScore", raw === "" ? null : Number(raw), true);
        }} /> /100</span></label>
        <div className="daily-reflection__moods" role="group" aria-label="오늘의 기분">
          {DAILY_MOODS.map(mood => <button key={mood.level} type="button" title={mood.label} aria-label={mood.label} aria-pressed={state.value.moodLevel === mood.level} onClick={() => session.set("moodLevel", state.value.moodLevel === mood.level ? null : mood.level, true)}>{mood.emoji}{state.value.moodLevel === mood.level && <span className="daily-reflection__selected" aria-hidden="true">✓</span>}</button>)}
          <button className="daily-reflection__clear" type="button" aria-label="기분 선택 지우기" onClick={() => session.set("moodLevel", null, true)}>지우기</button>
        </div>
      </div>
      {scoreError && <span role="alert">0부터 100 사이의 정수를 입력하세요.</span>}
      <label htmlFor={`${id}-memo`}>메모</label>
      <textarea id={`${id}-memo`} rows={4} maxLength={10000} value={state.value.memo ?? ""} placeholder="오늘의 기억, 배운 점, 내일을 위한 메모" onChange={event => session.set("memo", event.target.value || null)} onCompositionStart={() => session.composition(true)} onCompositionEnd={() => session.composition(false)} />
      <small>제목 100자 · 메모 10,000자 · 자동 저장</small>
    </dialog>}
  </div>;
}
