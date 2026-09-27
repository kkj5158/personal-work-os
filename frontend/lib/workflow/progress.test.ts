import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Phase, Project, WorkTask } from '../api/workflow';
import { projectProgress, resumeContext } from './progress';

const project = (extra: Partial<Project> = {}): Project => ({ id: 'p', title: 'P', status: 'ACTIVE', startDate: null, endDate: null, color: '#0969da', memo: null, order: 0, ...extra });
const phase = (id: string, order: number, extra: Partial<Phase> = {}): Phase => ({ id, projectId: 'p', title: id, status: 'TODO', startDate: null, endDate: null, memo: null, order, ...extra });
const task = (id: string, status: WorkTask['status'], phaseId: string | null, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status, projectId: 'p', phaseId, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, ...extra });

test('weighted progress uses Σ(Phase progress × weight) only when weights are finalized', () => {
  const phases = [phase('a', 0, { weight: 40 }), phase('b', 1, { weight: 60 })];
  const tasks = [task('1', 'DONE', 'a'), task('2', 'TODO', 'a'), task('3', 'DONE', 'b'), task('4', 'DONE', 'b'), task('x', 'DONE', 'a', { archivedAt: '2026-01-01' })];
  const value = projectProgress(project(), phases, tasks);
  assert.equal(value.basis, 'weighted');
  assert.equal(value.percent, Math.round(50 * 0.4 + 100 * 0.6), 'archived Tasks are not active');
  assert.equal(value.total, 4);
});

test('progress override replaces the automatic Phase ratio', () => {
  const value = projectProgress(project(), [phase('a', 0, { weight: 50, progressOverride: 90 }), phase('b', 1, { weight: 50 })], [task('1', 'TODO', 'a'), task('2', 'DONE', 'b')]);
  assert.equal(value.groups.find(g => g.id === 'a')!.auto, 0); assert.equal(value.groups.find(g => g.id === 'a')!.value, 90);
  assert.equal(value.percent, 95);
});

test('incomplete weights are "가중치 미확정" and fall back to the Task count, never a fabricated weight', () => {
  const missing = projectProgress(project(), [phase('a', 0, { weight: 25 }), phase('b', 1)], [task('1', 'DONE', 'a'), task('2', 'TODO', 'b'), task('3', 'TODO', 'b')]);
  assert.equal(missing.basis, 'unconfirmed'); assert.equal(missing.percent, 33);
  const short = projectProgress(project(), [phase('a', 0, { weight: 30 }), phase('b', 1, { weight: 30 })], [task('1', 'DONE', 'a'), task('2', 'TODO', 'b')]);
  assert.equal(short.basis, 'unconfirmed'); assert.equal(short.totalWeight, 60);
  const none = projectProgress(project(), [], [task('1', 'DONE', null), task('2', 'TODO', null)]);
  assert.equal(none.basis, 'count'); assert.equal(none.percent, 50);
});

test('미분류 Tasks participate with the explicit unassigned weight and are never silently excluded', () => {
  const phases = [phase('a', 0, { weight: 80 })], tasks = [task('1', 'DONE', 'a'), task('2', 'TODO', null)];
  assert.equal(projectProgress(project(), phases, tasks).basis, 'unconfirmed', 'unassigned Tasks without a weight keep weighting unconfirmed');
  const weighted = projectProgress(project({ unassignedWeight: 20 }), phases, tasks);
  assert.equal(weighted.basis, 'weighted'); assert.equal(weighted.percent, 80);
  const suggestion = projectProgress(project(), [phase('a', 0), phase('b', 1)], [task('1', 'TODO', 'a'), task('2', 'TODO', 'b'), task('3', 'TODO', 'b'), task('4', 'TODO', null)]).suggested;
  assert.equal([...suggestion.values()].reduce((a, b) => a + b, 0), 100, 'Task-count suggestion sums to 100');
  assert.equal(suggestion.get('b'), 50);
});

test('resume: pinned next Task, else first unfinished non-WAITING candidate in manual order, else WAITING', () => {
  const phases = [phase('a', 0)];
  const tasks = [task('w', 'WAITING', null, { order: 0 }), task('t1', 'TODO', null, { order: 1 }), task('t2', 'DOING', 'a', { order: 0 })];
  assert.deepEqual(resumeContext(project({ nextTaskId: 't1' }), phases, tasks), { task: tasks[1], source: 'pinned' });
  assert.equal(resumeContext(project(), phases, tasks)!.task.id, 't2', 'in-progress work first');
  assert.equal(resumeContext(project({ nextTaskId: 'gone' }), phases, [task('d', 'DONE', null), task('w', 'WAITING', null)])!.source, 'waiting');
});
