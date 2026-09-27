import type { PlanDay, Project, Phase, WorkTask, WorkflowData } from '../api/workflow';
import { ApiError } from '../api/client';

/**
 * Pure helpers behind the WORK FLOW store. The store keeps the last server-confirmed data and a list of
 * optimistic overlays (pending field edits). What screens render is always confirmed + overlays, so a
 * remote refresh never discards an unsaved local edit and a failed edit rolls back by removing its overlay.
 */
export type EntityKind = 'projects' | 'phases' | 'tasks';
export type Entity = Project | Phase | WorkTask;
export type Overlay = { token: number; kind: EntityKind; id: string; patch: Record<string, unknown> };
export type StoreData = { projects: Project[]; phases: Phase[]; tasks: WorkTask[]; planDays: PlanDay[] };

export const emptyData = (): StoreData => ({ projects: [], phases: [], tasks: [], planDays: [] });
export function normalize(data: WorkflowData): StoreData {
  return { projects: data.projects ?? [], phases: data.phases ?? [], tasks: data.tasks ?? [], planDays: data.planDays ?? [] };
}

export function applyOverlays(confirmed: StoreData, overlays: Overlay[]): StoreData {
  if (!overlays.length) return confirmed;
  const next: StoreData = { ...confirmed };
  for (const overlay of overlays) {
    const list = next[overlay.kind] as Entity[];
    next[overlay.kind] = list.map(item => item.id === overlay.id ? { ...item, ...overlay.patch } : item) as never;
  }
  return next;
}

export function replaceEntity<K extends EntityKind>(data: StoreData, kind: K, entity: StoreData[K][number]): StoreData {
  const list = data[kind] as Entity[];
  const exists = list.some(item => item.id === entity.id);
  return { ...data, [kind]: exists ? list.map(item => item.id === entity.id ? entity : item) : [...list, entity] };
}
export function removeEntity(data: StoreData, kind: EntityKind, id: string): StoreData {
  const next = { ...data, [kind]: (data[kind] as Entity[]).filter(item => item.id !== id) } as StoreData;
  return kind === 'tasks' ? { ...next, planDays: next.planDays.filter(day => day.taskId !== id) } : next;
}
export function setTaskPlanDays(data: StoreData, taskId: string, planDays: PlanDay[]): StoreData {
  return { ...data, planDays: [...data.planDays.filter(day => day.taskId !== taskId), ...planDays].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order) };
}
export function planDatesOf(data: Pick<StoreData, 'planDays'>, taskId: string): string[] {
  return data.planDays.filter(day => day.taskId === taskId).map(day => day.date).sort();
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/**
 * Three-way check after a 409: the edit may be retried on the latest revision only when another window did
 * not change any of the edited fields (latest still equals the base this edit started from).
 */
export function canRebase(base: Record<string, unknown>, latest: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return Object.keys(patch).every(key => same(base[key], latest[key]));
}

export class WorkflowConflictError extends Error {
  constructor(message = '다른 창에서 먼저 변경되었습니다. 입력한 내용은 유지되어 있습니다.', readonly latest?: Entity) { super(message); this.name = 'WorkflowConflictError'; }
}
export const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

/** Monday (ISO week start) of a YYYY-MM-DD date key, computed in UTC so it is independent of the browser zone. */
export function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
export function addDaysKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
