import type { Phase, Project, WorkTask } from '../api/workflow';

/** One progress group: a real Phase, or the 미분류 projection (id null — never a Phase entity). */
export type ProgressGroup = { id: string | null; title: string; total: number; done: number; auto: number; override: number | null; value: number; weight: number | null };
export type ProjectProgress = {
  groups: ProgressGroup[]; basis: 'weighted' | 'unconfirmed' | 'count'; percent: number; done: number; total: number;
  totalWeight: number; suggested: Map<string | null, number>;
};

const activeOf = (tasks: WorkTask[], projectId: string) => tasks.filter(task => task.projectId === projectId && !task.archivedAt);
const ratio = (done: number, total: number) => total ? Math.round(done / total * 100) : 0;

/** Task-count proportional suggestion (largest remainder, sums to exactly 100). */
function suggest(groups: ProgressGroup[]): Map<string | null, number> {
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const raw = groups.map(group => ({ id: group.id, value: total ? group.total / total * 100 : 100 / groups.length }));
  const floors = raw.map(item => ({ ...item, floor: Math.floor(item.value) }));
  let rest = 100 - floors.reduce((sum, item) => sum + item.floor, 0);
  for (const item of [...floors].sort((a, b) => (b.value - b.floor) - (a.value - a.floor))) { if (rest <= 0) break; item.floor++; rest--; }
  return new Map(floors.map(item => [item.id, item.floor]));
}

/**
 * Locked V1 progress model. Phase progress = manual override, otherwise completed active Tasks / active Tasks.
 * Project progress = Σ(Phase progress × weight) only when every participating group has a weight and the weights
 * total 100%; 미분류 participates (with the Project's unassigned weight) whenever it holds Tasks. Otherwise the
 * weighting is "가중치 미확정" and the percentage falls back to the plain Task count — never a fabricated weight.
 */
export function projectProgress(project: Project, phases: Phase[], tasks: WorkTask[]): ProjectProgress {
  const active = activeOf(tasks, project.id);
  const projectPhases = phases.filter(phase => phase.projectId === project.id).sort((a, b) => a.order - b.order);
  const group = (id: string | null, title: string, members: WorkTask[], weight: number | null, override: number | null): ProgressGroup => {
    const done = members.filter(task => task.status === 'DONE').length, auto = ratio(done, members.length);
    return { id, title, total: members.length, done, auto, override, value: override ?? auto, weight };
  };
  const unassignedTasks = active.filter(task => !task.phaseId || !projectPhases.some(phase => phase.id === task.phaseId));
  const unassigned = group(null, '미분류 작업', unassignedTasks, project.unassignedWeight ?? null, null);
  const phaseGroups = projectPhases.map(phase => group(phase.id, phase.title, active.filter(task => task.phaseId === phase.id), phase.weight ?? null, phase.progressOverride ?? null));
  const participants = [...(unassigned.total ? [unassigned] : []), ...phaseGroups];
  const totalWeight = Math.round(participants.reduce((sum, item) => sum + Number(item.weight ?? 0), 0) * 100) / 100;
  const done = active.filter(task => task.status === 'DONE').length;
  const finalized = phaseGroups.length > 0 && participants.every(item => item.weight !== null && item.weight !== undefined) && Math.abs(totalWeight - 100) < 0.01;
  const basis = !phaseGroups.length ? 'count' : finalized ? 'weighted' : 'unconfirmed';
  const percent = basis === 'weighted' ? Math.round(participants.reduce((sum, item) => sum + item.value * Number(item.weight) / 100, 0)) : ratio(done, active.length);
  return { groups: [unassigned, ...phaseGroups], basis, percent, done, total: active.length, totalWeight, suggested: suggest(participants.length ? participants : [unassigned]) };
}
export const BASIS_LABELS = { weighted: '가중치 기준', unconfirmed: '가중치 미확정 · 작업 수 기준', count: '작업 수 기준' } as const;

/** Display order used for "manual order": 미분류 first, then Phases in order, each by Task order. */
export function orderedProjectTasks(project: Project, phases: Phase[], tasks: WorkTask[]): WorkTask[] {
  const projectPhases = phases.filter(phase => phase.projectId === project.id).sort((a, b) => a.order - b.order);
  const rank = new Map(projectPhases.map((phase, index) => [phase.id, index + 1]));
  return activeOf(tasks, project.id).sort((a, b) => (rank.get(a.phaseId ?? '') ?? 0) - (rank.get(b.phaseId ?? '') ?? 0) || a.order - b.order || a.id.localeCompare(b.id));
}

export type Resume = { task: WorkTask; source: 'pinned' | 'candidate' | 'waiting' } | null;
/**
 * Where to resume: the pinned next Task when it is still open; otherwise the first unfinished non-WAITING Task in
 * manual order (a suggestion, not a decision); otherwise the first WAITING Task so its reason stays visible.
 */
export function resumeContext(project: Project, phases: Phase[], tasks: WorkTask[]): Resume {
  const pinned = tasks.find(task => task.id === project.nextTaskId);
  if (pinned && pinned.status !== 'DONE' && !pinned.archivedAt) return { task: pinned, source: 'pinned' };
  const ordered = orderedProjectTasks(project, phases, tasks);
  const candidate = ordered.find(task => task.status === 'DOING') ?? ordered.find(task => task.status === 'TODO');
  if (candidate) return { task: candidate, source: 'candidate' };
  const waiting = ordered.find(task => task.status === 'WAITING');
  return waiting ? { task: waiting, source: 'waiting' } : null;
}
