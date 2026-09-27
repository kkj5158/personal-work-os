import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { FILTER_STATUSES, emptyFilters, inArchiveScope, isFiltered, matchesFilters, normalizeSort, passesDisplayPreferences, resetGroup, sortTasks, toggleFilter, type ExplorerContext } from './explorer';

const task = (id: string, patch: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: 'TODO', projectId: 'p1', phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, deadlineDate: null, ...patch });
const context: ExplorerContext = { weekTaskIds: new Set(['wk']), plannedTaskIds: new Set(['wk', 'later']) };
const ids = (tasks: WorkTask[]) => tasks.map(item => item.id);

test('button filters: OR inside one group, AND across groups, 전체 resets one group, global reset clears all', () => {
  const rows = [task('a', { status: 'TODO', priority: 'HIGH' }), task('b', { status: 'DOING', priority: 'LOW' }), task('c', { status: 'WAITING', priority: 'HIGH', projectId: null }), task('d', { status: 'DONE', projectId: 'p2' })];
  const pick = (filters: ReturnType<typeof emptyFilters>) => ids(rows.filter(row => matchesFilters(row, filters, context)));
  assert.deepEqual(pick(emptyFilters()), ['a', 'b', 'c', 'd'], 'empty group = 전체');
  let filters = toggleFilter(toggleFilter(emptyFilters(), 'statuses', 'TODO'), 'statuses', 'WAITING');
  assert.deepEqual(pick(filters), ['a', 'c'], 'OR within Status');
  filters = toggleFilter(filters, 'priorities', 'HIGH');
  assert.deepEqual(pick(filters), ['a', 'c'], 'AND with Priority');
  filters = toggleFilter(filters, 'projects', 'unassigned');
  assert.deepEqual(pick(filters), ['c'], '프로젝트 없음 is the unassigned bucket');
  filters = toggleFilter(filters, 'statuses', 'WAITING');
  assert.deepEqual(pick(filters), [], 'toggling a value off');
  const statusReset = resetGroup(filters, 'statuses');
  assert.deepEqual(statusReset.statuses, []); assert.deepEqual(statusReset.priorities, ['HIGH'], 'group 전체 leaves other groups alone');
  assert.equal(isFiltered(emptyFilters()), false); assert.equal(isFiltered(statusReset), true);
});

test('Task status filter never contains 보류 (a Project status)', () => {
  assert.deepEqual(FILTER_STATUSES, ['TODO', 'DOING', 'WAITING', 'DONE']);
});

test('This Week filter reuses the week set; 미배치 = no plan day and not in the week', () => {
  const rows = [task('wk'), task('later'), task('free')];
  assert.deepEqual(ids(rows.filter(row => matchesFilters(row, toggleFilter(emptyFilters(), 'week', 'THIS_WEEK'), context))), ['wk']);
  assert.deepEqual(ids(rows.filter(row => matchesFilters(row, toggleFilter(emptyFilters(), 'week', 'UNPLANNED'), context))), ['free']);
  const both = toggleFilter(toggleFilter(emptyFilters(), 'week', 'THIS_WEEK'), 'week', 'UNPLANNED');
  assert.deepEqual(ids(rows.filter(row => matchesFilters(row, both, context))), ['wk', 'free']);
});

test('deadline sort uses the semantic deadlineDate only; legacy due_date is never reinterpreted', () => {
  const rows = [
    task('legacyEarly', { dueDate: '2026-01-01', startDate: '2025-12-01' }),
    task('late', { deadlineDate: '2026-10-20' }),
    task('soon', { deadlineDate: '2026-09-30', dueDate: '2027-12-31' }),
    task('none'),
  ];
  assert.deepEqual(ids(sortTasks(rows, 'DEADLINE')), ['soon', 'late', 'legacyEarly', 'none']);
  assert.deepEqual(ids(rows), ['legacyEarly', 'late', 'soon', 'none'], 'input (canonical order) is not mutated');
});

test('recent update, project order and priority sorts; legacy stored keys are normalized', () => {
  const rows = [task('old', { updatedAt: '2026-09-01T00:00:00Z', projectId: 'p2', priority: 'LOW', order: 0 }), task('new', { updatedAt: '2026-09-27T00:00:00Z', projectId: null, priority: 'HIGH', order: 1 }), task('mid', { updatedAt: '2026-09-10T00:00:00Z', projectId: 'p1', order: 2 })];
  assert.deepEqual(ids(sortTasks(rows, 'UPDATED')), ['new', 'mid', 'old']);
  assert.deepEqual(ids(sortTasks(rows, 'PROJECT', [{ id: 'p1', order: 0 }, { id: 'p2', order: 1 }])), ['mid', 'old', 'new'], 'Project order, 프로젝트 없음 last');
  assert.deepEqual(ids(sortTasks(rows, 'PRIORITY')), ['new', 'mid', 'old']);
  assert.equal(normalizeSort('DUE_DATE'), 'DEADLINE'); assert.equal(normalizeSort('DEFAULT'), 'UPDATED'); assert.equal(normalizeSort('ORDER'), 'PROJECT'); assert.equal(normalizeSort(undefined), 'UPDATED');
});

test('archive is distinct from DONE; display preferences use plan days and deadline, not the legacy range', () => {
  const archivedDone = task('x', { status: 'DONE', archivedAt: '2026-09-20T00:00:00Z' }), done = task('y', { status: 'DONE' });
  assert.equal(inArchiveScope(archivedDone, false), false); assert.equal(inArchiveScope(done, false), true);
  assert.equal(inArchiveScope(archivedDone, true), true); assert.equal(inArchiveScope(done, true), false, 'DONE is not archived');
  const prefs = { showCompleted: true, showUndated: false };
  assert.equal(passesDisplayPreferences(task('legacy', { startDate: '2026-09-01', dueDate: '2026-09-02' }), prefs, new Set()), false, 'legacy range does not count as dated');
  assert.equal(passesDisplayPreferences(task('dl', { deadlineDate: '2026-09-30' }), prefs, new Set()), true);
  assert.equal(passesDisplayPreferences(task('wk'), prefs, context.plannedTaskIds), true);
  assert.equal(passesDisplayPreferences(done, { showCompleted: false, showUndated: true }, new Set()), false);
});
