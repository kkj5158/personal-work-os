import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { ALL_CONTEXT, NO_PROJECT_CONTEXT, contextProjectId, defaultCheckDate, extendChoices, inWaitingContext, isReadyToCheck, matchesCheckWhen, waitingContextProjects, waitingProjection } from './waiting';

const task = (id: string, patch: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: 'WAITING', projectId: null, phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, waitingFlagged: false, waitingCheckDate: null, ...patch });
const today = '2026-09-27';

test('ready to check = WAITING and (flagged or check date <= today in Seoul); otherwise waiting', () => {
  assert.equal(isReadyToCheck(task('flag', { waitingFlagged: true }), today), true, 'flagged WAITING');
  assert.equal(isReadyToCheck(task('due', { waitingCheckDate: today }), today), true, 'check date today');
  assert.equal(isReadyToCheck(task('overdue', { waitingCheckDate: '2026-09-20' }), today), true);
  assert.equal(isReadyToCheck(task('future', { waitingCheckDate: '2026-09-28' }), today), false, 'future check date');
  assert.equal(isReadyToCheck(task('none'), today), false, 'no date, not flagged');
  assert.equal(isReadyToCheck(task('todo', { status: 'TODO', waitingFlagged: true }), today), false, 'only WAITING Tasks');
});

test('projection holds only active WAITING Tasks, one status, two views, ordered by check date', () => {
  const tasks = [task('future', { waitingCheckDate: '2026-10-02' }), task('nodate'), task('flag', { waitingFlagged: true, waitingCheckDate: '2026-12-01' }), task('due', { waitingCheckDate: '2026-09-26' }),
    task('archived', { waitingFlagged: true, archivedAt: '2026-09-01T00:00:00Z' }), task('doing', { status: 'DOING' }), task('done', { status: 'DONE' })];
  const view = waitingProjection(tasks, today);
  assert.deepEqual(view.ready.map(item => item.id), ['due', 'flag']);
  assert.deepEqual(view.waiting.map(item => item.id), ['future', 'nodate']);
  assert.ok([...view.ready, ...view.waiting].every(item => item.status === 'WAITING'), 'no separate "확인 필요" status');
});

test('check-time filter, extend choices and create defaults', () => {
  const when = (date: string | null, values: Parameters<typeof matchesCheckWhen>[1]) => matchesCheckWhen({ waitingCheckDate: date }, values, today);
  assert.equal(when('2026-09-25', ['TODAY']), true, 'overdue counts as due today');
  assert.equal(when('2026-09-28', ['TOMORROW']), true);
  assert.equal(when('2026-09-22', ['THIS_WEEK']), true); assert.equal(when('2026-09-28', ['THIS_WEEK']), false, 'Sep 27 2026 is a Sunday: the week ends today');
  assert.equal(when('2026-09-30', ['NEXT_WEEK']), true);
  assert.equal(when(null, ['NONE']), true); assert.equal(when(null, ['TODAY', 'NEXT_WEEK']), false);
  assert.equal(when('2026-12-01', []), true, 'no filter = 전체');
  assert.deepEqual(extendChoices(today).map(choice => [choice.key, choice.date]), [['today', today], ['tomorrow', '2026-09-28'], ['nextWeek', '2026-09-28'], ['none', null]]);
  assert.equal(defaultCheckDate('ready', today), today); assert.equal(defaultCheckDate('waiting', today), '');
});

test('Waiting context: 전체 aggregates, 프로젝트 없음 = no Project, a Project context owns its items and decides new projectId', () => {
  const p1 = task('p1-item', { projectId: 'p1' }), none = task('none-item');
  assert.equal(inWaitingContext(p1, ALL_CONTEXT), true); assert.equal(inWaitingContext(none, ALL_CONTEXT), true);
  assert.equal(inWaitingContext(p1, 'p1'), true); assert.equal(inWaitingContext(none, 'p1'), false);
  assert.equal(inWaitingContext(none, NO_PROJECT_CONTEXT), true); assert.equal(inWaitingContext(p1, NO_PROJECT_CONTEXT), false);
  assert.equal(contextProjectId(ALL_CONTEXT), undefined, '전체 has no creation Project');
  assert.equal(contextProjectId(NO_PROJECT_CONTEXT), null); assert.equal(contextProjectId('p1'), 'p1');
});

test('context chips prioritise active Projects; inactive and archived-with-items go to 더보기; the selection stays visible', () => {
  const p = (id: string, status: 'READY' | 'ACTIVE' | 'PAUSED' | 'DONE', archivedAt: string | null = null) => ({ id, status, archivedAt });
  const ordered = [p('a1', 'ACTIVE'), p('done', 'DONE'), p('a2', 'READY'), p('a3', 'ACTIVE'), p('old', 'ACTIVE', '2026-01-01'), p('old-empty', 'DONE', '2026-01-01'), p('paused', 'PAUSED')];
  const nav = waitingContextProjects(ordered, new Set(['old']), ALL_CONTEXT, 2);
  assert.deepEqual(nav.chips.map(item => item.id), ['a1', 'a2'], 'active, catalog order, limited');
  assert.deepEqual(nav.more.active.map(item => item.id), ['a3']);
  assert.deepEqual(nav.more.inactive.map(item => item.id), ['done', 'paused']);
  assert.deepEqual(nav.more.archived.map(item => item.id), ['old'], 'archived only while it still owns Waiting items');
  assert.equal(nav.known('old-empty'), false);
  const picked = waitingContextProjects(ordered, new Set(['old']), 'paused', 2);
  assert.deepEqual(picked.chips.map(item => item.id), ['a1', 'a2', 'paused'], 'a selected 더보기 Project is shown as a chip');
  assert.deepEqual(picked.more.inactive.map(item => item.id), ['done']);
});
