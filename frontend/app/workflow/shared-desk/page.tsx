'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Clipboard, Files, MessageSquare, Plus, RefreshCw, Search, Pin, Trash2, Copy, UploadCloud, Download, X, ChevronDown} from 'lucide-react';
import {ApiError, apiClient} from '@/lib/api/client';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';
import {isAuthRequired} from '@/lib/supabase/env';
import {DeskApi} from '@/lib/shared-desk/api';
import {DeskStorage, deskScope, type DeskLocalState} from '@/lib/shared-desk/storage';
import {BODY_LIMIT, bodyBytes, deskPath, itemTitle, matchingOperation, newOperation, type DeskCapabilities, type DeskDraft, type DeskItem, type DeskKind, type DeskOperation, type DeskProject, type DeskReply} from '@/lib/shared-desk/model';
import {FILE_ACCEPT, journal, uploadFile, verifiedDownload} from '@/lib/shared-desk/files';
import './shared-desk.css';

const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
const message = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
const when = (value: string) => new Intl.DateTimeFormat('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(value));
const bytes = (value = 0) => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB`;
type Identity = DeskCapabilities & {scope: string};
const blankDraft = (kind: 'CLIP' | 'MEMO'): DeskDraft => ({kind, title: '', body: '', projectId: ''});
type UploadJob = {id: string; file: File; status: string; percent: number; controller: AbortController; fileId?: string; retry?: DeskItem; failed?: boolean};

/** A new authenticated identity unmounts the previous workspace before its local data can render. */
export default function SharedDeskPage() {
  const [identity, setIdentity] = useState<Identity | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const auth = createSupabaseBrowserClient(); let alive = true, generation = 0, authEvents = 0, resolvedOwner: string | null = null, lastOwner: string | undefined;
    const capabilityKey = (owner: string) => 'pos.shared-desk.capability.' + JSON.stringify([apiOrigin, process.env.NEXT_PUBLIC_APP_ENV ?? '', owner]);
    const resolve = async (owner?: string, force = false) => {
      lastOwner = owner;
      const ownerKey = owner ?? 'local-development';
      if (!force && resolvedOwner === ownerKey) return;
      resolvedOwner = null;
      const request = ++generation; setIdentity(null); setError('');
      try {
        if (isAuthRequired() && !owner) throw new Error('POS에 로그인한 뒤 공유 작업대를 열어주세요.');
        const caps = owner ? await apiClient.scoped<DeskCapabilities>(owner, '/api/shared-desk/capabilities') : await apiClient.get<DeskCapabilities>('/api/shared-desk/capabilities');
        if (!alive || request !== generation) return;
        if (!caps.ownerId || owner && caps.ownerId !== owner) throw new Error('로그인 계정과 작업대 소유자가 일치하지 않습니다.');
        resolvedOwner = ownerKey;
        if (owner) try {localStorage.setItem(capabilityKey(owner), JSON.stringify(caps));} catch { /* Metadata caching is optional; durable drafts use IndexedDB. */ }
        setIdentity({...caps, scope: deskScope(apiOrigin, caps.environment, caps.ownerId)});
      } catch (failure) {
        if (!alive || request !== generation) return;
        // Offline reads may reuse only a previously server-verified scope for the current auth owner.
        // A signed-out identity and an API authentication rejection never unlock another cache.
        if (owner && !(failure instanceof ApiError && [401, 403].includes(failure.status))) {
          try {
            const cached = JSON.parse(localStorage.getItem(capabilityKey(owner)) ?? 'null') as DeskCapabilities | null;
            if (cached?.ownerId === owner && typeof cached.environment === 'string' && typeof cached.enabled === 'boolean') {
              resolvedOwner = ownerKey; setIdentity({...cached, filesEnabled: false, scope: deskScope(apiOrigin, cached.environment, owner)}); return;
            }
          } catch { /* Missing/invalid metadata cannot unlock an unknown owner scope. */ }
        }
        setError(message(failure));
      }
    };
    const subscription = auth?.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      authEvents++; queueMicrotask(() => {if (alive) void resolve(session?.user.id);});
    }).data.subscription;
    const initialEvent = authEvents;
    if (auth) void auth.auth.getSession().then(({data, error}) => {if (alive && initialEvent === authEvents) void resolve(error ? undefined : data.session?.user.id);});
    else void resolve();
    const reconnect = () => {if (alive) void resolve(lastOwner, true);}; window.addEventListener('online', reconnect);
    return () => {alive = false; generation++; subscription?.unsubscribe(); window.removeEventListener('online', reconnect);};
  }, []);
  if (error) return <div className="sd-page"><h1>공유 작업대</h1><p role="alert">{error}</p><button onClick={() => window.location.reload()}>다시 연결</button></div>;
  if (!identity) return <div className="sd-page" role="status">공유 작업대에 연결 중…</div>;
  if (!identity.enabled) return <div className="sd-page"><span className="sd-eyebrow">WORK FLOW / SHARED SPACE</span><h1>공유 작업대</h1><div className="sd-empty">이 환경의 공유 작업대는 아직 활성화되지 않았습니다. 배포 검증 후 사용할 수 있습니다.</div></div>;
  return <DeskWorkspace key={identity.scope} identity={identity}/>;
}

function DeskWorkspace({identity}: {identity: Identity}) {
  const active = useRef(true), listRequest = useRef(0), selectionRequest = useRef(0), syncBusy = useRef(false), dispatchBusy = useRef(false), cursor = useRef<string | undefined>(undefined);
  const storage = useMemo(() => new DeskStorage(identity.scope), [identity.scope]);
  const api = useMemo(() => new DeskApi(identity.ownerId, storage, () => active.current), [identity.ownerId, storage]);
  const [kind, setKind] = useState<DeskKind>('CLIP'), [trash, setTrash] = useState(false), [search, setSearch] = useState(''), [query, setQuery] = useState(''), [project, setProject] = useState('');
  const [items, setItems] = useState<DeskItem[]>([]), [nextPage, setNextPage] = useState<string | null>(null), [selected, setSelected] = useState<DeskItem | null>(null), [replies, setReplies] = useState<DeskReply[]>([]);
  const [projects, setProjects] = useState<DeskProject[]>([]), [local, setLocal] = useState<DeskLocalState>({cache: [], drafts: {}, outbox: []});
  const [editor, setEditor] = useState<string | null>(null), [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [online, setOnline] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [lastSync, setLastSync] = useState('');
  const [copyFallback, setCopyFallback] = useState<string | null>(null), [confirmDelete, setConfirmDelete] = useState<DeskItem | null>(null), [saving, setSaving] = useState(false), [replySaving, setReplySaving] = useState(false), [downloadId, setDownloadId] = useState('');
  const [jobs, setJobs] = useState<UploadJob[]>([]), jobsRef = useRef<UploadJob[]>([]), uploadQueue = useRef<(() => Promise<void>)[]>([]), uploadCount = useRef(0), uploadInput = useRef<HTMLInputElement>(null), retryFile = useRef<DeskItem | undefined>(undefined), downloadAbort = useRef<AbortController | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<DeskItem[]>([]);
  const currentSelection = useRef<DeskItem | null>(null), currentLocal = useRef(local);
  useEffect(() => {currentSelection.current = selected;}, [selected]);
  useEffect(() => {currentLocal.current = local;}, [local]);
  useEffect(() => {const timeout = setTimeout(() => setQuery(search), 250); return () => clearTimeout(timeout);}, [search]);
  const acceptLocal = useCallback((value: DeskLocalState) => {if (active.current) {currentLocal.current = value; setLocal(value);}}, []);
  const reloadLocal = useCallback(async () => {acceptLocal(await storage.read());}, [acceptLocal, storage]);
  const loadReplies = useCallback(async (id: string) => {
    const result = await api.replies(id);
    if (active.current && currentSelection.current?.id === id) setReplies(Array.isArray(result) ? result : result.items);
  }, [api]);
  const loadList = useCallback(async (append = false, page?: string | null) => {
    const request = ++listRequest.current;
    if (!append) setLoading(true);
    try {
      const result = await api.list(kind, query, project, append ? page : undefined, trash);
      if (!active.current || request !== listRequest.current) return;
      setItems(previous => append ? [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))] : result.items);
      setNextPage(result.nextCursor); setError('');
      await reloadLocal();
    } catch (failure) {
      if (!active.current || request !== listRequest.current) return;
      setError(message(failure));
      if ((!navigator.onLine || !(failure instanceof ApiError)) && !append && !trash) {
        const cached = (await storage.read()).cache.filter(item => item.kind === kind && !item.deletedAt && (!project || project === 'unlinked' ? !project || !item.projectId : item.projectId === project) && (!query || `${item.title ?? ''}\n${item.body ?? item.preview ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
        setItems(cached); setNextPage(null); setNotice('연결되지 않아 이 계정에 보관된 목록을 표시합니다. 새 입력과 초안은 유지됩니다.');
      }
    } finally {if (active.current && request === listRequest.current) setLoading(false);}
  }, [api, kind, project, query, reloadLocal, storage, trash]);
  const openItem = useCallback(async (item: DeskItem) => {
    const request = ++selectionRequest.current; currentSelection.current = item; setSelected(item); setReplies([]); setDetailLoading(true);
    try {
      const detail = await api.detail(item);
      if (!active.current || request !== selectionRequest.current) return;
      setSelected(detail); currentSelection.current = detail;
      if (item.kind === 'MEMO') await loadReplies(item.id);
    } catch (failure) {
      if (!active.current || request !== selectionRequest.current) return;
      const cached = (await storage.read()).cache.find(value => value.id === item.id);
      if (!navigator.onLine && cached?.body !== undefined) setSelected(cached);
      else setError(message(failure));
    } finally {if (active.current && request === selectionRequest.current) setDetailLoading(false);}
  }, [api, loadReplies, storage]);
  const refresh = useCallback(async () => {
    await loadList();
    const item = currentSelection.current;
    if (item && !trash) {
      try {const detail = await api.detail(item); if (active.current && currentSelection.current?.id === item.id) {setSelected(detail); currentSelection.current = detail; if (item.kind === 'MEMO') await loadReplies(item.id);}}
      catch (failure) {if (failure instanceof ApiError && failure.status === 410 && active.current) {setSelected(null); currentSelection.current = null;} else if (active.current) setError(message(failure));}
    }
  }, [api, loadList, loadReplies, trash]);
  const send = useCallback(async (intended: DeskOperation) => {
    const operation = matchingOperation((await storage.read()).outbox, intended) ?? intended;
    await storage.queue(operation); await reloadLocal();
    if (!navigator.onLine) {setNotice('오프라인: 입력을 이 계정의 전송 대기에 보관했습니다.'); return false;}
    try {await api.dispatch(operation); setNotice('서버에 저장했습니다.'); await reloadLocal(); await refresh(); return true;}
    catch (failure) {await reloadLocal(); setError(message(failure)); return false;}
  }, [api, refresh, reloadLocal, storage]);
  const flush = useCallback(async () => {
    if (dispatchBusy.current || !navigator.onLine || !active.current) return;
    dispatchBusy.current = true;
    try {
      for (const operation of (await storage.read()).outbox) {
        // File steps need a selected original File and their explicit workflow.
        if (operation.state !== 'pending' || operation.path.startsWith('/files/')) continue;
        try {await api.dispatch(operation);} catch (failure) {if (active.current) setError(message(failure)); break;}
      }
      await reloadLocal();
    } finally {dispatchBusy.current = false;}
  }, [api, reloadLocal, storage]);
  useEffect(() => {
    active.current = true; void reloadLocal().catch(failure => setError(message(failure)));
    void api.projects().then(value => {if (active.current) setProjects(value);}).catch(() => {});
    return () => {active.current = false; jobsRef.current.forEach(job => job.controller.abort()); downloadAbort.current?.abort();};
  }, [api, reloadLocal]);
  useEffect(() => {
    // The list remains server-backed; cached details are only an explicitly offline fallback.
    const start = setTimeout(() => void loadList(), 0); return () => clearTimeout(start);
  }, [loadList]);
  useEffect(() => {
    const sync = async () => {
      if (!active.current || document.visibilityState !== 'visible' || !navigator.onLine || syncBusy.current) return;
      syncBusy.current = true;
      try {
        let page = await api.changes(cursor.current), changed = page.changes.length > 0;
        while (page.hasMore && page.nextCursor) {page = await api.changes(page.nextCursor, page.highWater); changed ||= page.changes.length > 0;}
        const initial = !cursor.current; cursor.current = page.highWater;
        await flush(); if (changed || initial) await refresh();
        if (active.current) setLastSync(new Date().toISOString());
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 410) {cursor.current = undefined; await refresh();}
        else if (active.current) setError(message(failure));
      } finally {syncBusy.current = false;}
    };
    const reconnect = () => {setOnline(navigator.onLine); if (navigator.onLine) void sync();};
    const focus = () => {void sync();};
    const start = setTimeout(reconnect, 0);
    const timer = setInterval(focus, 10_000);
    window.addEventListener('online', reconnect); window.addEventListener('offline', reconnect); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => {clearTimeout(start); clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus);};
  }, [api, flush, refresh]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') {setEditor(null); setCopyFallback(null); setConfirmDelete(null);}};
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  const modalOpen = !!editor || copyFallback !== null || !!confirmDelete;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('.sd-dialog');
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {event.preventDefault(); first?.focus();}
    };
    document.addEventListener('keydown', trap);
    return () => {document.removeEventListener('keydown', trap); previous?.focus();};
  }, [modalOpen]);

  const draft = editor ? local.drafts[editor] : undefined;
  const setDraft = async (key: string, value: DeskDraft) => {
    // Keep controlled input/IME responsive while each IDB transaction durably records the event.
    acceptLocal({...currentLocal.current, drafts: {...currentLocal.current.drafts, [key]: value}});
    try {await storage.draft(key, value);} catch (failure) {setError(message(failure));}
  };
  const startEditor = async (item?: DeskItem) => {
    const nextKind = item?.kind === 'MEMO' ? 'MEMO' : kind === 'MEMO' ? 'MEMO' : 'CLIP';
    const key = item ? 'edit:' + item.id : 'new:' + nextKind;
    try {
      if (!currentLocal.current.drafts[key]) {
        let detail = item;
        if (item && item.body === undefined) detail = await api.detail(item);
        await setDraft(key, detail ? {kind: nextKind, title: detail.title ?? '', body: detail.body ?? '', projectId: detail.projectId ?? '', fileIds: detail.fileIds ?? [], itemId: detail.id, revision: detail.revision} : blankDraft(nextKind));
      }
      setEditor(key);
      if (nextKind === 'MEMO' && identity.filesEnabled) void api.list('FILE', '', '').then(page => {if (active.current) setReferenceFiles(page.items.filter(file => file.state === 'READY'));}).catch(() => {});
    } catch (failure) {setError(message(failure));}
  };
  const saveDraft = async (asNew = false) => {
    if (!draft || !editor || saving) return;
    if (!draft.body.trim()) {setError('본문을 입력해주세요.'); return;}
    if (bodyBytes(draft.body) > BODY_LIMIT) {setError('본문은 UTF-8 기준 1 MiB까지 저장할 수 있습니다.'); return;}
    setSaving(true);
    const id = asNew ? undefined : draft.itemId;
    const operation = newOperation(deskPath(draft.kind) + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', {title: draft.title || null, body: draft.body, projectId: draft.projectId || null, ...(draft.kind === 'MEMO' ? {fileIds: draft.fileIds ?? []} : {}), ...(id ? {expectedRevision: draft.revision} : {})});
    try {
      const unresolved = local.outbox.find(value => value.path === operation.path && value.method === operation.method && value.state !== 'conflict');
      if (!asNew && unresolved && !matchingOperation([unresolved], operation)) {setError('먼저 이전 전송의 결과를 확인해주세요. 전송 대기의 같은 요청 재시도를 사용하면 저장 여부를 확인합니다. 현재 입력은 초안에 보관했습니다.'); return;}
      const acknowledged = await send(operation);
      if (acknowledged && asNew && draft.itemId) {
        for (const conflict of (await storage.read()).outbox.filter(value => value.state === 'conflict' && value.path.endsWith('/' + draft.itemId))) await storage.acknowledge(conflict.operationId);
      }
      // An offline draft now belongs to its durable outbox entry; a failed/conflicted one remains editable.
      if (acknowledged || !navigator.onLine) {acceptLocal(await storage.draft(editor, null)); setEditor(null);}
    } catch (failure) {setError(message(failure));} finally {setSaving(false);}
  };
  const copy = async (item: DeskItem) => {
    try {
      const full = item.body !== undefined ? item : navigator.onLine ? await api.detail(item) : (await storage.read()).cache.find(value => value.id === item.id);
      if (full?.body === undefined) throw new Error('이 항목의 원문은 아직 기기에 보관되지 않았습니다. 연결 후 다시 열어주세요.');
      try {await navigator.clipboard.writeText(full.body); setNotice('원문 전체를 복사했습니다.');}
      catch {setCopyFallback(full.body);}
    } catch (failure) {setError(message(failure));}
  };
  const downloadText = (item: DeskItem) => {
    if (item.body === undefined) return;
    const url = URL.createObjectURL(new Blob([new TextEncoder().encode(item.body)], {type: 'text/plain;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = itemTitle(item).replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 100) + '.txt';
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); setNotice('줄바꿈을 포함한 원문 UTF-8 파일을 저장합니다.');
  };
  const mutate = async (item: DeskItem, action: 'pin' | 'delete' | 'restore') => {
    const path = action === 'restore' ? '/items/' + item.id + '/restore' : deskPath(item.kind) + '/' + item.id;
    const success = await send(newOperation(path, action === 'delete' ? 'DELETE' : action === 'restore' ? 'POST' : 'PATCH', {expectedRevision: item.revision, ...(action === 'pin' ? {pinned: !item.pinned} : {})}));
    if (success && action === 'delete') {setSelected(null); currentSelection.current = null;} setConfirmDelete(null);
  };
  const postReply = async () => {
    if (!selected || replySaving) return;
    const key = 'reply:' + selected.id, reply = local.drafts[key];
    if (!reply?.body.trim() || bodyBytes(reply.body) > BODY_LIMIT) {setError('답글은 비어 있지 않은 1 MiB 이하의 본문이어야 합니다.'); return;}
    setReplySaving(true);
    try {const acknowledged = await send(newOperation('/memos/' + selected.id + '/replies', 'POST', {body: reply.body})); if (acknowledged || !navigator.onLine) acceptLocal(await storage.draft(key, null));}
    finally {setReplySaving(false);}
  };
  const retryOperation = async (operation: DeskOperation) => {
    if (dispatchBusy.current) return;
    dispatchBusy.current = true;
    try {await api.dispatch(operation); await reloadLocal(); await refresh(); setNotice('전송을 확인했습니다.');}
    catch (failure) {await reloadLocal(); setError(message(failure));} finally {dispatchBusy.current = false;}
  };
  const cloneOperation = async (operation: DeskOperation) => {
    const body = typeof operation.body.body === 'string' ? operation.body.body : '';
    const key = 'recovered:' + operation.operationId;
    await setDraft(key, {kind: operation.path.startsWith('/memos') ? 'MEMO' : 'CLIP', title: typeof operation.body.title === 'string' ? operation.body.title : '', body, projectId: typeof operation.body.projectId === 'string' ? operation.body.projectId : ''}); setEditor(key);
  };
  function updateJob(id: string, patch: Partial<UploadJob>) {jobsRef.current = jobsRef.current.map(job => job.id === id ? {...job, ...patch} : job); if (active.current) setJobs(jobsRef.current);}
  function pumpUploads() {
    while (uploadCount.current < 3 && uploadQueue.current.length && active.current) {const work = uploadQueue.current.shift()!; uploadCount.current++; void work().finally(() => {uploadCount.current--; pumpUploads();});}
  }
  function addFiles(files: File[], retry?: DeskItem) {
    if (!identity.filesEnabled) {setError('파일 저장소가 아직 활성화되지 않았습니다.'); return;}
    const added = files.map(file => ({id: crypto.randomUUID(), file, status: '대기 중', percent: 0, controller: new AbortController(), retry}));
    jobsRef.current = [...jobsRef.current, ...added]; setJobs(jobsRef.current);
    for (const job of added) uploadQueue.current.push(async () => {
      if (job.controller.signal.aborted) return;
      try {
        await uploadFile(api, job.file, project && project !== 'unlinked' ? project : null, job.controller.signal,
          (status, percent, fileId) => updateJob(job.id, {status, percent, fileId}), job.retry);
        updateJob(job.id, {status: '서버 검증 완료', percent: 100}); await refresh();
      } catch (failure) {
        updateJob(job.id, {status: job.controller.signal.aborted ? '취소됨' : message(failure), failed: !job.controller.signal.aborted});
        if (job.controller.signal.aborted) {
          const id = jobsRef.current.find(value => value.id === job.id)?.fileId;
          if (id) try {const latest = await api.detail({kind: 'FILE', id}); await journal(api, newOperation('/files/' + id + '/cancel', 'POST', {expectedRevision: latest.revision})); await refresh();} catch {setError('전송은 중단했습니다. 서버 취소 상태를 새로고침해 확인해주세요.');}
        }
      } finally {await reloadLocal();}
    }); pumpUploads();
  }
  const download = async (item: DeskItem) => {
    downloadAbort.current?.abort(); downloadAbort.current = new AbortController(); setDownloadId(item.id);
    try {await verifiedDownload(api, item, downloadAbort.current.signal); setNotice('SHA-256 검증을 마쳤습니다. 브라우저 다운로드를 확인해주세요.');}
    catch (failure) {setError(message(failure));} finally {setDownloadId('');}
  };
  const chooseTab = (value: DeskKind) => {selectionRequest.current++; currentSelection.current = null; setSelected(null); setKind(value); setTrash(false);};
  const projectName = (id: string | null) => projects.find(value => value.id === id)?.title ?? (id ? '연결된 프로젝트' : '프로젝트 없음');
  const shownItems = kind === 'MEMO' && !trash ? [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : items;
  const replyKey = selected ? 'reply:' + selected.id : '';
  const isConflict = draft?.itemId && local.outbox.some(operation => operation.state === 'conflict' && operation.path.endsWith('/' + draft.itemId));

  return <main className="sd-page">
    <header className="sd-header"><div><span className="sd-eyebrow">WORK FLOW / SHARED SPACE</span><h1>공유 작업대</h1><p>텍스트, 파일, 짧은 메모를 기기 사이에서 빠르게 이어갑니다.</p></div><div className="sd-sync"><span>{!online ? '오프라인 · 보관된 항목' : local.outbox.length ? `${local.outbox.length}건 전송 대기` : lastSync ? `동기화 ${when(lastSync)}` : '연결 확인 중'}</span><button onClick={() => void refresh()} aria-label="공유 작업대 새로고침"><RefreshCw size={14}/> 새로고침</button></div></header>
    <nav className="sd-tabs" aria-label="공유 작업대 모듈">{([{kind: 'CLIP', label: '클립보드', Icon: Clipboard}, {kind: 'FILE', label: '파일 공유', Icon: Files}, {kind: 'MEMO', label: '메모 채팅', Icon: MessageSquare}] as const).map(tab => <button key={tab.kind} aria-current={!trash && kind === tab.kind ? 'page' : undefined} onClick={() => chooseTab(tab.kind)}><tab.Icon size={15}/>{tab.label}</button>)}<button className="sd-trash-tab" aria-current={trash ? 'page' : undefined} onClick={() => {setTrash(true); setSelected(null); currentSelection.current = null;}}><Trash2 size={14}/> 휴지통</button></nav>
    <div className="sd-announcement" aria-live="polite" role="status">{notice}</div>
    {error && <div className="sd-error" role="alert"><span>{error}</span><button onClick={() => {setError(''); void refresh();}}>다시 시도</button><button aria-label="오류 닫기" onClick={() => setError('')}><X size={14}/></button></div>}
    <div className="sd-toolbar"><label className="sd-search"><Search size={15}/><input aria-label="제목과 본문 검색" placeholder="제목이나 본문 검색…" value={search} disabled={trash} onChange={event => setSearch(event.target.value)}/></label>{!trash && <ProjectSelect projects={projects} value={project} onChange={setProject} filter/>}{!trash && kind !== 'FILE' && <button className="sd-primary" onClick={() => void startEditor()}><Plus size={15}/>{kind === 'CLIP' ? '새 클립' : '새 메모'}</button>}{trash && <span className="sd-hint">삭제 후 7일 이내 복구할 수 있습니다.</span>}</div>
    {Object.keys(local.drafts).length > 0 && <details className="sd-drafts"><summary>보관한 초안 {Object.keys(local.drafts).length}개</summary>{Object.entries(local.drafts).map(([key, saved]) => <div key={key}><span>{saved.title || saved.body.split("\n").find(line => line.trim())?.slice(0, 60) || "빈 초안"}</span><button onClick={() => {setEditor(key); if (saved.kind === "MEMO" && identity.filesEnabled) void api.list("FILE", "", "").then(page => setReferenceFiles(page.items.filter(file => file.state === "READY"))).catch(() => {});}}>{key.startsWith("reply:") ? "새 메모로 열기" : "계속 작성"}</button></div>)}</details>}{local.outbox.length > 0 && <details className="sd-outbox"><summary>전송 대기 · 실패 {local.outbox.length}건 — 내용은 이 계정에 보관됩니다.</summary>{local.outbox.map(operation => <div className="sd-outbox-row" key={operation.operationId}><div><strong>{operation.state === 'conflict' ? '확인 필요' : operation.state === 'failed' ? '전송 실패' : '전송 대기'}</strong><p>{operation.error ?? when(operation.operationCreatedAt)}</p>{typeof operation.body.body === 'string' && <pre>{operation.body.body.slice(0, 140)}</pre>}</div>{operation.state !== 'conflict' && <button disabled={!online} onClick={() => void retryOperation(operation)}>같은 요청 재시도</button>}{typeof operation.body.body === 'string' && <button onClick={() => void cloneOperation(operation)}>내용 열기 · 새 사본</button>}</div>)}</details>}
    {kind === 'FILE' && !trash && <><section className={'sd-dropzone' + (!identity.filesEnabled ? ' sd-disabled' : '')} onDragOver={event => {event.preventDefault();}} onDrop={event => {event.preventDefault(); if (identity.filesEnabled) addFiles([...event.dataTransfer.files]);}}><UploadCloud size={25}/><strong>{identity.filesEnabled ? '파일을 끌어놓거나 선택하세요' : '파일 저장소 연결 확인 중'}</strong><p>{identity.filesEnabled ? '파일당 100 MiB · 개인 1 GiB · 최대 3개 동시 전송' : '파일 업로드는 실제 비공개 저장소 검증 후 활성화됩니다.'}</p><button disabled={!identity.filesEnabled || !online} onClick={() => {retryFile.current = undefined; uploadInput.current?.click();}}>파일 선택</button><input ref={uploadInput} type="file" multiple accept={FILE_ACCEPT} className="sd-hidden" aria-label="공유 파일 선택" onChange={event => {addFiles([...(event.target.files ?? [])], retryFile.current); event.target.value = ''; retryFile.current = undefined;}}/></section>{jobs.length > 0 && <section className="sd-uploads" aria-label="파일 전송 상태">{jobs.map(job => <div key={job.id}><div><strong>{job.file.name}</strong><span role="status">{job.status} · {job.percent}%</span><progress max={100} value={job.percent}/></div>{!job.failed && !['서버 검증 완료', '취소됨'].includes(job.status) && <button onClick={() => {job.controller.abort(); updateJob(job.id, {status: '취소됨'});}}>취소</button>}{job.failed && <button onClick={() => {const id = job.fileId; if (id) void api.detail({kind: 'FILE', id}).then(item => {if (item.state === 'READY') {updateJob(job.id, {status: '서버 검증 완료', percent: 100, failed: false}); void refresh();} else addFiles([job.file], item);}).catch(failure => setError(message(failure))); else addFiles([job.file]);}}>재시도</button>}</div>)}</section>}</>}
    <section className={'sd-workspace' + (kind === 'FILE' || trash ? ' sd-full-list' : '')} aria-label={trash ? '휴지통' : kind === 'CLIP' ? '클립보드' : kind === 'MEMO' ? '메모 채팅' : '공유 파일'}>
      <div className="sd-list"><div className="sd-list-caption">{trash ? '복구 가능한 항목' : kind === 'MEMO' ? '메모 · 시간순' : '고정 먼저 · 최근 변경순'} <span>{items.length}개{nextPage ? '+' : ''}</span></div>{loading && !items.length ? <div className="sd-empty" role="status">불러오는 중…</div> : !items.length ? <div className="sd-empty"><strong>{query || project ? '검색 결과가 없습니다.' : trash ? '휴지통이 비어 있습니다.' : kind === 'FILE' ? '공유한 파일이 없습니다.' : kind === 'MEMO' ? '첫 메모를 남겨보세요.' : '자주 쓰는 텍스트를 저장해보세요.'}</strong><p>{query || project ? '검색어나 프로젝트 필터를 바꿔보세요.' : '프로젝트를 선택하지 않아도 저장할 수 있습니다.'}</p></div> : shownItems.map(item => <article key={item.id} className={'sd-row' + (selected?.id === item.id ? ' is-selected' : '')}>
        <button className="sd-row-title" onClick={() => {if (!trash && item.kind !== 'FILE') void openItem(item);}} disabled={trash || item.kind === 'FILE'}>{item.pinned && <Pin size={12}/>}<strong>{item.kind === 'FILE' ? item.displayName ?? itemTitle(item) : itemTitle(item)}</strong></button>
        {item.kind !== 'FILE' && <p className="sd-preview">{item.preview ?? item.body?.slice(0, 180)}</p>}
        <div className="sd-metadata"><span>{projectName(item.projectId)}</span><time dateTime={item.updatedAt}>{when(item.updatedAt)}</time>{item.kind === 'FILE' && <><span>{bytes(item.sizeBytes)}</span><span>{item.state === 'READY' ? '준비 완료' : item.state ?? '확인 중'}</span></>}</div>
        <div className="sd-actions">{trash ? <button onClick={() => void mutate(item, 'restore')}>복구</button> : <>{item.kind !== 'FILE' && <button onClick={() => void copy(item)}><Copy size={12}/>복사</button>}{item.kind === 'FILE' && item.state === 'READY' && <button disabled={downloadId === item.id || !online} onClick={() => void download(item)}><Download size={12}/>{downloadId === item.id ? '검증하며 다운로드…' : '다운로드'}</button>}{item.kind === 'FILE' && ['FAILED', 'UPLOADING', 'CANCELLED'].includes(item.state ?? '') && <button disabled={!identity.filesEnabled || !online} onClick={() => {retryFile.current = item; uploadInput.current?.click();}}>같은 파일 다시 선택</button>}{item.kind === 'FILE' && <ProjectSelect projects={projects} value={item.projectId ?? ''} onChange={projectId => void send(newOperation('/files/' + item.id, 'PATCH', {expectedRevision: item.revision, projectId: projectId || null}))}/>}<button aria-label={item.pinned ? '고정 해제' : '고정'} onClick={() => void mutate(item, 'pin')}>{item.pinned ? '고정 해제' : '고정'}</button>{item.kind === 'MEMO' && <button onClick={() => void openItem(item)}><MessageSquare size={12}/>답글{item.replyCount !== undefined ? ` ${item.replyCount}` : ''}</button>}<button onClick={() => setConfirmDelete(item)}>삭제</button></>}</div>
      </article>)}{nextPage && <button className="sd-more" disabled={loading} onClick={() => void loadList(true, nextPage)}><ChevronDown size={14}/> 더 보기</button>}</div>
      {!trash && kind !== 'FILE' && <aside className="sd-detail">{!selected ? <div className="sd-empty"><Clipboard size={26}/><strong>{kind === 'MEMO' ? '메모를 선택해 답글을 이어가세요.' : '클립을 선택하면 원문을 볼 수 있습니다.'}</strong><p>목록의 복사 버튼은 원문 전체를 복사합니다.</p></div> : <><div className="sd-detail-meta"><span>{projectName(selected.projectId)}</span><time dateTime={selected.updatedAt}>{when(selected.updatedAt)}</time></div><h2>{itemTitle(selected)}</h2><p className="sd-hint">revision {selected.revision} · {selected.body !== undefined ? `${bodyBytes(selected.body).toLocaleString()} bytes · 원문 전체` : '원문을 불러오는 중'}</p>{detailLoading ? <p role="status">원문을 불러오는 중…</p> : selected.body === undefined ? <p>원문을 연결 후 다시 불러와주세요.</p> : <pre className="sd-body">{selected.body}</pre>}<div className="sd-actions"><button className="sd-primary" disabled={selected.body === undefined} onClick={() => void copy(selected)}>원문 전체 복사</button><button disabled={selected.body === undefined} onClick={() => downloadText(selected)}>원문 UTF-8 저장</button><button disabled={detailLoading} onClick={() => void startEditor(selected)}>편집 · 프로젝트 연결</button><button onClick={() => setConfirmDelete(selected)}>삭제</button></div>{selected.kind === 'MEMO' && <section className="sd-thread">{selected.fileIds && selected.fileIds.length > 0 && <div className="sd-file-references"><strong>참조 파일</strong>{selected.fileIds.map((id, index) => <button key={id} disabled={!online || !!downloadId} onClick={() => void api.detail({id, kind: 'FILE'}).then(file => download(file)).catch(() => setError('삭제되었거나 사용할 수 없는 참조 파일입니다. 메모 본문은 보관됩니다.'))}>첨부 파일 {index + 1} 다운로드</button>)}<small>삭제된 참조 파일은 다운로드할 수 없습니다.</small></div>}<h3>답글</h3>{replies.length ? replies.map(reply => <article className="sd-reply" key={reply.id}><pre>{reply.body}</pre><time dateTime={reply.createdAt}>{when(reply.createdAt)}</time></article>) : <p>아직 답글이 없습니다.</p>}<label htmlFor="sd-reply-body">답글 작성</label><textarea id="sd-reply-body" rows={3} value={local.drafts[replyKey]?.body ?? ''} onChange={event => void setDraft(replyKey, {...blankDraft('MEMO'), body: event.target.value})}/><div className="sd-actions"><span className="sd-hint">입력은 초안으로 보관됩니다.</span><button className="sd-primary" disabled={replySaving || !local.drafts[replyKey]?.body.trim()} onClick={() => void postReply()}>{replySaving ? '전송 중…' : '답글 전송'}</button></div></section>}</>}</aside>}
    </section>
    {kind === 'MEMO' && !trash && <div className="sd-composer-dock"><span>빠르게 메모를 남기고 한 단계 답글로 이어갑니다.</span><button className="sd-primary" onClick={() => void startEditor()}><Plus size={15}/> 메모 작성</button></div>}
    {downloadId && <div className="sd-download-status" role="status">파일을 내려받아 무결성을 확인하고 있습니다. <button onClick={() => downloadAbort.current?.abort()}>다운로드 취소</button></div>}<footer className="sd-footer">개인 비공개 작업대 · 삭제 항목 7일 보관 · 입력 초안과 전송 대기는 이 브라우저의 로그인 계정별로 보관됩니다.</footer>
    {editor && draft && <div className="sd-dialog-backdrop"><section className="sd-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-edit-title"><header><h2 id="sd-edit-title">{draft.itemId ? '편집' : '새 ' + (draft.kind === 'CLIP' ? '클립' : '메모')}</h2><button aria-label="초안 보관하고 닫기" onClick={() => setEditor(null)}><X size={18}/></button></header><p>프로젝트 없이도 저장할 수 있습니다. 닫으면 입력을 초안으로 보관합니다.</p>{draft.kind === 'CLIP' && <label>제목 <span className="sd-hint">선택</span><input aria-label="제목" autoFocus value={draft.title} maxLength={200} placeholder="비워두면 첫 줄을 제목으로 사용합니다" onChange={event => void setDraft(editor, {...draft, title: event.target.value})}/></label>}<label>본문<textarea aria-label="본문" autoFocus={draft.kind === 'MEMO'} rows={12} value={draft.body} spellCheck={false} onChange={event => void setDraft(editor, {...draft, body: event.target.value})}/></label><div className="sd-editor-meta"><ProjectSelect projects={projects} value={draft.projectId} onChange={value => void setDraft(editor, {...draft, projectId: value})}/><span>{bytes(bodyBytes(draft.body))} / 1 MiB</span></div>{draft.kind === 'MEMO' && identity.filesEnabled && <fieldset className="sd-attachment-picker"><legend>공유 파일 참조 · 최대 10개</legend>{referenceFiles.length === 0 && <span className="sd-hint">준비 완료된 파일이 없습니다.</span>}{referenceFiles.map(file => <label key={file.id}><input type="checkbox" checked={draft.fileIds?.includes(file.id) ?? false} disabled={!draft.fileIds?.includes(file.id) && (draft.fileIds?.length ?? 0) >= 10} onChange={event => void setDraft(editor, {...draft, fileIds: event.target.checked ? [...(draft.fileIds ?? []), file.id] : draft.fileIds?.filter(id => id !== file.id)})}/>{file.displayName ?? itemTitle(file)}</label>)}{draft.fileIds?.filter(id => !referenceFiles.some(file => file.id === id)).map(id => <label key={id}><input type="checkbox" checked onChange={() => void setDraft(editor, {...draft, fileIds: draft.fileIds?.filter(value => value !== id)})}/>이전에 연결한 파일 · {id.slice(0, 8)}</label>)}</fieldset>}{isConflict && <div className="sd-error" role="alert">다른 기기에서 변경했습니다. 입력은 유지했습니다. 최신 원문과 비교한 뒤 새 사본으로 저장할 수 있습니다.</div>}<div className="sd-actions sd-dialog-actions"><button onClick={() => setEditor(null)}>초안 보관하고 닫기</button>{draft.itemId && <button onClick={() => void saveDraft(true)} disabled={saving}>새 사본으로 저장</button>}<button className="sd-primary" disabled={saving || !!isConflict || !draft.body.trim() || bodyBytes(draft.body) > BODY_LIMIT} onClick={() => void saveDraft()}>{saving ? '저장 중…' : online ? '저장' : '전송 대기에 보관'}</button></div></section></div>}
    {copyFallback !== null && <div className="sd-dialog-backdrop"><section className="sd-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-copy-title"><header><h2 id="sd-copy-title">원문을 직접 복사해주세요</h2><button aria-label="복사 창 닫기" onClick={() => setCopyFallback(null)}><X size={18}/></button></header><p>클립보드 권한을 사용할 수 없습니다. 선택된 원문 전체를 Ctrl+C 또는 기기 복사 메뉴로 복사해주세요.</p><textarea aria-label="복사할 원문 전체" readOnly rows={14} value={copyFallback} ref={element => {element?.focus(); element?.select();}}/><button onClick={() => setCopyFallback(null)}>닫기</button></section></div>}
    {confirmDelete && <div className="sd-dialog-backdrop"><section className="sd-dialog sd-confirm" role="dialog" aria-modal="true" aria-labelledby="sd-delete-title"><h2 id="sd-delete-title">휴지통으로 이동할까요?</h2><p>{itemTitle(confirmDelete)}{confirmDelete.kind === 'MEMO' ? ' — 답글도 함께 이동합니다.' : ''}</p><p>7일 이내 복구할 수 있습니다.</p><div className="sd-actions"><button autoFocus onClick={() => setConfirmDelete(null)}>취소</button><button className="sd-danger" onClick={() => void mutate(confirmDelete, 'delete')}>휴지통으로 이동</button></div></section></div>}
  </main>;
}

function ProjectSelect({projects, value, onChange, filter = false}: {projects: DeskProject[]; value: string; onChange: (value: string) => void; filter?: boolean}) {
  return <select aria-label={filter ? '프로젝트 필터' : '프로젝트 연결'} value={value} onChange={event => onChange(event.target.value)}><option value="">{filter ? '모든 프로젝트' : '프로젝트 없음'}</option>{filter && <option value="unlinked">프로젝트 없음</option>}{projects.filter(project => !project.archivedAt || project.id === value).map(project => <option key={project.id} value={project.id}>{project.emoji ? project.emoji + ' ' : ''}{project.title}</option>)}{value && value !== 'unlinked' && !projects.some(project => project.id === value) && <option value={value}>연결된 프로젝트</option>}</select>;
}
