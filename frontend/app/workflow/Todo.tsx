"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { workflowApi, type Project, type TodoPreferences, type WorkTask } from "@/lib/api/workflow";
import { useWorkflow } from "./WorkflowContext";
import { AddTask } from "./TaskDetails";
import TaskDetailPanel from "./TaskDetailPanel";
import SplitView from "./SplitView";
import { useTaskSelection } from "./useTaskSelection";
import { PRIORITY_LABELS, TASK_STATUS_LABELS, shortDate } from "@/lib/workflow/labels";
import { Progress } from "./Projects";
import { RowControl, TaskRow, rowOpenHandler } from "./TaskRow";
import { defaultTodoPreferences, reorderIds, orderedGroupIds } from "./projects-todo-utils";
import { catalogOrder } from "@/lib/workflow/catalog";
import { useFlip } from "@/lib/workflow/dnd";
import {
  EXPLORER_SORT_LABELS, FILTER_PRIORITIES, FILTER_STATUSES, UNASSIGNED, WEEK_SCOPE_LABELS, emptyFilters, inArchiveScope, isFiltered,
  matchesFilters, matchesSearch, normalizeSort, passesDisplayPreferences, resetGroup, sortTasks, toggleFilter,
  type ExplorerFilters, type ExplorerSort, type FilterGroup, type WeekScope,
} from "@/lib/workflow/explorer";

const SORTS = Object.keys(EXPLORER_SORT_LABELS) as ExplorerSort[];

export function TodoSettings({ initial, projects, onSave, onClose }: { initial: TodoPreferences; projects: Project[]; onSave: (preferences: TodoPreferences) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState({ ...initial, sort: normalizeSort(initial.sort) as TodoPreferences["sort"] }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ids = orderedGroupIds(projects.map(project => project.id), draft.projectOrder);
  const name = (id: string) => projects.find(project => project.id === id)?.title || "프로젝트 없음";
  function move(id: string, direction: -1 | 1) { const index = ids.indexOf(id), to = index + direction; if (to < 0 || to >= ids.length) return; const next = [...ids]; [next[index], next[to]] = [next[to], next[index]]; setDraft({ ...draft, projectOrder: next }); }
  return <Modal open title="To-do 보기 설정" onClose={() => { if (!busy) onClose(); }}><form className="wf-todo-settings" role="dialog" aria-label="To-do 보기 설정" aria-modal="true" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }} onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await onSave(draft); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "설정 저장 실패"); } finally { setBusy(false); } }}>
    <p className="wf-muted">작업 목록의 표시 방식을 설정합니다. 필터는 목록 위 버튼에서 바로 조작합니다.</p><fieldset disabled={busy}><legend>그룹 모드</legend><div className="wf-setting-options">{(["PROJECT", "FLAT"] as const).map(mode => <label key={mode}><input type="radio" name="groupMode" checked={draft.groupMode === mode} onChange={() => setDraft({ ...draft, groupMode: mode })}/>{mode === "PROJECT" ? "프로젝트별 그룹" : "전체 목록"}</label>)}</div></fieldset>
    <fieldset disabled={busy}><legend>프로젝트 그룹 순서</legend><p className="wf-muted">끌어서 순서를 변경하세요. 프로젝트 자체의 순서는 유지됩니다.</p><ul className="wf-group-order">{ids.map((id, index) => <li key={id} draggable={!busy} onDragStart={event => { event.dataTransfer.setData("application/workflow-todo-group", id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={event => { if (event.dataTransfer.types.includes("application/workflow-todo-group")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); setDraft({ ...draft, projectOrder: reorderIds(ids, event.dataTransfer.getData("application/workflow-todo-group"), id) }); }}><span className="wf-drag">⠿</span><span>{name(id)}</span><button type="button" aria-label={`${name(id)} 위로`} disabled={busy || index === 0} onClick={() => move(id, -1)}>↑</button><button type="button" aria-label={`${name(id)} 아래로`} disabled={busy || index === ids.length - 1} onClick={() => move(id, 1)}>↓</button></li>)}</ul></fieldset>
    <fieldset disabled={busy}><legend>작업 정렬 기준</legend><select aria-label="작업 정렬 기준" value={draft.sort} onChange={event => setDraft({ ...draft, sort: event.target.value as TodoPreferences["sort"] })}>{SORTS.map(value => <option key={value} value={value}>{EXPLORER_SORT_LABELS[value]}</option>)}</select></fieldset>
    <fieldset disabled={busy}><legend>표시 옵션</legend>{([["showCompleted", "완료 항목 표시"], ["showUndated", "날짜 없는 항목 표시"], ["rememberCollapse", "프로젝트 접힘 상태 기억"]] as const).map(([key, label]) => <label key={key} className="wf-setting-check"><input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })}/>{label}</label>)}</fieldset>
    {error && <p role="alert" className="wf-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="wf-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></footer>
  </form></Modal>;
}

/** One always-visible button group. "전체" is pressed when the group has no active value and clears only this group. */
function FilterRow<G extends FilterGroup>({ label, group, filters, options, onChange, className = "" }: {
  label: string; group: G; filters: ExplorerFilters; className?: string;
  options: { value: ExplorerFilters[G][number]; label: string; color?: string }[]; onChange: (next: ExplorerFilters) => void;
}) {
  const active = filters[group] as string[];
  return <div className="wf-filter-row" role="group" aria-label={`${label} 필터`}>
    <span className="wf-filter-label">{label}</span>
    <div className={`wf-filter-buttons ${className}`}>
      <button type="button" aria-pressed={!active.length} onClick={() => onChange(resetGroup(filters, group))}>전체</button>
      {options.map(option => <button key={option.value} type="button" aria-pressed={active.includes(option.value)} onClick={() => onChange(toggleFilter(filters, group, option.value))}>
        {option.color && <span className="wf-filter-dot" style={{ background: option.color }} aria-hidden/>}{option.label}
      </button>)}
    </div>
  </div>;
}

/** Archived Task row: row body opens S10; 복구 restores the same canonical Task (identity and history kept). */
function ArchivedTaskRow({ task, project, selected, onSelect }: { task: WorkTask; project?: Project; selected: boolean; onSelect: () => void }) {
  const flow = useWorkflow();
  const [message, setMessage] = useState("");
  return <div className={`wf-task-row is-archived ${selected ? "is-selected" : ""}`} data-task-id={task.id} onClick={rowOpenHandler(onSelect)}>
    <div className="wf-row-main"><div className="wf-task-name"><button type="button" className="wf-title-button" aria-current={selected || undefined}>{task.title}</button>{message && <small role="status">{message}</small>}</div></div>
    <span className="wf-archived-meta">{project?.title ?? "프로젝트 없음"} · {TASK_STATUS_LABELS[task.status]}{task.archivedAt ? ` · 보관 ${shortDate(task.archivedAt.slice(0, 10))}` : ""}</span>
    <RowControl><button type="button" className="wf-restore" aria-label={`${task.title} 복구`} onClick={() => void flow.archiveTask(task.id, false).then(() => setMessage(""), e => setMessage(e instanceof Error ? e.message : "복구 실패"))}><ArchiveRestore size={13} aria-hidden/>복구</button></RowControl>
  </div>;
}

export default function Todo() {
  const flow = useWorkflow();
  const { projects, tasks, planDays, ensureWeek, week, groups } = flow;
  const [preferences, setPreferences] = useState(defaultTodoPreferences), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [settings, setSettings] = useState(false), [search, setSearch] = useState("");
  const [selected, setSelected] = useTaskSelection();
  const [filters, setFilters] = useState<ExplorerFilters>(emptyFilters), [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]), [saving, setSaving] = useState(false);
  useEffect(() => { let live = true; workflowApi.getPreferences().then(value => { if (!live) return; const next = { ...defaultTodoPreferences, ...value }; setPreferences(next); setCollapsed(next.rememberCollapse ? next.collapsedProjects : []); setReady(true); }).catch(e => { if (live) { setError(e instanceof Error ? e.message : "보기 설정을 불러오지 못했습니다."); setReady(true); } }); return () => { live = false; }; }, []);
  // The 이번 주 filter reuses the This Week projection (selection ∪ plan days in the week).
  useEffect(() => { void ensureWeek(); }, [ensureWeek]);
  async function savePreferences(next: TodoPreferences) { setSaving(true); try { const saved = await workflowApi.savePreferences(next); setPreferences(saved); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "보기 설정 저장 실패"); throw e; } finally { setSaving(false); } }
  const sort = normalizeSort(preferences.sort);
  // "프로젝트 순서" = the Projects catalog order (group order, then manual order inside the group). It is read only;
  // All To-dos never rewrites Project or Task order.
  const orderedProjects = useMemo(() => catalogOrder(projects, groups).map((id, index) => ({ ...projects.find(project => project.id === id)!, order: index })), [projects, groups]);
  const groupIds = orderedGroupIds(orderedProjects.map(project => project.id), preferences.projectOrder);
  const projectTitle = (id: string | null) => projects.find(project => project.id === id)?.title ?? "";
  const context = useMemo(() => ({ weekTaskIds: new Set(week?.tasks.map(item => item.taskId) ?? []), plannedTaskIds: new Set(planDays.map(day => day.taskId)) }), [week, planDays]);
  const scoped = tasks.filter(task => inArchiveScope(task, showArchived));
  const filtered = sortTasks(scoped.filter(task => (showArchived || passesDisplayPreferences(task, preferences, context.plannedTaskIds))
    && matchesFilters(task, filters, context) && matchesSearch(task, search, projectTitle(task.projectId))), sort, orderedProjects);
  const narrowed = isFiltered(filters) || !!search.trim();
  const activeTasks = tasks.filter(task => !task.archivedAt), archivedCount = tasks.length - activeTasks.length;
  const groupName = (id: string) => projects.find(project => project.id === id)?.title || "프로젝트 없음";
  function toggle(id: string) { if (saving) return; const next = collapsed.includes(id) ? collapsed.filter(value => value !== id) : [...collapsed, id]; setCollapsed(next); if (preferences.rememberCollapse) void savePreferences({ ...preferences, collapsedProjects: next }).catch(() => setCollapsed(collapsed)); }
  function resetAll() { setFilters(emptyFilters()); setSearch(""); }
  const row = (item: WorkTask) => showArchived
    ? <ArchivedTaskRow key={item.id} task={item} project={projects.find(project => project.id === item.projectId)} selected={selected === item.id} onSelect={() => setSelected(item.id)}/>
    : <TaskRow key={item.id} task={item} selected={selected === item.id} onSelect={() => setSelected(item.id)}/>;
  const projectOptions = [...orderedProjects.filter(project => !project.archivedAt).map(project => ({ value: project.id, label: project.title, color: project.color || "#0969da" })), { value: UNASSIGNED, label: "프로젝트 없음", color: "#8c959f" }];
  // View-only group order (preferences.projectOrder) settles smoothly; it never rewrites Project or Task order.
  const groupsRef = useRef<HTMLElement>(null);
  useFlip(groupsRef, groupIds.join());
  const statusCount = (status: WorkTask["status"] | "ALL") => activeTasks.filter(task => status === "ALL" || task.status === status).length;

  return <SplitView detail={selected ? <TaskDetailPanel key={selected} taskId={selected} onClose={() => setSelected(null)} onSelect={setSelected}/> : null}><div className={`wf-todo-layout ${selected ? "has-split-detail" : ""}`}><main className="wf-todo-main" ref={groupsRef}><header className="wf-page-heading"><div><h1>모든 할 일</h1><p className="wf-muted">프로젝트의 모든 작업을 검색하고 정리합니다. 매일 거쳐야 하는 단계는 아닙니다.</p></div><button disabled={!ready || saving} onClick={() => setSettings(true)}>⚙ 보기 설정</button></header>
    <section className="wf-explorer-filters" aria-label="작업 필터">
      <FilterRow label="프로젝트" group="projects" filters={filters} onChange={setFilters} options={projectOptions}/>
      <div className="wf-filter-row" role="group" aria-label="상태 필터"><span className="wf-filter-label">상태</span><div className="wf-filter-buttons wf-status-tabs">
        <button type="button" aria-pressed={!filters.statuses.length} onClick={() => setFilters(resetGroup(filters, "statuses"))}>전체 ({statusCount("ALL")})</button>
        {FILTER_STATUSES.map(status => <button key={status} type="button" aria-pressed={filters.statuses.includes(status)} onClick={() => setFilters(toggleFilter(filters, "statuses", status))}>{TASK_STATUS_LABELS[status]} ({statusCount(status)})</button>)}
      </div></div>
      <FilterRow label="우선순위" group="priorities" filters={filters} onChange={setFilters} options={FILTER_PRIORITIES.map(value => ({ value, label: PRIORITY_LABELS[value] }))}/>
      <FilterRow label="이번 주" group="week" filters={filters} onChange={setFilters} options={(Object.keys(WEEK_SCOPE_LABELS) as WeekScope[]).map(value => ({ value, label: WEEK_SCOPE_LABELS[value] }))}/>
    </section>
    <div className="wf-todo-toolbar">
      <strong className="wf-explorer-count">{showArchived ? "보관됨" : "전체"} {filtered.length}</strong>
      <input aria-label="작업 검색" placeholder="제목, 메모, 프로젝트 검색…" value={search} onChange={event => setSearch(event.target.value)}/>
      <label className="wf-explorer-sort">정렬<select aria-label="정렬 기준" value={sort} disabled={!ready || saving} onChange={event => void savePreferences({ ...preferences, sort: event.target.value as TodoPreferences["sort"] }).catch(() => {})}>{SORTS.map(value => <option key={value} value={value}>{EXPLORER_SORT_LABELS[value]}</option>)}</select></label>
      <button type="button" className="wf-archive-toggle" aria-pressed={showArchived} onClick={() => setShowArchived(value => !value)}>보관됨 {archivedCount}</button>
      <button type="button" className="wf-filter-reset" disabled={!narrowed} onClick={resetAll}><RotateCcw size={12} aria-hidden/>필터 초기화</button>
    </div>
    {!showArchived && <AddTask/>}{error && <p className="wf-error" role="alert">{error}</p>}
    {showArchived ? <section className="wf-todo-group is-archive" aria-label="보관된 작업"><header><h2>보관된 작업</h2><small className="wf-muted">보관은 완료와 다릅니다. 복구하면 같은 작업이 그대로 돌아옵니다.</small></header>{filtered.map(row)}</section>
      : preferences.groupMode === "FLAT" ? <section className="wf-todo-group"><header><h2>전체 작업</h2><Progress tasks={activeTasks}/></header>{filtered.map(row)}</section> : groupIds.map(id => {
      const project = projects.find(item => item.id === id), groupTasks = activeTasks.filter(task => (task.projectId || UNASSIGNED) === id), visible = filtered.filter(task => (task.projectId || UNASSIGNED) === id);
      // Unfiltered: every active Project keeps its group (so Tasks can be added there). Filtered: only groups with results.
      if (narrowed ? !visible.length : !groupTasks.length && (!project || !!project.archivedAt)) return null;
      // "프로젝트 없음" is the unassigned bucket, not a Project: neutral identity, same row behaviour.
      const color = project ? project.color || "#0969da" : undefined;
      return <section key={id} className={`wf-todo-group ${project ? "" : "is-unassigned"}`} aria-label={`${groupName(id)} 그룹`} data-flip-id={`todo-group:${id}`} data-dnd-target="before" data-dnd-accept="application/workflow-todo-group" style={color ? { ["--group-color" as string]: color } : undefined} onDragOver={event => { if (!saving && event.dataTransfer.types.includes("application/workflow-todo-group")) event.preventDefault(); }} onDrop={event => { const moved = event.dataTransfer.getData("application/workflow-todo-group"); if (!saving && moved) { event.preventDefault(); void savePreferences({ ...preferences, projectOrder: reorderIds(groupIds, moved, id) }).catch(() => {}); } }}>
        <header data-dnd-row=""><span className="wf-drag" draggable={ready && !saving} title="끌어서 프로젝트 그룹 순서 변경" onDragStart={event => { event.dataTransfer.setData("application/workflow-todo-group", id); event.dataTransfer.effectAllowed = "move"; }}>⠿</span><span className="wf-color-dot" style={{ background: project?.color || "#8c959f" }}/><button className="wf-group-toggle" aria-expanded={!collapsed.includes(id)} onClick={() => toggle(id)}><strong>{groupName(id)}</strong><small className="wf-count">{visible.length}개 작업</small></button><Progress tasks={groupTasks}/><button className="wf-group-collapse" aria-label={`${groupName(id)} 접기/펼치기`} onClick={() => toggle(id)}>{collapsed.includes(id) ? "▸" : "▾"}</button></header>
        {!collapsed.includes(id) && <div className="wf-todo-group-body">{visible.map(row)}{visible.length === 0 && <p className="wf-muted wf-group-empty">표시할 작업이 없습니다.</p>}<AddTask projectId={project?.id ?? null}/></div>}
      </section>;
    })}
    {/* Filter results empty is not the same as no Tasks: say which one, and offer the reset. */}
    {!filtered.length && (showArchived ? !archivedCount : !activeTasks.length)
      ? <p className="wf-empty">{showArchived ? "보관된 작업이 없습니다." : "새 작업을 추가하거나 Workpad에서 체크리스트를 WorkTask로 전환하세요."}</p>
      : !filtered.length && narrowed && <div className="wf-empty wf-filter-empty"><p>현재 필터와 일치하는 작업이 없습니다.</p><button type="button" onClick={resetAll}>필터 초기화</button></div>}
  </main>{!selected && <aside className="wf-context-rail"><div className="wf-detail"><h2>작업 상세</h2><p className="wf-muted">행을 클릭하면 공통 작업 상세가 열리고, 자주 쓰는 속성은 행에서 바로 수정합니다.</p><p className="wf-muted">같은 그룹 안의 버튼은 OR, 다른 그룹 사이는 AND로 적용됩니다. 각 그룹의 ‘전체’는 그 그룹만 초기화합니다.</p><p className="wf-muted">정렬은 보기 방식일 뿐이며 프로젝트의 작업 순서를 바꾸지 않습니다.</p></div></aside>}
    {settings && <TodoSettings initial={{ ...preferences, collapsedProjects: collapsed }} projects={orderedProjects} onSave={savePreferences} onClose={() => setSettings(false)}/>}
  </div></SplitView>;
}
