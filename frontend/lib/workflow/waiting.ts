import type { WorkTask } from '../api/workflow';
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

/** 확인 시점 filter row. Several active values are OR; none means 전체. */
export type CheckWhen = 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'NEXT_WEEK' | 'NONE';
export const CHECK_WHEN_LABELS: Record<CheckWhen, string> = { TODAY: '오늘', TOMORROW: '내일', THIS_WEEK: '이번 주', NEXT_WEEK: '다음 주', NONE: '날짜 없음' };
export function matchesCheckWhen(task: Pick<WorkTask, 'waitingCheckDate'>, when: CheckWhen[], today: string): boolean {
  if (!when.length) return true;
  const date = task.waitingCheckDate ?? null, monday = mondayOf(today), nextMonday = addDaysKey(monday, 7);
  return when.some(value => {
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
