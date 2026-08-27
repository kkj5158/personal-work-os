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
