"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, CalendarDays, ChevronRight, Clock, Pin, PinOff, Plus, Settings2, Sun, Target, X } from "lucide-react";
import { workflowApi, type Phase, type Project, type ProjectStatus, type ProjectType, type RecentRecord, type WorkTask } from "@/lib/api/workflow";
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, TASK_STATUS_LABELS, shortDate } from "@/lib/workflow/labels";
import { BASIS_LABELS, projectProgress, resumeContext, type ProjectProgress } from "@/lib/workflow/progress";
import { weekRows } from "@/lib/workflow/week";
import { projectColor } from "@/lib/workflow/timeline";
import { useWorkflow } from "./WorkflowContext";
import { AddTask, InlineField } from "./TaskDetails";
import TaskDetailPanel, { Resources } from "./TaskDetailPanel";
import SplitView from "./SplitView";
import { useTaskSelection } from "./useTaskSelection";
import { RowControl, TaskRow, rowOpenHandler } from "./TaskRow";
import { reorderIds, moveTask, progress } from "./projects-todo-utils";
import { ProjectCatalog, type RowRender } from "./ProjectCatalog";
import { nextUngroupedOrder } from "@/lib/workflow/catalog";
import { useFlip } from "@/lib/workflow/dnd";

/** Restrained Phase identity colors (header band only). 미분류 stays neutral. */
const PHASE_COLORS = ["#4f7fc4", "#8a6bbf", "#3f9a73", "#c2893a", "#3b93a5", "#b56a86"];
const PROJECT_COLORS = ["#0969da", "#8250df", "#1a7f37", "#bf8700", "#0a7ea4", "#cf222e"];
const STATUSES: ProjectStatus[] = ["READY", "ACTIVE", "PAUSED", "DONE"];
const TYPES: ProjectType[] = ["GENERAL", "DEVELOPMENT", "CONTENT", "PERSONAL"];
const BASIC_GROUPS = ["기획", "디자인", "구현", "검증"];
const errorText = (e: unknown) => e instanceof Error ? e.message : "저장하지 못했습니다.";

/** Used by All To-dos group headers (count-based, per group). */
export function Progress({ tasks }: { tasks: WorkTask[] }) {
  const value = progress(tasks);
  return <span className="wf-progress"><progress value={value.done} max={value.total || 1}/><small>{value.done}/{value.total} ({value.percent}%)</small></span>;
}
function ProjectPercent({ value }: { value: ProjectProgress }) {
  return <span className="wf-progress wf-project-percent"><progress value={value.percent} max={100}/><small>{value.percent}% · {BASIS_LABELS[value.basis]}</small></span>;
}

/** ?project= keeps the open Project across reloads and tabs, next to ?task= (S10). */
function useProjectParam(): [string | null, (id: string | null) => void] {
  const params = useSearchParams();
  const fromUrl = params ? params.get("project") : typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("project");
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocal(undefined); }, [fromUrl]);
  const select = useCallback((id: string | null) => {
    setLocal(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("project", id); else url.searchParams.delete("project");
    url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return [local !== undefined ? local : fromUrl, select];
}

type Panel = { mode: "create" } | { mode: "settings"; id: string } | null;

/** S01 list → S02 detail, S03 create/settings and S10 in the same non-modal split. */
export default function Projects() {
  const flow = useWorkflow();
  const [projectId, openProject] = useProjectParam();
  const [selectedTask, selectTask] = useTaskSelection();
  const [panel, setPanel] = useState<Panel>(null);
  const project = projectId ? flow.projects.find(item => item.id === projectId) ?? null : null;
  const { ensureWeek } = flow;
  useEffect(() => { void ensureWeek(); }, [ensureWeek]);
  const open = (id: string | null) => { setPanel(null); openProject(id); };
  const detail = selectedTask && project ? <TaskDetailPanel key={selectedTask} taskId={selectedTask} onClose={() => selectTask(null)} onSelect={selectTask}/>
    : panel?.mode === "create" ? <ProjectForm onClose={() => setPanel(null)} onCreated={id => { setPanel(null); openProject(id); }}/>
    : panel?.mode === "settings" && project ? <ProjectSettings key={project.id} project={project} onClose={() => setPanel(null)}/> : null;
  return <SplitView detail={detail} label={selectedTask ? "작업 상세" : panel?.mode === "create" ? "새 프로젝트" : "프로젝트 설정"}>
    {project ? <ProjectDetail project={project} selectedTask={selectedTask} onTask={id => { setPanel(null); selectTask(id); }} onBack={() => open(null)} onSettings={() => { selectTask(null); setPanel({ mode: "settings", id: project.id }); }}/>
      : <ProjectsList onOpen={id => open(id)} onCreate={() => setPanel({ mode: "create" })} creating={panel?.mode === "create"} missing={!!projectId && !flow.loading}/>}
  </SplitView>;
}

/* ------------------------------------------------------------------ S01 list */

function ProjectsList({ onOpen, onCreate, creating, missing }: { onOpen: (id: string) => void; onCreate: () => void; creating: boolean; missing: boolean }) {
  const flow = useWorkflow();
  const [filter, setFilter] = useState<ProjectStatus[]>(["READY", "ACTIVE"]), [archived, setArchived] = useState(false), [search, setSearch] = useState(""), [error, setError] = useState("");
  const live = flow.projects.filter(project => !project.archivedAt), stored = flow.projects.filter(project => project.archivedAt);
  const week = flow.week, weekly = week ? weekRows(week, flow.tasks) : [];
  // Order comes from the Projects catalog (group order, then manual order inside the group), not from this filter.
  const visible = (archived ? stored : live.filter(project => filter.includes(project.status)))
    .filter(project => `${project.title} ${project.goal ?? ""} ${project.memo ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const renderRow: RowRender = (project, index, handle) => {
      const value = projectProgress(project, flow.phases, flow.tasks), resume = resumeContext(project, flow.phases, flow.tasks);
      const included = !!week?.projects.some(item => item.projectId === project.id), selected = weekly.filter(row => row.task.projectId === project.id && row.selected).length;
      return { className: `wf-project-row ${project.archivedAt ? "is-archived" : ""}`, style: { ["--group-color" as string]: projectColor(project.color) }, onClick: rowOpenHandler(() => onOpen(project.id)), content: <>
        {handle ?? <span className="wf-drag-cell"/>}
        <span className="wf-project-index">{String(index + 1).padStart(2, "0")}</span>
        <div className="wf-project-identity">
          <button type="button" className="wf-title-button wf-project-name"><span className="wf-color-dot" style={{ background: projectColor(project.color) }}/>{project.title}</button>
          <small className="wf-project-type">{PROJECT_TYPE_LABELS[project.projectType ?? "GENERAL"]}</small>
          <p>{project.goal || project.memo || <span className="wf-muted">목표 한 문장을 적어 두면 여기서 바로 보입니다.</span>}</p>
          <ProjectPercent value={value}/>
        </div>
        <div className="wf-project-resume">
          <p><strong>{resume?.source === "waiting" ? "대기" : "이어갈 작업"}</strong>{resume ? <>{resume.task.title}{resume.source === "pinned" && <small> · 고정</small>}{resume.source === "waiting" && resume.task.waitingReason && <small> · {resume.task.waitingReason}</small>}</> : <span className="wf-muted">열린 작업 없음</span>}</p>
          <p><strong>이번 주</strong>{included ? `포함 · 집중 ${selected}` : selected ? `집중 ${selected} (프로젝트 미포함)` : <span className="wf-muted">포함 안 됨</span>}</p>
        </div>
        <div className="wf-project-meta">
          <span className={`wf-project-status is-${project.status.toLowerCase()}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
          {(project.startDate || project.endDate) && <small><CalendarDays size={12}/> {project.startDate ?? "—"} ~ {project.endDate ?? "—"}</small>}
          {project.archivedAt ? <RowControl><button onClick={() => void flow.archiveProject(project.id, false).catch(e => setError(errorText(e)))}><ArchiveRestore size={13}/> 복구</button></RowControl> : <ChevronRight size={16} className="wf-muted"/>}
        </div>
      </> };
  };
  const toggle = (status: ProjectStatus) => { setArchived(false); setFilter(current => current.includes(status) ? current.filter(item => item !== status) : [...current, status]); };
  return <div className="wf-projects">
    <header className="wf-projects-head"><div><h1>프로젝트</h1><p className="wf-muted">각 프로젝트의 목표와 이어갈 작업을 한눈에 확인하세요.</p></div>
      <div className="wf-projects-head-actions"><input aria-label="프로젝트 검색" placeholder="프로젝트 검색…" value={search} onChange={event => setSearch(event.target.value)}/>
        <button className="wf-primary" aria-pressed={creating} onClick={onCreate}><Plus size={15}/> 새 프로젝트</button></div></header>
    <div className="wf-projects-filters" role="group" aria-label="프로젝트 상태 필터">
      {STATUSES.map(status => <button key={status} aria-pressed={!archived && filter.includes(status)} onClick={() => toggle(status)}>{PROJECT_STATUS_LABELS[status]} <small>{live.filter(project => project.status === status).length}</small></button>)}
      <span className="wf-projects-filter-sep"/>
      <button aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={13}/> 보관됨 <small>{stored.length}</small></button>
    </div>
    {missing && <p className="wf-week-hint">선택한 프로젝트를 찾을 수 없습니다. 삭제되었거나 다른 창에서 바뀌었을 수 있습니다.</p>}
    {error && <p className="wf-error" role="alert">{error}</p>}
    <ProjectCatalog visible={visible} draggable={!archived} renderRow={renderRow}/>
    {flow.loading && !flow.projects.length && <p className="wf-muted">프로젝트를 불러오는 중…</p>}
    {!flow.loading && !flow.projects.length && <div className="wf-week-empty"><Target size={18}/><div><strong>첫 프로젝트를 만드세요.</strong><p className="wf-muted">이름만 있으면 됩니다. 작업 묶음과 가중치는 나중에 정해도 됩니다.</p><button className="wf-primary" onClick={onCreate}><Plus size={14}/> 새 프로젝트</button></div></div>}
    {!flow.loading && !!flow.projects.length && !visible.length && <p className="wf-week-hint">조건에 맞는 프로젝트가 없습니다. <button className="wf-link" onClick={() => { setArchived(false); setFilter(STATUSES); setSearch(""); }}>필터 초기화</button></p>}
  </div>;
}

/* ------------------------------------------------------------------ S02 detail */

function ProjectDetail({ project, selectedTask, onTask, onBack, onSettings }: { project: Project; selectedTask: string | null; onTask: (id: string) => void; onBack: () => void; onSettings: () => void }) {
  const flow = useWorkflow();
  const { phases, tasks, updateProject, updatePhase, savePhase, updateTask } = flow;
  const [collapsed, setCollapsed] = useState<string[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [newPhase, setNewPhase] = useState(""), [weights, setWeights] = useState(false);
  const projectTasks = tasks.filter(task => task.projectId === project.id);
  const projectPhases = phases.filter(phase => phase.projectId === project.id).sort((a, b) => a.order - b.order);
  const value = projectProgress(project, phases, tasks);
  const active = projectTasks.filter(task => !task.archivedAt);
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  const update = (patch: Partial<Project>) => void act(() => updateProject(project.id, patch));
  async function dropTask(id: string, phaseId: string | null, beforeId?: string) { if (busy) return; await act(async () => { for (const task of moveTask(tasks, id, project.id, phaseId, beforeId)) await updateTask(task.id, { projectId: task.projectId, phaseId: task.phaseId, order: task.order }); }); }
  // "미분류 작업" is a projection of Phase-less Tasks, not a Phase: always first, neutral, never a Phase drop target.
  function section(phase: Phase | null, index = 0) {
    const id = phase?.id ?? "uncategorized", members = projectTasks.filter(task => task.phaseId === (phase?.id ?? null) && !task.archivedAt).sort((a, b) => a.order - b.order);
    const open = !collapsed.includes(id), name = phase?.title ?? "미분류 작업", color = phase ? PHASE_COLORS[index % PHASE_COLORS.length] : undefined;
    const group = value.groups.find(item => item.id === (phase?.id ?? null));
    return <section key={id} className={`wf-phase-section ${phase ? "" : "is-unassigned"}`} style={color ? { ["--phase-color" as string]: color } : undefined} aria-label={name}
      data-flip-id={`phase:${id}`} data-dnd-target="inside" data-dnd-accept={phase ? "application/workflow-task application/workflow-phase" : "application/workflow-task"} onDragOver={event => { if (event.dataTransfer.types.includes("application/workflow-task") || (phase && event.dataTransfer.types.includes("application/workflow-phase"))) event.preventDefault(); }} onDrop={event => {
      const taskId = event.dataTransfer.getData("application/workflow-task"), phaseId = event.dataTransfer.getData("application/workflow-phase");
      if (taskId) { event.preventDefault(); void dropTask(taskId, phase?.id ?? null); }
      else if (phaseId && phase && !busy) { event.preventDefault(); const ids = reorderIds(projectPhases.map(item => item.id), phaseId, phase.id); void act(async () => { for (const [order, itemId] of ids.entries()) { const item = projectPhases.find(entry => entry.id === itemId)!; if (item.order !== order) await updatePhase(item.id, { order }); } }); }
    }}>
      <header className="wf-phase-header" data-dnd-row="">
        {phase ? <span draggable className="wf-drag" title="끌어서 Phase 순서 변경" onDragStart={event => { event.dataTransfer.setData("application/workflow-phase", phase.id); event.dataTransfer.effectAllowed = "move"; }}>⠿</span> : <span className="wf-drag-spacer"/>}
        <button className="wf-phase-toggle" aria-label={`${name} 접기/펼치기`} aria-expanded={open} onClick={() => setCollapsed(old => old.includes(id) ? old.filter(item => item !== id) : [...old, id])}>{open ? "▾" : "▸"}</button>
        <span className="wf-phase-badge" aria-hidden>{phase ? index + 1 : "–"}</span>
        <div className="wf-phase-heading">
          {phase ? <InlineField key={phase.title} value={phase.title} label="Phase 이름 편집" className="wf-phase-title" onSave={title => { if (title.trim()) void act(() => updatePhase(phase.id, { title: title.trim() })); }}/> : <h3>미분류 작업</h3>}
          {!phase && <small>아직 작업 묶음에 배정되지 않은 작업입니다.</small>}
        </div>
        <span className="wf-count" title="작업 수">{members.length}</span>
        {group && (phase || group.weight !== null) && <span className="wf-phase-weight" title="가중치">{group.weight === null ? "가중치 —" : `가중치 ${Number(group.weight)}%`}</span>}
        {group && <span className="wf-progress"><progress value={group.value} max={100}/><small>{group.value}% ({group.done}/{group.total}){group.override !== null && " · 수동"}</small></span>}
      </header>
      {open && <div className="wf-phase-content">
        {members.map(task => <TaskRow key={task.id} task={task} variant="project" draggable selected={selectedTask === task.id} onSelect={() => onTask(task.id)} onDropTask={movedId => void dropTask(movedId, phase?.id ?? null, task.id)}/>)}
        {!members.length && <p className="wf-phase-empty">{phase ? "이 묶음에 작업이 없습니다." : "작업을 여기로 끌어 놓으면 묶음 배정이 해제됩니다."}</p>}
        <AddTask projectId={project.id} phaseId={phase?.id ?? null}/>
      </div>}
    </section>;
  }
  // Smooth settle after Task/Phase moves (transform-only FLIP); order semantics stay project-internal.
  const listRef = useRef<HTMLElement>(null);
  useFlip(listRef, `${projectPhases.map(phase => phase.id).join()}|${projectTasks.map(task => `${task.id}:${task.phaseId}:${task.order}`).join()}`);
  const counts = { DONE: 0, DOING: 0, WAITING: 0 };
  for (const task of active) if (task.status in counts) counts[task.status as keyof typeof counts]++;
  return <div className="wf-project-detail">
    <main className="wf-project-main">
      <nav className="wf-project-crumbs"><button className="wf-link" onClick={onBack}><ArrowLeft size={13}/> 프로젝트</button><ChevronRight size={12}/><span>{project.title}</span></nav>
      {error && <p role="alert" className="wf-error">{error}</p>}
      <header className="wf-project-heading"><span className="wf-color-dot" style={{ background: projectColor(project.color) }}/>
        <InlineField key={project.title} label="프로젝트 이름 편집" value={project.title} onSave={title => { if (title.trim()) update({ title: title.trim() }); }}/>
        <select aria-label="프로젝트 상태" value={project.status} onChange={event => update({ status: event.target.value as ProjectStatus })}>{STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}</select>
        <select aria-label="프로젝트 종류" value={project.projectType ?? "GENERAL"} onChange={event => update({ projectType: event.target.value as ProjectType })}>{TYPES.map(type => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}</select>
        <button onClick={onSettings}><Settings2 size={14}/> 설정</button>
        <button onClick={() => void act(() => flow.archiveProject(project.id, !project.archivedAt))}>{project.archivedAt ? <><ArchiveRestore size={14}/> 보관 해제</> : <><Archive size={14}/> 보관</>}</button>
      </header>
      {project.archivedAt && <p className="wf-warning">보관된 프로젝트입니다. 목록의 ‘보관됨’에서 찾을 수 있고 언제든 복구할 수 있습니다.</p>}
      {project.status === "DONE" && active.some(task => task.status !== "DONE") && <p className="wf-warning">프로젝트는 완료 상태입니다. 미완료 작업은 그대로 남아 있습니다.</p>}
      <section className="wf-project-summary-strip" aria-label="전체 진행률">
        <div className="wf-project-progress"><strong>전체 진행률</strong><ProjectPercent value={value}/></div>
        <dl className="wf-project-counts"><div><dt>완료</dt><dd>{counts.DONE}</dd></div><div><dt>진행 중</dt><dd>{counts.DOING}</dd></div><div><dt>대기</dt><dd>{counts.WAITING}</dd></div><div><dt>전체</dt><dd>{active.length}</dd></div></dl>
        <div className="wf-project-period"><label>시작일<InlineField key={`s${project.startDate}`} type="date" label="프로젝트 시작일 편집" value={project.startDate} onSave={startDate => update({ startDate: startDate || null })}/></label><label>목표일<InlineField key={`e${project.endDate}`} type="date" label="프로젝트 종료일 편집" value={project.endDate} onSave={endDate => update({ endDate: endDate || null })}/></label></div>
        <button aria-expanded={weights} onClick={() => setWeights(!weights)}>가중치 설정</button>
      </section>
      {weights && <WeightsEditor project={project} value={value}/>}
      <div className="wf-project-cards">
        <Card icon={<Target size={15}/>} title="목표"><InlineField key={project.goal ?? ""} multiline label="프로젝트 목표" value={project.goal ?? null} onSave={goal => update({ goal: goal.trim() || null })}/></Card>
        <ResumeCard project={project} onTask={onTask}/>
        <LatestRecord project={project}/>
      </div>
      <WeekProjection project={project} onTask={onTask}/>
      <section ref={listRef} className="wf-project-tasks" aria-label="작업 목록">
        <header><h2>작업 목록</h2><small className="wf-muted">작업을 끌어 묶음을 바꾸거나 순서를 정하세요. 행을 누르면 상세가 열립니다.</small></header>
        {section(null)}{projectPhases.map((phase, index) => section(phase, index))}
        <form className="wf-add-inline wf-add-phase" onSubmit={event => { event.preventDefault(); if (!newPhase.trim() || busy) return; void act(async () => { await savePhase({ projectId: project.id, title: newPhase.trim(), status: "TODO", startDate: null, endDate: null, memo: null, order: Math.max(-1, ...projectPhases.map(phase => phase.order)) + 1 }); setNewPhase(""); }); }}><input aria-label="새 Phase 제목" placeholder="+ 작업 묶음(Phase) 추가" value={newPhase} onChange={event => setNewPhase(event.target.value)}/><button disabled={!newPhase.trim() || busy}>추가</button></form>
      </section>
    </main>
    <aside className="wf-project-rail" aria-label="프로젝트 맥락">
      <Resources projectId={project.id}/>
      <ProjectRecords project={project}/>
    </aside>
  </div>;
}

function Card({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="wf-project-card" aria-label={title}><header><span className="wf-td-block-icon">{icon}</span><h3>{title}</h3>{actions}</header>{children}</section>;
}

/** Resume context without a fake "현재 단계": pinned next Task, else a suggested candidate, else a WAITING reason. */
function ResumeCard({ project, onTask }: { project: Project; onTask: (id: string) => void }) {
  const flow = useWorkflow();
  const resume = resumeContext(project, flow.phases, flow.tasks);
  const [message, setMessage] = useState("");
  const run = (action: () => Promise<unknown>, done = "") => void action().then(() => setMessage(done), e => setMessage(errorText(e)));
  return <Card icon={<ChevronRight size={15}/>} title="다음에 이어갈 작업" actions={resume && resume.source !== "waiting" ? <button className="wf-icon-button" aria-label={resume.source === "pinned" ? "다음 작업 고정 해제" : "다음 작업으로 고정"} title={resume.source === "pinned" ? "고정 해제" : "다음 작업으로 고정"}
    onClick={() => run(() => flow.updateProject(project.id, { nextTaskId: resume.source === "pinned" ? null : resume.task.id }))}>{resume.source === "pinned" ? <PinOff size={14}/> : <Pin size={14}/>}</button> : undefined}>
    {resume ? <>
      <button className="wf-title-button wf-resume-title" onClick={() => onTask(resume.task.id)}>{resume.task.title}</button>
      <small className="wf-muted">{resume.source === "pinned" ? "고정한 다음 작업" : resume.source === "candidate" ? "순서상 다음 후보 (고정하면 확정)" : `대기 중${resume.task.waitingReason ? ` · ${resume.task.waitingReason}` : ""}`} · {TASK_STATUS_LABELS[resume.task.status]}</small>
      {resume.source !== "waiting" && <button className="wf-add-today wf-resume-today" onClick={() => run(() => flow.addToToday(resume.task.id), "오늘 Workpad에 연결했습니다.")}><Sun size={12}/> 오늘에 추가</button>}
    </> : <p className="wf-muted">열린 작업이 없습니다. 아래에서 작업을 추가하세요.</p>}
    {message && <small role="status" className="wf-muted">{message}</small>}
  </Card>;
}

function useProjectRecords(project: Project, limit: number) {
  const flow = useWorkflow();
  const [records, setRecords] = useState<RecentRecord[] | null>(null);
  // Reload when a Task of this Project changes (new references, titles, completion).
  const signature = flow.tasks.filter(task => task.projectId === project.id).map(task => `${task.id}:${task.revision ?? 0}`).join();
  useEffect(() => {
    let live = true;
    workflowApi.projectRecords(project.id, limit).then(list => { if (live) setRecords(list); }).catch(() => { if (live) setRecords([]); });
    return () => { live = false; };
  }, [project.id, limit, signature]);
  return records;
}
function LatestRecord({ project }: { project: Project }) {
  const records = useProjectRecords(project, 1), latest = records?.[0];
  return <Card icon={<Clock size={15}/>} title="최근 작업">
    {records === null ? <p className="wf-muted">불러오는 중…</p> : latest ? <a className="wf-latest-record" href={latest.href}><strong>{shortDate(latest.date)} · {latest.taskTitle}</strong><span>{latest.excerpt || "Workpad에 연결됨"}</span></a> : <p className="wf-muted">아직 Workpad 기록이 없습니다.</p>}
  </Card>;
}
/** "최근 기록" = Workpad TaskReference projection (not an activity log), newest Workpad date first. */
function ProjectRecords({ project }: { project: Project }) {
  const records = useProjectRecords(project, 8);
  return <section className="wf-td-block" aria-label="최근 기록"><header className="wf-td-block-head"><span className="wf-td-block-icon"><Clock size={15}/></span><div><h3>최근 기록<small>{records?.length ?? 0}</small></h3><p>이 프로젝트 작업이 연결된 Workpad 기록입니다.</p></div></header>
    {records === null ? <p className="wf-muted">불러오는 중…</p> : records.length ? <ul className="wf-td-records">{records.map(record => <li key={record.blockId}>
      <a href={record.href}><strong>{shortDate(record.date)}</strong><span>{record.taskTitle}{record.excerpt ? ` — ${record.excerpt}` : ""}</span>{(record.hasImage || record.hasNote) && <small>{[record.hasImage && "이미지", record.hasNote && "노트"].filter(Boolean).join(" · ")}</small>}</a>
    </li>)}</ul> : <p className="wf-muted">아직 Workpad 기록이 없습니다. 작업을 ‘오늘에 추가’하면 여기에 모입니다.</p>}
  </section>;
}

/** Projection of the existing This Week model (work_week_*): the same data S04 edits. */
function WeekProjection({ project, onTask }: { project: Project; onTask: (id: string) => void }) {
  const flow = useWorkflow();
  const week = flow.week, [picking, setPicking] = useState(false), [message, setMessage] = useState("");
  const rows = week ? weekRows(week, flow.tasks).filter(row => row.task.projectId === project.id) : [];
  const included = !!week?.projects.some(item => item.projectId === project.id);
  const scope = week?.projects.find(item => item.projectId === project.id)?.scopeLine;
  const candidates = flow.tasks.filter(task => task.projectId === project.id && !task.archivedAt && task.status !== "DONE" && !rows.some(row => row.task.id === task.id && row.selected));
  const run = (action: () => Promise<unknown>, done = "") => void action().then(() => setMessage(done), e => setMessage(errorText(e)));
  if (!week) return null;
  return <section className="wf-project-week" aria-label="이번 주 계획">
    <header><h2><CalendarDays size={15}/> 이번 주 계획</h2>
      <button aria-pressed={included} onClick={() => run(() => flow.includeProject(week.weekStart, project.id, !included))}>{included ? "이번 주 포함됨" : "이번 주에 포함"}</button>
      <a className="wf-link" href={`/workflow/week`}>이번 주에서 보기 →</a></header>
    {scope && <p className="wf-muted">이번 주에는 여기까지: {scope}</p>}
    {rows.length ? <ul>{rows.map(row => <li key={row.task.id} className={row.task.status === "DONE" ? "is-done" : ""}>
      <button className="wf-title-button" onClick={() => onTask(row.task.id)}>{row.task.title}</button>
      <span className={`wf-week-kind is-${row.kind}`}>{row.kind === "planned" ? "날짜만" : row.kind === "both" ? "집중 · 날짜" : "집중"}</span>
      <small>{row.plannedDates.map(shortDate).join(", ") || "날짜 미정"}</small>
      {row.selected && <button className="wf-week-select" aria-pressed aria-label={`${row.task.title} 이번 주 선택 해제`} onClick={() => run(() => flow.selectWeekTask(week.weekStart, row.task.id, false), row.plannedDates.length ? "집중 선택은 해제됨, 날짜 배치는 유지" : "")}>선택됨</button>}
      <button className="wf-add-today" aria-label="오늘에 추가" onClick={() => run(() => flow.addToToday(row.task.id), "오늘 Workpad에 연결했습니다.")}><Sun size={12}/></button>
    </li>)}</ul> : <p className="wf-muted">이번 주에 선택한 작업이 없습니다.</p>}
    <button className="wf-link" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "▾" : "+"} 이번 주에 작업 추가</button>
    {picking && <ul className="wf-week-candidates">{candidates.map(task => <li key={task.id}><button className="wf-week-select" aria-label={`${task.title} 이번 주 선택`} onClick={() => run(() => flow.selectWeekTask(week.weekStart, task.id, true))}><Plus size={12}/> 선택</button><span>{task.title}</span></li>)}{!candidates.length && <li className="wf-muted">선택할 수 있는 작업이 없습니다.</li>}</ul>}
    {message && <small role="status" className="wf-muted">{message}</small>}
  </section>;
}

/** Lightweight weight / progress editing: Phase weight, automatic vs manual progress, unassigned weight. */
function WeightsEditor({ project, value }: { project: Project; value: ProjectProgress }) {
  const flow = useWorkflow();
  const [message, setMessage] = useState("");
  const run = (action: () => Promise<unknown>) => void action().then(() => setMessage(""), e => setMessage(errorText(e)));
  const number = (raw: string) => raw.trim() === "" ? null : Math.max(0, Math.min(100, Number(raw)));
  const unassigned = value.groups.find(group => group.id === null)!;
  const rows = value.groups.filter(group => group.id !== null || group.total > 0 || group.weight !== null);
  const apply = () => run(async () => {
    for (const group of value.groups) {
      const suggested = value.suggested.get(group.id);
      if (suggested === undefined) continue;
      if (group.id === null) await flow.updateProject(project.id, { unassignedWeight: suggested });
      else await flow.updatePhase(group.id, { weight: suggested });
    }
  });
  return <section className="wf-weights" aria-label="가중치 설정">
    <header><h3>가중치 설정</h3><small className={value.basis === "weighted" ? "is-ok" : "is-pending"}>합계 {value.totalWeight}% · {BASIS_LABELS[value.basis]}</small></header>
    <p className="wf-muted">각 묶음이 프로젝트에 기여하는 비율입니다. 합계가 100%일 때만 가중 진행률을 쓰고, 아니면 작업 수 기준으로 표시합니다. 진행률은 비워 두면 자동(완료 작업 비율)입니다.</p>
    <table><thead><tr><th>묶음</th><th>가중치 %</th><th>진행률</th></tr></thead><tbody>{rows.map(group => {
      const phase = flow.phases.find(item => item.id === group.id);
      return <tr key={group.id ?? "none"}><td>{group.title}{group.id === null && <small className="wf-muted"> (Phase 아님)</small>}</td>
        <td><input type="number" min={0} max={100} aria-label={`${group.title} 가중치`} defaultValue={group.weight ?? ""} key={`w${group.weight}`} placeholder={String(value.suggested.get(group.id) ?? "")}
          onBlur={event => { const next = number(event.target.value); if (next === group.weight) return; run(() => group.id === null ? flow.updateProject(project.id, { unassignedWeight: next }) : flow.updatePhase(group.id!, { weight: next })); }}/></td>
        <td>{phase ? <span className="wf-weights-progress">자동 {group.auto}%<input type="number" min={0} max={100} aria-label={`${group.title} 수동 진행률`} placeholder="자동" defaultValue={group.override ?? ""} key={`o${group.override}`}
          onBlur={event => { const next = number(event.target.value); if (next === group.override) return; run(() => flow.updatePhase(phase.id, { progressOverride: next })); }}/>{group.override !== null && <button className="wf-link" onClick={() => run(() => flow.updatePhase(phase.id, { progressOverride: null }))}>자동으로</button>}</span> : <span>자동 {group.auto}%</span>}</td></tr>;
    })}</tbody></table>
    <div className="wf-weights-actions"><button onClick={apply}>작업 수 비례 제안값 적용</button>{unassigned.total > 0 && unassigned.weight === null && <small className="wf-muted">미분류 작업이 있어 미분류 가중치도 필요합니다.</small>}</div>
    {message && <p role="alert" className="wf-error">{message}</p>}
  </section>;
}

/* ------------------------------------------------------------------ S03 create / settings */

type Draft = { title: string; type: ProjectType; goal: string; status: ProjectStatus; startDate: string; endDate: string; groups: boolean; phases: { title: string; weight: string }[] };
/** S03 create: name is the only required field; type is metadata; basic groups are optional and weights may stay unconfirmed. */
function ProjectForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const flow = useWorkflow();
  const [draft, setDraft] = useState<Draft>({ title: "", type: "GENERAL", goal: "", status: "READY", startDate: "", endDate: "", groups: false, phases: BASIC_GROUPS.map(title => ({ title, weight: "25" })) });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const total = draft.phases.reduce((sum, phase) => sum + (Number(phase.weight) || 0), 0);
  async function create() {
    if (!draft.title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const created = await flow.saveProject({ title: draft.title.trim(), status: draft.status, projectType: draft.type, goal: draft.goal.trim() || null, startDate: draft.startDate || null, endDate: draft.endDate || null,
        color: PROJECT_COLORS[flow.projects.length % PROJECT_COLORS.length], memo: null, order: nextUngroupedOrder(flow.projects, flow.groups) });
      if (draft.groups) for (const [order, phase] of draft.phases.filter(item => item.title.trim()).entries())
        await flow.savePhase({ projectId: created.id, title: phase.title.trim(), status: "TODO", startDate: null, endDate: null, memo: null, order, weight: phase.weight.trim() === "" ? null : Number(phase.weight) });
      onCreated(created.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <form className="wf-project-form" aria-label="새 프로젝트 만들기" onSubmit={event => { event.preventDefault(); void create(); }}>
    <header><h2>새 프로젝트 만들기</h2><button type="button" className="wf-td-icon" aria-label="닫기" onClick={onClose}><X size={16}/></button></header>
    <label className="wf-form-field">프로젝트 이름 <em>*</em><input autoFocus aria-label="프로젝트 이름" placeholder="예) WORK FLOW 첫 실사용 흐름 완성" value={draft.title} onChange={event => set({ title: event.target.value })}/></label>
    <fieldset className="wf-form-field"><legend>종류</legend><div className="wf-segmented" role="radiogroup" aria-label="프로젝트 종류">{TYPES.map(type => <button type="button" key={type} role="radio" aria-checked={draft.type === type} onClick={() => set({ type })}>{PROJECT_TYPE_LABELS[type]}</button>)}</div><small className="wf-muted">분류용 정보입니다. 작업이나 묶음을 자동으로 만들지 않습니다.</small></fieldset>
    <label className="wf-form-field">목표 한 문장 <small className="wf-muted">(선택)</small><textarea aria-label="프로젝트 목표 입력" rows={2} value={draft.goal} onChange={event => set({ goal: event.target.value })}/></label>
    <div className="wf-form-row">
      <label className="wf-form-field">상태<select aria-label="새 프로젝트 상태" value={draft.status} onChange={event => set({ status: event.target.value as ProjectStatus })}>{STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}</select></label>
      <label className="wf-form-field">시작일<input type="date" aria-label="새 프로젝트 시작일" value={draft.startDate} onChange={event => set({ startDate: event.target.value })}/></label>
      <label className="wf-form-field">목표일<input type="date" aria-label="새 프로젝트 목표일" value={draft.endDate} onChange={event => set({ endDate: event.target.value })}/></label>
    </div>
    <fieldset className="wf-form-field"><legend>작업 묶음</legend>
      <div className="wf-segmented" role="radiogroup" aria-label="작업 묶음 선택"><button type="button" role="radio" aria-checked={!draft.groups} onClick={() => set({ groups: false })}>작업 묶음 없이 시작</button><button type="button" role="radio" aria-checked={draft.groups} onClick={() => set({ groups: true })}>기본 작업 묶음 적용</button></div>
      {draft.groups && <div className="wf-form-phases">{draft.phases.map((phase, index) => <div key={index} className="wf-form-phase">
        <input aria-label={`묶음 ${index + 1} 이름`} value={phase.title} onChange={event => set({ phases: draft.phases.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })}/>
        <input type="number" min={0} max={100} aria-label={`묶음 ${index + 1} 가중치`} value={phase.weight} onChange={event => set({ phases: draft.phases.map((item, i) => i === index ? { ...item, weight: event.target.value } : item) })}/><span>%</span>
        <button type="button" className="wf-td-icon" aria-label={`묶음 ${index + 1} 제거`} onClick={() => set({ phases: draft.phases.filter((_, i) => i !== index) })}><X size={13}/></button></div>)}
        <div className="wf-form-phase-foot"><button type="button" className="wf-link" onClick={() => set({ phases: [...draft.phases, { title: "", weight: "" }] })}>+ 묶음 추가</button><small className={total === 100 ? "is-ok" : "is-pending"}>합계 {total}%{total === 100 ? "" : " · 가중치 미확정 (나중에 정해도 됩니다)"}</small></div>
      </div>}
    </fieldset>
    {error && <p role="alert" className="wf-error">{error}</p>}
    <footer><button type="button" onClick={onClose}>취소</button><button className="wf-primary" disabled={!draft.title.trim() || busy}>{busy ? "만드는 중…" : "프로젝트 생성"}</button></footer>
  </form>;
}

/** S03 settings: metadata autosave + Phase add/rename/reorder/delete + weights, in the same non-modal split. */
function ProjectSettings({ project, onClose }: { project: Project; onClose: () => void }) {
  const flow = useWorkflow();
  const [error, setError] = useState(""), [confirm, setConfirm] = useState<string | null>(null), [newPhase, setNewPhase] = useState("");
  const phases = useMemo(() => flow.phases.filter(phase => phase.projectId === project.id).sort((a, b) => a.order - b.order), [flow.phases, project.id]);
  const value = projectProgress(project, flow.phases, flow.tasks);
  const run = (action: () => Promise<unknown>) => void action().then(() => setError(""), e => setError(errorText(e)));
  const update = (patch: Partial<Project>) => run(() => flow.updateProject(project.id, patch));
  const move = (index: number, direction: -1 | 1) => { const to = index + direction; if (to < 0 || to >= phases.length) return; const ids = phases.map(phase => phase.id); [ids[index], ids[to]] = [ids[to], ids[index]];
    run(async () => { for (const [order, id] of ids.entries()) { const phase = phases.find(item => item.id === id)!; if (phase.order !== order) await flow.updatePhase(id, { order }); } }); };
  return <section className="wf-project-form" aria-label="프로젝트 설정">
    <header><h2>프로젝트 설정</h2><small className="wf-muted">변경은 자동 저장됩니다.</small><button type="button" className="wf-td-icon" aria-label="닫기" onClick={onClose}><X size={16}/></button></header>
    <label className="wf-form-field">프로젝트 이름<InlineField key={project.title} label="설정 프로젝트 이름" value={project.title} onSave={title => { if (title.trim()) update({ title: title.trim() }); }}/></label>
    <fieldset className="wf-form-field"><legend>종류</legend><div className="wf-segmented" role="radiogroup" aria-label="설정 프로젝트 종류">{TYPES.map(type => <button type="button" key={type} role="radio" aria-checked={(project.projectType ?? "GENERAL") === type} onClick={() => update({ projectType: type })}>{PROJECT_TYPE_LABELS[type]}</button>)}</div></fieldset>
    <label className="wf-form-field">목표<InlineField key={project.goal ?? ""} multiline label="설정 프로젝트 목표" value={project.goal ?? null} onSave={goal => update({ goal: goal.trim() || null })}/></label>
    <div className="wf-form-row"><label className="wf-form-field">상태<select aria-label="설정 프로젝트 상태" value={project.status} onChange={event => update({ status: event.target.value as ProjectStatus })}>{STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}</select></label>
      <label className="wf-form-field">색상<input type="color" aria-label="프로젝트 색상" value={projectColor(project.color)} onChange={event => update({ color: event.target.value })}/></label></div>
    <fieldset className="wf-form-field"><legend>작업 묶음</legend>
      <ul className="wf-settings-phases">{phases.map((phase, index) => {
        const count = flow.tasks.filter(task => task.phaseId === phase.id && !task.archivedAt).length;
        return <li key={phase.id}><InlineField key={phase.title} label={`${phase.title} 이름`} value={phase.title} onSave={title => { if (title.trim()) run(() => flow.updatePhase(phase.id, { title: title.trim() })); }}/>
          <small className="wf-muted">{count}개</small>
          <button type="button" className="wf-td-icon" aria-label={`${phase.title} 위로`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13}/></button>
          <button type="button" className="wf-td-icon" aria-label={`${phase.title} 아래로`} disabled={index === phases.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13}/></button>
          {confirm === phase.id ? <span className="wf-settings-confirm">{count ? `작업 ${count}개는 미분류로 이동합니다.` : "빈 묶음입니다."}<button type="button" className="wf-danger-text" onClick={() => { setConfirm(null); run(() => flow.deletePhase(phase.id)); }}>삭제</button><button type="button" onClick={() => setConfirm(null)}>취소</button></span>
            : <button type="button" className="wf-td-icon" aria-label={`${phase.title} 삭제`} onClick={() => setConfirm(phase.id)}><X size={13}/></button>}</li>;
      })}</ul>
      {!phases.length && <p className="wf-muted">작업 묶음 없이 진행 중입니다. 필요할 때만 추가하세요.</p>}
      <form className="wf-add-inline" onSubmit={event => { event.preventDefault(); const title = newPhase.trim(); if (!title) return; setNewPhase(""); run(() => flow.savePhase({ projectId: project.id, title, status: "TODO", startDate: null, endDate: null, memo: null, order: Math.max(-1, ...phases.map(phase => phase.order)) + 1 })); }}>
        <input aria-label="설정 새 묶음" placeholder="+ 묶음 추가" value={newPhase} onChange={event => setNewPhase(event.target.value)}/><button disabled={!newPhase.trim()}>추가</button></form>
    </fieldset>
    <WeightsEditor project={project} value={value}/>
    {error && <p role="alert" className="wf-error">{error}</p>}
  </section>;
}
