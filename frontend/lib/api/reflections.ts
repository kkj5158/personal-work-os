import { apiClient } from "./client";
import type { ReflectionEntryDto } from "./types";

export async function getReflection(date: string): Promise<ReflectionEntryDto | null> {
  try {
    return await apiClient.get<ReflectionEntryDto>(`/api/reflections/${date}`);
  } catch (e) {
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 404) {
      return null;
    }
    throw e;
  }
}

export function createReflection(date: string): Promise<ReflectionEntryDto> {
  return apiClient.post<ReflectionEntryDto>(`/api/reflections/${date}`, {});
}

export function updateReflectionContent(date: string, content: string, expectedVersion: number): Promise<ReflectionEntryDto> {
  return apiClient.put<ReflectionEntryDto>(`/api/reflections/${date}/content`, { content, expectedVersion });
}

export function completeReflection(date: string, expectedVersion: number): Promise<ReflectionEntryDto> {
  return apiClient.post<ReflectionEntryDto>(`/api/reflections/${date}/complete`, { expectedVersion });
}

export function reopenReflection(date: string, expectedVersion: number): Promise<ReflectionEntryDto> {
  return apiClient.post<ReflectionEntryDto>(`/api/reflections/${date}/edit`, { expectedVersion });
}

export function deleteReflection(date: string): Promise<void> {
  return apiClient.delete<void>(`/api/reflections/${date}`);
}
