export type DeskKind = 'CLIP' | 'MEMO' | 'FILE';
export type DeskItem = {
  id: string; kind: DeskKind; title: string | null; body?: string; preview?: string;
  projectId: string | null; pinned: boolean; revision: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
  replyCount?: number; fileIds?: string[];
  displayName?: string; sizeBytes?: number; sha256?: string; state?: string; uploadExpiresAt?: string;
};
export type DeskReply = {id: string; parentId: string; body: string; revision: number; createdAt: string; updatedAt: string};
export type DeskPage<T> = {items: T[]; nextCursor: string | null; hasMore: boolean};
export type DeskCapabilities = {enabled: boolean; filesEnabled: boolean; environment: string; ownerId: string};
export type DeskProject = {id: string; title: string; emoji?: string; archivedAt?: string | null};
export type DeskDraft = {title: string; body: string; projectId: string; fileIds?: string[]; itemId?: string; revision?: number; recoveredOperationId?: string; kind: 'CLIP' | 'MEMO'};
export type DeskOperation = {
  operationId: string; operationCreatedAt: string; path: string; method: 'POST' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>; state: 'pending' | 'failed' | 'conflict'; attempts: number; error?: string;
};
export const BODY_LIMIT = 1024 * 1024;
export const OPERATION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
export const bodyBytes = (body: string) => new TextEncoder().encode(body).length;
/** Suggest a title without ever trimming or modifying the stored body. */
export const suggestedTitle = (body: string) => body.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 100) || '제목 없음';
export const itemTitle = (item: DeskItem) => item.title || suggestedTitle(item.preview ?? item.body ?? '');
export const deskPath = (kind: DeskKind) => kind === 'CLIP' ? '/clips' : kind === 'MEMO' ? '/memos' : '/files';
export function newOperation(path: string, method: DeskOperation['method'], values: Record<string, unknown>, now = new Date()): DeskOperation {
  const operationId = crypto.randomUUID(), operationCreatedAt = now.toISOString();
  return {operationId, operationCreatedAt, path, method, body: {...values, operationId, operationCreatedAt}, state: 'pending', attempts: 0};
}
export const expiredOperation = (operation: DeskOperation, now = Date.now()) => now - Date.parse(operation.operationCreatedAt) >= OPERATION_LIFETIME;
/** A cache is expendable; drafts and pending writes are stored separately and never evicted here. */
export function boundedCache(items: DeskItem[]): DeskItem[] {
  const merged = new Map<string, DeskItem>();
  for (const item of items) {
    const previous = merged.get(item.id);
    merged.set(item.id, previous?.revision === item.revision && item.body === undefined ? {...previous, ...item, body: previous.body} : item);
  }
  const sorted = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let bytes = 0;
  return sorted.filter((item, index) => {bytes += bodyBytes(JSON.stringify(item)); return index < 200 && bytes <= 10 * 1024 * 1024;});
}
export function matchingOperation(operations: DeskOperation[], intended: DeskOperation): DeskOperation | undefined {
  const payload = (operation: DeskOperation) => JSON.stringify(Object.entries(operation.body).filter(([key]) => !['operationId', 'operationCreatedAt'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  return operations.find(operation => operation.path === intended.path && operation.method === intended.method && operation.state !== 'conflict' && payload(operation) === payload(intended));
}
/** Only the rejected operation that supplied this draft can be resolved after a new copy is ACKed. */
export function recoveredConflict(operations: DeskOperation[], draft: DeskDraft): string | undefined {
  const match = draft.recoveredOperationId
    ? operations.find(operation => operation.operationId === draft.recoveredOperationId)
    : draft.itemId ? operations.find(operation => operation.state === 'conflict' && operation.path === deskPath(draft.kind) + '/' + draft.itemId && operation.body.expectedRevision === draft.revision && operation.body.body === draft.body && (operation.body.title ?? '') === draft.title && (operation.body.projectId ?? '') === draft.projectId) : undefined;
  return match?.state === 'conflict' ? match.operationId : undefined;
}
export function appendReplyPage(previous: DeskReply[], incoming: DeskReply[]): DeskReply[] {
  return [...new Map([...previous, ...incoming].map(reply => [reply.id, reply])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
