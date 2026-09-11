import { apiClient } from "./client";
import type { LifeTimeEntryDto, LifeTimeEntryInput } from "./types";

export function listLifeTimeEntries(from: string, to: string): Promise<LifeTimeEntryDto[]> {
  const params = new URLSearchParams({ from, to });
  return apiClient.get<LifeTimeEntryDto[]>(`/api/life-time-entries?${params.toString()}`);
}

export function createLifeTimeEntry(input: LifeTimeEntryInput): Promise<LifeTimeEntryDto> {
  return apiClient.post<LifeTimeEntryDto>("/api/life-time-entries", input);
}

export function updateLifeTimeEntry(id: string, input: LifeTimeEntryInput): Promise<LifeTimeEntryDto> {
  return apiClient.put<LifeTimeEntryDto>(`/api/life-time-entries/${id}`, input);
}

export function deleteLifeTimeEntry(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/life-time-entries/${id}`);
}
