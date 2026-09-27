import type { PlanDay, TaskStatus, WeekView, WorkTask } from '../api/workflow';
import { addDaysKey, mondayOf } from './store';

/** Monday–Sunday date keys of the week starting at `weekStart` (a Monday, Asia/Seoul calendar date). */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysKey(weekStart, index));
}
export const shiftWeek = (weekStart: string, weeks: number) => addDaysKey(mondayOf(weekStart), weeks * 7);

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
export const weekdayLabel = (index: number) => WEEKDAY_LABELS[index];
/** "2026년 9월 28일 (월) – 10월 4일 (일)" */
export function weekRangeLabel(weekStart: string): string {
  const end = addDaysKey(weekStart, 6);
  const [y, m, d] = weekStart.split('-').map(Number), [, em, ed] = end.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 (월) – ${em === m ? '' : `${em}월 `}${ed}일 (일)`;
}
/** "9.28 (월)" for a board column header. */
export function columnLabel(dateKey: string, index: number): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}.${d} (${WEEKDAY_LABELS[index]})`;
}

export type WeekKind = 'selected' | 'planned' | 'both';
export type WeekRow = { task: WorkTask; selected: boolean; selectionOrder: number | null; plannedDates: string[]; kind: WeekKind };

/**
 * The This Week task set: explicit weekly selections ∪ Tasks with a plan day inside the week. One row per
 * canonical Task; a plan-day-only Task is never turned into a selection. Selected rows follow the week order,
 * planned-only rows follow their first plan date.
 */
export function weekRows(week: Pick<WeekView, 'tasks'>, tasks: WorkTask[]): WeekRow[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const rows: WeekRow[] = [];
  for (const item of week.tasks) {
    const task = byId.get(item.taskId);
    if (!task) continue;
    const plannedDates = [...item.plannedDates].sort();
    rows.push({ task, selected: item.selected, selectionOrder: item.selectionOrder, plannedDates, kind: item.selected ? plannedDates.length ? 'both' : 'selected' : 'planned' });
  }
  return rows.sort((a, b) => Number(b.selected) - Number(a.selected) || (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0)
    || (a.plannedDates[0] ?? '').localeCompare(b.plannedDates[0] ?? '') || a.task.order - b.task.order || a.task.id.localeCompare(b.task.id));
}

export type BoardCard = { task: WorkTask; date: string; order: number };
/**
 * Weekday board: one card per plan placement (the same taskId may appear on several days, still one Task),
 * plus "이번 주 · 날짜 미정" = explicitly selected Tasks with no plan day inside this week.
 */
export function boardColumns(week: Pick<WeekView, 'weekStart' | 'tasks'>, planDays: PlanDay[], tasks: WorkTask[]) {
  const days = weekDays(week.weekStart), byId = new Map(tasks.map(task => [task.id, task]));
  const columns = new Map<string, BoardCard[]>(days.map(day => [day, []]));
  for (const plan of planDays) {
    const task = byId.get(plan.taskId), column = columns.get(plan.date);
    if (task && column) column.push({ task, date: plan.date, order: plan.order });
  }
  for (const column of columns.values()) column.sort((a, b) => a.order - b.order || a.task.id.localeCompare(b.task.id));
  const planned = new Set(planDays.filter(plan => columns.has(plan.date)).map(plan => plan.taskId));
  const unscheduled = weekRows(week, tasks).filter(row => row.selected && !planned.has(row.task.id)).map(row => row.task);
  return { days, columns, unscheduled };
}
/** Distinct Tasks on the board: counts never grow because one Task sits on several days. */
export function distinctTaskIds(columns: Map<string, BoardCard[]>): Set<string> {
  return new Set([...columns.values()].flatMap(cards => cards.map(card => card.task.id)));
}

/** Moves `moved` in front of `before` (or to the end); ids missing from the list are appended. */
export function placeBefore(ids: string[], moved: string, before: string | null): string[] {
  const rest = ids.filter(id => id !== moved);
  const index = before ? rest.indexOf(before) : -1;
  rest.splice(index < 0 ? rest.length : index, 0, moved);
  return rest;
}
/** Swap-with-neighbour move used by keyboard/button alternatives to DnD. */
export function shiftItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  if (index < 0 || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * Undoing a completion restores the Task's previous non-DONE status (TODO / DOING). WAITING is not resurrected:
 * completing a WAITING Task cleared its waiting context, so it comes back as TODO.
 */
export function reopenStatus(task: Pick<WorkTask, 'previousStatus'>): TaskStatus {
  return task.previousStatus === 'DOING' || task.previousStatus === 'TODO' ? task.previousStatus : 'TODO';
}
export const toggledStatus = (task: Pick<WorkTask, 'status' | 'previousStatus'>): TaskStatus => task.status === 'DONE' ? reopenStatus(task) : 'DONE';
