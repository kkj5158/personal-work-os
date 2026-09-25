"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { DietStore } from "@/lib/diet/types";
import { addDays, today } from "@/lib/diet/model";
import { challengesOn, checklistOn } from "@/lib/diet/day";
import { DailyNoteAutosave, dailyNotesApi, type SaveState } from "@/lib/diet/dailyNote";

const roleNames = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };
const stateNames = { SUCCESS: "성공", FAILURE: "실패", UNRECORDED: "기록 못함", MISSING: "미입력" };
const saveLabels: Record<SaveState, string> = { idle: "", dirty: "입력 중…", saving: "저장 중…", saved: "저장됨", error: "저장 실패", conflict: "다른 곳에서 변경됨" };
const weekday = (date: string) => ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00`).getDay()];
const value = (n: number | null | undefined, unit: string) => n == null ? "—" : `${n} ${unit}`;

/**
 * Selected-date detail for the Planner: canonical measurements and checklist for
 * the date, the Challenge context derived from the date, and the one Diet Daily
 * Note for the date (autosaved). The note never belongs to a Challenge.
 */
export default function DayPanel({ date, store, onSelect, onNoteChange }: { date: string; store: DietStore; onSelect: (date: string) => void; onNoteChange: (date: string, hasText: boolean) => void }) {
  const { data } = store;
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [generation, setGeneration] = useState(0);
  const saver = useRef<DailyNoteAutosave | null>(null);
  const noteSaved = useEffectEvent((saved: string, hasText: boolean) => onNoteChange(saved, hasText));

  // The parent keys this panel by date, so each date mounts with fresh state.
  useEffect(() => {
    let live = true;
    dailyNotesApi.get(date).then(note => {
      if (!live) return;
      setText(note.content);
      setLoadError("");
      setState("idle");
      saver.current = new DailyNoteAutosave(date, note.version, dailyNotesApi.save, (next, saved) => {
        setState(next);
        if (saved) noteSaved(saved.date, saved.content.trim() !== "");
      });
      setLoaded(true);
    }).catch(e => { if (live) setLoadError(e instanceof Error ? e.message : "노트를 불러오지 못했습니다."); });
    return () => {
      live = false;
      // Leaving a date flushes its pending text; the next date starts clean.
      const previous = saver.current;
      saver.current = null;
      if (previous) { void previous.flush().catch(() => {}); previous.dispose(); }
    };
  }, [date, generation]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (saver.current?.dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const day = data.days.find(d => d.date === date);
  const future = date > today();
  const checklist = checklistOn(date, data);
  const focus = challengesOn(date, data.challenges);
  // Conflict/failed load: drop local pending text and read the newest note.
  const reload = () => { saver.current?.dispose(); saver.current = null; setGeneration(g => g + 1); };

  return <section className="dp-panel dp-day" aria-label="선택한 날짜">
    <div className="dp-toolbar">
      <div className="dp-actions"><button aria-label="이전 날짜" onClick={() => onSelect(addDays(date, -1))}>‹</button><h2>{date} ({weekday(date)})</h2><button aria-label="다음 날짜" onClick={() => onSelect(addDays(date, 1))}>›</button>{date !== today() && <button onClick={() => onSelect(today())}>오늘</button>}</div>
      <span className={`dp-save dp-save-${state}`} aria-live="polite">{saveLabels[state]}{(state === "error") && <button onClick={() => void saver.current?.retry()}>다시 시도</button>}{state === "conflict" && <button onClick={reload}>최신 불러오기</button>}</span>
    </div>
    <div className="dp-day-grid">
      <div className="dp-day-summary">
        <h3>챌린지 / 포커스</h3>
        {focus.length ? <ul className="dp-day-focus">{focus.map(c => <li key={c.id} style={{ borderLeftColor: c.color }}><small>{roleNames[c.role]}</small><strong>{c.title}</strong><small>{c.startDate} – {c.endDate}{c.keyPoint ? ` · ${c.keyPoint}` : ""}</small></li>)}</ul> : <p className="dp-hint">이 날짜에 해당하는 챌린지가 없습니다.</p>}
        <h3>측정</h3>
        {future ? <p className="dp-hint">미래 날짜에는 실제 기록을 표시하지 않습니다.</p> : <table className="dp-day-measure"><thead><tr><th /><th>아침</th><th>취침 전</th></tr></thead><tbody>
          <tr><th>체중</th><td>{value(day?.morningWeight, "kg")}</td><td>—</td></tr>
          <tr><th>혈당</th><td>{value(day?.morningGlucose, "mg/dL")}</td><td>{value(day?.bedtimeGlucose, "mg/dL")}</td></tr>
          <tr><th>혈중 케톤</th><td>{value(day?.morningBloodKetone, "mmol/L")}</td><td>{value(day?.bedtimeBloodKetone, "mmol/L")}</td></tr>
          <tr><th>호흡 케톤</th><td>{value(day?.morningBreathKetone, "ppm")}</td><td>{value(day?.bedtimeBreathKetone, "ppm")}</td></tr>
        </tbody></table>}
        <h3>체크리스트 {checklist.total > 0 && <small>{checklist.success}/{checklist.total} 성공{checklist.unrecorded ? ` · 기록 못함 ${checklist.unrecorded}` : ""}</small>}</h3>
        {checklist.total ? <ul className="dp-day-checks">{checklist.rows.map(r => <li key={r.item.id} className={`dp-check-${r.state.toLowerCase()}`}><span>{r.item.title}</span><small>{stateNames[r.state]}</small></li>)}</ul> : <p className="dp-hint">이 날짜의 체크리스트 항목이 없습니다.</p>}
      </div>
      <div className="dp-day-note">
        <h3>데일리 노트</h3>
        {loadError ? <p className="dp-error" role="alert">{loadError} <button onClick={reload}>다시 시도</button></p> :
          <textarea aria-label={`${date} 데일리 노트`} disabled={!loaded} value={text} maxLength={20000} placeholder={loaded ? "오늘의 식단, 컨디션, 조정한 점을 자유롭게 기록하세요." : "불러오는 중…"}
            onChange={e => { setText(e.target.value); saver.current?.edit(e.target.value); }} onBlur={() => void saver.current?.flush().catch(() => {})} />}
      </div>
    </div>
  </section>;
}
