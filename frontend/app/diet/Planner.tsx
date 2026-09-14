"use client";

import { useState } from "react";
import type { Challenge, DietStore, Importance, Milestone, ChallengeRole } from "@/lib/diet/types";
import { addDays, challengeProgress, monthStart, today, weekStart } from "@/lib/diet/model";
import { SortableList } from "./SortableList";
import GlobalGoals, { goalNames } from "./GlobalGoals";
import BulletEditor from "./BulletEditor";
import "./Planner.css";

const statusNames = { WAITING: "대기", ACTIVE: "진행 중", COMPLETED: "완료", STOPPED: "중단" };
const typeNames = { WEIGHT: "체중", CHECKLIST: "체크리스트", MANUAL: "수동" };
const roleNames = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };
const format = (value: number | null | undefined, unit = "") => value == null ? "—" : `${Number(value.toFixed(1))}${unit}`;
const numberValue = (value: string) => value === "" ? null : Number(value);

function newChallenge(order: number): Challenge {
  return { id: crypto.randomUUID(), title: "", role: "CURRENT_FOCUS", homeSortOrder: order, type: "WEIGHT", status: "ACTIVE", startDate: today(), endDate: addDays(today(), 27), color: "#3b82f6", keyPoint: "", notes: [], sortOrder: order, startWeight: null, targetWeight: null, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null };
}

export default function Planner({ store }: { store: DietStore }) {
  const { data } = store;
  const [month, setMonth] = useState(() => monthStart(today()));
  const [selectedId, setSelectedId] = useState("");
  const [timelineId, setTimelineId] = useState("");
  const [showChecklist, setShowChecklist] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [status, setStatus] = useState<Challenge["status"] | "ALL">("ACTIVE");
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const challenges = [...data.challenges].sort((a, b) => a.sortOrder - b.sortOrder);
  const visible = challenges.filter(c => status === "ALL" || c.status === status);
  const selected = challenges.find(c => c.id === selectedId) ?? visible[0];
  const weightChallenges = challenges.filter(c => c.type === "WEIGHT");
  const timelineChallenge = weightChallenges.find(c => c.id === timelineId) ?? (selected?.type === "WEIGHT" ? selected : weightChallenges[0]);
  const first = weekStart(month);
  const monthEnd = addDays(`${Number(month.slice(0, 4)) + (month.slice(5, 7) === "12" ? 1 : 0)}-${String(Number(month.slice(5, 7)) % 12 + 1).padStart(2, "0")}-01`, -1);
  const weeks: string[][] = [];
  for (let start = first; start <= monthEnd; start = addDays(start, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  const progress = selected ? challengeProgress(selected, data) : null;
  const selectedMilestones = data.milestones.filter(m => m.challengeId === selected?.id).sort((a, b) => a.date.localeCompare(b.date));
  const moveMonth = (offset: number) => {
    const date = new Date(`${month}T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  };
  const reorder = (ids: string[]) => {
    let index = 0;
    void store.reorder("challenges", challenges.map(c => visible.some(v => v.id === c.id) ? ids[index++] : c.id)).catch(() => {});
  };

  return <div className="diet-planner">
    <div className="dp-toolbar">
      <div className="dp-tabs dp-layer-controls" aria-label="달력 표시 설정"><button aria-pressed={showChecklist} onClick={() => setShowChecklist(!showChecklist)}>체크리스트 챌린지 표시</button><button aria-pressed={showWeight} onClick={() => setShowWeight(!showWeight)}>체중 기록 표시</button></div>
      <button className="primary" onClick={() => setEditing(newChallenge(challenges.length))}>+ 챌린지 추가</button>
    </div>
    <RoleSection role="CURRENT_FOCUS" challenges={challenges} store={store} onSelect={setSelectedId} />
    <section className="dp-panel dp-calendar" aria-label="체중 계획 달력">
      <div className="dp-toolbar"><h2>{month.slice(0, 4)}년 {Number(month.slice(5, 7))}월</h2><div className="dp-actions"><button aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button><button onClick={() => setMonth(monthStart(today()))}>오늘</button><button aria-label="다음 달" onClick={() => moveMonth(1)}>›</button></div></div>
      <div className="dp-weekdays">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}</div>
      {weeks.map(week => <div className="dp-week" key={week[0]}>
        <div className="dp-calendar-days">{week.map(date => {
          const goals = data.goals.filter(g => g.targetDate === date);
          const milestones = data.milestones.filter(m => m.date === date && weightChallenges.some(c => c.id === m.challengeId));
          const day = data.days.find(d => d.date === date);
          return <div key={date} className={`dp-date ${date.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""} ${date === today() ? "today" : ""}`}>
            <div className="dp-date-label"><time dateTime={date}>{Number(date.slice(8))}</time>{date === today() && <small>오늘</small>}</div>
            {day?.targetWeight != null && <div className="dp-target">일 목표 · {format(day.targetWeight, "kg")}</div>}
            {goals.map(g => <div key={g.id} className={`dp-target dp-goal-${g.kind.toLowerCase()}`} title={g.core}>{goalNames[g.kind]} · {format(g.targetWeight, "kg")}</div>)}
            {milestones.map(m => <div key={m.id} className="dp-target" style={{ color: challenges.find(c => c.id === m.challengeId)?.color }}>{m.title || "마일스톤"} · {format(m.value, "kg")}</div>)}
            {weightChallenges.filter(c => c.endDate === date && c.targetWeight != null).map(c => <div key={c.id} className="dp-target" style={{ color: c.color }} title={c.title}>챌린지 목표 · {format(c.targetWeight, "kg")}</div>)}
            {showWeight && date <= today() && day?.morningWeight != null && <div className="dp-actual">기록 : {format(day.morningWeight, "kg")}</div>}
          </div>;
        })}</div>
        {showChecklist && <div className="dp-duration-lines">{challenges.filter(c => c.type === "CHECKLIST" && c.startDate <= week[6] && c.endDate >= week[0]).map(c => {
          const start = week.findIndex(d => d >= c.startDate);
          const end = week.filter(d => d <= c.endDate).length;
          return <div key={c.id} className="dp-duration-row"><button title={`${c.title} · ${c.startDate} – ${c.endDate}`} aria-label={`${c.title} 기간`} style={{ gridColumn: `${start + 1} / ${end + 1}`, background: c.color }} onClick={() => setSelectedId(c.id)}>체크 · {c.title}</button></div>;
        })}</div>}
      </div>)}
    </section>
    <section className="dp-panel dp-timeline">
      <div className="dp-toolbar"><h2>타임라인</h2>{!!weightChallenges.length && <select aria-label="타임라인 체중 챌린지" value={timelineChallenge?.id ?? ""} onChange={e => setTimelineId(e.target.value)}>{weightChallenges.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}</div>
      {timelineChallenge ? <div className="dp-timeline-scroll"><ol className="dp-timeline-axis">
        {[{ id: "start", date: timelineChallenge.startDate, title: "시작", value: timelineChallenge.startWeight, memoItems: [] as string[] },
          ...data.goals.filter(g => g.targetDate >= timelineChallenge.startDate && g.targetDate <= timelineChallenge.endDate).map(g => ({ id: g.id, date: g.targetDate, value: g.targetWeight, title: goalNames[g.kind], memoItems: g.memoItems })),
          ...data.milestones.filter(m => m.challengeId === timelineChallenge.id).map(m => ({ ...m, title: m.title || "마일스톤" })),
          { id: "final", date: timelineChallenge.endDate, title: "챌린지 최종 목표", value: timelineChallenge.targetWeight, memoItems: [] as string[] }]
          .sort((a, b) => a.date.localeCompare(b.date)).map(point => <li className="dp-timeline-point" key={point.id} style={{ color: timelineChallenge.color }}><div className="dp-point-label"><strong>{point.title}</strong><b>{format(point.value, "kg")}</b><time>{point.date}</time></div><span className="dp-node" aria-hidden="true" />{!!point.memoItems.length && <ul className="dp-point-memos">{point.memoItems.map((memo, i) => <li key={i}>{memo}</li>)}</ul>}</li>)}
      </ol></div> : <p className="dp-empty">체중 챌린지를 추가하면 시작부터 최종 목표까지 표시됩니다.</p>}
    </section>
    <RoleSection role="NEXT_FOCUS" challenges={challenges} store={store} onSelect={setSelectedId} />
    <RoleSection role="FINAL_GOAL" challenges={challenges} store={store} onSelect={setSelectedId} />

    <div className="dp-bottom">
      <section className="dp-panel dp-challenges"><h2>챌린지 목록 <small>{visible.length}</small></h2><div className="dp-tabs dp-management-tabs" aria-label="챌린지 상태">{(["ACTIVE", "WAITING", "COMPLETED", "STOPPED", "ALL"] as const).map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "ALL" ? "전체" : statusNames[s]}</button>)}</div>
        {!visible.length && <p className="dp-empty">이 상태의 챌린지가 없습니다. 새 챌린지를 추가해 보세요.</p>}
        <SortableList ids={visible.map(c => c.id)} onReorder={reorder}>{(id, handle) => {
          const c = visible.find(item => item.id === id)!;
          const p = challengeProgress(c, data);
          return <div className={`dp-challenge ${selected?.id === id ? "selected" : ""}`} style={{ borderLeftColor: c.color }}>
            {handle}<button className="dp-challenge-select" onClick={() => setSelectedId(id)} aria-pressed={selected?.id === id}><strong>{c.title}</strong><small>{typeNames[c.type]} · {statusNames[c.status]}</small><small>{c.startDate} – {c.endDate}</small><div className="dp-progress"><span style={{ width: `${Math.max(0, Math.min(100, p.progress ?? 0))}%`, background: c.color }} /></div><small>{format(p.progress, "%")}</small></button>
          </div>;
        }}</SortableList>
      </section>

      <section className="dp-panel dp-detail">
        {!selected ? <p className="dp-empty">챌린지를 추가하면 목표와 마일스톤을 관리할 수 있습니다.</p> : <>
          <div className="dp-toolbar"><div><h2 style={{ borderLeft: `4px solid ${selected.color}`, paddingLeft: 10 }}>{selected.title}</h2><p className="dp-hint">{typeNames[selected.type]} · {roleNames[selected.role]} · {selected.startDate} – {selected.endDate} · {statusNames[selected.status]}</p></div><button onClick={() => setEditing({ ...selected, itemIds: [...selected.itemIds], notes: [...selected.notes] })}>수정</button></div>
          {selected.keyPoint && <p className="dp-key"><b>핵심</b> {selected.keyPoint}</p>}
          {!!selected.notes.length && <div className="dp-notes"><b>메모</b><ul>{selected.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></div>}
          <div className="dp-metrics">
            {selected.type === "WEIGHT" ? <><Metric label="시작 체중" value={format(selected.startWeight, " kg")} /><Metric label="챌린지 목표" value={format(selected.targetWeight, " kg")} /><Metric label="현재 체중" value={format(progress?.current, " kg")} /><Metric label="감량" value={format(progress?.lost, " kg")} loss={(progress?.lost ?? 0) > 0} /><Metric label="남은 감량" value={format(progress?.remaining, " kg")} /></> : <><Metric label={selected.type === "CHECKLIST" ? (selected.goalMode === "RATE" ? "현재 성공률" : "성공 횟수") : "현재 값"} value={format(progress?.current, selected.type === "CHECKLIST" && selected.goalMode === "RATE" ? "%" : "")} /><Metric label="목표" value={format(progress?.target, selected.type === "CHECKLIST" && selected.goalMode === "RATE" ? "%" : "")} /></>}
            <Metric label="진행률" value={format(progress?.progress, "%")} />
          </div>
          {selected.type === "CHECKLIST" && <p className="dp-hint">대상: {selected.itemIds.map(id => data.items.find(item => item.id === id)?.title || "보관된 항목").join(", ") || "없음"} · 미입력 {selected.includeMissing ? "포함" : "제외"} · 성공 {progress?.success ?? 0} / 집계 {progress?.eligible ?? 0}회</p>}
          <div className="dp-toolbar dp-milestone-heading"><h3>마일스톤</h3><button onClick={() => setMilestone({ id: crypto.randomUUID(), challengeId: selected.id, date: selected.endDate, value: (selected.type === "WEIGHT" ? selected.targetWeight : selected.targetValue) ?? 0, title: "", memoItems: [] })}>+ 마일스톤 추가</button></div>
          {!selectedMilestones.length ? <p className="dp-empty">아직 마일스톤이 없습니다.</p> : <div className="dp-table-scroll"><table><thead><tr><th>날짜</th><th>목표 {selected.type === "WEIGHT" ? "체중" : "값"}</th><th>제목</th><th>메모</th><th><span className="sr-only">관리</span></th></tr></thead><tbody>{selectedMilestones.map(m => <tr key={m.id}><td>{m.date}</td><td style={{ color: selected.color }}>{format(m.value, selected.type === "WEIGHT" ? " kg" : "")}</td><td>{m.title || "—"}</td><td>{m.memoItems.length ? <ul className="dp-bullets">{m.memoItems.map((memo, i) => <li key={i}>{memo}</li>)}</ul> : "—"}</td><td><button onClick={() => setMilestone({ ...m })} aria-label={`${m.title || m.date} 마일스톤 수정`}>수정</button></td></tr>)}</tbody></table></div>}
        </>}
      </section>
    </div>
    <GlobalGoals store={store} />
    {editing && <ChallengeEditor key={editing.id} initial={editing} store={store} onClose={() => setEditing(null)} onSaved={id => { setSelectedId(id); setStatus("ALL"); }} />}
    {milestone && <MilestoneEditor initial={milestone} store={store} onClose={() => setMilestone(null)} />}
  </div>;
}

function Metric({ label, value, loss = false }: { label: string; value: string; loss?: boolean }) {
  return <div><small>{label}</small><strong className={loss ? "dp-loss" : ""}>{value}</strong></div>;
}

function RoleSection({ role, challenges, store, onSelect }: { role: ChallengeRole; challenges: Challenge[]; store: DietStore; onSelect: (id: string) => void }) {
  const entries = challenges.filter(c => c.role === role);
  return <section className="dp-role-section" aria-label={roleNames[role]}><h2>{roleNames[role]}</h2>{!entries.length ? <p className="dp-hint">등록된 챌린지가 없습니다.</p> : <div className="dp-role-cards">{entries.map(c => {
    const progress = challengeProgress(c, store.data);
    return <button key={c.id} className="dp-role-card" style={{ borderLeftColor: c.color }} onClick={() => onSelect(c.id)}><span><small>{c.type === "CHECKLIST" ? "체크" : typeNames[c.type]} · {statusNames[c.status]}</small><strong>{c.title}</strong><small>{c.startDate} – {c.endDate}</small></span><span className="dp-role-progress"><b>{format(progress.progress, "%")}</b><span className="dp-progress"><span style={{ width: `${progress.progress ?? 0}%`, background: c.color }} /></span>{c.keyPoint && <small>{c.keyPoint}</small>}</span></button>;
  })}</div>}</section>;
}

function ChallengeEditor({ initial, store, onClose, onSaved }: { initial: Challenge; store: DietStore; onClose: () => void; onSaved: (id: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const change = <K extends keyof Challenge>(key: K, value: Challenge[K]) => setDraft(d => ({ ...d, [key]: value }));
  const numeric = (label: string, key: "startWeight" | "targetWeight" | "currentValue" | "targetValue", max?: number) => <label>{label}<input type="number" step={key === "targetValue" && draft.type === "CHECKLIST" && draft.goalMode === "COUNT" ? "1" : "any"} min={key === "currentValue" ? "0" : key === "targetValue" && draft.goalMode === "COUNT" ? "1" : "0.1"} max={max} required value={draft[key] ?? ""} onChange={e => change(key, numberValue(e.target.value))} /></label>;
  return <div className="dp-modal-backdrop" onClick={onClose}><section className="dp-modal" role="dialog" aria-modal="true" aria-labelledby="dp-challenge-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
    <div className="dp-toolbar"><h2 id="dp-challenge-title">챌린지 {store.data.challenges.some(c => c.id === initial.id) ? "수정" : "추가"}</h2><button type="button" onClick={onClose} aria-label="닫기">×</button></div>
    <form onSubmit={async e => { e.preventDefault(); setError(""); const values = new FormData(e.currentTarget); if (String(values.get("endDate")) < String(values.get("startDate"))) { setError("종료일은 시작일 이후여야 합니다."); return; } if (draft.type === "CHECKLIST" && !draft.itemIds.length) { setError("체크리스트 항목을 하나 이상 선택해 주세요."); return; } setSaving(true); try {
      const next = { ...draft, startDate: String(values.get("startDate")), endDate: String(values.get("endDate")), title: draft.title.trim(), notes: draft.notes.map(n => n.trim()).filter(Boolean) };
      await store.save("challenges", next);
      onSaved(next.id); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setSaving(false); } }}>
      <label>챌린지 제목<input autoFocus required maxLength={200} value={draft.title} onChange={e => change("title", e.target.value)} /></label>
      <div className="dp-form-grid"><label>유형<select disabled={store.data.challenges.some(c => c.id === initial.id)} value={draft.type} onChange={e => change("type", e.target.value as Challenge["type"])}>{Object.entries(typeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>역할<select value={draft.role} onChange={e => change("role", e.target.value as ChallengeRole)}>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>상태<select value={draft.status} onChange={e => change("status", e.target.value as Challenge["status"])}>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>시작일<input name="startDate" type="date" required defaultValue={draft.startDate} /></label><label>종료일<input name="endDate" type="date" required defaultValue={draft.endDate} /></label><label>색상<input type="color" value={draft.color} onChange={e => change("color", e.target.value)} /></label></div>
      {draft.type === "WEIGHT" && <div className="dp-form-grid">{numeric("시작 체중 (kg)", "startWeight")}{numeric("목표 체중 (kg)", "targetWeight")}</div>}
      {draft.type === "MANUAL" && <div className="dp-form-grid">{numeric("현재 값", "currentValue")}{numeric("목표 값", "targetValue")}</div>}
      {draft.type === "CHECKLIST" && <fieldset><legend>대상 체크리스트</legend><div className="dp-actions">{(["CORE", "SECONDARY", "OPTIONAL"] as Importance[]).map(group => <button type="button" key={group} onClick={() => change("itemIds", store.data.items.filter(item => item.active && item.importance === group).map(item => item.id))}>{group} 선택</button>)}</div><p className="dp-hint">그룹 선택 시 현재 항목이 저장됩니다. 이후 중요도를 바꿔도 대상은 유지됩니다.</p><div className="dp-item-options">{store.data.items.filter(item => item.active || draft.itemIds.includes(item.id)).map(item => <label key={item.id}><input type="checkbox" checked={draft.itemIds.includes(item.id)} onChange={e => change("itemIds", e.target.checked ? [...draft.itemIds, item.id] : draft.itemIds.filter(id => id !== item.id))} />{item.title} <small>{item.importance}</small></label>)}</div>{!store.data.items.length && <p className="dp-hint">기록 화면에서 체크리스트 항목을 먼저 추가하세요.</p>}<div className="dp-form-grid"><label>목표 방식<select value={draft.goalMode} onChange={e => change("goalMode", e.target.value as Challenge["goalMode"])}><option value="RATE">성공률</option><option value="COUNT">성공 횟수</option></select></label>{numeric(draft.goalMode === "RATE" ? "목표 성공률 (%)" : "목표 성공 횟수", "targetValue", draft.goalMode === "RATE" ? 100 : undefined)}</div><label className="dp-inline"><input type="checkbox" checked={draft.includeMissing} onChange={e => change("includeMissing", e.target.checked)} />미입력 포함 (기본)</label><p className="dp-hint">미래 날짜는 집계하지 않습니다. 제외하면 성공·실패가 입력된 기록만 집계합니다.</p></fieldset>}
      <label>핵심<textarea rows={2} value={draft.keyPoint} onChange={e => change("keyPoint", e.target.value)} placeholder="짧은 핵심 문장" /></label><BulletEditor value={draft.notes} onChange={notes => change("notes", notes)} />
      {error && <p className="dp-error" role="alert">{error}</p>}<div className="dp-modal-actions"><button type="button" onClick={onClose}>취소</button><button className="primary" disabled={saving || store.busy || !draft.title.trim()}>{saving ? "저장 중…" : "저장"}</button></div>
    </form>
  </section></div>;
}

function MilestoneEditor({ initial, store, onClose }: { initial: Milestone; store: DietStore; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const challenge = store.data.challenges.find(c => c.id === draft.challengeId);
  const existing = store.data.milestones.some(m => m.id === initial.id);
  const submit = async (remove = false, date = draft.date) => { setError(""); setSaving(true); try { if (remove) await store.remove("milestones", draft.id); else await store.save("milestones", { ...draft, date, memoItems: draft.memoItems.map(item => item.trim()).filter(Boolean) }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setSaving(false); } };
  return <div className="dp-modal-backdrop" onClick={onClose}><section className="dp-modal dp-modal-small" role="dialog" aria-modal="true" aria-labelledby="dp-milestone-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="dp-toolbar"><h2 id="dp-milestone-title">마일스톤 {existing ? "수정" : "추가"}</h2><button onClick={onClose} aria-label="닫기">×</button></div><form onSubmit={e => { e.preventDefault(); void submit(false, String(new FormData(e.currentTarget).get("date"))); }}>
    <label>날짜<input name="date" autoFocus type="date" min={challenge?.startDate} max={challenge?.endDate} required defaultValue={draft.date} /></label><label>목표 값 {challenge?.type === "WEIGHT" ? "(kg)" : ""}<input type="number" step="any" min={challenge?.type === "WEIGHT" ? "0.1" : "0"} required value={draft.value} onChange={e => setDraft({ ...draft, value: Number(e.target.value) })} /></label><label>제목 (선택)<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><BulletEditor value={draft.memoItems} onChange={memoItems => setDraft({ ...draft, memoItems })} />
    {error && <p className="dp-error" role="alert">{error}</p>}<div className="dp-modal-actions">{existing && <button type="button" disabled={saving || store.busy} onClick={() => void submit(true)}>삭제</button>}<button type="button" onClick={onClose}>취소</button><button className="primary" disabled={saving || store.busy}>{saving ? "저장 중…" : "저장"}</button></div>
  </form></section></div>;
}

