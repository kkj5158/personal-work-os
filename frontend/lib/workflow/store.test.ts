import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { applyOverlays, canRebase, emptyData, mondayOf, addDaysKey, planDatesOf, removeEntity, replaceEntity, setTaskPlanDays } from './store';

const task = (id: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: 'TODO', projectId: null, phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, revision: 1, ...extra });

test('overlays render optimistic edits over confirmed data without mutating it', () => {
  const confirmed = { ...emptyData(), tasks: [task('a'), task('b')] };
  const shown = applyOverlays(confirmed, [{ token: 1, kind: 'tasks', id: 'a', patch: { title: 'draft' } }]);
  assert.equal(shown.tasks[0].title, 'draft');
  assert.equal(confirmed.tasks[0].title, 'a');
  assert.equal(shown.tasks[1], confirmed.tasks[1]);
  // Removing the overlay is the rollback: confirmed data is shown again.
  assert.equal(applyOverlays(confirmed, []).tasks[0].title, 'a');
});

test('three-way rebase only when the other window left the edited fields alone', () => {
  const base = task('a', { memo: 'old', title: 'T' });
  assert.equal(canRebase(base, { ...base, title: 'renamed elsewhere', revision: 2 }, { memo: 'mine' }), true);
  assert.equal(canRebase(base, { ...base, memo: 'changed elsewhere', revision: 2 }, { memo: 'mine' }), false);
  assert.equal(canRebase({ deadlineDate: null }, { deadlineDate: undefined }, { deadlineDate: '2026-10-01' }), true);
});

test('entity replacement, removal and plan-day relations stay normalized', () => {
  let data = { ...emptyData(), tasks: [task('a')] };
  data = replaceEntity(data, 'tasks', task('a', { title: 'saved', revision: 2 }));
  data = replaceEntity(data, 'tasks', task('b'));
  assert.deepEqual(data.tasks.map(t => [t.id, t.revision]), [['a', 2], ['b', 1]]);
  data = setTaskPlanDays(data, 'a', [{ taskId: 'a', date: '2026-10-02', order: 0 }, { taskId: 'a', date: '2026-09-30', order: 0 }]);
  data = setTaskPlanDays(data, 'b', [{ taskId: 'b', date: '2026-10-01', order: 0 }]);
  assert.deepEqual(planDatesOf(data, 'a'), ['2026-09-30', '2026-10-02']);
  data = removeEntity(data, 'tasks', 'a');
  assert.deepEqual(data.planDays.map(d => d.taskId), ['b']);
});

test('weeks start on Monday regardless of the browser time zone', () => {
  assert.equal(mondayOf('2026-09-27'), '2026-09-21'); // Sunday belongs to the week that started Monday.
  assert.equal(mondayOf('2026-09-28'), '2026-09-28');
  assert.equal(mondayOf('2026-10-03'), '2026-09-28');
  assert.equal(addDaysKey('2026-09-28', 6), '2026-10-04');
});
