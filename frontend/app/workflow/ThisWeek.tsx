'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, GripVertical, LayoutGrid, List, Plus, Sun, Target, X } from 'lucide-react';
import type { Project, WeekView, WorkTask } from '@/lib/api/workflow';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/lib/workflow/labels';
import { WorkflowConflictError, mondayOf } from '@/lib/workflow/store';
import { projectColor } from '@/lib/workflow/timeline';
import { boardColumns, columnLabel, placeBefore, shiftItem, shiftWeek, toggledStatus, weekDays, weekRangeLabel, weekRows, type WeekRow } from '@/lib/workflow/week';
import { seoulToday } from '@/lib/seoulDate';
import { toDateKey } from '@/lib/date';
import { useWorkflow } from './WorkflowContext';
import { useTaskSelection } from './useTaskSelection';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';
import { PlanDates, RowControl, rowOpenHandler } from './TaskRow';

type View = 'list' | 'board';
const TASK_MIME = 'application/x-wf-week-task', PROJECT_MIME = 'application/x-wf-week-project', CARD_MIME = 'application/x-wf-board-card';
const todayKey = () => toDateKey(seoulToday());
const errorText = (e: unknown) => e instanceof Error ? e.message : '저장하지 못했습니다.';

/** Week and view live in the URL (?week=&view=) next to ?task=, so reloads and tabs restore the same plan. */
function useWeekParams(defaultWeek: string): [string, View, (week: string) => void, (view: View) => void] {
  const params = useSearchParams();
  const read = (key: string) => params ? params.get(key) : typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(key);
  const initialWeek = read('week'), initialView = read('view');
  const [week, setWeek] = useState(() => initialWeek && /^\d{4}-\d{2}-\d{2}$/.test(initialWeek) ? mondayOf(initialWeek) : defaultWeek);
  const [view, setView] = useState<View>(initialView === 'board' ? 'board' : 'list');
  const write = (key: string, value: string | null) => { const url = new URL(window.location.href); if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); window.history.replaceState(window.history.state, '', url); };
  return [week, view, next => { setWeek(next); write('week', next === defaultWeek ? null : next); }, next => { setView(next); write('view', next === 'board' ? 'board' : null); }];
}

/**
 * S04 This Week + S05 Weekday Board. Both are views over the same canonical Tasks: weekly selection
 * (work_week_tasks), plan days (work_task_plan_days) and Project inclusion (work_week_projects) stay distinct,
 * and every order change here is week-scoped — canonical Project/Task order is never touched.
 */
export default function ThisWeek() {
  const flow = useWorkflow();
  const [weekStart, view, setWeekStart, setView] = useWeekParams(flow.weekStart);
  const [selected, select] = useTaskSelection();
  const [notice, setNotice] = useState<{ text: string; undo?: () => Promise<unknown> } | null>(null);
  const [error, setError] = useState('');
  const { loadWeek } = flow;
  useEffect(() => { void loadWeek(weekStart).catch(e => setError(errorText(e))); }, [loadWeek, weekStart]);
  const week = flow.weeks[weekStart];
  const run = useCallback(async (action: () => Promise<unknown>, success?: string | (() => string), undo?: () => Promise<unknown>) => {
    setError('');
    try { await action(); const text = typeof success === 'function' ? success() : success; setNotice(text ? { text, undo } : null); return true; }
    catch (e) { setError(errorText(e)); return false; }
  }, []);
  const current = weekStart === flow.weekStart, past = weekStart < flow.weekStart;

  return <SplitView detail={selected ? <TaskDetailPanel key={selected} taskId={selected} onClose={() => select(null)} onSelect={select}/> : null}>
    <div className="wf-week">
      <header className="wf-week-head">
        <div className="wf-week-title"><h1><CalendarDays size={22}/> 이번 주 {view === 'board' ? '일정' : '계획'}</h1>
          <div className="wf-week-range"><strong>{weekRangeLabel(weekStart)}</strong>{past && <small className="wf-week-past">지난 주 기록</small>}
            <button aria-label="이전 주" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><ChevronLeft size={15}/></button>
            <button aria-label="다음 주" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><ChevronRight size={15}/></button>
            <button aria-pressed={current} onClick={() => setWeekStart(flow.weekStart)}>이번 주</button></div>
          <p className="wf-muted">이번 주에 실제로 밀 작업만 고르세요. 날짜 배치는 필요할 때만, 실행은 ‘오늘에 추가’로 Workpad에서.</p></div>
        <div className="wf-week-views" role="group" aria-label="보기 전환">
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={15}/> 목록 보기</button>
          <button aria-pressed={view === 'board'} onClick={() => setView('board')}><LayoutGrid size={15}/> 보드 보기</button>
        </div>
      </header>
      {!week ? <p className="wf-muted">{error || '이번 주 계획을 불러오는 중…'}</p> : <>
        <ProjectInclusion week={week} run={run}/>
        {(notice || error) && <div className={`wf-week-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>
          <span>{error || notice?.text}</span>
          {!error && notice?.undo && <button onClick={() => { const undo = notice.undo!; void run(undo, '되돌렸습니다.'); }}>되돌리기</button>}
          <button aria-label="알림 닫기" onClick={() => { setNotice(null); setError(''); }}><X size={13}/></button></div>}
        <div className={`wf-week-body is-${view}`}>
          <div className="wf-week-main">{view === 'list'
            ? <WeekList week={week} selectedTask={selected} select={select} run={run}/>
            : <WeekBoard week={week} selectedTask={selected} select={select} run={run}/>}</div>
          <aside className="wf-week-rail">
            <FocusAndGoals week={week}/>
            {view === 'board' && <Unscheduled week={week} select={select} run={run}/>}
          </aside>
        </div>
      </>}
    </div>
  </SplitView>;
}

type Run = (action: () => Promise<unknown>, success?: string | (() => string), undo?: () => Promise<unknown>) => Promise<boolean>;
type Select = (id: string | null) => void;

/** Visible whole-button Project inclusion; including a Project never selects its Tasks. */
function ProjectInclusion({ week, run }: { week: WeekView; run: Run }) {
  const flow = useWorkflow();
  const included = new Set(week.projects.map(item => item.projectId));
  const rows = weekRows(week, flow.tasks);
  const projects = [...flow.projects].filter(project => !project.archivedAt && (project.status !== 'DONE' || included.has(project.id))).sort((a, b) => a.order - b.order);
  const toggle = (project: Project) => run(() => flow.includeProject(week.weekStart, project.id, !included.has(project.id)));
  return <div className="wf-week-include" role="group" aria-label="이번 주 포함 프로젝트">
    <span className="wf-week-include-total">포함 {included.size}/{projects.length}</span>
    {projects.map(project => <button key={project.id} aria-pressed={included.has(project.id)} aria-label={`${project.title} 이번 주 포함`} onClick={() => void toggle(project)}>
      <span className="wf-color-dot" style={{ background: projectColor(project.color) }}/>{project.title}<small>{rows.filter(row => row.task.projectId === project.id).length}</small></button>)}
    <span className="wf-week-include-actions">
      <button onClick={() => void run(async () => { for (const project of projects) if (!included.has(project.id)) await flow.includeProject(week.weekStart, project.id, true); })}>전체 선택</button>
      <button onClick={() => void run(async () => { for (const project of projects) if (included.has(project.id)) await flow.includeProject(week.weekStart, project.id, false); })}>전체 해제</button>
    </span>
    {!projects.length && <span className="wf-muted">프로젝트가 없습니다. 프로젝트 없는 작업은 아래 ‘기타’에서 고를 수 있습니다.</span>}
  </div>;
}

/* ------------------------------------------------------------------ S04 list */

function WeekList({ week, selectedTask, select, run }: { week: WeekView; selectedTask: string | null; select: Select; run: Run }) {
  const flow = useWorkflow();
  const rows = weekRows(week, flow.tasks);
  const includedIds = week.projects.map(item => item.projectId);
  const [dragProject, setDragProject] = useState<string | null>(null);
  const reorderProjects = (ids: string[]) => run(() => flow.reorderWeek(week.weekStart, 'week-projects', ids));
  // Projects with weekly Tasks but not included still show (a plan day elsewhere must not vanish).
  const extra = [...new Set(rows.map(row => row.task.projectId).filter((id): id is string => !!id && !includedIds.includes(id)))];
  const sections: { project: Project | null; included: boolean }[] = [
    ...includedIds.map(id => ({ project: flow.projects.find(project => project.id === id) ?? null, included: true })).filter(item => item.project),
    ...extra.map(id => ({ project: flow.projects.find(project => project.id === id) ?? null, included: false })).filter(item => item.project),
    { project: null, included: true },
  ];
  return <div className="wf-week-list">
    {!includedIds.length && <div className="wf-week-empty"><Target size={18}/><div><strong>이번 주에 다룰 프로젝트를 위에서 선택하세요.</strong><p className="wf-muted">프로젝트를 포함해도 작업은 자동으로 선택되지 않습니다. 각 프로젝트에서 이번 주에 할 작업만 고릅니다.</p></div></div>}
    {sections.map(({ project, included }, index) => <WeekSection key={project?.id ?? 'none'} week={week} project={project} included={included}
      rows={rows.filter(row => (row.task.projectId ?? null) === (project?.id ?? null))} selectedTask={selectedTask} select={select} run={run}
      move={included && project ? direction => { const ids = shiftItem(includedIds, index, direction); if (ids !== includedIds) void reorderProjects(ids); } : undefined}
      onDragProject={included && project ? () => setDragProject(project.id) : undefined}
      onDropProject={included && project ? () => { if (dragProject && dragProject !== project.id) void reorderProjects(placeBefore(includedIds, dragProject, project.id)); setDragProject(null); } : undefined}/>)}
  </div>;
}

function WeekSection({ week, project, included, rows, selectedTask, select, run, move, onDragProject, onDropProject }: {
  week: WeekView; project: Project | null; included: boolean; rows: WeekRow[]; selectedTask: string | null; select: Select; run: Run;
  move?: (direction: -1 | 1) => void; onDragProject?: () => void; onDropProject?: () => void;
}) {
  const flow = useWorkflow();
  const [collapsed, setCollapsed] = useState(false), [showWaiting, setShowWaiting] = useState(false), [pickOpen, setPickOpen] = useState(false), [title, setTitle] = useState('');
  const weekProject = week.projects.find(item => item.projectId === project?.id);
  const inWeek = new Set(rows.map(row => row.task.id));
  const candidates = flow.tasks.filter(task => (task.projectId ?? null) === (project?.id ?? null) && !inWeek.has(task.id) && task.status !== 'DONE' && !task.archivedAt).sort((a, b) => a.order - b.order);
  if (!project && !rows.length && !candidates.length) return null;
  const active = rows.filter(row => row.task.status !== 'WAITING'), waiting = rows.filter(row => row.task.status === 'WAITING');
  const selectedIds = weekRows(week, flow.tasks).filter(row => row.selected).map(row => row.task.id);
  const name = project?.title ?? '기타 · 프로젝트 없음';
  const dropTask = (event: DragEvent, before: string) => {
    const moved = event.dataTransfer.getData(TASK_MIME);
    if (!moved || moved === before || !selectedIds.includes(moved) || !selectedIds.includes(before)) return;
    event.preventDefault(); event.stopPropagation();
    void run(() => flow.reorderWeek(week.weekStart, 'week-tasks', placeBefore(selectedIds, moved, before)));
  };
  const shiftTask = (id: string, direction: -1 | 1) => {
    const inSection = active.filter(row => row.selected).map(row => row.task.id), index = inSection.indexOf(id), neighbour = inSection[index + direction];
    if (!neighbour) return;
    void run(() => flow.reorderWeek(week.weekStart, 'week-tasks', direction < 0 ? placeBefore(selectedIds, id, neighbour) : placeBefore(selectedIds, neighbour, id)));
  };
  const renderRow = (row: WeekRow) => <WeekTaskRow key={row.task.id} week={week} row={row} selectedTask={selectedTask} select={select} run={run}
    onDrop={event => dropTask(event, row.task.id)} shift={row.selected ? direction => shiftTask(row.task.id, direction) : undefined}/>;
  const done = rows.filter(row => row.task.status === 'DONE').length;
  return <section className={`wf-week-section ${project ? '' : 'is-unassigned'} ${included ? '' : 'is-excluded'}`} aria-label={`${name} 이번 주`}
    style={project ? { ['--group-color' as string]: projectColor(project.color) } : undefined}
    onDragOver={event => { if (onDropProject && event.dataTransfer.types.includes(PROJECT_MIME)) event.preventDefault(); }}
    onDrop={event => { if (onDropProject && event.dataTransfer.types.includes(PROJECT_MIME)) { event.preventDefault(); onDropProject(); } }}>
    <header className="wf-week-section-head">
      {onDragProject ? <span className="wf-drag" draggable title="끌어서 이번 주 프로젝트 순서 변경" onDragStart={event => { event.dataTransfer.setData(PROJECT_MIME, project!.id); event.dataTransfer.effectAllowed = 'move'; onDragProject(); }}><GripVertical size={14}/></span> : <span className="wf-drag-spacer"/>}
      <button className="wf-phase-toggle" aria-label={`${name} 접기/펼치기`} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</button>
      <span className="wf-color-dot" style={{ background: project ? projectColor(project.color) : '#8c959f' }}/>
      <div className="wf-week-section-name"><h2>{name}</h2>
        {project && included && <ScopeLine key={`${week.weekStart}:${weekProject?.scopeLine ?? ''}`} value={weekProject?.scopeLine ?? ''} label={`${name} 이번 주 범위`}
          onCommit={value => run(() => flow.includeProject(week.weekStart, project.id, true, value || null))}/>}
        {project && !included && <small className="wf-muted">이번 주 포함 안 됨 · 선택이나 날짜 배치가 있어 표시합니다 <button className="wf-link" onClick={() => void run(() => flow.includeProject(week.weekStart, project.id, true))}>포함하기</button></small>}
      </div>
      <span className="wf-week-counts">집중 {rows.filter(row => row.selected).length} · 완료 {done}</span>
      {move && <span className="wf-week-order"><button aria-label={`${name} 위로`} onClick={() => move(-1)}><ArrowUp size={13}/></button><button aria-label={`${name} 아래로`} onClick={() => move(1)}><ArrowDown size={13}/></button></span>}
    </header>
    {!collapsed && <div className="wf-week-section-body">
      {active.map(renderRow)}
      {!rows.length && <p className="wf-week-hint">이번 주에 할 작업을 아직 고르지 않았습니다. 아래에서 선택하세요.</p>}
      {!!waiting.length && <div className="wf-week-waiting"><button className="wf-link" aria-expanded={showWaiting} onClick={() => setShowWaiting(!showWaiting)}>{showWaiting ? '▾' : '▸'} 대기 중 {waiting.length}</button>{showWaiting && waiting.map(renderRow)}</div>}
      <div className="wf-week-pick">
        {!!candidates.length && <button className="wf-link" aria-expanded={pickOpen || !rows.length} onClick={() => setPickOpen(!pickOpen)}>{pickOpen || !rows.length ? '▾' : '▸'} 이 {project ? '프로젝트' : '구역'}의 다른 작업 {candidates.length}</button>}
        {(pickOpen || !rows.length) && <ul className="wf-week-candidates">{candidates.map(task => <li key={task.id}>
          <button className="wf-week-select" aria-pressed={false} aria-label={`${task.title} 이번 주 선택`} onClick={() => void run(() => flow.selectWeekTask(week.weekStart, task.id, true))}><Plus size={12}/> 선택</button>
          <span>{task.title}</span>{task.phaseId && <small>{flow.phases.find(phase => phase.id === task.phaseId)?.title}</small>}</li>)}</ul>}
        <form className="wf-add-inline" onSubmit={event => { event.preventDefault(); const value = title.trim(); if (!value) return; setTitle('');
          void run(async () => { const created = await flow.saveTask({ title: value, projectId: project?.id ?? null, phaseId: null, status: 'TODO', priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: Math.max(-1, ...flow.tasks.filter(task => (task.projectId ?? null) === (project?.id ?? null)).map(task => task.order)) + 1 }); await flow.selectWeekTask(week.weekStart, created.id, true); }, `‘${value}’ 작업을 만들고 이번 주에 선택했습니다.`); }}>
          <input aria-label={`${name}에 작업 추가`} placeholder={`+ ${project ? '이 프로젝트에' : '프로젝트 없이'} 작업 추가 (이번 주 선택)`} value={title} onChange={event => setTitle(event.target.value)}/><button disabled={!title.trim()}>추가</button></form>
      </div>
    </div>}
  </section>;
}

/** Optional "이번 주에는 여기까지" line: a weekly boundary, never written back to the Project goal. */
function ScopeLine({ value, label, onCommit }: { value: string; label: string; onCommit: (value: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value);
  const commit = () => { if (draft.trim() !== value) void onCommit(draft.trim()); };
  return <input className="wf-week-scope" aria-label={label} placeholder="이번 주에는 여기까지 (선택)" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') setDraft(value); }}/>;
}

const KIND_LABELS = { selected: '집중', planned: '날짜만', both: '집중 · 날짜' } as const;
function WeekTaskRow({ week, row, selectedTask, select, run, onDrop, shift }: { week: WeekView; row: WeekRow; selectedTask: string | null; select: Select; run: Run; onDrop: (event: DragEvent) => void; shift?: (direction: -1 | 1) => void }) {
  const flow = useWorkflow();
  const { task } = row;
  const phase = flow.phases.find(item => item.id === task.phaseId);
  const inWeek = row.plannedDates.filter(date => date >= week.weekStart && date <= weekDays(week.weekStart)[6]);
  const toggleSelection = () => {
    if (row.selected) {
      const kept = inWeek.length ? ` 날짜 배치 ${inWeek.length}개는 유지됩니다. 완전히 빼려면 날짜도 제거하세요.` : '';
      return run(() => flow.selectWeekTask(week.weekStart, task.id, false), `‘${task.title}’ 집중 선택은 해제됨, ${inWeek.length ? '날짜 배치는 유지' : '이번 주 목록에서 빠졌습니다'}.${kept}`,
        () => flow.selectWeekTask(week.weekStart, task.id, true));
    }
    return run(() => flow.selectWeekTask(week.weekStart, task.id, true));
  };
  return <div className={`wf-week-row is-${row.kind} ${task.status === 'DONE' ? 'is-done' : ''} ${task.archivedAt ? 'is-archived' : ''} ${selectedTask === task.id ? 'is-selected' : ''}`}
    data-task-id={task.id} onClick={rowOpenHandler(() => select(task.id))}
    onDragOver={event => { if (event.dataTransfer.types.includes(TASK_MIME)) event.preventDefault(); }} onDrop={onDrop}>
    <RowControl>{row.selected ? <span className="wf-drag" draggable title="끌어서 이번 주 작업 순서 변경" onDragStart={event => { event.dataTransfer.setData(TASK_MIME, task.id); event.dataTransfer.effectAllowed = 'move'; }}><GripVertical size={14}/></span> : <span className="wf-drag-spacer"/>}</RowControl>
    <RowControl><input type="checkbox" aria-label={`${task.title} 완료`} checked={task.status === 'DONE'} onChange={() => void run(() => flow.updateTask(task.id, { status: toggledStatus(task) }))}/></RowControl>
    <div className="wf-week-row-title"><button type="button" className="wf-title-button">{task.title}</button>
      {phase && <small className="wf-week-phase">{phase.title}</small>}{task.archivedAt && <small className="wf-week-phase">보관됨</small>}</div>
    <RowControl className="wf-row-props">
      <span className={`wf-week-kind is-${row.kind}`} title={row.kind === 'planned' ? '이번 주에 날짜만 배치됨 (집중 선택 아님)' : row.kind === 'both' ? '집중 선택 + 날짜 배치' : '집중 선택 · 날짜 미정'}>{KIND_LABELS[row.kind]}</span>
      <button type="button" className="wf-week-select" aria-pressed={row.selected} aria-label={`${task.title} 이번 주 ${row.selected ? '선택 해제' : '선택'}`} onClick={() => void toggleSelection()}>{row.selected ? '선택됨' : '선택'}</button>
      <select className={`wf-inline-select wf-status ${task.status.toLowerCase()}`} aria-label={`${task.title} 상태`} value={task.status} onChange={event => void run(() => flow.updateTask(task.id, { status: event.target.value as WorkTask['status'] }))}>
        {TASK_STATUSES.map(value => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}</select>
      <PlanDates task={task}/>
      <button type="button" className="wf-add-today" aria-label="오늘에 추가" title="오늘에 추가" onClick={() => void run(() => flow.addToToday(task.id), `‘${task.title}’을(를) 오늘 Workpad에 연결했습니다.`)}><Sun size={12} aria-hidden/><span>오늘에 추가</span></button>
      {shift && <span className="wf-week-order"><button type="button" aria-label={`${task.title} 위로`} onClick={() => shift(-1)}><ArrowUp size={12}/></button><button type="button" aria-label={`${task.title} 아래로`} onClick={() => shift(1)}><ArrowDown size={12}/></button></span>}
    </RowControl>
  </div>;
}

/* ------------------------------------------------------------------ S05 board */

type DragCard = { taskId: string; from: string | null };
const readCard = (event: DragEvent): DragCard | null => { try { const raw = event.dataTransfer.getData(CARD_MIME); return raw ? JSON.parse(raw) : null; } catch { return null; } };

/** One placement action shared by DnD and the day menu, with a one-step inverse for Undo. */
function usePlacement(run: Run) {
  const flow = useWorkflow();
  return (task: WorkTask, from: string | null, to: string | null) => {
    if (from === to) return Promise.resolve(true);
    const label = (date: string | null) => date ? `${Number(date.slice(5, 7))}.${Number(date.slice(8))}` : '날짜 미정';
    if (from && to) {
      let merged = false;
      return run(async () => { merged = (await flow.movePlanDay(task.id, from, to)).merged; },
        () => merged ? `‘${task.title}’은(는) ${label(to)}에 이미 있어 하나로 합쳤습니다 (중복 없음).` : `‘${task.title}’ ${label(from)} → ${label(to)} 이동 (다른 날짜 배치·마감·Workpad 기록은 그대로)`,
        // Undo restores the source placement; a merged move only needs the source added back.
        () => merged ? flow.addPlanDay(task.id, from) : flow.movePlanDay(task.id, to, from));
    }
    if (to) return run(() => flow.addPlanDay(task.id, to), `‘${task.title}’을(를) ${label(to)}에 배치했습니다.`, () => flow.removePlanDay(task.id, to));
    return run(() => flow.removePlanDay(task.id, from!), `‘${task.title}’의 ${label(from)} 배치만 해제했습니다.`, () => flow.addPlanDay(task.id, from!));
  };
}

function WeekBoard({ week, selectedTask, select, run }: { week: WeekView; selectedTask: string | null; select: Select; run: Run }) {
  const flow = useWorkflow();
  const [hideDone, setHideDone] = useState(false);
  const place = usePlacement(run);
  const { days, columns } = useMemo(() => boardColumns(week, week.planDays, flow.tasks), [week, flow.tasks]);
  const today = todayKey();
  const dropOnDay = (event: DragEvent, day: string, before: string | null) => {
    const card = readCard(event); if (!card) return;
    event.preventDefault(); event.stopPropagation();
    const task = flow.tasks.find(item => item.id === card.taskId); if (!task) return;
    if (card.from === day) {
      const ids = (columns.get(day) ?? []).map(item => item.task.id), next = placeBefore(ids, task.id, before);
      if (next.join() !== ids.join()) void run(() => flow.reorderDay(day, next));
      return;
    }
    void place(task, card.from, day);
  };
  return <div className="wf-board-wrap">
    <div className="wf-board-tools"><label><input type="checkbox" checked={hideDone} onChange={event => setHideDone(event.target.checked)}/> 완료 숨기기</label>
      <span className="wf-muted">카드를 끌어 요일을 바꾸거나 ‘날짜’ 메뉴를 쓰세요. 같은 작업을 여러 날에 둘 수 있습니다.</span></div>
    <div className="wf-board" role="list" aria-label="요일 보드">
      {days.map((day, index) => {
        const cards = (columns.get(day) ?? []).filter(card => !hideDone || card.task.status !== 'DONE');
        return <section key={day} role="listitem" className={`wf-board-col ${day === today ? 'is-today' : ''}`} aria-label={`${columnLabel(day, index)} 계획`}
          onDragOver={event => { if (event.dataTransfer.types.includes(CARD_MIME)) event.preventDefault(); }} onDrop={event => dropOnDay(event, day, null)}>
          <header><strong>{columnLabel(day, index)}</strong>{day === today && <small className="wf-board-today">오늘</small>}<small>{cards.length}개</small></header>
          <div className="wf-board-cards">{cards.map(card => <BoardCard key={`${card.task.id}:${day}`} task={card.task} from={day} selected={selectedTask === card.task.id} select={select} place={place} run={run}
            onDrop={event => dropOnDay(event, day, card.task.id)}/>)}
            {!cards.length && <p className="wf-board-empty">비어 있음</p>}</div>
        </section>;
      })}
    </div>
  </div>;
}

function BoardCard({ task, from, selected, select, place, run, onDrop }: { task: WorkTask; from: string | null; selected: boolean; select: Select; place: ReturnType<typeof usePlacement>; run: Run; onDrop?: (event: DragEvent) => void }) {
  const flow = useWorkflow();
  const project = flow.projects.find(item => item.id === task.projectId);
  return <article className={`wf-board-card ${task.status === 'DONE' ? 'is-done' : ''} ${selected ? 'is-selected' : ''}`} data-task-id={task.id} draggable
    style={{ ['--group-color' as string]: project ? projectColor(project.color) : '#8c959f' }}
    onDragStart={event => { event.dataTransfer.setData(CARD_MIME, JSON.stringify({ taskId: task.id, from } satisfies DragCard)); event.dataTransfer.effectAllowed = 'move'; }}
    onDragOver={event => { if (onDrop && event.dataTransfer.types.includes(CARD_MIME)) event.preventDefault(); }} onDrop={onDrop} onClick={rowOpenHandler(() => select(task.id))}>
    <button type="button" className="wf-title-button">{task.title}</button>
    <span className="wf-board-project"><span className="wf-color-dot" style={{ background: project ? projectColor(project.color) : '#8c959f' }}/>{project?.title ?? '프로젝트 없음'}</span>
    <RowControl className="wf-board-actions">
      <input type="checkbox" aria-label={`${task.title} 완료`} checked={task.status === 'DONE'} onChange={() => void run(() => flow.updateTask(task.id, { status: toggledStatus(task) }))}/>
      {task.status !== 'TODO' && <span className={`wf-board-status is-${task.status.toLowerCase()}`}>{TASK_STATUS_LABELS[task.status]}</span>}
      <DayMenu task={task} from={from} place={place}/>
      <button type="button" className="wf-add-today" aria-label="오늘에 추가" title="오늘에 추가" onClick={() => void run(() => flow.addToToday(task.id), `‘${task.title}’을(를) 오늘 Workpad에 연결했습니다.`)}><Sun size={12} aria-hidden/></button>
    </RowControl>
  </article>;
}

/** Keyboard/menu alternative to DnD: move this placement, add another day, or unschedule just this one. */
function DayMenu({ task, from, place }: { task: WorkTask; from: string | null; place: ReturnType<typeof usePlacement> }) {
  const flow = useWorkflow();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const weekStart = mondayOf(from ?? flow.weekStart);
  const week = flow.weeks[weekStart] ?? flow.week;
  const days = weekDays(week?.weekStart ?? weekStart);
  const planned = new Set(flow.planDays.filter(day => day.taskId === task.id).map(day => day.date));
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const choose = (action: () => Promise<unknown>) => { setOpen(false); void action(); };
  return <span className="wf-day-menu" ref={box}>
    <button type="button" className="wf-inline-chip is-empty" aria-label={`${task.title} 날짜`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><CalendarPlus size={12}/> 날짜</button>
    {open && <span className="wf-day-menu-pop" role="menu" aria-label={`${task.title} 날짜 메뉴`}>
      {from && <small>이 배치를 옮기기</small>}
      {from && days.filter(day => day !== from).map(day => <button key={`m${day}`} role="menuitem" disabled={planned.has(day)} onClick={() => choose(() => place(task, from, day))}>{columnLabel(day, days.indexOf(day))}{planned.has(day) ? ' · 이미 있음' : ''}</button>)}
      <small>{from ? '다른 날에도 배치' : '요일에 배치'}</small>
      {days.filter(day => !planned.has(day)).map(day => <button key={`a${day}`} role="menuitem" onClick={() => choose(() => place(task, null, day))}>+ {columnLabel(day, days.indexOf(day))}</button>)}
      {from && <button role="menuitem" className="wf-danger-text" onClick={() => choose(() => place(task, from, null))}>이 날짜 배치만 해제 (날짜 미정)</button>}
    </span>}
  </span>;
}

/** "이번 주 · 날짜 미정": selected this week without a plan day in the week. Dropping a card here unschedules it. */
function Unscheduled({ week, select, run }: { week: WeekView; select: Select; run: Run }) {
  const flow = useWorkflow();
  const place = usePlacement(run);
  const { unscheduled } = useMemo(() => boardColumns(week, week.planDays, flow.tasks), [week, flow.tasks]);
  return <section className="wf-week-unscheduled" aria-label="이번 주 날짜 미정"
    onDragOver={event => { if (event.dataTransfer.types.includes(CARD_MIME)) event.preventDefault(); }}
    onDrop={event => { const card = readCard(event); if (!card?.from) return; event.preventDefault(); const task = flow.tasks.find(item => item.id === card.taskId); if (task) void place(task, card.from, null); }}>
    <h3>이번 주 · 날짜 미정 <small>{unscheduled.length}</small></h3>
    <p className="wf-muted">이번 주에 선택했지만 요일이 없는 작업입니다. 요일로 끌어 배치하세요. (전체 날짜 미정 목록과는 다릅니다)</p>
    {unscheduled.map(task => <BoardCard key={task.id} task={task} from={null} selected={false} select={select} place={place} run={run}/>)}
    {!unscheduled.length && <p className="wf-board-empty">없음</p>}
  </section>;
}

/* ------------------------------------------------------------------ Focus + Weekly Goals */

type Slot = WeekView['focusSlots'][number];
type Goal = WeekView['goals'][number];
/** Exactly three Focus slots (Title + Memo, empty allowed, reorderable) and inline Weekly Goals, autosaved together. */
function FocusAndGoals({ week }: { week: WeekView }) {
  const flow = useWorkflow();
  const [slots, setSlots] = useState<Slot[]>(week.focusSlots), [goals, setGoals] = useState<Goal[]>(week.goals);
  const [state, setState] = useState<'saved' | 'pending' | 'saving' | 'conflict' | 'error'>('saved'), [message, setMessage] = useState('');
  const dirty = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined), latest = useRef({ slots, goals });
  const [newGoal, setNewGoal] = useState(''), [dragSlot, setDragSlot] = useState<number | null>(null), [dragGoal, setDragGoal] = useState<number | null>(null);
  // Follow the server (other windows, other weeks) while there is no unsaved local draft.
  const resetTo = useCallback((next: WeekView) => { dirty.current = false; latest.current = { slots: next.focusSlots, goals: next.goals }; setSlots(next.focusSlots); setGoals(next.goals); }, []);
  useEffect(() => { if (!dirty.current) resetTo(week); }, [week, resetTo]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const draft = latest.current;
    setState('saving');
    try {
      await flow.saveWeekContent(week.weekStart, draft.slots.map((slot, slotIndex) => ({ ...slot, slot: slotIndex })), draft.goals.filter(goal => goal.text.trim()).map((goal, order) => ({ ...goal, order })));
      if (latest.current === draft) dirty.current = false;
      setState('saved'); setMessage('');
    } catch (e) { setState(e instanceof WorkflowConflictError ? 'conflict' : 'error'); setMessage(errorText(e)); }
  }, [flow, week.weekStart]);
  const edit = (next: { slots?: Slot[]; goals?: Goal[] }, immediate = false) => {
    dirty.current = true;
    latest.current = { slots: next.slots ?? latest.current.slots, goals: next.goals ?? latest.current.goals };
    if (next.slots) setSlots(next.slots); if (next.goals) setGoals(next.goals);
    setState('pending'); clearTimeout(timer.current);
    if (immediate) void save(); else timer.current = setTimeout(() => void save(), 700);
  };
  const moveSlot = (from: number, to: number) => { if (from === to || to < 0 || to > 2) return; const next = [...latest.current.slots]; const [item] = next.splice(from, 1); next.splice(to, 0, item); edit({ slots: next }, true); };
  const moveGoal = (from: number, to: number) => { if (from === to || to < 0 || to >= latest.current.goals.length) return; const next = [...latest.current.goals]; const [item] = next.splice(from, 1); next.splice(to, 0, item); edit({ goals: next }, true); };
  const saveLabel = { saved: '저장됨', pending: '입력 중…', saving: '저장 중…', conflict: '충돌 확인 필요', error: '저장 실패' }[state];
  return <>
    <section className="wf-week-focus" aria-label="이번 주 집중 영역">
      <header><h3><Target size={15}/> 이번 주 집중 영역</h3><small className={`wf-week-save is-${state}`} role="status">{saveLabel}</small></header>
      {(state === 'conflict' || state === 'error') && <div className="wf-td-alert" role="alert"><p>{message}</p>{state === 'conflict' && <button onClick={() => { const next = flow.weeks[week.weekStart]; if (next) resetTo(next); setState('saved'); setMessage(''); }}>최신 값 사용</button>}{state === 'error' && <button onClick={() => void save()}>다시 저장</button>}</div>}
      {slots.map((slot, index) => <div key={index} className="wf-focus-slot" aria-label={`집중 ${index + 1}`}
        onDragOver={event => { if (dragSlot !== null) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragSlot !== null) moveSlot(dragSlot, index); setDragSlot(null); }}>
        <span className="wf-drag" draggable title="끌어서 집중 순서 변경" onDragStart={event => { event.dataTransfer.setData('text/plain', `focus-${index}`); setDragSlot(index); }} onDragEnd={() => setDragSlot(null)}><GripVertical size={13}/></span>
        <span className="wf-focus-index">{index + 1}</span>
        <div className="wf-focus-fields">
          <input aria-label={`집중 ${index + 1} 제목`} placeholder="제목 (비워도 됩니다)" value={slot.title} onChange={event => edit({ slots: latest.current.slots.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} onBlur={() => { if (dirty.current) void save(); }}/>
          <textarea aria-label={`집중 ${index + 1} 메모`} placeholder="메모" rows={2} value={slot.memo} onChange={event => edit({ slots: latest.current.slots.map((item, i) => i === index ? { ...item, memo: event.target.value } : item) })} onBlur={() => { if (dirty.current) void save(); }}/>
        </div>
        <span className="wf-week-order wf-focus-order"><button aria-label={`집중 ${index + 1} 위로`} disabled={index === 0} onClick={() => moveSlot(index, index - 1)}><ArrowUp size={12}/></button><button aria-label={`집중 ${index + 1} 아래로`} disabled={index === 2} onClick={() => moveSlot(index, index + 1)}><ArrowDown size={12}/></button></span>
      </div>)}
    </section>
    <section className="wf-week-goals" aria-label="이번 주 목표">
      <header><h3>이번 주 목표</h3><small className="wf-muted">체크는 목표 표시일 뿐, 작업을 완료하지 않습니다.</small></header>
      <ul>{goals.map((goal, index) => <li key={index} onDragOver={event => { if (dragGoal !== null) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragGoal !== null) moveGoal(dragGoal, index); setDragGoal(null); }}>
        <span className="wf-drag" draggable title="끌어서 목표 순서 변경" onDragStart={event => { event.dataTransfer.setData('text/plain', `goal-${index}`); setDragGoal(index); }} onDragEnd={() => setDragGoal(null)}><GripVertical size={13}/></span>
        <input aria-label={`목표 ${index + 1}`} value={goal.text} onChange={event => edit({ goals: latest.current.goals.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })}
          onBlur={() => { if (!goal.text.trim()) edit({ goals: latest.current.goals.filter((_, i) => i !== index) }, true); else if (dirty.current) void save(); }}/>
        <span className="wf-week-order"><button aria-label={`목표 ${index + 1} 위로`} disabled={index === 0} onClick={() => moveGoal(index, index - 1)}><ArrowUp size={11}/></button><button aria-label={`목표 ${index + 1} 삭제`} onClick={() => edit({ goals: latest.current.goals.filter((_, i) => i !== index) }, true)}><X size={11}/></button></span>
        <input type="checkbox" aria-label={`목표 ${index + 1} 달성`} checked={goal.checked} onChange={event => edit({ goals: latest.current.goals.map((item, i) => i === index ? { ...item, checked: event.target.checked } : item) }, true)}/>
      </li>)}</ul>
      {!goals.length && <p className="wf-muted">목표가 없어도 괜찮습니다.</p>}
      <form className="wf-add-inline" onSubmit={event => { event.preventDefault(); const text = newGoal.trim(); if (!text) return; setNewGoal(''); edit({ goals: [...latest.current.goals, { id: null, text, checked: false, order: latest.current.goals.length }] }, true); }}>
        <input aria-label="새 목표" placeholder="+ 목표 추가" value={newGoal} onChange={event => setNewGoal(event.target.value)}/><button disabled={!newGoal.trim()}>추가</button></form>
    </section>
  </>;
}

