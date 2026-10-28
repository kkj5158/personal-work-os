import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BODY_LIMIT, OPERATION_LIFETIME, appendReplyPage, bodyBytes, boundedCache, expiredOperation, matchingOperation, newOperation, recoveredConflict, suggestedTitle, type DeskItem, type DeskReply} from './model';

const item = (id: string, body?: string, revision = 1): DeskItem => ({id, kind: 'CLIP', title: null, body, projectId: null, pinned: false, revision, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', deletedAt: null});
test('title suggestion and byte validation preserve exact Korean/code/blank lines/final newline input', () => {
  const body = '\n  한글 제목  \n\n```json\n{"value": 1}\n```\n';
  assert.equal(suggestedTitle(body), '한글 제목');
  assert.equal(body, '\n  한글 제목  \n\n```json\n{"value": 1}\n```\n');
  assert.equal(bodyBytes('한'), 3);
  assert.equal(bodyBytes('a'.repeat(BODY_LIMIT)), BODY_LIMIT);
});
test('cache retains loaded original at the same revision, invalidates stale bodies and enforces both caps', () => {
  assert.equal(boundedCache([item('same', '원문\n'), item('same')])[0].body, '원문\n');
  assert.equal(boundedCache([item('same', '원문\n'), item('same', undefined, 2)])[0].body, undefined);
  assert.equal(boundedCache(Array.from({length: 230}, (_, index) => item(String(index), 'body'))).length, 200);
  assert.ok(boundedCache(Array.from({length: 20}, (_, index) => item(String(index), 'a'.repeat(BODY_LIMIT)))).length < 11);
});
test('uncertain retry reuses original operation identity and timestamp; changed payload and conflicts never match', () => {
  const original = {...newOperation('/clips', 'POST', {body: '원문\n', projectId: null}), attempts: 1, state: 'failed' as const};
  const retry = newOperation('/clips', 'POST', {projectId: null, body: '원문\n'});
  assert.equal(matchingOperation([original], retry)?.operationId, original.operationId);
  assert.equal(matchingOperation([original], retry)?.operationCreatedAt, original.operationCreatedAt);
  assert.equal(matchingOperation([original], newOperation('/clips', 'POST', {body: '원문', projectId: null})), undefined);
  assert.equal(matchingOperation([{...original, state: 'conflict'}], retry), undefined);
  assert.equal(expiredOperation(original, Date.parse(original.operationCreatedAt) + OPERATION_LIFETIME), true);
});
test('an acknowledged recovered clone resolves only its exact known-conflict operation', () => {
  const first = {...newOperation('/clips/same-item', 'PATCH', {body: 'first', title: null, projectId: null, expectedRevision: 1}), state: 'conflict' as const};
  const second = {...newOperation('/clips/same-item', 'PATCH', {body: 'second', title: null, projectId: null, expectedRevision: 1}), state: 'conflict' as const};
  const draft = {kind: 'CLIP' as const, title: '', body: 'second, edited locally', projectId: '', recoveredOperationId: second.operationId};
  assert.equal(recoveredConflict([first, second], draft), second.operationId);
  assert.equal(recoveredConflict([first, {...second, state: 'failed'}], draft), undefined);
  assert.equal(recoveredConflict([first], draft), undefined);
  assert.equal(recoveredConflict([first, second], {kind: 'CLIP', title: '', body: 'first', projectId: '', itemId: 'same-item', revision: 1}), first.operationId);
});
test('reply pages append without duplicates in chronological order while keeping an overlapping revision', () => {
  const reply = (id: string, createdAt: string, body = id): DeskReply => ({id, parentId: 'memo-root', body, revision: 1, createdAt, updatedAt: createdAt});
  const first = reply('a', '2026-10-28T00:00:00Z'), boundary = reply('b', '2026-10-28T00:00:01Z');
  const result = appendReplyPage([first, boundary], [reply('c', '2026-10-28T00:00:02Z'), {...boundary, body: 'latest', revision: 2}]);
  assert.deepEqual(result.map(item => item.id), ['a', 'b', 'c']); assert.equal(result[1].body, 'latest');
});
