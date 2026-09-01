import { apiClient } from "./client";
import type { WorkChartReferenceLineCreateInput, WorkChartReferenceLineDto, WorkChartReferenceLineUpdateInput } from "./types";

export function listWorkChartReferenceLines(): Promise<WorkChartReferenceLineDto[]> {
  return apiClient.get<WorkChartReferenceLineDto[]>("/api/work-chart-reference-lines");
}

export function createWorkChartReferenceLine(input: WorkChartReferenceLineCreateInput): Promise<WorkChartReferenceLineDto> {
  return apiClient.post<WorkChartReferenceLineDto>("/api/work-chart-reference-lines", input);
}

export function updateWorkChartReferenceLine(id: string, input: WorkChartReferenceLineUpdateInput): Promise<WorkChartReferenceLineDto> {
  return apiClient.put<WorkChartReferenceLineDto>(`/api/work-chart-reference-lines/${id}`, input);
}

export function deleteWorkChartReferenceLine(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/work-chart-reference-lines/${id}`);
}
