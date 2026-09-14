"use client";

import { useState } from "react";
import type { WorkTask } from "@/lib/api/workflow";
import { useWorkflow } from "./WorkflowContext";

export function InlineField({ value, onSave, label, multiline = false, type = "text", className = "" }: {
  value: string | null; onSave: (value: string) => void; label: string; multiline?: boolean; type?: string; className?: string;
}) {
  const props = { "aria-label": label, defaultValue: value ?? "", className,
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (event.target.value !== (value ?? "")) onSave(event.target.value); } };
  return multiline ? <textarea key={value} {...props} rows={4}/> : <input key={value} {...props} type={type} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = value ?? ""; event.currentTarget.blur(); } }}/>;
}

export function AddTask({ projectId = null, phaseId = null }: { projectId?: string | null; phaseId?: string | null }) {
  const { saveTask, tasks } = useWorkflow();
  const [title, setTitle] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="wf-add-inline" onSubmit={async event => {
    event.preventDefault(); if (!title.trim() || busy) return; setBusy(true); setError("");
    try { await saveTask({ title: title.trim(), projectId, phaseId, status: "TODO", priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: Math.max(-1, ...tasks.filter(task => task.projectId === projectId && task.phaseId === phaseId).map(task => task.order)) + 1 }); setTitle(""); }
    catch (e) { setError(e instanceof Error ? e.message : "작업을 추가하지 못했습니다."); } finally { setBusy(false); }
  }}><input aria-label="새 작업 제목" placeholder="+ 작업 추가" value={title} onChange={event => setTitle(event.target.value)}/><button disabled={!title.trim() || busy}>추가</button>{error && <span role="alert">{error}</span>}</form>;
}

export default function TaskDetails({ task, onClose, beforeDelete, onDeleted }: {
  task: WorkTask; onClose?: () => void; beforeDelete?: () => Promise<void>; onDeleted?: () => Promise<void>;
}) {
  const { projects, phases, saveTask, deleteTask, addToToday } = useWorkflow();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  async function run(action: () => Promise<unknown>, success = "") {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); } catch (e) { setMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  }
  const update = (patch: Partial<WorkTask>) => void run(() => saveTask({ ...task, ...patch }));
  return <section className="wf-detail" aria-label="작업 상세">
    <header><h2>작업 상세</h2>{onClose && <button aria-label="상세 닫기" onClick={onClose}>×</button>}</header>
    <fieldset disabled={busy}>
      <InlineField label="작업 제목" value={task.title} className="wf-detail-title" onSave={title => { if (title.trim()) update({ title: title.trim() }); }}/>
      <label>상태<select value={task.status} onChange={event => update({ status: event.target.value as WorkTask["status"] })}><option>TODO</option><option>DOING</option><option>DONE</option></select></label>
      <label>프로젝트<select value={task.projectId ?? ""} onChange={event => update({ projectId: event.target.value || null, phaseId: null })}><option value="">프로젝트 없음</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
      <label>Phase<select value={task.phaseId ?? ""} disabled={!task.projectId} onChange={event => update({ phaseId: event.target.value || null })}><option value="">미분류 작업</option>{phases.filter(phase => phase.projectId === task.projectId).map(phase => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></label>
      <label>우선순위<select value={task.priority} onChange={event => update({ priority: event.target.value as WorkTask["priority"] })}><option value="HIGH">높음</option><option value="NORMAL">보통</option><option value="LOW">낮음</option></select></label>
      <label>시작일<InlineField label="작업 시작일" type="date" value={task.startDate} onSave={startDate => update({ startDate: startDate || null })}/></label>
      <label>마감일<InlineField label="작업 마감일" type="date" value={task.dueDate} onSave={dueDate => update({ dueDate: dueDate || null })}/></label>
      <label className="wf-stack">메모<InlineField label="작업 메모" value={task.memo} multiline onSave={memo => update({ memo })}/></label>
      <button className="wf-primary" onClick={() => void run(() => addToToday(task.id), "오늘 Workpad에 추가했습니다.")}>☀ 오늘에 추가</button>
      <p className="wf-muted">동일한 WorkTask를 오늘 Workpad에 연결합니다.</p>
      {confirmDelete ? <div className="wf-delete-confirm"><p>작업을 삭제할까요?</p><button onClick={() => void run(async () => { await beforeDelete?.(); await deleteTask(task.id); await onDeleted?.(); onClose?.(); })}>삭제</button><button onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className="wf-danger" onClick={() => setConfirmDelete(true)}>작업 삭제</button>}
    </fieldset>
    {message && <p role="status">{message}</p>}
  </section>;
}
