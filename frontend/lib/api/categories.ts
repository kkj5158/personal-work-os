import { apiClient } from "./client";
import type { ActivityCategory, ActivityCategoryInput } from "./types";

export function listCategories(): Promise<ActivityCategory[]> {
  return apiClient.get<ActivityCategory[]>("/api/activity-categories");
}

export function createCategory(input: ActivityCategoryInput): Promise<ActivityCategory> {
  return apiClient.post<ActivityCategory>("/api/activity-categories", input);
}
