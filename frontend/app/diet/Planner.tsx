"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Challenge, DietStore, Importance, Milestone, ChallengeRole } from "@/lib/diet/types";
import { addDays, challengeProgress, monthStart, today, weekStart } from "@/lib/diet/model";
import { SortableList } from "./SortableList";
import GlobalGoals, { goalNames } from "./GlobalGoals";
import BulletEditor from "./BulletEditor";
import { DateRangeTimeline } from "@/components/DateRangeTimeline";
import { useChallengeDrafts } from "./useChallengeDrafts";
import { civilDay } from "@/lib/dateRange";
import { checklistOn, challengesOn } from "@/lib/diet/day";
import { dailyNotesApi, type NoteSyncSettings } from "@/lib/diet/dailyNote";
import "./Planner.css";

const statusNames = { WAITING: "대기", ACTIVE: "진행 중", COMPLETED: "완료", STOPPED: "중단" };
const typeNames = { WEIGHT: "체중", CHECKLIST: "체크리스트", MANUAL: "수동" };
const roleNames = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };
const format = (value: number | null | undefined, unit = "") => value == null ? "—" : `${Number(value.toFixed(1))}${unit}`;
const numberValue = (value: string) => value === "" ? null : Number(value);

function newChallenge(order: number): Challenge {
  return { id: crypto.randomUUID(), title: "", role: "CURRENT_FOCUS", homeSortOrder: order, type: "WEIGHT", status: "ACTIVE", startDate: today(), endDate: addDays(today(), 27), color: "#3b82f6", keyPoint: "", notes: [], sortOrder: order, startWeight: null, targetWeight: null, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null };
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
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const challenges = [...data.challenges.map(c => drafts.drafts[c.id] ? { ...drafts.drafts[c.id].value, sortOrder: c.sortOrder, homeSortOrder: c.homeSortOrder } : c), ...Object.values(drafts.drafts).filter(d => !data.challenges.some(c => c.id === d.value.id)).map(d => d.value)].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const visible = challenges.filter(c => status === "ALL" || c.status === status);
  const selected = challenges.find(c => c.id === selectedId) ?? visible[0];
  const weightChallenges = challenges.filter(c => c.type === "WEIGHT");
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
    <div className="dp-toolbar">
      <div className="dp-tabs dp-layer-controls" aria-label="달력 표시 설정"><button aria-pressed={showChecklist} onClick={() => setShowChecklist(!showChecklist)}>체크리스트 챌린지 표시</button><button aria-pressed={showWeight} onClick={() => setShowWeight(!showWeight)}>체중 기록 표시</button></div>
      <div className="dp-actions">{sync && <button className="dp-sync" aria-pressed={sync.enabled} disabled={syncBusy} onClick={() => void toggleSync()} title={sync.enabled ? `NOTE SYS Workspace: ${sync.workspaceName ?? "—"}` : "켜면 날짜별 다이어트 기록을 NOTE SYS에 정리합니다. 끄면 이후 갱신만 멈추고 기존 노트는 지우지 않습니다."}>NOTE SYS에 다이어트 기록 자동 정리 · {syncBusy ? "…" : sync.enabled ? "ON" : "OFF"}</button>}<button className="primary" disabled={!drafts.ready || drafts.saving} onClick={() => { const next = newChallenge(Math.max(-1, ...challenges.map(c => c.sortOrder)) + 1); drafts.change(next); setSelectedId(next.id); setStatus("ALL"); }}>+ 챌린지 추가</button></div>
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

    <div className="dp-bottom">
      <section className="dp-panel dp-challenges"><h2>챌린지 목록 <small>{visible.length}</small></h2><div className="dp-tabs dp-management-tabs" aria-label="챌린지 상태">{(["ACTIVE", "WAITING", "COMPLETED", "STOPPED", "ALL"] as const).map(s => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "ALL" ? "전체" : statusNames[s]}</button>)}</div>
        {!visible.length && <p className="dp-empty">이 상태의 챌린지가 없습니다. 새 챌린지를 추가해 보세요.</p>}
        <SortableList ids={visible.map(c => c.id)} onReorder={ids => { if (!drafts.saving && !drafts.changedIds.some(id => !data.challenges.some(c => c.id === id))) reorder(ids); }}>{(id, handle) => {
          const c = visible.find(item => item.id === id)!;
          const p = challengeProgress(c, data);
          return <div className={`dp-challenge ${selected?.id === id ? "selected" : ""}`} style={{ borderLeftColor: c.color }}>
            {handle}<button className="dp-challenge-select" onClick={() => setSelectedId(id)} aria-pressed={selected?.id === id}><strong>{c.title}{drafts.changedIds.includes(c.id) ? " · 수정됨" : ""}</strong><small>{typeNames[c.type]} · {statusNames[c.status]}</small><small>{c.startDate} – {c.endDate}</small><div className="dp-progress"><span style={{ width: `${Math.max(0, Math.min(100, p.progress ?? 0))}%`, background: c.color }} /></div><small>{format(p.progress, "%")}</small></button>
          </div>;
        }}</SortableList>
      </section>

      <section className="dp-panel dp-detail">
        {!selected ? <p className="dp-empty">챌린지를 추가하면 목표와 마일스톤을 관리할 수 있습니다.</p> : <>
          <ChallengeFields key={selected.id} draft={selected} base={drafts.drafts[selected.id]?.base ?? data.challenges.find(c => c.id === selected.id) ?? null} store={store} onChange={drafts.change} onSave={() => void drafts.save([selected.id])} onCancel={() => drafts.cancel([selected.id])} changed={drafts.changedIds.includes(selected.id)} disabled={!drafts.ready || drafts.saving || store.busy} error={drafts.drafts[selected.id]?.error}/>
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
    {milestone && <MilestoneEditor initial={milestone} store={store} challengeOverride={challenges.find(c => c.id === milestone.challengeId)} onClose={() => setMilestone(null)} />}
  </div>;
}

function Metric({ label, value, loss = false }: { label: string; value: string; loss?: boolean }) {
  return <div><small>{label}</small><strong className={loss ? "dp-loss" : ""}>{value}</strong></div>;
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

function ChallengeFields({ draft, base, store, onChange, onSave, onCancel, changed, disabled, error }: { draft: Challenge; base: Challenge | null; store: DietStore; onChange: (value: Challenge) => void; onSave: () => void; onCancel: () => void; changed: boolean; disabled: boolean; error?: string }) {
  const change = <K extends keyof Challenge>(key: K, value: Challenge[K]) => onChange({ ...draft, [key]: value });
  const fieldClass = (key: keyof Challenge) => !base || JSON.stringify(draft[key]) !== JSON.stringify(base[key]) ? "dp-field-changed" : "";
  const numeric = (label: string, key: "startWeight" | "targetWeight" | "currentValue" | "targetValue", max?: number) => <label>{label}<input className={fieldClass(key)} type="number" step={key === "targetValue" && draft.type === "CHECKLIST" && draft.goalMode === "COUNT" ? "1" : "any"} min={key === "currentValue" ? "0" : "0.1"} max={max} required={key !== "currentValue"} value={draft[key] ?? ""} onChange={e => change(key, numberValue(e.target.value))}/></label>;
  return <form className="dp-inline-editor" onSubmit={e => { e.preventDefault(); onSave(); }}><fieldset disabled={disabled}>
    <div className="dp-toolbar"><h2>챌린지 상세</h2><span className="dp-dirty" aria-live="polite">{changed ? '● 저장하지 않은 변경 · 초안 보관' : '저장됨'}</span></div>
      <label>챌린지 제목<input required maxLength={200} className={fieldClass("title")} value={draft.title} onChange={e => change("title", e.target.value)} /></label>
      <div className="dp-form-grid"><label>유형<select disabled={!!base} className={fieldClass("type")} value={draft.type} onChange={e => change("type", e.target.value as Challenge["type"])}>{Object.entries(typeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>역할<select className={fieldClass("role")} value={draft.role ?? ""} onChange={e => change("role", e.target.value as ChallengeRole)}><option value="" disabled>역할 선택</option>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>상태<select className={fieldClass("status")} value={draft.status} onChange={e => change("status", e.target.value as Challenge["status"])}>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>시작일<input name="startDate" type="date" required className={fieldClass("startDate")} value={draft.startDate} onChange={e => change("startDate", e.target.value)} /></label><label>종료일<input name="endDate" type="date" required className={fieldClass("endDate")} value={draft.endDate} onChange={e => change("endDate", e.target.value)} /></label><label>색상<input type="color" className={fieldClass("color")} value={draft.color} onChange={e => change("color", e.target.value)} /></label></div>
      {draft.type === "WEIGHT" && <div className="dp-form-grid">{numeric("시작 체중 (kg)", "startWeight")}{numeric("목표 체중 (kg)", "targetWeight")}</div>}
      {draft.type === "MANUAL" && <div className="dp-form-grid">{numeric("현재 값", "currentValue")}{numeric("목표 값", "targetValue")}</div>}
      {draft.type === "CHECKLIST" && <fieldset className={fieldClass("itemIds")}><legend>대상 체크리스트</legend><div className="dp-actions">{(["CORE", "SECONDARY", "OPTIONAL"] as Importance[]).map(group => <button type="button" key={group} onClick={() => change("itemIds", store.data.items.filter(item => item.active && item.importance === group).map(item => item.id))}>{group} 선택</button>)}</div><p className="dp-hint">그룹 선택 시 현재 항목이 저장됩니다. 이후 중요도를 바꿔도 대상은 유지됩니다.</p><div className="dp-item-options">{store.data.items.filter(item => item.active || draft.itemIds.includes(item.id)).map(item => <label key={item.id}><input type="checkbox" checked={draft.itemIds.includes(item.id)} onChange={e => change("itemIds", e.target.checked ? [...draft.itemIds, item.id] : draft.itemIds.filter(id => id !== item.id))} />{item.title} <small>{item.importance}</small></label>)}</div>{!store.data.items.length && <p className="dp-hint">기록 화면에서 체크리스트 항목을 먼저 추가하세요.</p>}<div className="dp-form-grid"><label>목표 방식<select className={fieldClass("goalMode")} value={draft.goalMode} onChange={e => change("goalMode", e.target.value as Challenge["goalMode"])}><option value="RATE">성공률</option><option value="COUNT">성공 횟수</option></select></label>{numeric(draft.goalMode === "RATE" ? "목표 성공률 (%)" : "목표 성공 횟수", "targetValue", draft.goalMode === "RATE" ? 100 : undefined)}</div><label className="dp-inline"><input type="checkbox" checked={draft.includeMissing} onChange={e => change("includeMissing", e.target.checked)} />미입력 포함 (기본)</label><p className="dp-hint">미래 날짜는 집계하지 않습니다. 제외하면 성공·실패가 입력된 기록만 집계합니다.</p></fieldset>}
      <label>핵심<textarea aria-label="핵심" rows={2} className={fieldClass("keyPoint")} value={draft.keyPoint} onChange={e => change("keyPoint", e.target.value)} placeholder="짧은 핵심 문장" /></label><div className={fieldClass("notes")}><BulletEditor value={draft.notes} onChange={notes => change("notes", notes)} /></div>
      {error && <p className="dp-error" role="alert">{error}</p>}
      <div className="dp-editor-actions"><button type="button" disabled={!changed || disabled} onClick={onCancel}>취소</button><button className="primary" disabled={!changed || disabled}>저장</button></div>
    </fieldset></form>;
}

function MilestoneEditor({ initial, store, challengeOverride, onClose }: { initial: Milestone; store: DietStore; challengeOverride?: Challenge; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const challenge = challengeOverride ?? store.data.challenges.find(c => c.id === draft.challengeId);
  const existing = store.data.milestones.some(m => m.id === initial.id);
  const submit = async (remove = false, date = draft.date) => { setError(""); setSaving(true); try { if (remove) await store.remove("milestones", draft.id); else await store.save("milestones", { ...draft, date, memoItems: draft.memoItems.map(item => item.trim()).filter(Boolean) }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setSaving(false); } };
  return <div className="dp-modal-backdrop" onClick={onClose}><section className="dp-modal dp-modal-small" role="dialog" aria-modal="true" aria-labelledby="dp-milestone-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="dp-toolbar"><h2 id="dp-milestone-title">마일스톤 {existing ? "수정" : "추가"}</h2><button onClick={onClose} aria-label="닫기">×</button></div><form onSubmit={e => { e.preventDefault(); void submit(false, String(new FormData(e.currentTarget).get("date"))); }}>
    <label>날짜<input name="date" autoFocus type="date" min={challenge?.startDate} max={challenge?.endDate} required defaultValue={draft.date} /></label><label>목표 값 {challenge?.type === "WEIGHT" ? "(kg)" : ""}<input type="number" step="any" min={challenge?.type === "WEIGHT" ? "0.1" : "0"} required value={draft.value} onChange={e => setDraft({ ...draft, value: Number(e.target.value) })} /></label><label>제목 (선택)<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><BulletEditor value={draft.memoItems} onChange={memoItems => setDraft({ ...draft, memoItems })} />
    {error && <p className="dp-error" role="alert">{error}</p>}<div className="dp-modal-actions">{existing && <button type="button" disabled={saving || store.busy} onClick={() => void submit(true)}>삭제</button>}<button type="button" onClick={onClose}>취소</button><button className="primary" disabled={saving || store.busy}>{saving ? "저장 중…" : "저장"}</button></div>
  </form></section></div>;
}

