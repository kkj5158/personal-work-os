import { apiClient } from "./client";
import type { LifeStateEntryDto, LifeStateEntryInput } from "./types";

export function listLifeStateEntries(from: string, to: string): Promise<LifeStateEntryDto[]> {
  const params = new URLSearchParams({ from, to });
  return apiClient.get<LifeStateEntryDto[]>(`/api/life-state-entries?${params.toString()}`);
}

export function createLifeStateEntry(input: LifeStateEntryInput): Promise<LifeStateEntryDto> {
  return apiClient.post<LifeStateEntryDto>("/api/life-state-entries", input);
}

export function updateLifeStateEntry(id: string, input: LifeStateEntryInput): Promise<LifeStateEntryDto> {
  return apiClient.put<LifeStateEntryDto>(`/api/life-state-entries/${id}`, input);
}

export function deleteLifeStateEntry(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/life-state-entries/${id}`);
}
