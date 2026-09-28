import type { Priority, Project, TaskStatus, TodoPreferences, WorkTask } from '../api/workflow';

/**
 * All To-dos (S07) explorer logic. The explorer never mutates Task data or canonical order: filters and sorts are
 * presentation only. Filters are always-visible button groups — several active values inside one group are OR,
 * different groups are AND, and an empty group means "전체" (no constraint).
 */
export const UNASSIGNED = 'unassigned';
export type WeekScope = 'THIS_WEEK' | 'UNPLANNED';
export type ExplorerFilters = { projects: string[]; statuses: TaskStatus[]; priorities: Priority[]; week: WeekScope[] };
export type FilterGroup = keyof ExplorerFilters;
export const emptyFilters = (): ExplorerFilters => ({ projects: [], statuses: [], priorities: [], week: [] });

/** Task statuses only: 보류 is a Project status and archive is its own filter, so neither appears here. */
export const FILTER_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'WAITING', 'DONE'];
export const FILTER_PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH'];
export const WEEK_SCOPE_LABELS: Record<WeekScope, string> = { THIS_WEEK: '이번 주', UNPLANNED: '미배치' };

export function toggleFilter<G extends FilterGroup>(filters: ExplorerFilters, group: G, value: ExplorerFilters[G][number]): ExplorerFilters {
  const current = filters[group] as string[];
  const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  return { ...filters, [group]: next };
}
/** A group's "전체" clears only that group. */
export const resetGroup = (filters: ExplorerFilters, group: FilterGroup): ExplorerFilters => ({ ...filters, [group]: [] });
export const isFiltered = (filters: ExplorerFilters) => Object.values(filters).some(values => values.length > 0);

export type ExplorerContext = {
  /** Tasks in the current week set (explicit selection ∪ a plan day inside the week). */
  weekTaskIds: ReadonlySet<string>;
  /** Tasks that have at least one plan day anywhere. "미배치" = no plan day and not in this week. */
  plannedTaskIds: ReadonlySet<string>;
};

export function matchesFilters(task: WorkTask, filters: ExplorerFilters, context: ExplorerContext): boolean {
  const any = <T,>(values: T[], test: (value: T) => boolean) => !values.length || values.some(test);
  return any(filters.projects, id => (task.projectId ?? UNASSIGNED) === id)
    && any(filters.statuses, status => task.status === status)
    && any(filters.priorities, priority => task.priority === priority)
    && any(filters.week, scope => scope === 'THIS_WEEK'
      ? context.weekTaskIds.has(task.id)
      : !context.weekTaskIds.has(task.id) && !context.plannedTaskIds.has(task.id));
}

export function matchesSearch(task: WorkTask, query: string, projectTitle: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${task.title} ${task.memo ?? ''} ${task.waitingReason ?? ''} ${task.waitingNextAction ?? ''} ${projectTitle}`.toLocaleLowerCase().includes(needle);
}

/**
 * Explorer sorts. Stored preferences written by earlier versions may still hold the legacy keys; they are read
 * through normalizeSort. "마감" always means the V1 semantic deadline (deadlineDate) — the legacy
 * work_tasks.start_date / due_date range is never reinterpreted as a deadline.
 */
export type ExplorerSort = 'UPDATED' | 'PROJECT' | 'DEADLINE' | 'PRIORITY';
export const EXPLORER_SORT_LABELS: Record<ExplorerSort, string> = { UPDATED: '최근 업데이트', PROJECT: '프로젝트 순서', DEADLINE: '마감 가까운 순', PRIORITY: '우선순위' };
export function normalizeSort(sort: TodoPreferences['sort'] | undefined): ExplorerSort {
  switch (sort) {
    case 'PROJECT': case 'ORDER': case 'START_DATE': return 'PROJECT';
    case 'DEADLINE': case 'DUE_DATE': return 'DEADLINE';
    case 'PRIORITY': return 'PRIORITY';
    default: return 'UPDATED';
  }
}

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };
const lastIfEmpty = (value: string | null | undefined) => value || '￿';
/** Returns a sorted copy; the input (and so canonical Task order) is never touched. */
export function sortTasks(tasks: WorkTask[], sort: ExplorerSort, projects: Pick<Project, 'id' | 'order'>[] = []): WorkTask[] {
  const projectRank = new Map(projects.map(project => [project.id, project.order]));
  const projectOf = (task: WorkTask) => task.projectId ? projectRank.get(task.projectId) ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER;
  const canonical = (a: WorkTask, b: WorkTask) => a.order - b.order || a.id.localeCompare(b.id);
  const compare: Record<ExplorerSort, (a: WorkTask, b: WorkTask) => number> = {
    UPDATED: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    PROJECT: (a, b) => projectOf(a) - projectOf(b),
    DEADLINE: (a, b) => lastIfEmpty(a.deadlineDate).localeCompare(lastIfEmpty(b.deadlineDate)),
    PRIORITY: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  };
  return [...tasks].sort((a, b) => compare[sort](a, b) || canonical(a, b));
}

/**
 * Archive is distinct from DONE. The normal explorer shows active Tasks only; the 보관됨 view shows archived
 * Tasks only, where they can be searched and restored with their canonical identity and history.
 */
export const inArchiveScope = (task: WorkTask, showArchived: boolean) => showArchived ? !!task.archivedAt : !task.archivedAt;

/** "숨긴 완료" preference and the "undated" preference use plan days and the semantic deadline, never the legacy range. */
export function passesDisplayPreferences(task: WorkTask, preferences: Pick<TodoPreferences, 'showCompleted' | 'showUndated'>, plannedTaskIds: ReadonlySet<string>) {
  if (!preferences.showCompleted && task.status === 'DONE') return false;
  if (!preferences.showUndated && !plannedTaskIds.has(task.id) && !task.deadlineDate) return false;
  return true;
}
