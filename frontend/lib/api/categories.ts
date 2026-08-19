import { apiClient } from "./client";
import type { TimeBlockCategory, TimeBlockCategoryInput } from "./types";

export function listCategories(): Promise<TimeBlockCategory[]> {
  return apiClient.get<TimeBlockCategory[]>("/api/time-block-categories");
}

export function createCategory(input: TimeBlockCategoryInput): Promise<TimeBlockCategory> {
  return apiClient.post<TimeBlockCategory>("/api/time-block-categories", input);
}
