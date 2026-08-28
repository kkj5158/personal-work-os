import { apiClient } from "./client";
import type { ActivityCategory, ActivityCategoryInput, ActivityCategoryReorderInput } from "./types";

export function listCategories(): Promise<ActivityCategory[]> {
  return apiClient.get<ActivityCategory[]>("/api/activity-categories");
}

export function createCategory(input: ActivityCategoryInput): Promise<ActivityCategory> {
  return apiClient.post<ActivityCategory>("/api/activity-categories", input);
}

export function renameCategory(id: string, name: string): Promise<ActivityCategory> {
  return apiClient.put<ActivityCategory>(`/api/activity-categories/${id}`, { name });
}

export function setCategoryActive(id: string, isActive: boolean): Promise<ActivityCategory> {
  return apiClient.put<ActivityCategory>(`/api/activity-categories/${id}/active`, { isActive });
}

export function setDefaultCategory(id: string): Promise<ActivityCategory> {
  return apiClient.put<ActivityCategory>(`/api/activity-categories/${id}/default`, {});
}

export function deleteCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/activity-categories/${id}`);
}

export function reorderCategories(input: ActivityCategoryReorderInput): Promise<ActivityCategory[]> {
  return apiClient.put<ActivityCategory[]>("/api/activity-categories/reorder", input);
}

export function moveCategory(id: string, parentId: string): Promise<ActivityCategory> {
  return apiClient.put<ActivityCategory>(`/api/activity-categories/${id}/parent`, { parentId });
}
