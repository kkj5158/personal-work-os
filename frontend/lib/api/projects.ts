import { apiClient } from "./client";
import type { PhaseDto, PhaseInput, PhaseWithProjectDto, ProjectDto, ProjectInput } from "./types";

export function listProjects(): Promise<ProjectDto[]> {
  return apiClient.get<ProjectDto[]>("/api/projects");
}

export function createProject(input: ProjectInput): Promise<ProjectDto> {
  return apiClient.post<ProjectDto>("/api/projects", input);
}

export function updateProject(id: string, input: ProjectInput): Promise<ProjectDto> {
  return apiClient.put<ProjectDto>(`/api/projects/${id}`, input);
}

export function deleteProject(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/projects/${id}`);
}

export function listPhasesByProject(projectId: string): Promise<PhaseDto[]> {
  return apiClient.get<PhaseDto[]>(`/api/projects/${projectId}/phases`);
}

export function createPhase(projectId: string, input: PhaseInput): Promise<PhaseDto> {
  return apiClient.post<PhaseDto>(`/api/projects/${projectId}/phases`, input);
}

export function updatePhase(id: string, input: PhaseInput): Promise<PhaseDto> {
  return apiClient.put<PhaseDto>(`/api/phases/${id}`, input);
}

export function deletePhase(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/phases/${id}`);
}

/** Backs the searchable Phase selector — every phase, most-recent first, with parent Project context. */
export function listPhaseSelector(): Promise<PhaseWithProjectDto[]> {
  return apiClient.get<PhaseWithProjectDto[]>("/api/phases/selector");
}

/** Backs the date-first Project/Phase timeline widget. */
export function listPhaseTimeline(from: string, to: string): Promise<PhaseWithProjectDto[]> {
  const params = new URLSearchParams({ from, to });
  return apiClient.get<PhaseWithProjectDto[]>(`/api/phases/timeline?${params.toString()}`);
}
