import { apiClient } from "./client";
import type { WorkChartTargetDto } from "./types";

export function getWorkChartTargets(): Promise<WorkChartTargetDto> {
  return apiClient.get<WorkChartTargetDto>("/api/work-chart-targets");
}

export function setWorkChartTargets(input: WorkChartTargetDto): Promise<WorkChartTargetDto> {
  return apiClient.put<WorkChartTargetDto>("/api/work-chart-targets", input);
}
