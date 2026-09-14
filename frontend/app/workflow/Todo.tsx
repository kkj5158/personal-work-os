"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { workflowApi, type Project, type TodoPreferences } from "@/lib/api/workflow";
import { useWorkflow } from "./WorkflowContext";
import TaskDetails, { AddTask } from "./TaskDetails";
import { Progress, TaskRow } from "./Projects";
import { defaultTodoPreferences, reorderIds, orderedGroupIds, visibleTasks } from "./projects-todo-utils";

const sortLabels: Record<TodoPreferences["sort"], string> = { DEFAULT: "진행 중 · 마감일 · 우선순위", DUE_DATE: "마감일 빠른 순", STATUS: "상태 순", PRIORITY: "우선순위 순", START_DATE: "시작일 빠른 순", ORDER: "생성 / 사용자 순서" };

export function TodoSettings({ initial, projects, onSave, onClose }: { initial: TodoPreferences; projects: Project[]; onSave: (preferences: TodoPreferences) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ids = orderedGroupIds(projects.map(project => project.id), draft.projectOrder);
  const name = (id: string) => projects.find(project => project.id === id)?.title || "프로젝트 없음";
  function move(id: string, direction: -1 | 1) { const index = ids.indexOf(id), to = index + direction; if (to < 0 || to >= ids.length) return; const next = [...ids]; [next[index], next[to]] = [next[to], next[index]]; setDraft({ ...draft, projectOrder: next }); }
  return <Modal open title="To-do 보기 설정" onClose={() => { if (!busy) onClose(); }}><form className="wf-todo-settings" role="dialog" aria-label="To-do 보기 설정" aria-modal="true" onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }} onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await onSave(draft); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "설정 저장 실패"); } finally { setBusy(false); } }}>
    <p className="wf-muted">작업 목록의 표시 방식을 설정합니다.</p><fieldset disabled={busy}><legend>그룹 모드</legend><div className="wf-setting-options">{(["PROJECT", "FLAT"] as const).map(mode => <label key={mode}><input type="radio" name="groupMode" checked={draft.groupMode === mode} onChange={() => setDraft({ ...draft, groupMode: mode })}/>{mode === "PROJECT" ? "프로젝트별 그룹" : "전체 목록"}</label>)}</div></fieldset>
    <fieldset disabled={busy}><legend>프로젝트 그룹 순서</legend><p className="wf-muted">끌어서 순서를 변경하세요. 프로젝트 자체의 순서는 유지됩니다.</p><ul className="wf-group-order">{ids.map((id, index) => <li key={id} draggable={!busy} onDragStart={event => { event.dataTransfer.setData("application/workflow-todo-group", id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={event => { if (event.dataTransfer.types.includes("application/workflow-todo-group")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); setDraft({ ...draft, projectOrder: reorderIds(ids, event.dataTransfer.getData("application/workflow-todo-group"), id) }); }}><span className="wf-drag">⠿</span><span>{name(id)}</span><button type="button" aria-label={`${name(id)} 위로`} disabled={busy || index === 0} onClick={() => move(id, -1)}>↑</button><button type="button" aria-label={`${name(id)} 아래로`} disabled={busy || index === ids.length - 1} onClick={() => move(id, 1)}>↓</button></li>)}</ul></fieldset>
    <fieldset disabled={busy}><legend>작업 정렬 기준</legend><select aria-label="작업 정렬 기준" value={draft.sort} onChange={event => setDraft({ ...draft, sort: event.target.value as TodoPreferences["sort"] })}>{Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></fieldset>
    <fieldset disabled={busy}><legend>표시 옵션</legend>{([["showCompleted", "완료 항목 표시"], ["showUndated", "날짜 없는 항목 표시"], ["rememberCollapse", "프로젝트 접힘 상태 기억"]] as const).map(([key, label]) => <label key={key} className="wf-setting-check"><input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })}/>{label}</label>)}</fieldset>
    {error && <p role="alert" className="wf-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="wf-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></footer>
  </form></Modal>;
}

export default function Todo() {
  const { projects, tasks } = useWorkflow();
  const [preferences, setPreferences] = useState(defaultTodoPreferences), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [settings, setSettings] = useState(false), [selected, setSelected] = useState<string | null>(null), [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL"), [collapsed, setCollapsed] = useState<string[]>([]), [saving, setSaving] = useState(false);
  useEffect(() => { let live = true; workflowApi.getPreferences().then(value => { if (!live) return; const next = { ...defaultTodoPreferences, ...value }; setPreferences(next); setCollapsed(next.rememberCollapse ? next.collapsedProjects : []); setReady(true); }).catch(e => { if (live) { setError(e instanceof Error ? e.message : "보기 설정을 불러오지 못했습니다."); setReady(true); } }); return () => { live = false; }; }, []);
  async function savePreferences(next: TodoPreferences) { setSaving(true); try { const saved = await workflowApi.savePreferences(next); setPreferences(saved); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "보기 설정 저장 실패"); throw e; } finally { setSaving(false); } }
  const orderedProjects = [...projects].sort((a, b) => a.order - b.order);
  const groupIds = orderedGroupIds(orderedProjects.map(project => project.id), preferences.projectOrder);
  const filtered = visibleTasks(tasks, preferences).filter(task => (status === "ALL" || task.status === status) && (!search || `${task.title} ${task.memo || ""} ${projects.find(project => project.id === task.projectId)?.title || ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const task = tasks.find(value => value.id === selected);
  const groupName = (id: string) => projects.find(project => project.id === id)?.title || "프로젝트 없음";
  function toggle(id: string) { if (saving) return; const next = collapsed.includes(id) ? collapsed.filter(value => value !== id) : [...collapsed, id]; setCollapsed(next); if (preferences.rememberCollapse) void savePreferences({ ...preferences, collapsedProjects: next }).catch(() => setCollapsed(collapsed)); }
  return <div className="wf-todo-layout"><main className="wf-todo-main"><header className="wf-page-heading"><div><h1>To-do</h1><p className="wf-muted">프로젝트별 작업을 확인하고 오늘 할 일을 선택하세요.</p></div><button disabled={!ready || saving} onClick={() => setSettings(true)}>⚙ 보기 설정</button></header>
    <div className="wf-todo-toolbar"><div className="wf-status-tabs">{["ALL", "TODO", "DOING", "DONE"].map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "ALL" ? "전체" : value} ({tasks.filter(task => value === "ALL" || task.status === value).length})</button>)}</div><input aria-label="작업 검색" placeholder="작업 검색…" value={search} onChange={event => setSearch(event.target.value)}/></div>
    <AddTask/>{error && <p className="wf-error" role="alert">{error}</p>}
    {preferences.groupMode === "FLAT" ? <section className="wf-todo-group"><header><h2>전체 작업</h2><Progress tasks={tasks}/></header>{filtered.map(item => <TaskRow key={item.id} task={item} onSelect={() => setSelected(item.id)}/>)}</section> : groupIds.map(id => {
      const project = projects.find(item => item.id === id), groupTasks = tasks.filter(task => (task.projectId || "unassigned") === id), visible = filtered.filter(task => (task.projectId || "unassigned") === id);
      if (!groupTasks.length && (!project || search || status !== "ALL")) return null;
      return <section key={id} className="wf-todo-group" onDragOver={event => { if (!saving && event.dataTransfer.types.includes("application/workflow-todo-group")) event.preventDefault(); }} onDrop={event => { const moved = event.dataTransfer.getData("application/workflow-todo-group"); if (!saving && moved) { event.preventDefault(); void savePreferences({ ...preferences, projectOrder: reorderIds(groupIds, moved, id) }).catch(() => {}); } }}>
        <header><span className="wf-drag" draggable={ready && !saving} title="끌어서 프로젝트 그룹 순서 변경" onDragStart={event => { event.dataTransfer.setData("application/workflow-todo-group", id); event.dataTransfer.effectAllowed = "move"; }}>⠿</span><span className="wf-color-dot" style={{ background: project?.color || "#8c959f" }}/><button className="wf-group-toggle" aria-expanded={!collapsed.includes(id)} onClick={() => toggle(id)}><strong>{groupName(id)}</strong><small>{visible.length}개 작업</small></button><Progress tasks={groupTasks}/><button aria-label={`${groupName(id)} 접기/펼치기`} onClick={() => toggle(id)}>{collapsed.includes(id) ? "▸" : "▾"}</button></header>
        {!collapsed.includes(id) && <>{visible.map(item => <TaskRow key={item.id} task={item} onSelect={() => setSelected(item.id)}/>)}{visible.length === 0 && <p className="wf-muted wf-group-empty">표시할 작업이 없습니다.</p>}<AddTask projectId={project?.id ?? null}/></>}
      </section>;
    })}
    {!tasks.length && <p className="wf-empty">새 작업을 추가하거나 Today에서 체크리스트를 WorkTask로 전환하세요.</p>}
  </main><aside className="wf-context-rail">{task ? <TaskDetails key={task.id} task={task} onClose={() => setSelected(null)}/> : <div className="wf-detail"><h2>작업 상세</h2><p className="wf-muted">작업을 선택하면 프로젝트, Phase, 우선순위와 날짜를 편집할 수 있습니다.</p><p className="wf-muted">오늘에 추가하면 같은 작업을 Today Workpad에서 이어서 진행합니다.</p></div>}</aside>
    {settings && <TodoSettings initial={{ ...preferences, collapsedProjects: collapsed }} projects={orderedProjects} onSave={savePreferences} onClose={() => setSettings(false)}/>}
  </div>;
}
