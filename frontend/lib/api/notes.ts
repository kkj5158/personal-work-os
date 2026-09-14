import { encodeImage } from "./imageUpload";
import { apiClient } from "./client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DailyHubSettings, DailyHubRecord } from "@/lib/notes/dailyHub";
import type {
  Workspace,
  Settings,
  Note,
  Summary,
  Page,
  Tag,
  Reference,
  Metric,
  Pending,
  Graph,
  SearchResult,
  Media,
  ModuleSetting,
} from "@/lib/notes/types";
const root = "/api/note-system";
const path = (w: string) => `${root}/workspaces/${encodeURIComponent(w)}`;
export const notesApi = {
  mainWorkspace: () => apiClient.get<{ mainWorkspaceId: string | null }>(`${root}/settings/main-workspace`),
  saveMainWorkspace: (mainWorkspaceId: string) => apiClient.put<{ mainWorkspaceId: string }>(`${root}/settings/main-workspace`, { mainWorkspaceId }),
  dailyHubSettings: () => apiClient.get<DailyHubSettings>(`${root}/daily-hub/settings`),
  saveDailyHubSettings: (settings: DailyHubSettings) => apiClient.put<DailyHubSettings>(`${root}/daily-hub/settings`, settings),
  dailyHub: (date: string) => apiClient.get<Note[]>(`${root}/daily-hub?date=${date}`),
  dailyHubRecords: (end: string, days = 14) => apiClient.get<DailyHubRecord[]>(`${root}/daily-hub/records?end=${end}&days=${days}`),
  dailyHubRecent: () => apiClient.get<DailyHubRecord[]>(`${root}/daily-hub/recent?limit=30`),
  workspaces: () => apiClient.get<Workspace[]>(`${root}/workspaces`),
  reorderWorkspaces: (orderedIds: string[]) =>
    apiClient.put<Workspace[]>(`${root}/workspaces/reorder`, { orderedIds }),
  createWorkspace: (name: string) =>
    apiClient.post<{ id: string }>(`${root}/workspaces`, {
      name,
      description: "",
      icon: "notebook",
      archived: false,
      modules: null,
    }),
  updateWorkspace: (w: Workspace, modules: ModuleSetting[] = w.modules) =>
    apiClient.put<void>(path(w.id), {
      name: w.name,
      description: w.description,
      icon: w.icon,
      archived: !!w.archivedAt,
      modules,
    }),
  deleteWorkspace: (w: Workspace) =>
    apiClient.delete<void>(
      `${path(w.id)}?confirmation=${encodeURIComponent(w.name)}`,
    ),
  settings: () => apiClient.get<Settings>(`${root}/settings`),
  saveSettings: (settings: Settings) =>
    apiClient.put<Settings>(`${root}/settings`, settings),
  daily: (w: string, end: string, days = 14) =>
    apiClient.get<Note[]>(`${path(w)}/daily?end=${end}&days=${days}`),
  library: (w: string, params: Record<string, string | number> = {}) =>
    apiClient.get<Page<Summary>>(
      `${path(w)}/notes?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
    ),
  note: (w: string, id: string) =>
    apiClient.get<Note>(`${path(w)}/notes/${id}`),
  resolve: (w: string, title: string) =>
    apiClient.get<Note>(
      `${path(w)}/resolve?title=${encodeURIComponent(title)}`,
    ),
  openWiki: (w: string, title: string) =>
    apiClient.post<Note>(`${path(w)}/wiki`, { title, expectedVersion: 0 }),
  wikiSuggestions: (w: string, q: string) =>
    apiClient.get<SearchResult[]>(
      `${path(w)}/wiki?${new URLSearchParams({ q })}`,
    ),
  deleteNote: (w: string, note: Note) =>
    apiClient.delete<void>(
      `${path(w)}/notes/${note.id}?${new URLSearchParams({ expectedVersion: String(note.version), confirmation: note.title })}`,
    ),
  save: (
    w: string,
    note: Pick<Note, "id" | "journalDate" | "title" | "content" | "version">,
  ) =>
    apiClient.put<Note | null>(`${path(w)}/notes`, {
      ...note,
      expectedVersion: note.version,
    }),
  rename: (w: string, note: Note, title: string) =>
    apiClient.put<Note>(`${path(w)}/notes/${note.id}/title`, {
      title,
      expectedVersion: note.version,
    }),
  pin: (w: string, note: Note) =>
    apiClient.put<Note>(`${path(w)}/notes/${note.id}/pin`, {
      value: !note.pinnedAt,
      expectedVersion: note.version,
    }),
  trash: (w: string, note: Note) =>
    apiClient.put<Note>(`${path(w)}/notes/${note.id}/trash`, {
      value: !note.deletedAt,
      expectedVersion: note.version,
    }),
  visit: (w: string, id: string) =>
    apiClient.post<void>(`${path(w)}/notes/${id}/visit`, {}),
  tags: (w: string) => apiClient.get<Tag[]>(`${path(w)}/tags`),
  createTag: (w: string, name: string) =>
    apiClient.post<Tag>(`${path(w)}/tags`, { name }),
  renameTag: (w: string, id: string, name: string) =>
    apiClient.put<void>(`${path(w)}/tags/${id}`, { name }),
  deleteTag: (w: string, id: string) =>
    apiClient.delete<void>(`${path(w)}/tags/${id}`),
  attach: (w: string, id: string, name: string) =>
    apiClient.post<Note>(`${path(w)}/notes/${id}/tags`, { name }),
  detach: (w: string, id: string, name: string) =>
    apiClient.delete<Note>(
      `${path(w)}/notes/${id}/tags?name=${encodeURIComponent(name)}`,
    ),
  references: (w: string, params: { target: string } | { pending: string }) =>
    apiClient.get<Reference[]>(
      `${path(w)}/references?${new URLSearchParams(params)}`,
    ),
  metrics: (w: string) => apiClient.get<Metric[]>(`${path(w)}/metrics`),
  pending: (w: string) => apiClient.get<Pending[]>(`${path(w)}/pending`),
  graph: (w: string) => apiClient.get<Graph>(`${path(w)}/graph`),
  search: (w: string, q: string, limit = 30) =>
    apiClient.get<SearchResult[]>(
      `${path(w)}/search?${new URLSearchParams({ q, limit: String(limit) })}`,
    ),
  provider: () =>
    apiClient.get<{ available: boolean; reason: string }>(
      `${root}/reflection-provider`,
    ),
  upload: async (w: string, file: File): Promise<Media> => {
    return apiClient.post<Media>(`${path(w)}/media`, await encodeImage(file));
  },
  media: async (w: string, id: string): Promise<Blob> => {
    const client = createSupabaseBrowserClient();
    const session = client
      ? (await client.auth.getSession()).data.session
      : null;
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}${path(w)}/media/${id}`,
      {
        headers: session
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("이미지를 불러오지 못했습니다.");
    return response.blob();
  },
};
