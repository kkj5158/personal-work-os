import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiClient, ApiError} from '../api/client';
import {DeskApi} from './api';
import {DeskStorage, type DeskLocalState} from './storage';
import {newOperation, type DeskItem} from './model';

class MemoryStorage extends DeskStorage {
  value: DeskLocalState = {cache: [], drafts: {}, outbox: []};
  acknowledgements = 0;
  constructor() {super('test-owner-and-environment');}
  override async read() {return this.value;}
  override async update(change: (state: DeskLocalState) => DeskLocalState) {this.value = change(this.value); return this.value;}
  override async acknowledge(id: string, item?: DeskItem) {this.acknowledgements++; return super.acknowledge(id, item);}
}
const fixture: DeskItem = {id: 'clip-id', kind: 'CLIP', title: 'fixture', body: '한글\n\n끝\n', pinned: false, projectId: null, revision: 1, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', deletedAt: null};
type Request = {owner: string; path: string; method: string; body: unknown};
async function mockRequest<T>(callback: (request: Request) => Promise<unknown>, work: () => Promise<T>) {
  const original = apiClient.scoped;
  apiClient.scoped = async <R>(owner: string, path: string, method = 'GET', body?: unknown) => await callback({owner, path, method, body}) as R;
  try {return await work();} finally {apiClient.scoped = original;}
}
test('lost create response is resolved by operation lookup without a second POST', async () => {
  const storage = new MemoryStorage(), api = new DeskApi('owner-a', storage, () => true), operation = newOperation('/clips', 'POST', {body: fixture.body});
  await storage.queue(operation); const requests: Request[] = [];
  await mockRequest(async request => {requests.push(request); if (request.method === 'POST') throw new Error('synthetic timeout'); return {operationId: operation.operationId, status: 'ACKNOWLEDGED', result: fixture};}, async () => {
    await assert.rejects(api.dispatch(operation));
    assert.equal(storage.value.outbox[0].attempts, 1);
    const result = await api.dispatch<DeskItem>(storage.value.outbox[0]);
    assert.equal(result.body, fixture.body);
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.equal(requests[1].path, '/api/shared-desk/operations/' + operation.operationId);
    assert.equal(storage.value.outbox.length, 0);
  });
});
test('unknown operation lookup replays the same durable payload and identity', async () => {
  const storage = new MemoryStorage(), api = new DeskApi('owner-a', storage, () => true), operation = {...newOperation('/clips', 'POST', {body: fixture.body}), attempts: 1};
  await storage.queue(operation); const requests: Request[] = [];
  await mockRequest(async request => {requests.push(request); if (request.method === 'GET') throw new ApiError(404, 'unknown'); return fixture;}, async () => {
    await api.dispatch(operation); assert.equal(requests[0].method, 'GET'); assert.equal(requests[1].body, operation.body);
    assert.equal(storage.acknowledgements, 1);
  });
});
test('ticket metadata is re-signed by the exact POST without storing the signed URL', async () => {
  const storage = new MemoryStorage(), api = new DeskApi('owner-a', storage, () => true), operation = {...newOperation('/files/upload-tickets', 'POST', {displayName: 'fixture.txt', sizeBytes: 3, sha256: 'synthetic'}), attempts: 1};
  await storage.queue(operation); const requests: Request[] = [], known: Record<string, unknown>[] = [];
  await mockRequest(async request => {requests.push(request); return request.method === 'GET' ? {result: {fileId: 'file-id', revision: 1, expiresAt: new Date(Date.now() + 60_000).toISOString()}} : {fileId: 'file-id', url: 'https://storage.invalid/fixture?temporary=true', method: 'PUT'};}, async () => {
    const ticket = await api.dispatch<{url: string}>(operation, value => known.push(value));
    assert.equal(requests.length, 2); assert.equal(requests[1].body, operation.body); assert.equal(known[0].fileId, 'file-id');
    assert.ok(ticket.url); assert.equal(storage.value.outbox.length, 0); assert.equal(JSON.stringify(storage.value).includes('temporary=true'), false);
  });
});
test('VERIFYING and stale revisions retain the operation instead of reporting a successful file or losing input', async () => {
  const storage = new MemoryStorage(), api = new DeskApi('owner-a', storage, () => true), operation = newOperation('/files/id/complete', 'POST', {expectedRevision: 1, ticketId: 'ticket'});
  await storage.queue(operation);
  await mockRequest(async () => ({status: 'VERIFYING', id: 'id'}), async () => {
    await assert.rejects(api.dispatch(operation), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.equal(storage.value.outbox.length, 1); assert.equal(storage.acknowledgements, 0);
  });
  const edit = newOperation('/clips/id', 'PATCH', {body: fixture.body, expectedRevision: 1}); await storage.queue(edit);
  await mockRequest(async () => {throw new ApiError(409, 'revision conflict');}, async () => {
    await assert.rejects(api.dispatch(edit)); assert.equal(storage.value.outbox.find(item => item.operationId === edit.operationId)?.state, 'conflict');
    assert.equal(storage.value.outbox.find(item => item.operationId === edit.operationId)?.body.body, fixture.body);
  });
});
test('identity change while a request is in flight cannot acknowledge it into the next identity', async () => {
  const storage = new MemoryStorage(); let active = true;
  const api = new DeskApi('owner-a', storage, () => active), operation = newOperation('/clips', 'POST', {body: fixture.body}); await storage.queue(operation);
  await mockRequest(async () => {active = false; return fixture;}, async () => {
    await assert.rejects(api.dispatch(operation), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.equal(storage.acknowledgements, 0); assert.equal(storage.value.outbox.length, 1);
  });
});
