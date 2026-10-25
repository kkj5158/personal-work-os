"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Challenge, ChallengeRole, DietStore, Importance, Milestone } from "@/lib/diet/types";
import { challengeProgress, today } from "@/lib/diet/model";
import BulletEditor from "./BulletEditor";
import { useChallengeDrafts } from "./useChallengeDrafts";

export const statusNames = { WAITING: "대기", ACTIVE: "진행 중", COMPLETED: "완료", STOPPED: "중단" };
export const typeNames = { WEIGHT: "체중 목표", CHECKLIST: "체크리스트", MANUAL: "수동 목표" };
export const roleNames = { CURRENT_FOCUS: "CURRENT FOCUS", NEXT_FOCUS: "NEXT FOCUS", FINAL_GOAL: "FINAL GOAL" };
export const format = (value: number | null | undefined, unit = "") => value == null ? "미집계" : `${Number(value.toFixed(1))}${unit}`;
export const challengeStatus = (challenge: Challenge, date = today()) => challenge.startDate > date && (challenge.status === "ACTIVE" || challenge.status === "WAITING") ? "시작 예정" : statusNames[challenge.status];
type Drafts = ReturnType<typeof useChallengeDrafts>;

/** Both entry points keep the existing ID draft queue and canonical store mutations. */
export function ChallengeDetail({ challenge, store, drafts, onRemoved, onChanged }: { challenge: Challenge; store: DietStore; drafts: Drafts; onRemoved?: () => void; onChanged?: () => void }) {
  const persisted = store.data.challenges.find(c => c.id === challenge.id) ?? null;
  const base = drafts.drafts[challenge.id]?.base ?? persisted;
  const [deleteTarget, setDeleteTarget] = useState<Challenge | null>(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState("");
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const milestones = store.data.milestones.filter(m => m.challengeId === challenge.id).sort((a, b) => a.date.localeCompare(b.date));
  const progress = challengeProgress(challenge, store.data);
  const changed = drafts.changedIds.includes(challenge.id), disabled = !drafts.ready || drafts.saving || store.busy || deleting;
  const change = <K extends keyof Challenge>(key: K, value: Challenge[K]) => drafts.change({ ...challenge, [key]: value });
  const fieldClass = (key: keyof Challenge) => !base || JSON.stringify(challenge[key]) !== JSON.stringify(base[key]) ? "dp-field-changed" : "";
  const numeric = (label: string, key: "startWeight" | "targetWeight" | "currentValue" | "targetValue", max?: number) => <label>{label}<input className={fieldClass(key)} type="number" step={key === "targetValue" && challenge.type === "CHECKLIST" && challenge.goalMode === "COUNT" ? "1" : "any"} min={key === "currentValue" ? "0" : "0.1"} max={max} required={key !== "currentValue"} value={challenge[key] ?? ""} onChange={e => change(key, e.target.value === "" ? null : Number(e.target.value))}/></label>;
  async function remove() {
    setDeleting(true); setDeleteError("");
    try {
      if (!deleteTarget) return;
      await drafts.remove(deleteTarget);
      setDeleteTarget(null); onChanged?.(); onRemoved?.();
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "챌린지를 삭제하지 못했습니다. 다시 시도하세요."); }
    finally { setDeleting(false); }
  }
  return <div className="dp-challenge-detail">
    <header className="dp-toolbar dp-detail-heading"><div><h2>챌린지 상세</h2><p className="dp-hint">목표와 진행 상황을 확인하고 수정하세요.</p></div>{persisted && <button type="button" className="dp-danger" disabled={disabled} onClick={() => { setDeleteError(""); setDeleteTarget(structuredClone(persisted)); }}>챌린지 삭제</button>}</header>
    <form className="dp-inline-editor" onSubmit={async e => { e.preventDefault(); await drafts.save([challenge.id]); onChanged?.(); }}><fieldset disabled={disabled}>
      <section className="dp-editor-section"><h3>기본 정보</h3>
        <div className="dp-form-grid dp-basic-grid"><label>챌린지 제목<input required maxLength={200} className={fieldClass("title")} value={challenge.title} onChange={e => change("title", e.target.value)}/></label><label>설명 · 핵심 목표 (선택)<textarea rows={2} maxLength={2000} className={fieldClass("keyPoint")} value={challenge.keyPoint} onChange={e => change("keyPoint", e.target.value)}/></label></div>
        <div className="dp-form-grid"><label>유형<select disabled={!!base} className={fieldClass("type")} value={challenge.type} onChange={e => change("type", e.target.value as Challenge["type"])}>{Object.entries(typeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>역할<select className={fieldClass("role")} value={challenge.role ?? ""} onChange={e => change("role", e.target.value as ChallengeRole)}><option value="" disabled>역할 선택</option>{Object.entries(roleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>상태<select className={fieldClass("status")} value={challenge.status} onChange={e => change("status", e.target.value as Challenge["status"])}>{Object.entries(statusNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
      </section>
      <section className="dp-editor-section"><h3>목표 설정</h3><div className="dp-form-grid dp-basic-grid"><label>시작일<input name="startDate" type="date" required className={fieldClass("startDate")} value={challenge.startDate} onChange={e => change("startDate", e.target.value)}/></label><label>종료일<input name="endDate" type="date" required min={challenge.startDate} className={fieldClass("endDate")} value={challenge.endDate} onChange={e => change("endDate", e.target.value)}/></label></div>
        {challenge.type === "WEIGHT" && <div className="dp-form-grid dp-basic-grid">{numeric("시작 체중 (kg)", "startWeight")}{numeric("목표 체중 (kg)", "targetWeight")}</div>}
        {challenge.type === "MANUAL" && <div className="dp-form-grid dp-basic-grid">{numeric("현재 값", "currentValue")}{numeric("목표 값", "targetValue")}</div>}
        {challenge.type === "CHECKLIST" && <fieldset className={fieldClass("itemIds")}><legend>대상 체크리스트</legend><div className="dp-actions">{(["CORE", "SECONDARY", "OPTIONAL"] as Importance[]).map(group => <button type="button" key={group} onClick={() => change("itemIds", store.data.items.filter(item => item.active && item.importance === group).map(item => item.id))}>{group} 선택</button>)}</div><p className="dp-hint">그룹 선택 시 현재 항목을 대상으로 보관합니다. 이후 중요도를 바꿔도 대상은 유지됩니다.</p><div className="dp-item-options">{store.data.items.filter(item => item.active || challenge.itemIds.includes(item.id)).map(item => <label key={item.id}><input type="checkbox" checked={challenge.itemIds.includes(item.id)} onChange={e => change("itemIds", e.target.checked ? [...challenge.itemIds, item.id] : challenge.itemIds.filter(id => id !== item.id))}/>{item.title} <small>{item.importance}</small></label>)}</div>{!store.data.items.length && <p className="dp-hint">기록 화면에서 체크리스트 항목을 먼저 추가하세요.</p>}<div className="dp-form-grid dp-basic-grid"><label>목표 방식<select className={fieldClass("goalMode")} value={challenge.goalMode} onChange={e => change("goalMode", e.target.value as Challenge["goalMode"])}><option value="RATE">성공률</option><option value="COUNT">성공 횟수</option></select></label>{numeric(challenge.goalMode === "RATE" ? "목표 성공률 (%)" : "목표 성공 횟수", "targetValue", challenge.goalMode === "RATE" ? 100 : undefined)}</div><label className="dp-inline"><input type="checkbox" checked={challenge.includeMissing} onChange={e => change("includeMissing", e.target.checked)}/>미입력 포함</label><p className="dp-hint">미래 날짜는 집계하지 않습니다. 제외하면 성공·실패가 입력된 기록만 집계합니다.</p></fieldset>}
        <details className="dp-advanced"><summary>고급 설정 · 표시 색상</summary><label>색상<input type="color" className={fieldClass("color")} value={challenge.color} onChange={e => change("color", e.target.value)}/></label></details>
      </section>
      <section className="dp-editor-section"><h3>진행 현황</h3><div className="dp-metrics">
        {challenge.type === "WEIGHT" ? <><Metric label="시작 체중" value={format(challenge.startWeight, " kg")}/><Metric label="현재 체중" value={format(progress.current, " kg")}/><Metric label="목표 체중" value={format(challenge.targetWeight, " kg")}/><Metric label="남은 감량" value={format(progress.remaining, " kg")}/></> : <><Metric label={challenge.type === "CHECKLIST" ? (challenge.goalMode === "RATE" ? "현재 성공률" : "성공 횟수") : "현재 값"} value={format(progress.current, challenge.type === "CHECKLIST" && challenge.goalMode === "RATE" ? "%" : "")}/><Metric label="목표" value={format(progress.target, challenge.type === "CHECKLIST" && challenge.goalMode === "RATE" ? "%" : "")}/></>}
        <Metric label="진행률" value={format(progress.progress, "%")}/>
      </div>{challenge.type === "CHECKLIST" && <p className="dp-hint">미입력 {challenge.includeMissing ? "포함" : "제외"} · 성공 {progress.success} / 집계 {progress.eligible}회</p>}</section>
      <section className="dp-editor-section"><div className={fieldClass("notes")}><BulletEditor value={challenge.notes} onChange={notes => change("notes", notes)}/></div></section>
      {drafts.drafts[challenge.id]?.error && <p className="dp-error" role="alert">{drafts.drafts[challenge.id].error}</p>}
      <div className="dp-editor-actions"><span className="dp-dirty" role="status">{drafts.saving ? "저장 중…" : changed ? "저장하지 않은 변경 · 초안 보관" : "저장됨"}</span><button type="button" disabled={!changed || disabled} onClick={() => drafts.cancel([challenge.id])}>취소</button><button type="submit" className="primary" disabled={!changed || disabled}>저장</button></div>
    </fieldset></form>
    <details className="dp-editor-section dp-milestone-section"><summary>마일스톤 ({milestones.length})</summary><div className="dp-actions"><button type="button" disabled={disabled || !persisted} onClick={() => setMilestone({ id: crypto.randomUUID(), challengeId: challenge.id, date: challenge.endDate, value: (challenge.type === "WEIGHT" ? challenge.targetWeight : challenge.targetValue) ?? 1, title: "", memoItems: [] })}>+ 마일스톤 추가</button></div>{!persisted && <p className="dp-hint">챌린지를 먼저 저장한 뒤 마일스톤을 추가하세요.</p>}{!milestones.length ? <p className="dp-hint">아직 마일스톤이 없습니다.</p> : <ul className="dp-milestone-list">{milestones.map(m => <li key={m.id}><span><time>{m.date}</time><strong>{m.title || "마일스톤"} · {format(m.value, challenge.type === "WEIGHT" ? " kg" : "")}</strong>{m.memoItems.length > 0 && <ul className="dp-bullets">{m.memoItems.map((memo, i) => <li key={i}>{memo}</li>)}</ul>}</span><button type="button" disabled={disabled} onClick={() => setMilestone(structuredClone(m))}>수정</button></li>)}</ul>}</details>
    {deleteTarget && <Dialog title="챌린지 삭제 확인" onClose={() => { if (!deleting) setDeleteTarget(null); }} small><p><strong>“{deleteTarget.title}”</strong> 챌린지를 삭제할까요?</p><p>이 챌린지의 마일스톤 {milestones.length}개, 기존 연결 목표와 항목 연결이 삭제되며 복구할 수 없습니다. 공유 일지, 측정 기록, 체크리스트 항목과 날짜별 체크 기록은 유지됩니다.</p>{changed && <p>이 챌린지의 보관된 초안도 함께 해제합니다.</p>}{deleteError && <p className="dp-error" role="alert">{deleteError}</p>}<div className="dp-modal-actions"><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</button><button type="button" className="dp-danger" disabled={deleting} onClick={() => void remove()}>{deleting ? "삭제 중…" : "챌린지 삭제 확인"}</button></div></Dialog>}
    {milestone && <MilestoneEditor initial={milestone} store={store} challenge={challenge} onClose={() => setMilestone(null)}/>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }

function Dialog({ title, onClose, children, small = false }: { title: string; onClose: () => void; children: ReactNode; small?: boolean }) {
  const panel = useRef<HTMLElement>(null), close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const controls = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') ?? []).filter(element => {
      for (let parent = element.parentElement; parent && parent !== node; parent = parent.parentElement) if (parent.tagName === "DETAILS" && !parent.hasAttribute("open") && !parent.querySelector(":scope > summary")?.contains(element)) return false;
      return true;
    });
    (controls()[0] ?? node)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") { const items = controls(), first = items[0], last = items.at(-1); if (!first) { event.preventDefault(); return; } if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    };
    node?.addEventListener("keydown", key);
    return () => { node?.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return <div className="dp-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={panel} className={`dp-modal dp-challenge-modal${small ? " dp-modal-small" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="dp-toolbar"><h2>{title}</h2><button type="button" aria-label="닫기" onClick={onClose}>×</button></div>{children}</section></div>;
}

export function ChallengeDetailModal({ challengeId, store, onClose, onChanged }: { challengeId: string; store: DietStore; onClose: () => void; onChanged?: () => void }) {
  const drafts = useChallengeDrafts(store);
  const challenge = drafts.drafts[challengeId]?.value ?? store.data.challenges.find(c => c.id === challengeId);
  const close = () => { if (drafts.saving || store.busy) return; if (drafts.changedIds.includes(challengeId) && (!drafts.canPersist() || !window.confirm("저장하지 않은 변경은 초안으로 보관됩니다. 닫을까요?"))) return; onClose(); };
  return <Dialog title="챌린지 수정" onClose={close}>{drafts.storageError && <p role="alert" className="dp-error">{drafts.storageError}</p>}{challenge ? <ChallengeDetail key={challenge.id} challenge={challenge} store={store} drafts={drafts} onRemoved={onClose} onChanged={onChanged}/> : <p>챌린지를 찾을 수 없습니다. 목록을 다시 불러오세요.</p>}</Dialog>;
}

function MilestoneEditor({ initial, store, challenge, onClose }: { initial: Milestone; store: DietStore; challenge: Challenge; onClose: () => void }) {
  const [draft, setDraft] = useState(initial), [error, setError] = useState(""), [saving, setSaving] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const existing = store.data.milestones.some(m => m.id === initial.id);
  const close = () => { if (!saving && (JSON.stringify(initial) === JSON.stringify(draft) || window.confirm("마일스톤 변경을 취소할까요?"))) onClose(); };
  const submit = async (remove = false) => { setError(""); setSaving(true); try { if (remove) await store.remove("milestones", draft.id); else await store.save("milestones", { ...draft, memoItems: draft.memoItems.map(item => item.trim()).filter(Boolean) }); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setSaving(false); } };
  return <Dialog title={`마일스톤 ${existing ? "수정" : "추가"}`} small onClose={close}><form onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={saving || store.busy}><label>날짜<input name="date" type="date" min={challenge.startDate} max={challenge.endDate} required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}/></label><label>목표 값 {challenge.type === "WEIGHT" ? "(kg)" : ""}<input type="number" step="any" min="0.1" required value={draft.value} onChange={e => setDraft({ ...draft, value: Number(e.target.value) })}/></label><label>제목 (선택)<input maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label><BulletEditor value={draft.memoItems} onChange={memoItems => setDraft({ ...draft, memoItems })}/>{error && <p role="alert" className="dp-error">{error}</p>}{confirmDelete && <p>“{initial.title || initial.date}” 마일스톤을 삭제할까요? <button type="button" className="dp-danger" onClick={() => void submit(true)}>마일스톤 삭제 확인</button></p>}<div className="dp-modal-actions">{existing && <button type="button" onClick={() => setConfirmDelete(true)}>삭제</button>}<button type="button" onClick={close}>취소</button><button className="primary">{saving ? "저장 중…" : "저장"}</button></div></fieldset></form></Dialog>;
}
