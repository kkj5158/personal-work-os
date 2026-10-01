import type { Project, WaitingAgent, WorkTask } from '../api/workflow';
import type { ProjectGroupSection } from './catalog';
import { addDaysKey, mondayOf } from './store';

/**
 * Waiting / Check (S08) projections over canonical WAITING Tasks. "확인할 때가 된 일" is a projection, not a status.
 * Waiting revision 2026-10-01 (103 §4): the projection is by check date only (Asia/Seoul date keys) —
 * check date <= today → 확인할 때가 된 일; a future check date or no check date → 대기 중.
 */
export function isReadyToCheck(task: Pick<WorkTask, 'status' | 'waitingCheckDate'>, today: string): boolean {
  return task.status === 'WAITING' && !!task.waitingCheckDate && task.waitingCheckDate <= today;
}

const byCheckDate = (a: WorkTask, b: WorkTask) => (a.waitingCheckDate || '￿').localeCompare(b.waitingCheckDate || '￿') || a.order - b.order || a.id.localeCompare(b.id);

/** Only active (non-archived) WAITING Tasks; ideas, holds and archive are never part of this screen. */
export function waitingProjection(tasks: WorkTask[], today: string): { ready: WorkTask[]; waiting: WorkTask[] } {
  const all = tasks.filter(task => task.status === 'WAITING' && !task.archivedAt).sort(byCheckDate);
  return { ready: all.filter(task => isReadyToCheck(task, today)), waiting: all.filter(task => !isReadyToCheck(task, today)) };
}

/**
 * Completed Waiting history: the same canonical Task, completed from the Waiting queue (waitingCompletedAt set).
 * Its waiting context stays on the Task, newest completion first. A plain completion elsewhere is not Waiting history.
 */
export function completedWaiting(tasks: WorkTask[]): WorkTask[] {
  return tasks.filter(task => task.status === 'DONE' && !!task.waitingCompletedAt && !task.archivedAt)
    .sort((a, b) => (b.waitingCompletedAt ?? '').localeCompare(a.waitingCompletedAt ?? '') || a.id.localeCompare(b.id));
}

/**
 * 확인 시점 filter row. Several active values are OR; none means 전체. CUSTOM (직접 지정) matches one chosen date key.
 * All values are Asia/Seoul date keys (YYYY-MM-DD) compared as strings: the DATE column and the date input's value are
 * already local calendar days, so nothing here goes through a Date/UTC conversion (no off-by-one at midnight).
 */
export type CheckWhen = 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'NEXT_WEEK' | 'NONE' | 'CUSTOM';
export const CHECK_WHEN_LABELS: Record<Exclude<CheckWhen, 'CUSTOM'>, string> = { TODAY: '오늘', TOMORROW: '내일', THIS_WEEK: '이번 주', NEXT_WEEK: '다음 주', NONE: '날짜 없음' };
export function matchesCheckWhen(task: Pick<WorkTask, 'waitingCheckDate'>, when: CheckWhen[], today: string, customDate: string | null = null): boolean {
  if (!when.length) return true;
  const date = task.waitingCheckDate ?? null, monday = mondayOf(today), nextMonday = addDaysKey(monday, 7);
  return when.some(value => {
    if (value === 'CUSTOM') return !!customDate && date === customDate;
    if (value === 'NONE') return !date;
    if (!date) return false;
    // "오늘" also catches overdue check dates: they are due now.
    if (value === 'TODAY') return date <= today;
    if (value === 'TOMORROW') return date === addDaysKey(today, 1);
    if (value === 'THIS_WEEK') return date >= monday && date < nextMonday;
    return date >= nextMonday && date < addDaysKey(nextMonday, 7);
  });
}

/** Quick targets for the inline check-date picker. `null` clears the date (날짜 없음). */
export type ExtendChoice = { key: 'today' | 'tomorrow' | 'nextWeek' | 'none'; label: string; date: string | null };
export function extendChoices(today: string): ExtendChoice[] {
  return [
    { key: 'today', label: '오늘', date: today },
    { key: 'tomorrow', label: '내일', date: addDaysKey(today, 1) },
    { key: 'nextWeek', label: '다음 주', date: addDaysKey(mondayOf(today), 7) },
    { key: 'none', label: '날짜 없음', date: null },
  ];
}

/** New waiting Tasks created from the "확인할 때가 된 일" table default to today's check date; the other table leaves it optional. */
export const defaultCheckDate = (table: 'ready' | 'waiting', today: string) => table === 'ready' ? today : '';

/**
 * 담당 Agent: one Waiting execution classification per item. It is not an assignee / collaboration field.
 * 미지정 is stored as null on the Task and addressed as 'UNASSIGNED' in filters and commands.
 */
export type AgentKey = WaitingAgent | 'UNASSIGNED';
export const AGENT_KEYS: AgentKey[] = ['CODEX', 'CLAUDE_CODE', 'CHATGPT', 'DIRECT', 'UNASSIGNED'];
export const AGENT_LABELS: Record<AgentKey, string> = { CODEX: 'Codex', CLAUDE_CODE: 'Claude Code', CHATGPT: 'ChatGPT', DIRECT: '직접 작업', UNASSIGNED: '미지정' };
export const agentOf = (task: Pick<WorkTask, 'waitingAgent'>): AgentKey =>
  task.waitingAgent && (AGENT_KEYS as string[]).includes(task.waitingAgent) ? task.waitingAgent : 'UNASSIGNED';
/** Value sent in a Task patch: 미지정 clears the column. */
export const agentValue = (key: AgentKey): WaitingAgent | null => key === 'UNASSIGNED' ? null : key;

export const NO_PROJECT = 'unassigned';
export type WaitingFilters = { projects: string[]; when: CheckWhen[]; customDate: string | null; agents: AgentKey[]; search: string };
export const emptyWaitingFilters = (): WaitingFilters => ({ projects: [], when: [], customDate: null, agents: [], search: '' });
export const isNarrowed = (filters: WaitingFilters) => !!(filters.projects.length || filters.when.length || filters.agents.length || filters.search.trim());

/** Project AND check timing AND assigned Agent (AND text search). Inside one group the selected values are OR. */
export function matchesWaitingFilters(task: WorkTask, filters: WaitingFilters, today: string, projectTitle: string): boolean {
  if (filters.projects.length && !filters.projects.includes(task.projectId ?? NO_PROJECT)) return false;
  if (!matchesCheckWhen(task, filters.when, today, filters.customDate)) return false;
  if (filters.agents.length && !filters.agents.includes(agentOf(task))) return false;
  const query = filters.search.trim().toLocaleLowerCase();
  return !query || `${task.title} ${task.waitingReason ?? ''} ${task.waitingNextAction ?? ''} ${projectTitle}`.toLocaleLowerCase().includes(query);
}

/** Project filter: 전체 (empty) and individual selections are mutually exclusive; a group toggle selects / clears all of its Projects. */
export const toggleProject = (selected: string[], id: string) => selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
export const toggleProjectGroup = (selected: string[], ids: string[]) =>
  ids.length && ids.every(id => selected.includes(id)) ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])];

/**
 * Live project search inside the grouped filter: case-insensitive substring (Korean / English). Every group row stays
 * structurally present; a group without a match simply has no Projects to show (the UI renders its no-match state).
 */
export function searchProjectSections<P extends Project>(sections: ProjectGroupSection<P>[], query: string): ProjectGroupSection<P>[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return sections;
  return sections.map(section => ({ ...section, projects: section.projects.filter(project => project.title.toLocaleLowerCase().includes(needle)) }));
}

/**
 * Inline-create prefill from the current Project filter: exactly one Project → its group and Project; several Projects of
 * one group → that group only; anything else (전체, 프로젝트 없음, several groups) → nothing.
 */
export function createPrefill(selected: string[], sections: ProjectGroupSection[]): { group: string; projectId: string } {
  const picked = selected.filter(id => id !== NO_PROJECT);
  if (!picked.length || picked.length !== selected.length) return { group: '', projectId: '' };
  const groups = new Set(picked.map(id => sections.find(section => section.projects.some(project => project.id === id))?.key ?? ''));
  if (groups.size !== 1 || groups.has('')) return { group: '', projectId: '' };
  return { group: [...groups][0], projectId: picked.length === 1 ? picked[0] : '' };
}

const DAY = 86_400_000;
/** Whole days between two instants (never negative). Used for 대기 기간 in history and the active waiting statistics. */
export function daysBetween(from: string | null | undefined, to: string | number): number | null {
  if (!from) return null;
  const start = Date.parse(from), end = typeof to === 'number' ? to : Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / DAY)) : null;
}

/** Active Waiting only (확인할 때가 된 일 + 대기 중; completed history excluded). Not a general analytics dashboard. */
export function waitingStats(ready: WorkTask[], waiting: WorkTask[], now: number) {
  const active = [...ready, ...waiting];
  const days = active.map(task => daysBetween(task.waitingSince, now)).filter((value): value is number => value !== null);
  const agents = Object.fromEntries(AGENT_KEYS.map(key => [key, active.filter(task => agentOf(task) === key).length])) as Record<AgentKey, number>;
  return {
    total: active.length, ready: ready.length, waiting: waiting.length, noDate: active.filter(task => !task.waitingCheckDate).length,
    averageDays: days.length ? Math.round(days.reduce((sum, value) => sum + value, 0) / days.length * 10) / 10 : null,
    longestDays: days.length ? Math.max(...days) : null, agents,
  };
}

/** 재개 returns the Task to the active status it had before waiting (할 일 when unknown). */
export const resumeStatus = (task: Pick<WorkTask, 'previousStatus'>) => task.previousStatus === 'DOING' ? 'DOING' as const : 'TODO' as const;

/** Everything an Undo needs to put a Task back into the same Waiting state (same Task, same waiting start). */
export function waitingSnapshot(task: WorkTask) {
  return { status: 'WAITING' as const, waitingReason: task.waitingReason ?? null, waitingNextAction: task.waitingNextAction ?? null, waitingCheckDate: task.waitingCheckDate ?? null,
    waitingFlagged: false, waitingAgent: agentValue(agentOf(task)), waitingSince: task.waitingSince ?? null };
}
