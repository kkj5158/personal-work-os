"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CalendarDays, CalendarPlus, Sun, X } from "lucide-react";
import type { TaskStatus, WorkTask } from "@/lib/api/workflow";
import { PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, shortDate } from "@/lib/workflow/labels";
import { WorkflowConflictError, planDatesOf } from "@/lib/workflow/store";
import { useWorkflow } from "./WorkflowContext";

/**
 * One Task-row interaction model for Project Detail and All To-dos:
 * row body → open the shared S10 detail; anything inside a RowControl → only that control's own action.
 * The boundary is the `data-row-control` attribute, so a new control only needs to be wrapped, never listed.
 */
export const ROW_CONTROL_ATTRIBUTE = "data-row-control";

export function isRowControlEvent(event: Pick<MouseEvent, "target">) {
  const target = event.target as Element | null;
  return !!target?.closest?.(`[${ROW_CONTROL_ATTRIBUTE}]`);
}

export function RowControl({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`wf-row-control ${className}`} {...{ [ROW_CONTROL_ATTRIBUTE]: "" }}>{children}</span>;
}

/** Opens on a plain click of the row body; ignores control clicks and clicks that end a text selection. */
export function rowOpenHandler(onOpen: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || isRowControlEvent(event)) return;
    const selection = typeof window === "undefined" ? null : window.getSelection?.();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
    onOpen();
  };
}

function useRowAction() {
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<unknown>, success = "") {
    try { await action(); setMessage(success); }
    catch (e) { setMessage(e instanceof WorkflowConflictError ? "다른 창에서 먼저 변경되어 최신 값으로 표시합니다." : e instanceof Error ? e.message : "저장 실패"); }
  }
  return { message, run };
}

/** Plan dates are Task-owned plan days (not the legacy range): show the first date, edit the set in a popover. */
function PlanDates({ task }: { task: WorkTask }) {
  const flow = useWorkflow();
  const dates = planDatesOf(flow, task.id);
  const [open, setOpen] = useState(false), [value, setValue] = useState(""), [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function act(action: () => Promise<unknown>) { try { setError(""); await action(); } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } }
  const label = dates.length ? `${shortDate(dates[0])}${dates.length > 1 ? ` +${dates.length - 1}` : ""}` : "계획 없음";
  return <span className="wf-plan-inline" ref={box}>
    <button type="button" className={`wf-inline-chip ${dates.length ? "" : "is-empty"}`} aria-label={`${task.title} 계획 날짜`} aria-expanded={open} title="계획 날짜" onClick={() => setOpen(value => !value)}><CalendarDays size={12}/>{label}</button>
    {open && <span className="wf-plan-pop" role="group" aria-label={`${task.title} 계획 날짜 편집`}>
      <span className="wf-plan-pop-chips">{dates.length ? dates.map(date => <span key={date} className="wf-td-chip">{shortDate(date)}<button type="button" aria-label={`${date} 계획 제거`} onClick={() => void act(() => flow.removePlanDay(task.id, date))}><X size={11}/></button></span>) : <span className="wf-muted">날짜 미정</span>}</span>
      <span className="wf-plan-pop-add"><input type="date" aria-label={`${task.title} 계획 날짜 추가`} value={value} onChange={event => setValue(event.target.value)}/>
        <button type="button" aria-label={`${task.title} 계획 날짜 추가하기`} disabled={!value} onClick={() => { const date = value; setValue(""); void act(() => flow.addPlanDay(task.id, date)); }}><CalendarPlus size={13}/></button></span>
      {error && <small role="alert" className="wf-row-error">{error}</small>}
    </span>}
  </span>;
}

/**
 * Shared Task row. `todo` shows the inline-editable Project / 작업 묶음 as well; inside a Project those are implied
 * by the section. Every inline edit goes through the same revision-checked store as S10 (status via the status command).
 */
export function TaskRow({ task, onSelect, selected = false, variant = "todo", draggable = false, onDropTask }: {
  task: WorkTask; onSelect: () => void; selected?: boolean; variant?: "project" | "todo"; draggable?: boolean; onDropTask?: (id: string) => void;
}) {
  const flow = useWorkflow();
  const { message, run } = useRowAction();
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(task.title);
  const phases = flow.phases.filter(phase => phase.projectId === task.projectId).sort((a, b) => a.order - b.order);
  const update = (patch: Partial<WorkTask>) => void run(() => flow.updateTask(task.id, patch));
  return <div className={`wf-task-row ${task.status === "DONE" ? "is-done" : ""} ${selected ? "is-selected" : ""}`} data-task-id={task.id} onClick={rowOpenHandler(onSelect)}
    onDragOver={event => { if (event.dataTransfer.types.includes("application/workflow-task")) event.preventDefault(); }}
    onDrop={event => { const id = event.dataTransfer.getData("application/workflow-task"); if (id && onDropTask) { event.preventDefault(); event.stopPropagation(); onDropTask(id); } }}>
    <div className="wf-row-main">
      {draggable && <RowControl><span className="wf-drag" draggable onDragStart={event => { event.dataTransfer.setData("application/workflow-task", task.id); event.dataTransfer.effectAllowed = "move"; }} title="끌어서 작업 이동">⠿</span></RowControl>}
      <RowControl><input aria-label={`${task.title} 완료`} type="checkbox" checked={task.status === "DONE"} onChange={event => update({ status: event.target.checked ? "DONE" : "TODO" })}/></RowControl>
      <div className="wf-task-name">{editing
        ? <RowControl><input autoFocus aria-label="작업 이름 편집" value={title} onChange={event => setTitle(event.target.value)} onBlur={() => { setEditing(false); if (title.trim() && title.trim() !== task.title) update({ title: title.trim() }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTitle(task.title); setEditing(false); } }}/></RowControl>
        // The title is the row's keyboard target: Enter/Space click it, and the click reaches the row handler.
        : <button type="button" className="wf-title-button" aria-current={selected || undefined} title="클릭: 상세 · 더블 클릭: 이름 편집" onDoubleClick={() => { setTitle(task.title); setEditing(true); }}>{task.title}</button>}
        {message && <small role="status">{message}</small>}</div>
    </div>
    <RowControl className="wf-row-props">
      {variant === "todo" && <>
        <select className="wf-inline-select wf-inline-project" aria-label={`${task.title} 프로젝트`} value={task.projectId ?? ""} onChange={event => update({ projectId: event.target.value || null, phaseId: null })}>
          <option value="">프로젝트 없음</option>
          {flow.projects.filter(item => !item.archivedAt || item.id === task.projectId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <select className="wf-inline-select wf-inline-phase" aria-label={`${task.title} 작업 묶음`} value={task.phaseId ?? ""} disabled={!task.projectId} onChange={event => update({ phaseId: event.target.value || null })}>
          <option value="">미분류</option>{phases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </>}
      <select className={`wf-inline-select wf-status ${task.status.toLowerCase()}`} aria-label={`${task.title} 상태`} value={task.status} onChange={event => update({ status: event.target.value as TaskStatus })}>
        {TASK_STATUSES.map(value => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}
      </select>
      <select className={`wf-inline-select wf-priority ${task.priority.toLowerCase()}`} aria-label={`${task.title} 우선순위`} value={task.priority} onChange={event => update({ priority: event.target.value as WorkTask["priority"] })}>
        {(["HIGH", "NORMAL", "LOW"] as const).map(value => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
      </select>
      <PlanDates task={task}/>
      <input type="date" className={`wf-inline-date ${task.deadlineDate ? "" : "is-empty"}`} aria-label={`${task.title} 마감일`} title="마감일" value={task.deadlineDate ?? ""} onChange={event => update({ deadlineDate: event.target.value || null })}/>
      <button type="button" className="wf-add-today" aria-label="오늘에 추가" title="오늘에 추가" onClick={() => void run(() => flow.addToToday(task.id), "오늘에 추가됨")}><Sun size={12} aria-hidden/><span>오늘에 추가</span></button>
    </RowControl>
  </div>;
}
