import type { Project, ProjectGroup } from '../api/workflow';

/**
 * Projects catalog order = ProjectGroup.order, then Project.order inside the group; "그룹 없음" (groupId null,
 * or a group that no longer exists) comes last. This is independent of This Week order (work_week_projects)
 * and of Project-internal Phase/Task order. Ties keep the server's order (sort_order, created_at, id).
 */
export type CatalogSection = { group: ProjectGroup | null; projects: Project[] };

export function sortedGroups(groups: ProjectGroup[]): ProjectGroup[] {
  return groups.map((group, index) => ({ group, index })).sort((a, b) => a.group.order - b.group.order || a.index - b.index).map(item => item.group);
}
const groupOf = (project: Project, known: Set<string>) => project.groupId && known.has(project.groupId) ? project.groupId : null;

export function catalogSections(projects: Project[], groups: ProjectGroup[]): CatalogSection[] {
  const known = new Set(groups.map(group => group.id)), position = new Map(projects.map((project, index) => [project.id, index]));
  const members = (id: string | null) => projects.filter(project => groupOf(project, known) === id)
    .sort((a, b) => a.order - b.order || position.get(a.id)! - position.get(b.id)!);
  return [...sortedGroups(groups).map(group => ({ group, projects: members(group.id) })), { group: null, projects: members(null) }];
}

/** Flattened catalog order of every Project (archived included); used by All To-dos "프로젝트 순서". */
export function catalogOrder(projects: Project[], groups: ProjectGroup[]): string[] {
  return catalogSections(projects, groups).flatMap(section => section.projects.map(project => project.id));
}

/** Local mirror of POST /projects/{id}/move: insert before beforeId in the target group's full list and renumber it. */
export function moveInCatalog(projects: Project[], groups: ProjectGroup[], id: string, groupId: string | null, beforeId: string | null): Project[] {
  const known = new Set(groups.map(group => group.id)), target = groupId && known.has(groupId) ? groupId : null;
  const moving = projects.find(project => project.id === id);
  if (!moving || beforeId === id) return projects;
  const section = catalogSections(projects, groups).find(item => (item.group?.id ?? null) === target)!;
  const list = section.projects.filter(project => project.id !== id).map(project => project.id);
  const at = beforeId === null ? list.length : list.indexOf(beforeId);
  if (at < 0) return projects;
  list.splice(at, 0, id);
  const order = new Map(list.map((projectId, index) => [projectId, index]));
  return projects.map(project => order.has(project.id) ? { ...project, groupId: target, order: order.get(project.id)! } : project);
}

/** New Projects are appended to the end of 그룹 없음. */
export function nextUngroupedOrder(projects: Project[], groups: ProjectGroup[]): number {
  const known = new Set(groups.map(group => group.id));
  return Math.max(-1, ...projects.filter(project => groupOf(project, known) === null).map(project => project.order)) + 1;
}
