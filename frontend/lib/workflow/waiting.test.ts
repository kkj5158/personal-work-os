import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkTask } from '../api/workflow';
import { NO_PROJECT, agentOf, agentValue, completedWaiting, createPrefill, daysBetween, defaultCheckDate, emptyWaitingFilters, extendChoices, isReadyToCheck, matchesCheckWhen, matchesWaitingFilters,
  resumeStatus, searchProjectSections, toggleProject, toggleProjectGroup, waitingProjection, waitingSnapshot, waitingStats } from './waiting';
import { projectGroupSections } from './catalog';
import type { Project, ProjectGroup } from '../api/workflow';

const task = (id: string, patch: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: 'WAITING', projectId: null, phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0, waitingFlagged: false, waitingCheckDate: null, ...patch });
const today = '2026-09-27';

test('103 §4 date projection: check date <= today → 확인할 때가 된 일; future or no date → 대기 중 (a flag alone does not promote)', () => {
  assert.equal(isReadyToCheck(task('due', { waitingCheckDate: today }), today), true, 'check date today');
  assert.equal(isReadyToCheck(task('overdue', { waitingCheckDate: '2026-09-20' }), today), true);
  assert.equal(isReadyToCheck(task('future', { waitingCheckDate: '2026-09-28' }), today), false, 'future check date');
  assert.equal(isReadyToCheck(task('none'), today), false, 'no date');
  assert.equal(isReadyToCheck(task('flag', { waitingFlagged: true }), today), false, 'legacy flag without a date stays in 대기 중');
  assert.equal(isReadyToCheck(task('todo', { status: 'TODO', waitingCheckDate: today }), today), false, 'only WAITING Tasks');
});

test('projection holds only active WAITING Tasks, one status, two views, ordered by check date', () => {
  const tasks = [task('future', { waitingCheckDate: '2026-10-02' }), task('nodate'), task('flag', { waitingFlagged: true, waitingCheckDate: '2026-12-01' }), task('due', { waitingCheckDate: '2026-09-26' }),
    task('archived', { waitingCheckDate: today, archivedAt: '2026-09-01T00:00:00Z' }), task('doing', { status: 'DOING' }), task('done', { status: 'DONE' })];
  const view = waitingProjection(tasks, today);
  assert.deepEqual(view.ready.map(item => item.id), ['due']);
  assert.deepEqual(view.waiting.map(item => item.id), ['future', 'flag', 'nodate']);
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

const project = (id: string, groupId: string | null, order: number, patch: Partial<Project> = {}): Project =>
  ({ id, title: id, status: 'ACTIVE', startDate: null, endDate: null, color: '#000', memo: null, order, groupId, archivedAt: null, ...patch });
const groups: ProjectGroup[] = [{ id: 'pos', name: 'POS', order: 1, revision: 0 }, { id: 'out', name: '아웃라이어', order: 0, revision: 0 }];
const projects = [project('Money SYS', 'pos', 1), project('폴리싱', 'pos', 0), project('Outlier-ELO', 'out', 0), project('Orbit', null, 0)];
const sections = projectGroupSections(projects, groups);

test('담당 Agent: one value per item, 미지정 = null; unknown values read as 미지정', () => {
  assert.equal(agentOf(task('a', { waitingAgent: 'CLAUDE_CODE' })), 'CLAUDE_CODE');
  assert.equal(agentOf(task('b')), 'UNASSIGNED'); assert.equal(agentOf(task('c', { waitingAgent: null })), 'UNASSIGNED');
  assert.equal(agentOf(task('d', { waitingAgent: 'SOMEONE' as never })), 'UNASSIGNED');
  assert.equal(agentValue('UNASSIGNED'), null); assert.equal(agentValue('DIRECT'), 'DIRECT');
});

test('filters are Project AND 확인 시점 AND Agent (OR inside each); 전체 = empty selection', () => {
  const item = task('리뷰 대기', { projectId: 'Money SYS', waitingAgent: 'CODEX', waitingCheckDate: today, waitingReason: 'PR 머지' });
  const match = (patch: Partial<ReturnType<typeof emptyWaitingFilters>>) => matchesWaitingFilters(item, { ...emptyWaitingFilters(), ...patch }, today, 'Money SYS');
  assert.equal(match({}), true, '전체');
  assert.equal(match({ projects: ['Money SYS', 'Orbit'], when: ['TODAY', 'NONE'], agents: ['CODEX', 'CHATGPT'] }), true, 'all three match');
  assert.equal(match({ projects: ['Orbit'], when: ['TODAY'], agents: ['CODEX'] }), false, 'project fails');
  assert.equal(match({ projects: ['Money SYS'], when: ['TOMORROW'], agents: ['CODEX'] }), false, 'timing fails');
  assert.equal(match({ projects: ['Money SYS'], when: ['TODAY'], agents: ['UNASSIGNED'] }), false, 'agent fails');
  assert.equal(matchesWaitingFilters(task('none'), { ...emptyWaitingFilters(), projects: [NO_PROJECT], agents: ['UNASSIGNED'] }, today, ''), true, '프로젝트 없음 + 미지정');
  assert.equal(match({ search: 'pr 머지' }), true, 'search is case-insensitive over title / reason / next action / project'); assert.equal(match({ search: 'money' }), true); assert.equal(match({ search: 'zzz' }), false);
});

test('project filter: multi-select, group toggle, and live search that keeps every group row', () => {
  assert.deepEqual(toggleProject(toggleProject([], 'a'), 'b'), ['a', 'b']); assert.deepEqual(toggleProject(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleProjectGroup(['x'], ['a', 'b']), ['x', 'a', 'b']); assert.deepEqual(toggleProjectGroup(['x', 'a', 'b'], ['a', 'b']), ['x'], 'a fully selected group clears');
  assert.deepEqual(toggleProjectGroup(['a'], ['a', 'b']), ['a', 'b'], 'partial → whole group'); assert.deepEqual(toggleProjectGroup(['x'], []), ['x']);
  assert.deepEqual(sections.map(section => `${section.name}:${section.projects.map(item => item.id).join(',')}`), ['아웃라이어:Outlier-ELO', 'POS:폴리싱,Money SYS', '그룹 없음:Orbit'], 'Projects order, not alphabetical');
  const found = searchProjectSections(sections, 'MONEY');
  assert.deepEqual(found.map(section => `${section.name}:${section.projects.map(item => item.id).join(',')}`), ['아웃라이어:', 'POS:Money SYS', '그룹 없음:'], 'case-insensitive; groups without a match stay');
  assert.deepEqual(searchProjectSections(sections, '폴리').map(section => section.projects.length), [0, 1, 0], 'Korean substring');
  assert.equal(searchProjectSections(sections, '  '), sections, 'blank query = everything');
});

test('inline-create prefill follows a single Project or a single group; otherwise nothing', () => {
  assert.deepEqual(createPrefill(['Money SYS'], sections), { group: 'pos', projectId: 'Money SYS' });
  assert.deepEqual(createPrefill(['Money SYS', '폴리싱'], sections), { group: 'pos', projectId: '' }, 'one group, several Projects');
  assert.deepEqual(createPrefill(['Orbit'], sections), { group: 'none', projectId: 'Orbit' }, '그룹 없음 is a selectable group');
  assert.deepEqual(createPrefill([], sections), { group: '', projectId: '' }); assert.deepEqual(createPrefill(['Money SYS', 'Outlier-ELO'], sections), { group: '', projectId: '' });
  assert.deepEqual(createPrefill([NO_PROJECT], sections), { group: '', projectId: '' }); assert.deepEqual(createPrefill(['Money SYS', NO_PROJECT], sections), { group: '', projectId: '' });
});

test('completed history, resume status, Undo snapshot and active-only statistics', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const done = task('done', { status: 'DONE', waitingCompletedAt: '2026-09-26T03:00:00Z', waitingSince: '2026-09-23T03:00:00Z', waitingAgent: 'CHATGPT' });
  const older = task('older', { status: 'DONE', waitingCompletedAt: '2026-09-20T03:00:00Z' });
  const plain = task('plain', { status: 'DONE' }), archived = task('gone', { status: 'DONE', waitingCompletedAt: '2026-09-25T00:00:00Z', archivedAt: '2026-09-26T00:00:00Z' });
  assert.deepEqual(completedWaiting([older, plain, done, archived]).map(item => item.id), ['done', 'older'], 'only Waiting completions, newest first');
  assert.equal(daysBetween(done.waitingSince, done.waitingCompletedAt!), 3); assert.equal(daysBetween(null, now), null); assert.equal(daysBetween('2026-09-28T00:00:00Z', now), 0, 'never negative');
  assert.equal(resumeStatus({ previousStatus: 'DOING' }), 'DOING'); assert.equal(resumeStatus({ previousStatus: 'TODO' }), 'TODO'); assert.equal(resumeStatus({ previousStatus: null }), 'TODO'); assert.equal(resumeStatus({ previousStatus: 'DONE' }), 'TODO');
  const waiting = task('w', { waitingReason: 'r', waitingNextAction: 'n', waitingCheckDate: today, waitingAgent: 'CODEX', waitingSince: '2026-09-17T12:00:00Z' });
  assert.deepEqual(waitingSnapshot(waiting), { status: 'WAITING', waitingReason: 'r', waitingNextAction: 'n', waitingCheckDate: today, waitingFlagged: false, waitingAgent: 'CODEX', waitingSince: '2026-09-17T12:00:00Z' });
  const nodate = task('n', { waitingSince: '2026-09-25T12:00:00Z' }), unknown = task('u');
  const stats = waitingStats([waiting], [nodate, unknown], now);
  assert.deepEqual([stats.total, stats.ready, stats.waiting, stats.noDate], [3, 1, 2, 2]);
  assert.equal(stats.averageDays, 6); assert.equal(stats.longestDays, 10); assert.equal(stats.agents.CODEX, 1); assert.equal(stats.agents.UNASSIGNED, 2);
  assert.deepEqual([waitingStats([], [], now).averageDays, waitingStats([], [], now).longestDays], [null, null]);
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
