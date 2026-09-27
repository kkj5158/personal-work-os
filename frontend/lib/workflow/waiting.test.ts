import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { defaultCheckDate, extendChoices, isReadyToCheck, matchesCheckWhen, waitingProjection } from './waiting';

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
