import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Project, ProjectGroup } from '../api/workflow';
import { catalogOrder, catalogSections, moveInCatalog, nextUngroupedOrder } from './catalog';

const project = (id: string, order: number, groupId: string | null = null, archived = false): Project =>
  ({ id, title: id, status: 'ACTIVE', startDate: null, endDate: null, color: '#123456', memo: null, order, groupId, archivedAt: archived ? '2026-09-01T00:00:00Z' : null, revision: 0 });
const group = (id: string, order: number): ProjectGroup => ({ id, name: id, order, revision: 0 });
const titles = (projects: Project[], groups: ProjectGroup[]) => catalogSections(projects, groups).map(s => `${s.group?.id ?? '-'}:${s.projects.map(p => p.id).join(',')}`).join(' | ');

test('sections: groups by order, 그룹 없음 last, projects by order; unknown groups fall back to 그룹 없음', () => {
  const groups = [group('life', 1), group('work', 0)];
  const projects = [project('a', 1, 'work'), project('b', 0, 'work'), project('c', 0), project('d', 0, 'deleted-group')];
  assert.equal(titles(projects, groups), 'work:b,a | life: | -:c,d');
  assert.deepEqual(catalogOrder(projects, groups), ['b', 'a', 'c', 'd']);
});

test('move within, across, into and out of groups mirrors the server rule', () => {
  const groups = [group('work', 0)];
  let projects = [project('a', 0), project('b', 1), project('c', 2)];
  projects = moveInCatalog(projects, groups, 'b', 'work', null);
  projects = moveInCatalog(projects, groups, 'c', 'work', 'b');
  assert.equal(titles(projects, groups), 'work:c,b | -:a');
  projects = moveInCatalog(projects, groups, 'b', 'work', 'c');
  assert.equal(titles(projects, groups), 'work:b,c | -:a');
  projects = moveInCatalog(projects, groups, 'c', null, 'a');
  assert.equal(titles(projects, groups), 'work:b | -:c,a');
  const orders = projects.filter(p => !p.groupId).map(p => p.order);
  assert.equal(new Set(orders).size, orders.length);
});

test('hidden (archived) Projects keep their slot; invalid targets change nothing', () => {
  const groups = [group('work', 0)];
  const projects = [project('a', 0, 'work'), project('b', 1, 'work', true), project('c', 2, 'work')];
  const moved = moveInCatalog(projects, groups, 'c', 'work', 'a');
  assert.equal(titles(moved, groups), 'work:c,a,b | -:');
  assert.equal(moveInCatalog(projects, groups, 'c', 'work', 'missing'), projects);
  assert.equal(moveInCatalog(projects, groups, 'c', 'work', 'c'), projects);
  assert.equal(nextUngroupedOrder([project('x', 4), project('y', 9, 'work')], groups), 5);
});
