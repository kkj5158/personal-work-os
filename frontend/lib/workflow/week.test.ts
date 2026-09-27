import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { boardColumns, distinctTaskIds, placeBefore, reopenStatus, shiftItem, shiftWeek, toggledStatus, weekDays, weekRangeLabel, weekRows } from './week';
import { mondayOf } from './store';

const task = (id: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: 'TODO', projectId: 'p1', phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, ...extra });

test('Monday week start, Monday–Sunday days, week navigation and range label', () => {
  assert.equal(mondayOf('2026-09-27'), '2026-09-21', 'a Sunday belongs to the week that started Monday');
  assert.equal(mondayOf('2026-09-28'), '2026-09-28');
  assert.deepEqual(weekDays('2026-09-28'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(shiftWeek('2026-09-28', -1), '2026-09-21');
  assert.equal(shiftWeek('2026-09-28', 1), '2026-10-05');
  assert.equal(weekRangeLabel('2026-09-28'), '2026년 9월 28일 (월) – 10월 4일 (일)');
});

test('week task set = explicit selection ∪ plan days, one row per Task, kinds distinguished', () => {
  const tasks = [task('sel'), task('plan'), task('both'), task('multi'), task('outside')];
  const rows = weekRows({ tasks: [
    { taskId: 'both', selected: true, selectionOrder: 1, plannedDates: ['2026-09-30'] },
    { taskId: 'sel', selected: true, selectionOrder: 0, plannedDates: [] },
    { taskId: 'plan', selected: false, selectionOrder: null, plannedDates: ['2026-09-29'] },
    { taskId: 'multi', selected: false, selectionOrder: null, plannedDates: ['2026-10-02', '2026-09-28'] },
  ] }, tasks);
  assert.deepEqual(rows.map(row => [row.task.id, row.kind]), [['sel', 'selected'], ['both', 'both'], ['multi', 'planned'], ['plan', 'planned']]);
  assert.deepEqual(rows.find(row => row.task.id === 'multi')!.plannedDates, ['2026-09-28', '2026-10-02'], 'multiple plan dates on one row');
  assert.equal(new Set(rows.map(row => row.task.id)).size, rows.length, 'same taskId collapses to one weekly row');
  assert.equal(rows.find(row => row.task.id === 'plan')!.selected, false, 'plan-day-only is never turned into a selection');
});

test('board: same Task on several days keeps one id, unscheduled = selected without a plan day this week', () => {
  const tasks = [task('a'), task('b'), task('c'), task('d')];
  const week = { weekStart: '2026-09-28', tasks: [
    { taskId: 'a', selected: true, selectionOrder: 0, plannedDates: ['2026-09-28', '2026-09-30'] },
    { taskId: 'b', selected: true, selectionOrder: 1, plannedDates: [] },
    { taskId: 'c', selected: false, selectionOrder: null, plannedDates: ['2026-09-30'] },
  ] };
  const planDays = [{ taskId: 'a', date: '2026-09-28', order: 0 }, { taskId: 'a', date: '2026-09-30', order: 1 }, { taskId: 'c', date: '2026-09-30', order: 0 }, { taskId: 'd', date: '2026-10-09', order: 0 }];
  const { days, columns, unscheduled } = boardColumns(week, planDays, tasks);
  assert.equal(days.length, 7);
  assert.deepEqual(columns.get('2026-09-30')!.map(card => card.task.id), ['c', 'a'], 'within-day order follows plan-day order');
  assert.equal(columns.get('2026-09-28')![0].task, columns.get('2026-09-30')![1].task, 'the same canonical Task object on both days');
  assert.deepEqual(unscheduled.map(item => item.id), ['b']);
  assert.deepEqual([...distinctTaskIds(columns)].sort(), ['a', 'c'], 'counts are distinct by taskId; next-week plan days are out');
});

test('reorder helpers and completion undo restore previousStatus', () => {
  assert.deepEqual(placeBefore(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(placeBefore(['a', 'b', 'c'], 'a', null), ['b', 'c', 'a']);
  assert.deepEqual(shiftItem(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  const same = ['a', 'b']; assert.equal(shiftItem(same, 0, -1), same, 'no-op at the edge');
  assert.equal(reopenStatus({ previousStatus: 'DOING' }), 'DOING');
  assert.equal(reopenStatus({ previousStatus: 'TODO' }), 'TODO');
  assert.equal(reopenStatus({ previousStatus: 'WAITING' }), 'TODO', 'WAITING context was cleared on completion');
  assert.equal(reopenStatus({ previousStatus: null }), 'TODO');
  assert.equal(toggledStatus({ status: 'DOING', previousStatus: null }), 'DONE');
  assert.equal(toggledStatus({ status: 'DONE', previousStatus: 'DOING' }), 'DOING');
});

test('status/priority options are neutral instead of inheriting the selected value styling', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../app/workflow/projects-todo.css', import.meta.url), 'utf8');
  const rule = css.match(/\.wf-inline-select option,\.wf-status option,\.wf-priority option\{([^}]*)\}/);
  assert.ok(rule, 'option rule exists');
  assert.match(rule![1], /color:var\(--fg-default\)/);
  assert.ok(css.lastIndexOf('.wf-inline-select option') > css.lastIndexOf('.wf-status.doing'), 'option rule wins over later semantic trigger colors');
});
