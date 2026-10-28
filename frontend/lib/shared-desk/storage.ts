import {boundedCache, type DeskDraft, type DeskItem, type DeskOperation} from './model';

export type DeskLocalState = {cache: DeskItem[]; drafts: Record<string, DeskDraft>; outbox: DeskOperation[]};
const emptyState = (): DeskLocalState => ({cache: [], drafts: {}, outbox: []});
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('pos-shared-desk-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scopes');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {connection = undefined; reject(new Error('이 브라우저에 초안을 보관할 수 없습니다. 저장 공간 설정을 확인해주세요.'));};
  });
  return connection;
}
/** Environment + API origin + authenticated owner partition; never an unscoped fallback. */
export const deskScope = (api: string, environment: string, owner: string) => JSON.stringify([new URL(api, window.location.origin).origin, environment, owner]);
export class DeskStorage {
  constructor(readonly scope: string) {}
  async read(): Promise<DeskLocalState> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction('scopes').objectStore('scopes').get(this.scope);
      request.onsuccess = () => resolve(request.result ?? emptyState());
      request.onerror = () => reject(new Error('보관한 초안을 읽지 못했습니다.'));
    });
  }
  /** Read-modify-write in a single IDB transaction also serializes independent browser tabs. */
  async update(change: (state: DeskLocalState) => DeskLocalState): Promise<DeskLocalState> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('scopes', 'readwrite'), store = transaction.objectStore('scopes');
      const request = store.get(this.scope); let result: DeskLocalState;
      request.onsuccess = () => {result = change(request.result ?? emptyState()); store.put(result, this.scope);};
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () => reject(new Error('초안 보관에 실패했습니다. 저장 공간을 확인해주세요.'));
    });
  }
  draft(key: string, value: DeskDraft | null) {
    return this.update(state => {const drafts = {...state.drafts}; if (value) drafts[key] = value; else delete drafts[key]; return {...state, drafts};});
  }
  cache(items: DeskItem[]) {return this.update(state => ({...state, cache: boundedCache([...state.cache, ...items])}));}
  queue(operation: DeskOperation) {return this.update(state => ({...state, outbox: state.outbox.some(item => item.operationId === operation.operationId) ? state.outbox : [...state.outbox, operation]}));}
  operation(operation: DeskOperation) {return this.update(state => ({...state, outbox: state.outbox.map(item => item.operationId === operation.operationId ? operation : item)}));}
  acknowledge(operationId: string, item?: DeskItem) {
    return this.update(state => ({...state, outbox: state.outbox.filter(item => item.operationId !== operationId), cache: item ? boundedCache([...state.cache.filter(old => old.id !== item.id), item]) : state.cache}));
  }
}
