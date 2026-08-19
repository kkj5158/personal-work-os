import { apiClient } from "./client";
import type { PlannedTimeBlock, PlannedTimeBlockInput } from "./types";

export function listPlannedBlocks(rangeStart: string, rangeEnd: string): Promise<PlannedTimeBlock[]> {
  const params = new URLSearchParams({ rangeStart, rangeEnd });
  return apiClient.get<PlannedTimeBlock[]>(`/api/planned-blocks?${params.toString()}`);
}

export function createPlannedBlock(input: PlannedTimeBlockInput): Promise<PlannedTimeBlock> {
  return apiClient.post<PlannedTimeBlock>("/api/planned-blocks", input);
}

export function updatePlannedBlock(id: string, input: PlannedTimeBlockInput): Promise<PlannedTimeBlock> {
  return apiClient.put<PlannedTimeBlock>(`/api/planned-blocks/${id}`, input);
}

export function deletePlannedBlock(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/planned-blocks/${id}`);
}
