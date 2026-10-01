import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { ALL_CONTEXT, NO_PROJECT_CONTEXT, contextProjectId, defaultCheckDate, extendChoices, inWaitingContext, isReadyToCheck, matchesCheckWhen, waitingContextSections, waitingProjection } from './waiting';
import type { Project, ProjectGroup } from '../api/workflow';

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

test('context sections follow the Projects page groups; active Projects are primary; inactive and archived-with-items go to 더보기', () => {
  const p = (id: string, status: Project['status'], groupId: string | null, order: number, archivedAt: string | null = null): Project =>
    ({ id, title: id, status, startDate: null, endDate: null, color: '#000', memo: null, order, groupId, archivedAt });
  const groups: ProjectGroup[] = [{ id: 'pos', name: 'POS', order: 1, revision: 0 }, { id: 'out', name: '아웃라이어', order: 0, revision: 0 }];
  const projects = [p('money', 'ACTIVE', 'pos', 1), p('polish', 'READY', 'pos', 0), p('elo', 'ACTIVE', 'out', 0), p('done', 'DONE', 'pos', 2),
    p('old', 'ACTIVE', 'out', 1, '2026-01-01'), p('old-empty', 'DONE', 'out', 2, '2026-01-01'), p('paused', 'PAUSED', null, 0)];
  const shape = (sections: { name: string; projects: Project[] }[]) => sections.map(s => `${s.name}:${s.projects.map(x => x.id).join(',')}`);
  const nav = waitingContextSections(projects, groups, new Set(['old']), ALL_CONTEXT);
  assert.deepEqual(shape(nav.primary), ['아웃라이어:elo', 'POS:polish,money'], 'group order → Project order, active only');
  assert.deepEqual(shape(nav.more), ['아웃라이어:old', 'POS:done', '그룹 없음:paused'], 'archived only while it owns WAITING items');
  assert.equal(nav.known('old-empty'), false); assert.equal(nav.known('done'), true);
  const picked = waitingContextSections(projects, groups, new Set(['old']), 'done');
  assert.deepEqual(shape(picked.primary), ['아웃라이어:elo', 'POS:polish,money,done'], 'a selected 더보기 Project shows in its own group');
  assert.deepEqual(shape(picked.more), ['아웃라이어:old', '그룹 없음:paused']);
});

test('직접 지정 matches exactly one date key (past, today, future) and ORs with the other values', () => {
  const at = (date: string | null) => task('t', { waitingCheckDate: date });
  for (const date of ['2026-09-20', today, '2026-10-03']) {
    assert.equal(matchesCheckWhen(at(date), ['CUSTOM'], today, date), true, date);
    assert.equal(matchesCheckWhen(at('2026-09-26'), ['CUSTOM'], today, date), date === '2026-09-26');
  }
  assert.equal(matchesCheckWhen(at(null), ['CUSTOM'], today, '2026-10-03'), false);
  assert.equal(matchesCheckWhen(at('2026-10-03'), ['CUSTOM'], today, null), false, 'no chosen date matches nothing');
  assert.equal(matchesCheckWhen(at(null), ['CUSTOM', 'NONE'], today, '2026-10-03'), true, 'OR with 날짜 없음');
});
