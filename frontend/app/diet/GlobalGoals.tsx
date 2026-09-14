"use client";

import { useState } from "react";
import type { DietStore, WeightGoal } from "@/lib/diet/types";
import { display, goalFor, today } from "@/lib/diet/model";
import BulletEditor from "./BulletEditor";

export const goalNames = { SHORT_TERM: "단기 목표", WEEKLY: "주 목표", MONTHLY: "월 목표", FINAL: "최종 목표" };

export default function GlobalGoals({ store }: { store: DietStore }) {
  const [draft, setDraft] = useState<WeightGoal | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const edit = (goal: WeightGoal) => { setError(""); setDraft({ ...goal, memoItems: [...goal.memoItems] }); };
  const add = (kind: WeightGoal["kind"]) => edit({ id: crypto.randomUUID(), kind, targetDate: today(), targetWeight: goalFor(store.data, kind)?.targetWeight ?? 0, core: "", memoItems: [] });
  return <section className="dp-panel dp-global-goals" aria-label="공유 체중 목표 관리">
    <h2>공유 체중 목표</h2><p className="dp-hint">홈 · 플래너 · 통계에서 함께 사용합니다. 새 날짜의 목표는 추가하여 이전 기록을 보존하세요.</p>
    <div className="dp-global-grid">{(Object.keys(goalNames) as WeightGoal["kind"][]).map(kind => {
      const current = goalFor(store.data, kind);
      const history = store.data.goals.filter(g => g.kind === kind).sort((a, b) => b.targetDate.localeCompare(a.targetDate));
      return <div key={kind} className={`dp-global-goal ${kind === "SHORT_TERM" ? "short-term" : ""}`}><h3>{goalNames[kind]}</h3>
        <strong>{current ? `${display(current.targetWeight)}kg` : "미설정"}</strong><small>{current?.targetDate}</small>
        {current?.core && <p>{current.core}</p>}{!!current?.memoItems.length && <ul className="dp-bullets">{current.memoItems.map((memo, i) => <li key={i}>{memo}</li>)}</ul>}
        <div className="dp-actions">{current && <button onClick={() => edit(current)}>{goalNames[kind]} 수정</button>}<button onClick={() => add(kind)}>+ 목표 추가</button></div>
        {!!history.length && <details><summary>기록 / 계획 {history.length}</summary>{history.map(goal => <div className="dp-goal-history" key={goal.id}><span>{goal.targetDate} · {display(goal.targetWeight)}kg<small>{goal.core}</small></span><button onClick={() => edit(goal)} aria-label={`${goalNames[kind]} ${goal.targetDate} 수정`}>수정</button></div>)}</details>}
      </div>;
    })}</div>
    {draft && <div className="dp-modal-backdrop" onClick={() => setDraft(null)}><section className="dp-modal dp-modal-small" role="dialog" aria-modal="true" aria-labelledby="dp-global-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") setDraft(null); }}>
      <div className="dp-toolbar"><h2 id="dp-global-title">{goalNames[draft.kind]} {store.data.goals.some(g => g.id === draft.id) ? "수정" : "추가"}</h2><button aria-label="닫기" onClick={() => setDraft(null)}>×</button></div>
      <form onSubmit={async e => { e.preventDefault(); setError(""); setSaving(true); try { const fields = new FormData(e.currentTarget); await store.save("goals", { ...draft, targetDate: String(fields.get("targetDate")), core: draft.core.trim(), memoItems: draft.memoItems.map(item => item.trim()).filter(Boolean) }); setDraft(null); } catch (e) { setError(e instanceof Error ? e.message : "목표 저장 실패"); } finally { setSaving(false); } }}>
        <label>목표 체중 (kg)<input autoFocus required type="number" min="0.1" step="0.1" value={draft.targetWeight || ""} onChange={e => setDraft({ ...draft, targetWeight: Number(e.target.value) })} /></label>
        <label>목표 날짜<input name="targetDate" required type="date" defaultValue={draft.targetDate} /></label>
        <label>핵심<input value={draft.core} onChange={e => setDraft({ ...draft, core: e.target.value })} /></label>
        <BulletEditor value={draft.memoItems} onChange={memoItems => setDraft({ ...draft, memoItems })} />
        {error && <p className="dp-error" role="alert">{error}</p>}<div className="dp-modal-actions"><button type="button" onClick={() => setDraft(null)}>취소</button><button className="primary" disabled={saving || store.busy}>{saving ? "저장 중…" : "저장"}</button></div>
      </form>
    </section></div>}
  </section>;
}
