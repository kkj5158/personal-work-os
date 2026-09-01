import { apiClient } from "./client";
import type { StartTimeCriterionDto, StartTimeCriterionInput } from "./types";

export function listStartTimeCriteria(): Promise<StartTimeCriterionDto[]> {
  return apiClient.get<StartTimeCriterionDto[]>("/api/start-time-criteria");
}

export function createStartTimeCriterion(input: StartTimeCriterionInput): Promise<StartTimeCriterionDto> {
  return apiClient.post<StartTimeCriterionDto>("/api/start-time-criteria", input);
}

export function updateStartTimeCriterion(id: string, input: StartTimeCriterionInput): Promise<StartTimeCriterionDto> {
  return apiClient.put<StartTimeCriterionDto>(`/api/start-time-criteria/${id}`, input);
}

export function setDefaultStartTimeCriterion(id: string): Promise<StartTimeCriterionDto> {
  return apiClient.put<StartTimeCriterionDto>(`/api/start-time-criteria/${id}/default`, {});
}

/** Physically removes an unused criterion; archives (soft-deletes) one with
 *  usage history instead — either way it disappears from listStartTimeCriteria(). */
export function deleteStartTimeCriterion(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/start-time-criteria/${id}`);
}

/** orderedIds must name exactly the user's current non-archived criteria —
 *  presentation order only, never touches isDefault or history. Returns the
 *  full list in its new order, same shape as listStartTimeCriteria(). */
export function reorderStartTimeCriteria(orderedIds: string[]): Promise<StartTimeCriterionDto[]> {
  return apiClient.put<StartTimeCriterionDto[]>("/api/start-time-criteria/reorder", { orderedIds });
}
