import type { TodoPreferences, WorkTask } from "@/lib/api/workflow";

export const defaultTodoPreferences: TodoPreferences = {
  groupMode: "PROJECT", projectOrder: [], sort: "DEFAULT", showCompleted: true,
  showUndated: true, rememberCollapse: true, collapsedProjects: [],
};

export function progress(tasks: Pick<WorkTask, "status">[]) {
  const done = tasks.filter(task => task.status === "DONE").length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

const statusOrder = { DOING: 0, TODO: 1, DONE: 2 };
const priorityOrder = { HIGH: 0, NORMAL: 1, LOW: 2 };
const dateOrder = (a: string | null, b: string | null) => (a || "9999").localeCompare(b || "9999");
export function visibleTasks(tasks: WorkTask[], preferences: TodoPreferences) {
  return tasks.filter(task => (preferences.showCompleted || task.status !== "DONE") &&
    (preferences.showUndated || !!(task.startDate || task.dueDate))).sort((a, b) => {
    let result = 0;
    switch (preferences.sort) {
      case "DUE_DATE": result = dateOrder(a.dueDate, b.dueDate); break;
      case "START_DATE": result = dateOrder(a.startDate, b.startDate); break;
      case "STATUS": result = statusOrder[a.status] - statusOrder[b.status]; break;
      case "PRIORITY": result = priorityOrder[a.priority] - priorityOrder[b.priority]; break;
      case "ORDER": break;
      default: result = statusOrder[a.status] - statusOrder[b.status] || dateOrder(a.dueDate, b.dueDate) || priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return result || a.order - b.order || a.id.localeCompare(b.id);
  });
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
