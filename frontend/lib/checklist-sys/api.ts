import { apiClient } from "@/lib/api/client";
import type { ChecklistImportance } from "@/lib/checklist-core/types";
import type { ArchivePeriod } from "@/lib/checklist-core/stats";

export type RecordState = "SUCCESS" | "FAILURE" | "NOT_RECORDED";
export type Identity = { id: string; name: string; description: string; color: string; sortOrder: number };
export type Area = { id: string; identityId: string; name: string; description: string; color: string; sortOrder: number };
export type Item = { id: string; areaId: string; name: string; description: string; importance: ChecklistImportance; icon: string; sortOrder: number; startDate: string; archivedOn: string | null; lastRecordOn?: string | null };
export type Catalog = { identities: Identity[]; areas: Area[]; items: Item[]; archivePeriods: ArchivePeriod[] };
export type DailyRecord = { itemId: string; date: string; state: RecordState };
export type RecordChange = { itemId: string; date: string; state: RecordState | null };

const base = "/api/checklist-sys";
export const checklistSysApi = {
  catalog: () => apiClient.get<Catalog>(base),
  records: (from: string, to: string) => apiClient.get<DailyRecord[]>(`${base}/records?from=${from}&to=${to}`),
  saveRecords: (changes: RecordChange[]) => apiClient.put<void>(`${base}/records`, { changes }),
  saveIdentity: (identity: Identity) => apiClient.put<void>(`${base}/identities/${identity.id}`, identity),
  deleteIdentity: (id: string) => apiClient.delete<void>(`${base}/identities/${id}`),
  orderIdentities: (ids: string[]) => apiClient.put<void>(`${base}/identities/order`, { parentId: null, ids }),
  saveArea: (area: Area) => apiClient.put<void>(`${base}/areas/${area.id}`, area),
  deleteArea: (id: string) => apiClient.delete<void>(`${base}/areas/${id}`),
  orderAreas: (identityId: string, ids: string[]) => apiClient.put<void>(`${base}/areas/order`, { parentId: identityId, ids }),
  saveItem: (item: Item) => apiClient.put<void>(`${base}/items/${item.id}`, item),
  orderItems: (areaId: string, ids: string[]) => apiClient.put<void>(`${base}/items/order`, { parentId: areaId, ids }),
  archiveItem: (id: string) => apiClient.post<void>(`${base}/items/${id}/archive`, {}),
  restoreItem: (id: string) => apiClient.post<void>(`${base}/items/${id}/restore`, {}),
};
