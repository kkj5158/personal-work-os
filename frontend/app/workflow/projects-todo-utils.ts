import type { TodoPreferences, WorkTask } from "@/lib/api/workflow";

// Explorer filters and sorts live in lib/workflow/explorer.ts (semantic deadline only, never the legacy range).

export const defaultTodoPreferences: TodoPreferences = {
  groupMode: "PROJECT", projectOrder: [], sort: "UPDATED", showCompleted: true,
  showUndated: true, rememberCollapse: true, collapsedProjects: [],
};

export function progress(tasks: Pick<WorkTask, "status">[]) {
  const done = tasks.filter(task => task.status === "DONE").length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

export function reorderIds(ids: string[], moved: string, target: string) {
  if (moved === target || !ids.includes(moved) || !ids.includes(target)) return ids;
  const targetIndex = ids.indexOf(target);
  const result = ids.filter(id => id !== moved);
  result.splice(targetIndex, 0, moved);
  return result;
}

export function orderedGroupIds(projectIds: string[], preferred: string[]) {
  const available = [...projectIds, "unassigned"];
  return [...new Set([...preferred.filter(id => available.includes(id)), ...available])];
}

// Changes only task membership and custom order. Planning dates remain user-owned.
export function moveTask(tasks: WorkTask[], id: string, projectId: string, phaseId: string | null, beforeId?: string) {
  const source = tasks.find(task => task.id === id);
  if (!source || id === beforeId) return [];
  const group = tasks.filter(task => task.projectId === projectId && task.phaseId === phaseId).sort((a, b) => a.order - b.order);
  const index = beforeId ? group.findIndex(task => task.id === beforeId) : -1;
  const siblings = group.filter(task => task.id !== id);
  siblings.splice(index < 0 ? siblings.length : index, 0, { ...source, projectId, phaseId });
  return siblings.map((task, order) => ({ ...task, order })).filter(task => {
    const original = tasks.find(item => item.id === task.id)!;
    return task.order !== original.order || task.phaseId !== original.phaseId || task.projectId !== original.projectId;
  });
}
