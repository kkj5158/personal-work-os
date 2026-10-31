import {DeskApi} from './api';
import {sha256} from '@noble/hashes/sha2.js';
import {matchingOperation, newOperation, type DeskItem, type DeskOperation} from './model';

export const FILE_LIMIT = 100 * 1024 * 1024;
export const FILE_ACCEPT = '.apk,.zip,.pdf,.md,.json,.txt,.png,.jpg,.jpeg,.webp';
const MIME: Record<string, string> = {apk: 'application/vnd.android.package-archive', zip: 'application/zip', pdf: 'application/pdf', md: 'text/markdown', json: 'application/json', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'};
export type UploadTicket = {fileId: string; ticketId: string; expiresAt: string; url: string; method: 'PUT'; requiredHeaders: Record<string, string>; revision: number};
export const fileMime = (file: Pick<File, 'name'>) => MIME[file.name.split('.').pop()?.toLowerCase() ?? ''];
const HASH_CHUNK = 64 * 1024, HASH_YIELD_BYTES = 1024 * 1024;
function checkAborted(signal?: AbortSignal) {if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');}
async function readHashed(stream: ReadableStream<Uint8Array>, expectedSize: number, signal?: AbortSignal, retain?: (chunk: Uint8Array) => void) {
  const reader = stream.getReader(), hash = sha256.create(); let size = 0, sinceYield = 0;
  const abort = () => {void reader.cancel().catch(() => {});};
  signal?.addEventListener('abort', abort, {once: true});
  try {
    checkAborted(signal);
    while (true) {
      const {done, value} = await reader.read(); checkAborted(signal); if (done) break;
      size += value.byteLength;
      if (size > expectedSize || size > FILE_LIMIT) throw new Error('파일 크기가 예상한 크기와 다릅니다.');
      for (let offset = 0; offset < value.byteLength; offset += HASH_CHUNK) {
        checkAborted(signal);
        const chunk = value.subarray(offset, Math.min(offset + HASH_CHUNK, value.byteLength));
        hash.update(chunk); retain?.(chunk); sinceYield += chunk.byteLength;
        if (sinceYield >= HASH_YIELD_BYTES) {sinceYield = 0; await new Promise<void>(resolve => setTimeout(resolve, 0)); checkAborted(signal);}
      }
    }
    if (size !== expectedSize) throw new Error('파일 크기가 예상한 크기와 다릅니다.');
    return [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {await reader.cancel().catch(() => {}); throw error;}
  finally {signal?.removeEventListener('abort', abort); reader.releaseLock(); hash.destroy();}
}
export async function fileDigest(file: Pick<Blob, 'size' | 'stream'>, signal?: AbortSignal) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > FILE_LIMIT) throw new Error('파일은 100 MiB까지 업로드할 수 있습니다.');
  checkAborted(signal);
  // Blob streams are consumed incrementally; even a large producer chunk is hashed in <=64 KiB views.
  return readHashed(file.stream(), file.size, signal);
}
/** Only the selected File is passed to XHR; upload bytes are never converted to base64 or logged. */
export function putFile(ticket: UploadTicket, file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal.aborted) {reject(new DOMException('취소됨', 'AbortError')); return;}
    xhr.open(ticket.method, ticket.url);
    for (const [name, value] of Object.entries(ticket.requiredHeaders)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = event => {if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100));};
    const done = () => signal.removeEventListener('abort', abort);
    xhr.onload = () => {done(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('파일 전송에 실패했습니다. 재시도하면 업로드 주소를 새로 받습니다.'));};
    xhr.onerror = () => {done(); reject(new Error('파일 저장소에 연결하지 못했습니다. 네트워크와 CORS 설정을 확인해주세요.'));};
    xhr.onabort = () => {done(); reject(new DOMException('취소됨', 'AbortError'));};
    signal.addEventListener('abort', abort, {once: true}); xhr.send(file);
  });
}
export async function journal<T>(api: DeskApi, operation: DeskOperation, onKnown?: (result: Record<string, unknown>) => void): Promise<T> {
  const original = matchingOperation((await api.storage.read()).outbox, operation) ?? operation;
  await api.storage.queue(original); return api.dispatch<T>(original, onKnown);
}
export async function uploadFile(api: DeskApi, file: File, projectId: string | null, signal: AbortSignal,
  progress: (state: string, percent: number, fileId?: string) => void, retry?: DeskItem) {
  const mime = fileMime(file);
  if (!mime) throw new Error('APK, ZIP, PDF, MD, JSON, TXT, PNG, JPEG, WebP 파일만 허용합니다.');
  if (file.size === 0 || file.size > FILE_LIMIT) throw new Error('0바이트보다 크고 100 MiB 이하인 파일을 선택해주세요.');
  progress('무결성 계산 중', 0, retry?.id);
  const sha256 = await fileDigest(file, signal);
  if (signal.aborted) throw new DOMException('취소됨', 'AbortError');
  if (retry && (retry.sha256 !== sha256 || retry.sizeBytes !== file.size)) throw new Error('처음 업로드한 파일과 크기·SHA-256이 다릅니다. 같은 파일을 선택해주세요.');
  async function renew(item: DeskItem): Promise<UploadTicket> {
    if (item.state === 'UPLOADING' && Date.parse(item.uploadExpiresAt ?? '') > Date.now()) item = await journal<DeskItem>(api, newOperation('/files/' + item.id + '/cancel', 'POST', {expectedRevision: item.revision}));
    return journal<UploadTicket>(api, newOperation('/files/' + item.id + '/upload-tickets', 'POST', {expectedRevision: item.revision}), known => {if (known.fileId) progress('업로드 준비 중', 0, String(known.fileId));});
  }
  let ticket = retry ? await renew(retry) : await journal<UploadTicket>(api, newOperation('/files/upload-tickets', 'POST', {displayName: file.name, sizeBytes: file.size, sha256, claimedMime: mime, projectId}), known => {if (known.fileId) progress('업로드 준비 중', 0, String(known.fileId));});
  if (!ticket.url) ticket = await renew(await api.detail({kind: 'FILE', id: ticket.fileId}));
  progress('업로드 중', 0, ticket.fileId);
  if (signal.aborted) throw new DOMException('취소됨', 'AbortError');
  await putFile(ticket, file, signal, percent => progress('업로드 중', percent, ticket.fileId));
  if (signal.aborted) throw new DOMException('취소됨', 'AbortError');
  progress('서버 검증 중', 100, ticket.fileId);
  const result = await journal<DeskItem>(api, newOperation('/files/' + ticket.fileId + '/complete', 'POST', {ticketId: ticket.ticketId, expectedRevision: ticket.revision}));
  if (result.state !== 'READY') throw new Error('파일 검증이 완료되지 않았습니다. 파일 상태를 확인하고 재시도해주세요.');
  return result;
}
export async function verifiedDownload(api: DeskApi, item: DeskItem, signal: AbortSignal) {
  const ticket = await api.download(item.id);
  if (!Number.isSafeInteger(ticket.sizeBytes) || ticket.sizeBytes < 1 || ticket.sizeBytes > FILE_LIMIT) throw new Error('다운로드 크기 검증에 실패했습니다.');
  const response = await fetch(ticket.url, {signal, credentials: 'omit', redirect: 'error', cache: 'no-store'});
  if (!response.ok || !response.body) throw new Error('파일을 내려받지 못했습니다. 다시 시도해주세요.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const digest = await readHashed(response.body, ticket.sizeBytes, signal, chunk => chunks.push(new Uint8Array(chunk)));
  if (digest !== ticket.sha256.toLowerCase()) throw new Error('다운로드 무결성 검증에 실패했습니다. 파일을 저장하지 않았습니다.');
  // The browser Blob-save fallback retains at most 100 MiB of verified bytes (plus browser Blob
  // bookkeeping/copy overhead). Hashing happens during the read, without a second full-file buffer.
  const blob = new Blob(chunks, {type: 'application/octet-stream'});
  if (signal.aborted) throw new DOMException('취소됨', 'AbortError');
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = ticket.displayName.replace(/[\\/\u0000-\u001f]/g, '_');
  anchor.rel = 'noopener'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
