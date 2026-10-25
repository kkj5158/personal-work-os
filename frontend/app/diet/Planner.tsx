"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Challenge, DietStore, ChallengeRole } from "@/lib/diet/types";
import { addDays, challengeProgress, monthStart, today, weekStart } from "@/lib/diet/model";
import { SortableList } from "./SortableList";
import GlobalGoals, { goalNames } from "./GlobalGoals";
import { ChallengeDetail, challengeStatus, format, roleNames, statusNames, typeNames } from "./ChallengeDetail";
import { DateRangeTimeline } from "@/components/DateRangeTimeline";
import { useChallengeDrafts } from "./useChallengeDrafts";
import { civilDay } from "@/lib/dateRange";
import { checklistOn, challengesOn } from "@/lib/diet/day";
import { dailyNotesApi, type NoteSyncSettings } from "@/lib/diet/dailyNote";
import "./Planner.css";

function newChallenge(order: number, type: Challenge["type"]): Challenge {
  return { id: crypto.randomUUID(), title: "", role: "CURRENT_FOCUS", homeSortOrder: order, type, status: "ACTIVE", startDate: today(), endDate: addDays(today(), 27), color: "#3b82f6", keyPoint: "", notes: [], sortOrder: order, startWeight: null, targetWeight: null, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null };
}

export default function Planner({ store, registerFlush }: { store: DietStore; registerFlush?: (flush: () => Promise<void>) => () => void }) {
  const { data } = store;
  const params = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(params?.get("date") ?? "") ? params!.get("date")! : today());
  const [month, setMonth] = useState(() => monthStart(selectedDate));
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const [sync, setSync] = useState<NoteSyncSettings | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [showChecklist, setShowChecklist] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [status, setStatus] = useState<Challenge["status"] | "ALL">("ACTIVE");
  const drafts = useChallengeDrafts(store, registerFlush);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<Challenge["type"] | "ALL">("ALL");
  const [role, setRole] = useState<ChallengeRole | "ALL">("ALL");
  const [feedback, setFeedback] = useState("");
  const challenges = [...data.challenges.map(c => drafts.drafts[c.id] ? { ...drafts.drafts[c.id].value, sortOrder: c.sortOrder, homeSortOrder: c.homeSortOrder } : c), ...Object.values(drafts.drafts).filter(d => !data.challenges.some(c => c.id === d.value.id)).map(d => d.value)].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const visible = challenges.filter(c => (status === "ALL" || c.status === status) && (type === "ALL" || c.type === type) && (role === "ALL" || c.role === role));
  const selected = challenges.find(c => c.id === selectedId) ?? visible[0];
  const weightChallenges = challenges.filter(c => c.type === "WEIGHT");
  const first = weekStart(month);
  const monthEnd = addDays(`${Number(month.slice(0, 4)) + (month.slice(5, 7) === "12" ? 1 : 0)}-${String(Number(month.slice(5, 7)) % 12 + 1).padStart(2, "0")}-01`, -1);
  const weeks: string[][] = [];
  for (let start = first; start <= monthEnd; start = addDays(start, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  const moveMonth = (offset: number) => {
    const date = new Date(`${month}T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  };
  const gridStart = weeks[0][0], gridEnd = weeks.at(-1)![6];
  useEffect(() => {
    let live = true;
    dailyNotesApi.range(gridStart, gridEnd).then(notes => { if (live) setNoteDates(new Set(notes.map(n => n.date))); }).catch(() => {});
    return () => { live = false; };
  }, [gridStart, gridEnd]);
  useEffect(() => { dailyNotesApi.syncSettings().then(setSync).catch(() => {}); }, []);
  const selectDate = (date: string) => { setSelectedDate(date); if (date.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(date)); };
  const toggleSync = async () => {
    if (!sync) return;
    setSyncBusy(true);
    try { setSync((await dailyNotesApi.setSync(!sync.enabled)).settings); } catch { /* the toggle keeps its confirmed state */ } finally { setSyncBusy(false); }
  };
  const reorder = (ids: string[]) => {
    let index = 0;
    void store.reorder("challenges", challenges.map(c => visible.some(v => v.id === c.id) ? ids[index++] : c.id)).catch(() => {});
  };

  return <div className="diet-planner">
    <div className="dp-global-draftbar"><span role="status">변경 {drafts.changedIds.length}개 · 항목별 초안 보관</span><div className="dp-actions"><button disabled={!drafts.changedIds.length || drafts.saving || store.busy} onClick={() => drafts.cancel(drafts.changedIds)}>전체 취소</button><button className="primary" disabled={!drafts.ready || !drafts.changedIds.length || drafts.saving || store.busy} onClick={() => void drafts.save(drafts.changedIds)}>{drafts.saving ? "저장 중…" : "모두 저장"}</button></div></div>
    {drafts.storageError && <p className="dp-error" role="alert">{drafts.storageError}</p>}
    {feedback && <p className="dp-feedback" role="status">{feedback}</p>}
    <div className="dp-bottom dp-management">
      <section className="dp-panel dp-challenges" aria-label="챌린지 관리">
        <div className="dp-toolbar"><div><h2>챌린지 관리</h2><p className="dp-hint">목표를 확인하고 수정하세요.</p></div><button className="primary" disabled={!drafts.ready || drafts.saving} onClick={() => setCreating(value => !value)}>+ 새 챌린지</button></div>
        {creating && <div className="dp-create-types" role="group" aria-label="새 챌린지 유형"><p>목표 유형을 선택하세요.</p>{Object.entries(typeNames).map(([key, label]) => <button type="button" key={key} onClick={() => { const next = newChallenge(Math.max(-1, ...challenges.map(c => c.sortOrder)) + 1, key as Challenge["type"]); drafts.change(next); setSelectedId(next.id); setStatus("ALL"); setType("ALL"); setRole("ALL"); setCreating(false); }}>{label}</button>)}</div>}
        <div className="dp-tabs dp-management-tabs" aria-label="챌린지 상태">{(["ALL", "ACTIVE", "WAITING", "COMPLETED", "STOPPED"] as const).map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "ALL" ? "전체" : statusNames[s]} <small>{challenges.filter(c => s === "ALL" || c.status === s).length}</small></button>)}</div>
        <div className="dp-card-filters"><label>유형<select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="ALL">모든 유형</option>{Object.entries(typeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>역할<select value={role} onChange={e => setRole(e.target.value as typeof role)}><option value="ALL">모든 역할</option>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
        {!visible.length && <p className="dp-empty">선택한 조건의 챌린지가 없습니다.</p>}
        <SortableList ids={visible.map(c => c.id)} onReorder={ids => { if (!drafts.saving && !drafts.changedIds.some(id => !data.challenges.some(c => c.id === id))) reorder(ids); }}>{(id, handle) => {
          const c = visible.find(item => item.id === id)!, p = challengeProgress(c, data);
          return <div className={`dp-challenge ${selected?.id === id ? "selected" : ""}`} style={{ borderLeftColor: c.color }}>
            <button className="dp-challenge-select" onClick={() => setSelectedId(id)} aria-pressed={selected?.id === id}><span className="dp-card-labels"><span className={`dp-role-badge dp-role-${c.role?.toLowerCase()}`}>{roleNames[c.role]}</span><small>{typeNames[c.type]}</small></span><strong>{c.title || "새 챌린지"}{drafts.changedIds.includes(c.id) ? " · 수정됨" : ""}</strong>{c.keyPoint && <span className="dp-card-description">{c.keyPoint}</span>}<span className="dp-card-dates"><time>{c.startDate} – {c.endDate}</time><small>{challengeStatus(c)}</small></span>{p.progress != null && <div className="dp-progress" role="progressbar" aria-label={`${c.title} 진행률`} aria-valuenow={Number(p.progress.toFixed(1))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, p.progress))}%`, background: c.color }}/></div>}<small>{format(p.progress, "%")}</small><span className="dp-card-metrics">{c.type === "WEIGHT" ? <><span>현재 <b>{format(p.current, " kg")}</b></span><span>목표 <b>{format(c.targetWeight, " kg")}</b></span></> : <><span>{c.type === "CHECKLIST" ? "성공" : "현재"} <b>{format(c.type === "CHECKLIST" ? p.success : p.current)}</b></span><span>목표 <b>{format(p.target, c.type === "CHECKLIST" && c.goalMode === "RATE" ? "%" : "")}</b></span></>}</span></button>{handle}
          </div>;
        }}</SortableList>
      </section>
      <section className="dp-panel dp-detail">{selected ? <ChallengeDetail key={selected.id} challenge={selected} store={store} drafts={drafts} onRemoved={() => { setSelectedId(""); setFeedback("챌린지를 삭제했습니다."); }}/> : <p className="dp-empty">챌린지를 선택하거나 새 목표를 만드세요.</p>}</section>
    </div>
    <details className="dp-planning-tools"><summary>계획 달력 · 날짜별 현황 · 기간 편집</summary>
    <div className="dp-toolbar">
      <div className="dp-tabs dp-layer-controls" aria-label="달력 표시 설정"><button aria-pressed={showChecklist} onClick={() => setShowChecklist(!showChecklist)}>체크리스트 챌린지 표시</button><button aria-pressed={showWeight} onClick={() => setShowWeight(!showWeight)}>체중 기록 표시</button></div>
      <div className="dp-actions">{sync && <button className="dp-sync" aria-pressed={sync.enabled} disabled={syncBusy} onClick={() => void toggleSync()} title={sync.enabled ? `NOTE SYS Workspace: ${sync.workspaceName ?? "—"}` : "켜면 날짜별 다이어트 기록을 NOTE SYS에 정리합니다. 끄면 이후 갱신만 멈추고 기존 노트는 지우지 않습니다."}>NOTE SYS에 다이어트 기록 자동 정리 · {syncBusy ? "…" : sync.enabled ? "ON" : "OFF"}</button>}</div>
    </div>
    <div className="dp-context">{(["CURRENT_FOCUS", "NEXT_FOCUS", "FINAL_GOAL"] as const).map(role => <RoleSection key={role} role={role} challenges={challenges} store={store} onSelect={setSelectedId} />)}</div>
    <section className="dp-panel dp-calendar" aria-label="체중 계획 달력">
      <div className="dp-toolbar"><h2>{month.slice(0, 4)}년 {Number(month.slice(5, 7))}월</h2><div className="dp-actions"><button aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button><button onClick={() => selectDate(today())}>오늘</button><button aria-label="다음 달" onClick={() => moveMonth(1)}>›</button></div></div>
      <div className="dp-weekdays">{["월", "화", "수", "목", "금", "토", "일"].map(d => <span key={d}>{d}</span>)}</div>
      {weeks.map(week => <div className="dp-week" key={week[0]}>
        <div className="dp-calendar-days">{week.map(date => {
          const goals = data.goals.filter(g => g.targetDate === date);
          const milestones = data.milestones.filter(m => m.date === date && weightChallenges.some(c => c.id === m.challengeId));
          const day = data.days.find(d => d.date === date);
          return <div key={date} role="button" tabIndex={0} aria-pressed={date === selectedDate} aria-label={`${date} 선택`} onClick={() => selectDate(date)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDate(date); } }} className={`dp-date ${date.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""} ${date === today() ? "today" : ""} ${date === selectedDate ? "selected" : ""}`}>
            <div className="dp-date-label"><time dateTime={date}>{Number(date.slice(8))}</time>{noteDates.has(date) && <span className="dp-note-dot" title="데일리 노트" aria-label="데일리 노트 있음" />}{date === today() && <small>오늘</small>}</div>
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
    <div className="dp-selected-date" aria-label="선택한 날짜"><strong>{selectedDate}</strong><span>측정과 체크리스트 · {data.days.find(d => d.date === selectedDate)?.morningWeight ?? '—'} kg</span><a href={`/diet/note?date=${selectedDate}`}>날짜별 노트 보기</a><small>날짜별 기록은 다이어트 노트에서 확인하세요.</small></div>
    {drafts.storageError && <p className="dp-error" role="alert">{drafts.storageError}</p>}
    <SelectedDateSummary date={selectedDate} store={store}/>
    <DateRangeTimeline items={challenges.filter(c => { try { return civilDay(c.startDate) <= civilDay(c.endDate); } catch { return false; } }).map(c => ({ ...c, status: statusNames[c.status], editable: true, modified: drafts.changedIds.includes(c.id) }))} selectedId={selected?.id} disabled={!drafts.ready || drafts.saving || store.busy} onSelect={setSelectedId} onChange={(id, range) => { const c = challenges.find(c => c.id === id); if (c) drafts.change({ ...c, ...range }); }} actions={<><span aria-live="polite">변경 {drafts.changedIds.length}개 · 초안 보관</span><div className="dp-actions"><button disabled={!drafts.changedIds.length || drafts.saving || store.busy} onClick={() => drafts.cancel(drafts.changedIds)}>전체 취소</button><button className="primary" disabled={!drafts.ready || !drafts.changedIds.length || drafts.saving || store.busy} onClick={() => void drafts.save(drafts.changedIds)}>{drafts.saving ? '저장 중…' : '모두 저장'}</button></div></>}/>
    {!!drafts.changedIds.filter(id => drafts.drafts[id]?.error).length && <div className="dp-error" role="alert">{drafts.changedIds.filter(id => drafts.drafts[id]?.error).map(id => <p key={id}>{drafts.drafts[id].value.title}: {drafts.drafts[id].error}</p>)}<small>성공한 항목은 완료 처리되며, 다시 저장하면 남은 초안만 재시도합니다.</small></div>}

    </details>
    <GlobalGoals store={store}/>
  </div>;
}

function SelectedDateSummary({ date, store }: { date: string; store: DietStore }) {
  const day = store.data.days.find(d => d.date === date), checks = checklistOn(date, store.data);
  const stateNames = { SUCCESS: "성공", FAILURE: "실패", MISSING: "미입력", UNRECORDED: "기록 못함" };
  return <details className="dp-date-summary"><summary>선택 날짜 상세 · 체크리스트 성공 {checks.success}/{checks.total} · 측정 / 포커스</summary><div className="dp-date-summary-grid"><div><h3>포커스 / 목표</h3>{challengesOn(date, store.data.challenges).map(c => <p key={c.id}>{roleNames[c.role]} · {c.title} · {c.startDate} → {c.endDate}</p>)}<h3>측정 기록</h3><div className="dp-table-scroll"><table><thead><tr><th>시점</th><th>체중 kg</th><th>혈당 mg/dL</th><th>혈중 케톤 mmol/L</th><th>호흡 케톤 ppm</th><th>측정 시각</th></tr></thead><tbody><tr><td>아침</td><td>{format(day?.morningWeight)}</td><td>{format(day?.morningGlucose)}</td><td>{format(day?.morningBloodKetone)}</td><td>{format(day?.morningBreathKetone)}</td><td>{day?.morningMeasuredAt ?? "—"}</td></tr><tr><td>취침 전</td><td>해당 없음</td><td>{format(day?.bedtimeGlucose)}</td><td>{format(day?.bedtimeBloodKetone)}</td><td>{format(day?.bedtimeBreathKetone)}</td><td>{day?.bedtimeMeasuredAt ?? "—"}</td></tr></tbody></table></div></div><div><h3>체크리스트</h3>{checks.rows.map(r => <p key={r.item.id}>{r.item.importance} · {r.item.title} · {stateNames[r.state]}</p>)}</div></div></details>;
}

function RoleSection({ role, challenges, store, onSelect }: { role: ChallengeRole; challenges: Challenge[]; store: DietStore; onSelect: (id: string) => void }) {
  const entries = challenges.filter(c => c.role === role);
  return <section className="dp-role-section" aria-label={roleNames[role]}><h2>{roleNames[role]}</h2>{!entries.length ? <p className="dp-hint">등록된 챌린지가 없습니다.</p> : <div className="dp-role-cards">{entries.map(c => {
    const progress = challengeProgress(c, store.data);
    return <button key={c.id} className="dp-role-card" style={{ borderLeftColor: c.color }} onClick={() => onSelect(c.id)}><span><small>{c.type === "CHECKLIST" ? "체크" : typeNames[c.type]} · {statusNames[c.status]}</small><strong>{c.title}</strong><small>{c.startDate} – {c.endDate}</small></span><span className="dp-role-progress"><b>{format(progress.progress, "%")}</b><span className="dp-progress"><span style={{ width: `${progress.progress ?? 0}%`, background: c.color }} /></span>{c.keyPoint && <small>{c.keyPoint}</small>}</span></button>;
  })}</div>}</section>;
}

