'use client';

import { useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronRight, CornerDownRight, Sun } from 'lucide-react';
import type { WorkTask } from '@/lib/api/workflow';
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/workflow/labels';
import { projectColor } from '@/lib/workflow/timeline';
import { useWorkflow } from './WorkflowContext';

const COLLAPSE_KEY = 'wf-today-planned-collapsed';
function readCollapsed() { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } }
function writeCollapsed(value: boolean) { try { localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* per-viewer convenience only */ } }

/** "Project · Phase · 높음 · 마감 9.30" — the deadline only when a real semantic deadline exists (never legacy due). */
export function taskMeta(task: WorkTask, flow: Pick<ReturnType<typeof useWorkflow>, 'projects' | 'phases'>): string[] {
  const project = flow.projects.find(item => item.id === task.projectId), phase = flow.phases.find(item => item.id === task.phaseId);
  const parts = [project?.title ?? '프로젝트 없음'];
  if (phase) parts.push(phase.title);
  parts.push(PRIORITY_LABELS[task.priority]);
  if (task.deadlineDate) parts.push(`마감 ${Number(task.deadlineDate.slice(5, 7))}.${Number(task.deadlineDate.slice(8))}`);
  return parts;
}

/**
 * "오늘 예정": a read-only projection of the Tasks planned for this Workpad date (plan days from This Week /
 * the board). It never writes the document; only an explicit Add to Today creates the TaskReference.
 */
export default function TodayPlanned({ date, isToday, referenced, busy, onAdd, onOpen }: {
  date: string; isToday: boolean; referenced: Map<string, string>; busy: boolean;
  onAdd: (taskId: string) => void; onOpen: (blockId: string) => void;
}) {
  const flow = useWorkflow();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const planned = flow.planDays.filter(day => day.date === date).sort((a, b) => a.order - b.order)
    .map(day => flow.tasks.find(task => task.id === day.taskId)).filter((task): task is WorkTask => !!task && !task.archivedAt);
  if (!planned.length) return null;
  const done = planned.filter(task => task.status === 'DONE').length;
  const toggle = () => { setCollapsed(!collapsed); writeCollapsed(!collapsed); };
  return <section className={`wp-planned ${collapsed ? 'is-collapsed' : ''}`} contentEditable={false} aria-label={isToday ? '오늘 예정' : '이 날짜 예정'}>
    <button type="button" className="wp-planned-toggle" aria-expanded={!collapsed} onClick={toggle}>
      {collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<CalendarCheck size={14}/>
      <strong>{isToday ? '오늘 예정' : '이 날짜 예정'}</strong><small>{planned.length}개{done ? ` · 완료 ${done}` : ''}</small>
      {collapsed && <span className="wp-planned-peek">{planned.slice(0, 3).map(task => task.title).join(' · ')}{planned.length > 3 ? ' …' : ''}</span>}
    </button>
    {!collapsed && <ul>{planned.map(task => {
      const project = flow.projects.find(item => item.id === task.projectId), blockId = referenced.get(task.id);
      return <li key={task.id} className={task.status === 'DONE' ? 'is-done' : ''}>
        <span className="wf-color-dot" style={{ background: project ? projectColor(project.color) : '#8c959f' }}/>
        <span className="wp-planned-title">{task.title}</span>
        <small className="wp-planned-meta">{taskMeta(task, flow).join(' · ')}{task.status !== 'TODO' ? ` · ${TASK_STATUS_LABELS[task.status]}` : ''}</small>
        {blockId
          ? <button type="button" className="wp-planned-open" onClick={() => onOpen(blockId)}><CornerDownRight size={13}/>본문에서 보기</button>
          : <button type="button" className="wp-planned-add" disabled={busy} onClick={() => onAdd(task.id)}><Sun size={13}/>{isToday ? '오늘에 추가' : '이 날짜에 추가'}</button>}
      </li>;
    })}</ul>}
  </section>;
}
