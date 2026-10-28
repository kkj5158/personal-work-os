import {apiClient, ApiError} from '@/lib/api/client';
import {deskPath, expiredOperation, type DeskItem, type DeskKind, type DeskOperation, type DeskPage, type DeskProject, type DeskReply} from './model';
import {DeskStorage} from './storage';

export type ChangePage = {changes: unknown[]; highWater: string; nextCursor: string | null; hasMore: boolean};
export class DeskApi {
  constructor(readonly owner: string, readonly storage: DeskStorage, private readonly active: () => boolean) {}
  private async request<T>(path: string, method = 'GET', body?: unknown) {
    if (!this.active()) throw new ApiError(401, '로그인 사용자가 바뀌었습니다.');
    const result = await apiClient.scoped<T>(this.owner, '/api/shared-desk' + path, method, body);
    if (!this.active()) throw new ApiError(401, '로그인 사용자가 바뀌었습니다.');
    return result;
  }
  async list(kind: DeskKind, q: string, project: string, cursor?: string | null, trash = false) {
    const query = new URLSearchParams({limit: '50'});
    if (q) query.set('q', q);
    if (project === 'unlinked') query.set('unlinked', 'true'); else if (project) query.set('projectId', project);
    if (cursor) query.set('cursor', cursor);
    const result = await this.request<DeskPage<DeskItem>>((trash ? '/trash' : deskPath(kind)) + '?' + query);
    if (!q && !project && !trash) await this.storage.cache(result.items);
    return result;
  }
  async detail(item: Pick<DeskItem, 'id' | 'kind'>) {
    const result = await this.request<DeskItem>(deskPath(item.kind) + '/' + item.id);
    await this.storage.cache([result]); return result;
  }
  download(id: string) {return this.request<{url: string; sha256: string; sizeBytes: number; displayName: string}>('/files/' + id + '/download-tickets', 'POST', {});}
  replies(id: string, cursor?: string) {
    const query = cursor ? '?' + new URLSearchParams({cursor}) : '';
    return this.request<DeskReply[] | DeskPage<DeskReply>>('/memos/' + id + '/replies' + query);
  }
  changes(after?: string, until?: string) {
    const query = new URLSearchParams({limit: '100'});
    if (after) query.set('after', after); if (until) query.set('until', until);
    return this.request<ChangePage>('/changes?' + query);
  }
  async projects() {
    if (!this.active()) throw new ApiError(401, '로그인 사용자가 바뀌었습니다.');
    const result = await apiClient.scoped<DeskProject[]>(this.owner, '/api/workflow/project-profiles');
    if (!this.active()) throw new ApiError(401, '로그인 사용자가 바뀌었습니다.');
    return result;
  }
  /** Every retry checks the original operation before replaying. Conflicts are never rebased silently. */
  async dispatch<T = DeskItem | DeskReply>(operation: DeskOperation, onKnown?: (result: Record<string, unknown>) => void): Promise<T> {
    if (expiredOperation(operation)) {
      await this.storage.operation({...operation, state: 'conflict', error: '전송 대기가 30일을 넘었습니다. 내용을 확인하고 새 항목으로 저장해주세요.'});
      throw new ApiError(410, '전송 대기가 30일을 넘었습니다. 내용을 확인하고 새 항목으로 저장해주세요.');
    }
    if (operation.state === 'conflict') throw new ApiError(409, '충돌한 입력은 새 사본으로 저장해주세요.');
    if (operation.attempts > 0) {
      try {
        let completeReplay = false;
        const result = await this.request<Record<string, unknown> | {result: Record<string, unknown>}>('/operations/' + operation.operationId);
        const item = 'result' in result ? result.result : result;
        if (item && typeof item === 'object') {
          onKnown?.(item as Record<string, unknown>);
          if ('status' in item && item.status === 'VERIFYING') {
            // Only the exact complete POST may ask the server to reclaim an expired verification
            // lease. A live lease returns VERIFYING again and is never acknowledged below.
            completeReplay = operation.method === 'POST' && /^\/files\/[^/]+\/complete$/.test(operation.path);
            if (!completeReplay) throw new ApiError(503, '서버에서 파일을 검증하고 있습니다. 잠시 후 같은 요청을 확인해주세요.');
          }
        }
        // Ticket results deliberately contain no signed URL in the operation log. Replaying the
        // exact POST signs the same staging resource, while an expired ticket is renewed by its caller.
        const ticketReplay = operation.path.endsWith('/upload-tickets') && item && typeof item === 'object' && 'fileId' in item && 'expiresAt' in item && Date.parse(String(item.expiresAt)) > Date.now();
        if (!ticketReplay && !completeReplay) {await this.storage.acknowledge(operation.operationId, item && typeof item === 'object' && 'kind' in item ? item as DeskItem : undefined); return item as T;}
      } catch (error) {if (!(error instanceof ApiError) || error.status !== 404) throw error;}
    }
    const sending = {...operation, state: 'pending' as const, attempts: operation.attempts + 1, error: undefined};
    // Persist the attempt before dispatch so a killed tab knows its result may be unknown.
    await this.storage.operation(sending);
    try {
      const result = await this.request<Record<string, unknown>>(operation.path, operation.method, operation.body);
      if (result.status === 'VERIFYING') throw new ApiError(503, '서버에서 파일을 검증하고 있습니다. 잠시 후 같은 요청을 확인해주세요.');
      await this.storage.acknowledge(operation.operationId, result && 'kind' in result ? result as DeskItem : undefined); return result as T;
    } catch (error) {
      const conflict = error instanceof ApiError && [409, 410, 428].includes(error.status);
      await this.storage.operation({...sending, state: conflict ? 'conflict' : 'failed', error: error instanceof Error ? error.message : '전송 실패'});
      throw error;
    }
  }
}
