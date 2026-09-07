import { apiClient } from "./client";
import type { LifeCategoryDto, LifeCategoryInput } from "./types";

export function listLifeCategories(): Promise<LifeCategoryDto[]> {
  return apiClient.get<LifeCategoryDto[]>("/api/life-categories");
}

export function createLifeCategory(input: LifeCategoryInput): Promise<LifeCategoryDto> {
  return apiClient.post<LifeCategoryDto>("/api/life-categories", input);
}

export function renameLifeCategory(id: string, name: string): Promise<LifeCategoryDto> {
  return apiClient.put<LifeCategoryDto>(`/api/life-categories/${id}`, { name });
}

export function setLifeCategoryActive(id: string, isActive: boolean): Promise<LifeCategoryDto> {
  return apiClient.put<LifeCategoryDto>(`/api/life-categories/${id}/active`, { isActive });
}

export function deleteLifeCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/life-categories/${id}`);
}
