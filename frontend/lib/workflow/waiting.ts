import type { Project, ProjectGroup, WorkTask } from '../api/workflow';
import { isActiveProject, projectGroupSections } from './catalog';
import { addDaysKey, mondayOf } from './store';

/**
 * Waiting / Check (S08) projections over canonical WAITING Tasks. "확인할 때가 된 일" is a projection, not a status:
 * a WAITING Task is ready to check when it is explicitly flagged or its check date is today or earlier
 * (Asia/Seoul date keys). Everything else stays in "대기 중". Same rule as the server's /waiting projection.
 */
export function isReadyToCheck(task: Pick<WorkTask, 'status' | 'waitingFlagged' | 'waitingCheckDate'>, today: string): boolean {
  return task.status === 'WAITING' && (!!task.waitingFlagged || (!!task.waitingCheckDate && task.waitingCheckDate <= today));
}

const byCheckDate = (a: WorkTask, b: WorkTask) => (a.waitingCheckDate || '￿').localeCompare(b.waitingCheckDate || '￿') || a.order - b.order || a.id.localeCompare(b.id);

/** Only active (non-archived) WAITING Tasks; ideas, holds and archive are never part of this screen. */
export function waitingProjection(tasks: WorkTask[], today: string): { ready: WorkTask[]; waiting: WorkTask[] } {
  const all = tasks.filter(task => task.status === 'WAITING' && !task.archivedAt).sort(byCheckDate);
  return { ready: all.filter(task => isReadyToCheck(task, today)), waiting: all.filter(task => !isReadyToCheck(task, today)) };
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

/** Quick extend targets for the inline check-date picker. `null` clears the date (날짜 없음). */
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
 * Waiting project context: which Project's Waiting the user is looking at and entering. 'ALL' is the aggregated
 * management view; UNASSIGNED ('unassigned') is the no-Project context; anything else is a Project id.
 * Creation in a Project context takes its projectId from the context, never from a per-row selector.
 */
export type WaitingContext = string;
export const ALL_CONTEXT = 'ALL';
export const NO_PROJECT_CONTEXT = 'unassigned';
export const inWaitingContext = (task: Pick<WorkTask, 'projectId'>, context: WaitingContext) =>
  context === ALL_CONTEXT || (task.projectId ?? NO_PROJECT_CONTEXT) === context;
/** projectId a new Waiting item gets in this context (null = 프로젝트 없음). Undefined in 전체: no creation there. */
export const contextProjectId = (context: WaitingContext): string | null | undefined =>
  context === ALL_CONTEXT ? undefined : context === NO_PROJECT_CONTEXT ? null : context;

/**
 * Project contexts grouped exactly like the Projects page (group order → Project order).
 * `primary`: active Projects (READY / ACTIVE) — the normal creation contexts — plus the current selection.
 * `more` (더보기): 보류 / 완료 Projects and archived Projects that still own WAITING items, so no historical record
 * becomes unreachable. `known` = a context that can be shown (anything else falls back to 전체).
 */
export function waitingContextSections<P extends Project>(projects: P[], groups: ProjectGroup[], owning: Set<string>, selected: WaitingContext) {
  const reachable = (project: P) => !project.archivedAt || owning.has(project.id);
  const known = (id: string) => projects.some(project => project.id === id && reachable(project));
  const primary = projectGroupSections(projects, groups, project => isActiveProject(project) || (project.id === selected && reachable(project)));
  const more = projectGroupSections(projects, groups, project => !isActiveProject(project) && reachable(project) && project.id !== selected);
  return { primary, more, known };
}

const CONTEXT_KEY = 'wf.waiting.context';
/** Last Waiting context: a per-viewer convenience in localStorage (same pattern as the catalog collapse state). */
export function readWaitingContext(): WaitingContext {
  try { return localStorage.getItem(CONTEXT_KEY) || ALL_CONTEXT; } catch { return ALL_CONTEXT; }
}
export function writeWaitingContext(context: WaitingContext) {
  try { localStorage.setItem(CONTEXT_KEY, context); } catch { /* per-viewer convenience only */ }
}
