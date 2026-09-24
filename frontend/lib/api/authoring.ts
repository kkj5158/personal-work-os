import { apiClient } from "./client";
import type { Program, Session, SessionSummary, Draft } from "../authoring/types";
const base = "/api/authoring";
export const authoringApi = {
  programs: () => apiClient.get<Program[]>(`${base}/programs`),
  sessions: () => apiClient.get<SessionSummary[]>(`${base}/sessions`),
  create: (programKey: string, sourceSessionId?: string) => apiClient.post<Session>(`${base}/sessions`, { programKey, sourceSessionId: sourceSessionId || null }),
  get: (id: string) => apiClient.get<Session>(`${base}/sessions/${id}`),
  save: (id: string, expectedVersion: number, draft: Draft) => apiClient.put<Session>(`${base}/sessions/${id}`, { expectedVersion, ...draft }),
  saveMetadata: (id: string, expectedVersion: number, metadata: { title: string | null; memo: string | null }) => apiClient.put<Session>(`${base}/sessions/${id}/metadata`, { expectedVersion, ...metadata }),
  complete: (id: string, expectedVersion: number) => apiClient.post<Session>(`${base}/sessions/${id}/complete`, { expectedVersion }),
  recoveryExport: (id: string) => apiClient.get<unknown>(`${base}/sessions/${id}/recovery-export`),
};
