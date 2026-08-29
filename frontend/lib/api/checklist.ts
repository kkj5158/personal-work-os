import { apiClient } from "./client";
import type {
  AchievementPointDto,
  ChecklistCategoryDto,
  ChecklistDailyDto,
  ChecklistGoalDto,
  ChecklistItemCreateInput,
  ChecklistItemDto,
  ChecklistItemVersionDto,
  ChecklistItemVersionInput,
  ChecklistMatrixResponseDto,
  ChecklistPriority,
  ItemBreakdownEntryDto,
  ItemTrendPointDto,
} from "./types";

// Categories

export function listChecklistCategories(): Promise<ChecklistCategoryDto[]> {
  return apiClient.get<ChecklistCategoryDto[]>("/api/checklist-categories");
}

export function createChecklistCategory(name: string): Promise<ChecklistCategoryDto> {
  return apiClient.post<ChecklistCategoryDto>("/api/checklist-categories", { name });
}

export function renameChecklistCategory(id: string, name: string): Promise<ChecklistCategoryDto> {
  return apiClient.put<ChecklistCategoryDto>(`/api/checklist-categories/${id}`, { name });
}

export function reorderChecklistCategories(orderedIds: string[]): Promise<ChecklistCategoryDto[]> {
  return apiClient.put<ChecklistCategoryDto[]>("/api/checklist-categories/reorder", { orderedIds });
}

export function deleteChecklistCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/checklist-categories/${id}`);
}

// Items

export function listChecklistItems(): Promise<ChecklistItemDto[]> {
  return apiClient.get<ChecklistItemDto[]>("/api/checklist-items");
}

export function listChecklistItemHistory(): Promise<ChecklistItemDto[]> {
  return apiClient.get<ChecklistItemDto[]>("/api/checklist-items/history");
}

export function getChecklistActiveCount(): Promise<{ active: number; max: number }> {
  return apiClient.get<{ active: number; max: number }>("/api/checklist-items/active-count");
}

export function createChecklistItem(input: ChecklistItemCreateInput): Promise<ChecklistItemDto> {
  return apiClient.post<ChecklistItemDto>("/api/checklist-items", input);
}

export function listChecklistItemVersions(itemId: string): Promise<ChecklistItemVersionDto[]> {
  return apiClient.get<ChecklistItemVersionDto[]>(`/api/checklist-items/${itemId}/versions`);
}

export function scheduleChecklistItemVersion(itemId: string, input: ChecklistItemVersionInput): Promise<ChecklistItemVersionDto> {
  return apiClient.put<ChecklistItemVersionDto>(`/api/checklist-items/${itemId}/versions`, input);
}

export function deleteChecklistItemFutureVersion(itemId: string, versionId: string): Promise<void> {
  return apiClient.delete<void>(`/api/checklist-items/${itemId}/versions/${versionId}`);
}

export function moveChecklistItem(itemId: string, categoryId: string | null): Promise<ChecklistItemDto> {
  return apiClient.put<ChecklistItemDto>(`/api/checklist-items/${itemId}/parent`, { categoryId });
}

export function reorderChecklistItems(categoryId: string | null, orderedIds: string[]): Promise<ChecklistItemDto[]> {
  return apiClient.put<ChecklistItemDto[]>("/api/checklist-items/reorder", { categoryId, orderedIds });
}

export function deleteChecklistItem(itemId: string): Promise<void> {
  return apiClient.delete<void>(`/api/checklist-items/${itemId}`);
}

// Global default goal

export function getChecklistGoalHistory(): Promise<ChecklistGoalDto[]> {
  return apiClient.get<ChecklistGoalDto[]>("/api/checklist-goal/history");
}

export function getCurrentChecklistGoal(): Promise<{ goalPercent: number }> {
  return apiClient.get<{ goalPercent: number }>("/api/checklist-goal/current");
}

export function scheduleChecklistGoal(effectiveFrom: string, goalPercent: number): Promise<ChecklistGoalDto> {
  return apiClient.put<ChecklistGoalDto>("/api/checklist-goal", { effectiveFrom, goalPercent });
}

export function deleteChecklistGoalFutureVersion(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/checklist-goal/${id}`);
}

// Daily result

export function getChecklistForDate(date: string): Promise<ChecklistDailyDto> {
  return apiClient.get<ChecklistDailyDto>(`/api/checklist-daily/${date}`);
}

export function setChecklistEntryAchieved(entryId: string, achieved: boolean) {
  return apiClient.put(`/api/checklist-daily/entries/${entryId}/achieved`, { achieved });
}

export function getChecklistMatrix(from: string, to: string): Promise<ChecklistMatrixResponseDto> {
  return apiClient.get<ChecklistMatrixResponseDto>(`/api/checklist-daily/matrix?from=${from}&to=${to}`);
}

// Analytics

export function getOverallAchievementTrend(from: string, to: string): Promise<AchievementPointDto[]> {
  return apiClient.get<AchievementPointDto[]>(`/api/checklist-analytics/overall?from=${from}&to=${to}`);
}

export function getAchievementByItem(from: string, to: string, priority?: ChecklistPriority, includeDeleted = false): Promise<ItemBreakdownEntryDto[]> {
  const params = new URLSearchParams({ from, to, includeDeleted: String(includeDeleted) });
  if (priority) params.set("priority", priority);
  return apiClient.get<ItemBreakdownEntryDto[]>(`/api/checklist-analytics/by-item?${params.toString()}`);
}

export function getItemTrend(itemId: string, from: string, to: string): Promise<ItemTrendPointDto[]> {
  return apiClient.get<ItemTrendPointDto[]>(`/api/checklist-analytics/item/${itemId}?from=${from}&to=${to}`);
}
