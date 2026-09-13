import { ApiError, apiClient } from "./client";
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

const opening = new Map<string, Promise<ReflectionEntryDto>>();
/** Share only in-flight work, including React's development effect remount. */
export function openReflection(date:string):Promise<ReflectionEntryDto> {
  const pending=opening.get(date);if(pending)return pending;
  const request=(async()=>{
    const existing=await getReflection(date);if(existing)return existing;
    try{return await createReflection(date);}catch(error){
      // Another surface may have created this date between our GET and POST.
      if(error instanceof ApiError && error.status === 409){const created=await getReflection(date);if(created)return created;}
      throw error;
    }
  })().finally(()=>opening.delete(date));
  opening.set(date,request);return request;
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
