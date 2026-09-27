"use client";

import { useState } from "react";
import type { Phase, Project, WorkTask } from "@/lib/api/workflow";
import { useWorkflow } from "./WorkflowContext";
import { AddTask, InlineField } from "./TaskDetails";
import TaskDetailPanel from "./TaskDetailPanel";
import { TaskRow } from "./TaskRow";
import { reorderIds, moveTask, progress } from "./projects-todo-utils";

/** Restrained Phase identity colors (header band only). Unassigned stays neutral. */
const PHASE_COLORS = ["#4f7fc4", "#8a6bbf", "#3f9a73", "#c2893a", "#3b93a5", "#b56a86"];

export function Progress({ tasks }: { tasks: WorkTask[] }) {
  const value = progress(tasks);
  return <span className="wf-progress"><progress value={value.done} max={value.total || 1}/><small>{value.done}/{value.total} ({value.percent}%)</small></span>;
}

export function ProjectDetails({ project, onClose }: { project: Project; onClose?: () => void }) {
  const { tasks, updateProject, deleteProject } = useWorkflow();
  const [message, setMessage] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const children = tasks.filter(task => task.projectId === project.id && !task.archivedAt), incomplete = children.filter(task => task.status !== "DONE").length;
  async function update(patch: Partial<Project>) { try { await updateProject(project.id, patch); setMessage(""); } catch (e) { setMessage(e instanceof Error ? e.message : "저장 실패"); } }
  return <section className="wf-detail" aria-label="프로젝트 상세"><header><h2>프로젝트 상세</h2>{onClose && <button onClick={onClose} aria-label="상세 닫기">×</button>}</header>
    <InlineField label="프로젝트 제목" value={project.title} className="wf-detail-title" onSave={title => { if (title.trim()) void update({ title: title.trim() }); }}/>
    <label>상태<select value={project.status} onChange={event => void update({ status: event.target.value as Project["status"] })}><option value="READY">준비</option><option value="ACTIVE">진행</option><option value="PAUSED">보류</option><option value="DONE">완료</option></select></label>
    {incomplete > 0 && <p className="wf-warning">미완료 작업이 {incomplete}개 있습니다. 프로젝트를 완료해도 작업 상태는 유지됩니다.</p>}
    <label>시작일<InlineField label="프로젝트 시작일" type="date" value={project.startDate} onSave={startDate => void update({ startDate: startDate || null })}/></label>
    <label>종료일<InlineField label="프로젝트 종료일" type="date" value={project.endDate} onSave={endDate => void update({ endDate: endDate || null })}/></label>
    <label>색상<input type="color" aria-label="프로젝트 색상" value={project.color || "#0969da"} onChange={event => void update({ color: event.target.value })}/></label>
    <label>진행률<Progress tasks={children}/></label>
    <label className="wf-stack">메모<InlineField label="프로젝트 메모" value={project.memo} multiline onSave={memo => void update({ memo })}/></label>
    <p className="wf-muted">각 항목의 날짜는 직접 정합니다. 하위 작업의 날짜가 달라도 저장할 수 있습니다.</p>
    {confirmDelete ? <div className="wf-delete-confirm"><p>프로젝트를 삭제할까요? 먼저 하위 작업을 이동하거나 삭제하고 Phase를 삭제해야 합니다.</p><button onClick={async () => { try { await deleteProject(project.id); onClose?.(); } catch (e) { setMessage(e instanceof Error ? e.message : "삭제 실패"); } }}>삭제</button><button onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className="wf-danger" onClick={() => setConfirmDelete(true)}>프로젝트 삭제</button>}
    {message && <p role="alert">{message}</p>}
  </section>;
}

export function PhaseDetails({ phase, onClose }: { phase: Phase; onClose?: () => void }) {
  const { tasks, updatePhase, deletePhase } = useWorkflow();
  const [message, setMessage] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  async function update(patch: Partial<Phase>) { try { await updatePhase(phase.id, patch); setMessage(""); } catch (e) { setMessage(e instanceof Error ? e.message : "저장 실패"); } }
  return <section className="wf-detail" aria-label="Phase 상세"><header><h2>Phase 상세</h2>{onClose && <button onClick={onClose} aria-label="상세 닫기">×</button>}</header>
    <InlineField label="Phase 제목" value={phase.title} className="wf-detail-title" onSave={title => { if (title.trim()) void update({ title: title.trim() }); }}/>
    <label>상태<select value={phase.status} onChange={event => void update({ status: event.target.value as Phase["status"] })}><option>TODO</option><option>DOING</option><option>DONE</option></select></label>
    <label>시작일<InlineField label="Phase 시작일" type="date" value={phase.startDate} onSave={startDate => void update({ startDate: startDate || null })}/></label>
    <label>종료일<InlineField label="Phase 종료일" type="date" value={phase.endDate} onSave={endDate => void update({ endDate: endDate || null })}/></label>
    <label>진행률<Progress tasks={tasks.filter(task => task.phaseId === phase.id)}/></label>
    <label className="wf-stack">메모<InlineField label="Phase 메모" value={phase.memo} multiline onSave={memo => void update({ memo })}/></label>
    {confirmDelete ? <div className="wf-delete-confirm"><p>Phase를 삭제할까요? 먼저 하위 작업을 이동하거나 삭제해야 합니다.</p><button onClick={async () => { try { await deletePhase(phase.id); onClose?.(); } catch (e) { setMessage(e instanceof Error ? e.message : "삭제 실패"); } }}>삭제</button><button onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className="wf-danger" onClick={() => setConfirmDelete(true)}>Phase 삭제</button>}
    {message && <p role="alert">{message}</p>}
  </section>;
}

export default function Projects() {
  const { projects, phases, tasks, saveProject, savePhase, updateProject, updatePhase, updateTask } = useWorkflow();
  const [projectId, setProjectId] = useState<string | null>(null), [selection, setSelection] = useState<{ kind: "project" | "phase" | "task"; id: string } | null>(null);
  const [search, setSearch] = useState(""), [newProject, setNewProject] = useState(""), [creating, setCreating] = useState(false), [newPhase, setNewPhase] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const project = projects.find(item => item.id === projectId) ?? projects.find(item => item.status !== "DONE") ?? projects[0];
  const projectTasks = tasks.filter(task => task.projectId === project?.id);
  const projectPhases = phases.filter(phase => phase.projectId === project?.id).sort((a, b) => a.order - b.order);
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); } finally { setBusy(false); } }
  async function dropTask(id: string, phaseId: string | null, beforeId?: string) { if (!project || busy) return; await act(async () => { for (const task of moveTask(tasks, id, project.id, phaseId, beforeId)) await updateTask(task.id, { projectId: task.projectId, phaseId: task.phaseId, order: task.order }); }); }
  const chosenTask = selection?.kind === "task" ? tasks.find(task => task.id === selection.id) : null;
  const chosenPhase = selection?.kind === "phase" ? phases.find(phase => phase.id === selection.id) : null;
  const visibleProjects = projects.filter(item => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => a.order - b.order);
  // "미분류 작업" is a projection of phase-less Tasks, not a Phase: always first, neutral, never a Phase drop target.
  function section(phase: Phase | null, index = 0) {
    const id = phase?.id ?? "uncategorized", members = projectTasks.filter(task => task.phaseId === (phase?.id ?? null) && !task.archivedAt).sort((a, b) => a.order - b.order);
    const open = !collapsed.includes(id), name = phase?.title ?? "미분류 작업";
    const color = phase ? PHASE_COLORS[index % PHASE_COLORS.length] : undefined;
    return <section key={id} className={`wf-phase-section ${phase ? "" : "is-unassigned"}`} style={color ? { ["--phase-color" as string]: color } : undefined} aria-label={name} onDragOver={event => { if (event.dataTransfer.types.includes("application/workflow-task") || (phase && event.dataTransfer.types.includes("application/workflow-phase"))) event.preventDefault(); }} onDrop={event => {
      const taskId = event.dataTransfer.getData("application/workflow-task"), phaseId = event.dataTransfer.getData("application/workflow-phase");
      if (taskId) { event.preventDefault(); void dropTask(taskId, phase?.id ?? null); }
      else if (phaseId && phase && !busy) { event.preventDefault(); const ids = reorderIds(projectPhases.map(item => item.id), phaseId, phase.id); void act(async () => { for (const [order, itemId] of ids.entries()) { const item = projectPhases.find(value => value.id === itemId)!; if (item.order !== order) await updatePhase(item.id, { order }); } }); }
    }}>
      <header className="wf-phase-header">
        {phase ? <span draggable className="wf-drag" title="끌어서 Phase 순서 변경" onDragStart={event => { event.dataTransfer.setData("application/workflow-phase", phase.id); event.dataTransfer.effectAllowed = "move"; }}>⠿</span> : <span className="wf-drag-spacer"/>}
        <button className="wf-phase-toggle" aria-label={`${name} 접기/펼치기`} aria-expanded={open} onClick={() => setCollapsed(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id])}>{open ? "▾" : "▸"}</button>
        <span className="wf-phase-badge" aria-hidden>{phase ? index + 1 : "–"}</span>
        <div className="wf-phase-heading">
          {phase ? <InlineField value={phase.title} label="Phase 이름 편집" className="wf-phase-title" onSave={title => { if (title.trim()) void act(() => updatePhase(phase.id, { title: title.trim() })); }}/> : <h3>미분류 작업</h3>}
          {!phase && <small>아직 작업 묶음에 배정되지 않은 작업입니다.</small>}
        </div>
        <span className="wf-count" title="작업 수">{members.length}</span><Progress tasks={members}/>{phase && <button className="wf-phase-detail" aria-label={`${phase.title} 상세`} onClick={() => setSelection({ kind: "phase", id: phase.id })}>상세</button>}
      </header>
      {open && <div className="wf-phase-content">
        {members.map(task => <TaskRow key={task.id} task={task} variant="project" draggable selected={selection?.kind === "task" && selection.id === task.id} onSelect={() => setSelection({ kind: "task", id: task.id })} onDropTask={movedId => void dropTask(movedId, phase?.id ?? null, task.id)}/>)}
        {!members.length && <p className="wf-phase-empty">{phase ? "이 묶음에 작업이 없습니다." : "작업을 여기로 끌어 놓으면 묶음 배정이 해제됩니다."}</p>}
        <AddTask projectId={project.id} phaseId={phase?.id ?? null}/>
      </div>}
    </section>;
  }
  return <div className={`wf-projects-layout ${chosenTask ? "has-task-detail" : ""}`}>
    <aside className="wf-project-list"><h2>프로젝트</h2><input aria-label="프로젝트 검색" placeholder="프로젝트 검색…" value={search} onChange={event => setSearch(event.target.value)}/><button className="wf-primary" onClick={() => setCreating(true)}>+ 프로젝트</button>
      {creating && <form className="wf-project-create" onSubmit={event => { event.preventDefault(); if (!newProject.trim() || busy) return; void act(async () => { const created = await saveProject({ title: newProject.trim(), status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: Math.max(-1, ...projects.map(item => item.order)) + 1 }); setProjectId(created.id); setSelection(null); setNewProject(""); setCreating(false); }); }}><input autoFocus aria-label="새 프로젝트 제목" placeholder="프로젝트 이름" value={newProject} onChange={event => setNewProject(event.target.value)}/><button disabled={busy || !newProject.trim()}>추가</button><button type="button" onClick={() => setCreating(false)}>취소</button></form>}
      {([false, true] as const).map(done => <div key={String(done)}><h3>{done ? "완료 / 보관" : "진행 중 / 일시 중지"}</h3>{visibleProjects.filter(item => (item.status === "DONE") === done).map(item => <button key={item.id} className={`wf-project-item ${project?.id === item.id ? "selected" : ""}`} onClick={() => { setProjectId(item.id); setSelection(null); }}><span className="wf-color-dot" style={{ background: item.color || "#0969da" }}/><span><strong>{item.title}</strong><small>{item.startDate || "시작일 없음"} – {item.endDate || "종료일 없음"}</small><small>{progress(tasks.filter(task => task.projectId === item.id)).percent}% · {item.status}</small></span></button>)}</div>)}
    </aside>
    <main className="wf-project-main">{error && <p role="alert" className="wf-error">{error}</p>}{project ? <>
      <header className="wf-project-heading"><span className="wf-color-dot" style={{ background: project.color || "#0969da" }}/><InlineField label="프로젝트 이름 편집" value={project.title} onSave={title => { if (title.trim()) void act(() => updateProject(project.id, { title: title.trim() })); }}/><button onClick={() => setSelection({ kind: "project", id: project.id })}>프로젝트 상세</button></header>
      <p className="wf-muted">{project.memo || "프로젝트의 작업과 계획을 한곳에서 정리하세요."}</p>
      <div className="wf-project-summary"><label>상태<select aria-label="프로젝트 상태" value={project.status} onChange={event => void act(() => updateProject(project.id, { status: event.target.value as Project["status"] }))}><option value="READY">준비</option><option value="ACTIVE">진행</option><option value="PAUSED">보류</option><option value="DONE">완료</option></select></label><label>시작일<InlineField type="date" label="프로젝트 시작일 편집" value={project.startDate} onSave={startDate => void act(() => updateProject(project.id, { startDate: startDate || null }))}/></label><label>종료일<InlineField type="date" label="프로젝트 종료일 편집" value={project.endDate} onSave={endDate => void act(() => updateProject(project.id, { endDate: endDate || null }))}/></label><label>진행률<Progress tasks={projectTasks}/></label></div>
      {project.status === "DONE" && projectTasks.some(task => task.status !== "DONE") && <p className="wf-warning">프로젝트는 완료 상태입니다. 미완료 작업은 그대로 남아 있습니다.</p>}
      {section(null)}{projectPhases.map((phase, index) => section(phase, index))}
      <form className="wf-add-inline wf-add-phase" onSubmit={event => { event.preventDefault(); if (!newPhase.trim() || busy) return; void act(async () => { await savePhase({ projectId: project.id, title: newPhase.trim(), status: "TODO", startDate: null, endDate: null, memo: null, order: Math.max(-1, ...projectPhases.map(phase => phase.order)) + 1 }); setNewPhase(""); }); }}><input aria-label="새 Phase 제목" placeholder="+ Phase 추가" value={newPhase} onChange={event => setNewPhase(event.target.value)}/><button disabled={!newPhase.trim() || busy}>추가</button></form>
    </> : <div className="wf-empty"><h2>첫 프로젝트를 시작하세요</h2><p>프로젝트를 만들고 Phase와 작업을 추가하세요.</p><button onClick={() => setCreating(true)}>+ 프로젝트</button></div>}</main>
    <aside className={`wf-context-rail ${chosenTask ? "is-task-detail" : ""}`}>{chosenTask ? <TaskDetailPanel key={chosenTask.id} taskId={chosenTask.id} onClose={() => setSelection(null)} onSelect={id => setSelection(id ? { kind: "task", id } : null)}/> : chosenPhase ? <PhaseDetails key={chosenPhase.id} phase={chosenPhase} onClose={() => setSelection(null)}/> : project ? <ProjectDetails key={project.id} project={project}/> : <p className="wf-muted">프로젝트나 작업을 선택하면 상세 정보를 편집할 수 있습니다.</p>}</aside>
  </div>;
}
