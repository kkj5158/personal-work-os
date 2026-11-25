"use client";

import {Fragment, useEffect, useId, useRef, useState} from 'react';
import Link from 'next/link';
import {Archive, ArrowRight, CircleHelp, History, Inbox, RefreshCw, Search} from 'lucide-react';
import {ApiError} from '@/lib/api/client';
import type {AiItem} from '@/lib/money/ai';
import {moneyAmount} from '@/lib/money/accounts';
import {persistReviewCommand, storedReviewCommands, type StoredReviewCommand, type ReviewSubmission} from '@/lib/money/reviewRecovery';
import {affectedBy} from '@/lib/money/cache';
import {reviewReasons, ignoredReasons} from '@/lib/money/meaning';
import {moneyApi as api, seoul} from '@/lib/money/model';
import {REVIEW_BATCH_LIMIT, reviewActionLabel, reviewCurrency, reviewDirection, reviewKey, reviewLedgerHref, reviewMerchant, removeConfirmedReviewRows, type ReviewAction, type ReviewOutcome, type ReviewPage, type ReviewPreview, type ReviewPreviewRow} from '@/lib/money/reviewWorkflow';
import {useMoneyCache, useMoneyViewState} from './MoneyDataProvider';
import {MoneyNavigationTabs} from './MoneyNavigationTabs';
import {ReviewFinancialInline} from './MoneyReviewFinancialInline';
import {ReviewResults} from './MoneyReviewResults';
import {useMoneyData, LoadState} from './MoneyWebData';
import {Pagination, type Props} from './MoneyWebViews';
import './money-notification-review.css';

const tabs = [{value: 'PENDING', label: '검토 대기', icon: Inbox}, {value: 'DEFERRED', label: '제외', icon: Archive}, {value: 'COMPLETED', label: '처리 이력', icon: History}] as const;
const move = 'MOVE_TO_BOOKKEEPING';
const historyLabels: Record<string, string> = {MOVE_TO_BOOKKEEPING: '거래 등록', NON_TRANSACTION: '비거래 처리', DEFER: '제외', REOPEN: '복원', UNDO: '실행 취소'};
const reasonLabel = (reason: string) => historyLabels[reason] ?? reviewReasons[reason] ?? ignoredReasons[reason] ?? reason;
const errorText = (error: unknown) => error instanceof Error ? error.message : '처리하지 못했습니다.';
const eligible = (row: AiItem) => row.moveToBookkeepingEligible === true && !!row.admissionFingerprint;
type Command = StoredReviewCommand & {retryAllowed?: boolean; path: string; generation: number; skipped: ReviewOutcome['items']; snapshots: Record<string, ReviewPreviewRow>; applied: string[]};
type Receipt = {action: ReviewAction; value: ReviewOutcome; snapshots: Command['snapshots']};

export function NotificationReview(p: Props & {onPendingCount?: (count: number) => void; laneState?: 'PENDING_NOTIFICATION'|'FAILED_NOTIFICATION'|'DEFERRED'|'COMPLETED'}) {
  const tabsId = useId(), cache = useMoneyCache();
  const [tabState, setState] = useMoneyViewState('notice-review-state', () => 'PENDING');
  const queryState=p.laneState??tabState;
  const state=queryState==='PENDING_NOTIFICATION'||queryState==='FAILED_NOTIFICATION'?'PENDING':queryState;
  const [search, setSearch] = useMoneyViewState('notice-review-search', () => '');
  const [account, setAccount] = useMoneyViewState('notice-review-account', () => '');
  const [reason, setReason] = useMoneyViewState('notice-review-reason', () => '');
  const [offset, setOffset] = useMoneyViewState('notice-review-offset-'+queryState, () => 0);
  const [ids, setIds] = useMoneyViewState<string[]>('notice-review-ids-'+queryState, () => []);
  const [requests, setRequests] = useMoneyViewState<Command[]>('notice-review-commands', () => []);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const stored = storedReviewCommands(cache.preferenceOwner);
    if (stored.length) setRequests(old => [...old, ...stored.filter(c => !old.some(existing=>existing.requestId===c.requestId))
      .map(c => ({...c, path:'', generation:cache.scopeSnapshot(), skipped:[], snapshots:{}, applied:[]}))]);
  }, [cache, setRequests]);
  const [receipt, setReceipt] = useMoneyViewState<Receipt | null>('notice-review-receipt', () => null);
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manualId,setManualId]=useState<string|null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(''), [rowErrors, setRowErrors] = useState<Record<string,string>>({});
  const [working, setWorking] = useState<string[]>([]);
  const locks = useRef(new Set<string>()), network = useRef(new Set<string>()), preparingLock = useRef(false), epoch = useRef(0);
  const q = new URLSearchParams({scope: 'GATE0', state:queryState, search, limit: '50', offset: String(offset)});
  if (account) q.set('accountId', account);
  if (reason) q.set('reason', reason);
  const path = '/ai/workbench?' + q;
  const list = useMoneyData<ReviewPage>(path), history = state === 'COMPLETED';
  // The legacy workbench accepts unknown query parameters. Do not offer Gate 0 commands on that projection.
  const page = list.data?.counts ? list.data : null;
  const pendingCount = page?.counts?.PENDING, onPendingCount = p.onPendingCount;
  useEffect(() => {if (pendingCount !== undefined) onPendingCount?.(pendingCount);}, [pendingCount, onPendingCount]);
  const rows = page?.items ?? [];
  const hidden = ids.filter(id => !rows.some(row => reviewKey(row) === id)).length;
  const actions: ReviewAction[] = state === 'DEFERRED' ? ['REOPEN'] : [move, 'DEFER'];
  const hasPendingCommand = (key: string) => requests.some(command => command.keys.includes(key));
  const isLocked = (key: string) => locks.current.has(key) || hasPendingCommand(key);
  useEffect(() => {
    if (!page || list.loading) return;
    const last = Math.floor(Math.max(0, page.total - 1) / 50) * 50;
    if (offset > last) setOffset(last);
  }, [page, list.loading, offset, setOffset]);

  function select(next: string[]) {
    epoch.current++;
    setPreview(null);
    const unique = [...new Set(next)];
    if (unique.length > REVIEW_BATCH_LIMIT) {setError('한 번에 10,000건까지 선택할 수 있습니다. 필터를 좁혀 주세요.'); return;}
    setIds(unique);
  }
  function change(fn: () => void) {
    if (p.changeContext?.() === false) return;
    fn(); setOffset(0); select([]); setExpanded(null); setError('');
  }
  function release(command: Command) {
    persistReviewCommand(cache.preferenceOwner, command.requestId);
    command.keys.forEach(key => locks.current.delete(key));
    setRequests(old => old.filter(item => item.requestId !== command.requestId));
  }
  function showFailure(keys: string[], message: string) {
    setRowErrors(old => ({...old, ...Object.fromEntries(keys.map(key => [key, message]))}));
  }
  function apply(value: ReviewOutcome, command: Command) {
    if (command.generation !== cache.scopeSnapshot()) return;
    if (value.requestId !== command.requestId) throw Error('원래 요청과 다른 처리 결과입니다.');
    const results = [...value.items, ...command.skipped];
    const saved = value.items.filter(row => row.status === 'SAVED');
    const fresh = saved.filter(row => !command.applied.includes(reviewKey(row)));
    if (fresh.length) {
      cache.update<ReviewPage>(command.path, page => removeConfirmedReviewRows(page, fresh));
      setIds(old => old.filter(key => !saved.some(row => reviewKey(row) === key)));
      // Refill the active offset before the next page is visited. History is a distinct RAW count.
      cache.invalidate(key => key.startsWith('/ai/workbench?') || key.startsWith('/review') || key.startsWith('/overview') || key === '/connection-status' ||
        (command.action === move && affectedBy('transaction', key)));
    }
    setRowErrors(old => {
      const next = {...old};
      for (const row of results) {
        if (row.status === 'SAVED') delete next[reviewKey(row)];
        else next[reviewKey(row)] = row.message || '처리 결과를 확인해 주세요.';
      }
      return next;
    });
    setReceipt({action: command.action, value: {...value, items: results}, snapshots: command.snapshots});
    if (value.completed) release(command);
    else setRequests(old => old.map(item => item.requestId === command.requestId ? {...item, applied: [...item.applied, ...fresh.map(reviewKey)]} : item));
  }
  async function run(command: Command, operation: () => Promise<ReviewOutcome>, recovery = false) {
    if (network.current.has(command.requestId)) return;
    network.current.add(command.requestId);
    setWorking(old => [...old, command.requestId]);
    try {apply(await operation(), command);}
    catch (e) {
      if (command.generation !== cache.scopeSnapshot()) return;
      const rejected = !recovery && e instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(e.status);
      const message = rejected ? errorText(e) : '결과 미확인 · 원래 요청의 결과를 조회하세요.';
      showFailure(command.keys, message);
      if (rejected) release(command);
      if (recovery) {
        const absent = e instanceof ApiError && e.status === 404;
        setRequests(old => old.map(c => c.requestId === command.requestId ? {...c, retryAllowed:absent} : c));
        setError(absent ? '서버가 원래 요청을 찾지 못했습니다. 같은 요청으로 재시도할 수 있습니다.' : errorText(e) + ' 원래 요청 ID를 유지합니다.');
      }
    } finally {
      network.current.delete(command.requestId);
      setWorking(old => old.filter(id => id !== command.requestId));
    }
  }
  function send(command: Command) {
    const {requestId, action, submission} = command;
    if (submission.kind === 'batch') return api.post<ReviewOutcome>('/review/batches/execute', {requestId, previewId:submission.previewId});
    return api.post<ReviewOutcome>('/review/batches/single', {requestId, action, id:submission.id, version:submission.version,
      ...(action === move ? {admissionFingerprint:submission.admissionFingerprint} : {})});
  }
  function submit(action: ReviewAction, sources: ReviewPreviewRow[], submission: ReviewSubmission) {
    const targets = sources.filter(row => row.eligible).map(reviewKey);
    if (!targets.length || targets.some(isLocked)) return;
    const command: Command = {requestId: crypto.randomUUID(), keys: targets, action, path, submission, generation: cache.scopeSnapshot(), applied: [],
      snapshots: Object.fromEntries(sources.map(row => [reviewKey(row), row])),
      skipped: sources.filter(row => !row.eligible).map(row => ({id: row.id, kind: row.kind, status: 'SKIPPED', message: row.exclusionReason || row.nextAction}))};
    targets.forEach(key => locks.current.add(key));
    setRequests(old => [...old, command]); setError(''); setPreview(null); epoch.current++;
    if (!persistReviewCommand(cache.preferenceOwner, command.requestId, command)) setError('브라우저에서 요청 ID를 보관할 수 없습니다. 결과를 확인할 때까지 이 탭을 유지해 주세요.');
    void run(command, () => send(command));
  }
  function single(action: ReviewAction, row: AiItem) {
    if (row.kind !== 'RAW' || history || action === move && !eligible(row)) return;
    const snapshot: ReviewPreviewRow = {...row, eligible: true, exclusionReason: null, nextAction: '', commandGroup: 'RAW'};
    submit(action, [snapshot], {kind:'single', id:row.id, version:row.version,
      ...(action === move ? {admissionFingerprint:row.admissionFingerprint!} : {})});
  }
  async function prepare(action: ReviewAction, wholeFilter = false) {
    if (preparingLock.current || !wholeFilter && (!ids.length || ids.some(isLocked))) return;
    const currentEpoch = epoch.current, generation = cache.scopeSnapshot();
    preparingLock.current = true; setPreparing(true); setPreview(null); setError('');
    try {
      const value = await api.post<ReviewPreview>('/review/batches/preview', {gate0: true, state:queryState, search, accountId: account || null, reason: reason || null,
        scope: wholeFilter ? 'FILTER' : 'SELECTED', action, items: wholeFilter ? [] : ids.map(key => ({kind: 'RAW', id: key.slice(4)}))});
      if (currentEpoch !== epoch.current || generation !== cache.scopeSnapshot()) return;
      if (wholeFilter) select([...ids, ...value.items.map(reviewKey)]);
      else setPreview(value);
    } catch (e) {if (generation === cache.scopeSnapshot()) setError(errorText(e));}
    finally {preparingLock.current = false; setPreparing(false);}
  }
  async function undo(eventId: string) {
    if (network.current.has(eventId)) return;
    const generation = cache.scopeSnapshot();
    network.current.add(eventId); setWorking(old => [...old, eventId]); setError('');
    try {
      await api.post('/ai/events/' + eventId + '/undo', {});
      if (generation !== cache.scopeSnapshot()) return;
      cache.mutate('ai');
      setReceipt(old => old ? {...old, value: {...old.value, items: old.value.items.map(row => row.eventId === eventId ? {...row, status: 'UNDONE', canUndo: false} : row)}} : null);
    } catch (e) {setError(errorText(e));}
    finally {network.current.delete(eventId); setWorking(old => old.filter(id => id !== eventId));}
  }
  const chosenBusy = preparing || ids.some(hasPendingCommand);
  const allChecked = rows.length > 0 && rows.every(row => ids.includes(reviewKey(row)));
  const singleResult = receipt?.value.items.length === 1 ? receipt.value.items[0] : null;
  return <section className="money-notice-review" aria-label="검토 필요 알림 작업함">
    {!p.laneState&&<div className="money-notice-stats">{tabs.map(({value, label, icon: Icon}) => <div key={value}><span>{label}</span><strong>{page?.counts?.[value]?.toLocaleString('ko-KR') ?? '—'}</strong><Icon aria-hidden="true" size={21}/></div>)}</div>}
    <p className="money-notice-guide"><CircleHelp size={17} aria-hidden="true"/><span><b>거래 등록</b>으로 원본 알림을 등록합니다. 금융 의미가 확정된 거래는 가계부에 표시됩니다.</span></p>
    <section className="money-notice-inbox" aria-label="알림 분류함"><h2>알림 분류함</h2>
    {!p.laneState&&<MoneyNavigationTabs id={tabsId} label="검토 상태" items={tabs.map(({value,label}) => ({value,label}))} selected={state} onSelect={value => change(() => setState(value))}/>}
    <div id={tabsId+'-panel'} role={p.laneState?undefined:'tabpanel'} aria-labelledby={p.laneState?undefined:tabsId+'-tab-'+state} tabIndex={0}>
    <div className="money-notice-filters"><label><Search size={16} aria-hidden="true"/><input type="search" aria-label="거래처·알림 검색" placeholder="거래처·알림 검색" value={search} onChange={e => change(() => setSearch(e.target.value))}/></label>
      <select aria-label="검토 계좌" value={account} onChange={e => change(() => setAccount(e.target.value))}><option value="">전체 계좌</option>{p.accounts.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
      <select aria-label="검토 사유" value={reason} onChange={e => change(() => setReason(e.target.value))}><option value="">전체 검토 사유</option>{[...new Set([...(page?.reasons ?? []), ...(reason ? [reason] : [])])].map(v => <option key={v} value={v}>{reasonLabel(v)}</option>)}</select>
      <button className="money-notice-refresh" aria-label="새로고침" title="새로고침" onClick={() => {epoch.current++; setPreview(null); cache.invalidate(key=>key.startsWith('/ai/workbench?'));}}><RefreshCw size={16}/></button></div>
    {!history && <div className="money-notice-toolbar" aria-label="선택 항목 일괄 처리"><div>
      <input type="checkbox" aria-label="현재 페이지 전체 선택" checked={allChecked} disabled={!rows.length} ref={node => {if(node) node.indeterminate = !allChecked && rows.some(row => ids.includes(reviewKey(row)));}} onChange={e => select(e.target.checked ? [...ids, ...rows.map(reviewKey)] : ids.filter(key => !rows.some(row => reviewKey(row) === key)))}/>
      <strong>{ids.length ? '선택 '+ids.length+'건' : '빠른 일괄 처리'}</strong><small>{ids.length ? '현재 화면 밖 '+hidden+'건' : '원하는 알림을 선택하세요.'}</small>
      {!!page && page.total > rows.length && <button disabled={preparing || page.total > REVIEW_BATCH_LIMIT} onClick={() => void prepare(state === 'DEFERRED' ? 'REOPEN' : 'DEFER', true)}>필터 결과 전체 선택 ({page.total}건)</button>}</div>
      {!!ids.length && <div>{actions.map(action => <button key={action} disabled={chosenBusy} className={action === move ? 'money-primary' : ''} onClick={() => void prepare(action)}>선택 {reviewActionLabel(action)}</button>)}<button onClick={() => select([])}>선택 해제</button></div>}</div>}
    <LoadState loading={list.loading} error={list.error || error || (list.data && !page ? '검토 목록의 버전을 확인할 수 없습니다. 새로고침해 주세요.' : '')} lastSuccessAt={list.lastSuccessAt} hideLastChecked/>
    {preparing && <p className="money-notice-message" role="status">처리 범위 확인 중…</p>}
    {requests.map(command => <div key={command.requestId} className="money-notice-recovery" role="status">{reviewActionLabel(command.action)} · {command.keys.length}건 {working.includes(command.requestId) ? '처리 중…' : <><span>결과 확인 필요</span><button onClick={() => void run(command, () => api.get('/review/batches/outcomes/' + command.requestId), true)}>원래 요청 결과 조회</button>{command.retryAllowed && <button onClick={() => void run(command, () => send(command))}>같은 요청으로 재시도</button>}</>}</div>)}
    {preview && <BatchPreview value={preview} p={p} close={() => setPreview(null)} busy={preview.items.some(r => hasPendingCommand(reviewKey(r)))} execute={() => submit(preview.action, preview.items, {kind:'batch', previewId:preview.previewId})}/>}
    {receipt && <div className="money-notice-results">{singleResult ? <div className="money-notice-receipt" role="status"><strong>{reviewActionLabel(receipt.action)} · {singleResult.status === 'SAVED' ? '완료' : singleResult.status === 'UNDONE' ? '취소 완료' : singleResult.message || '처리 결과 확인 필요'}</strong>{singleResult.transactionId && <a href={reviewLedgerHref(singleResult.transactionId)}>가계부에서 보기</a>}{singleResult.status === 'SAVED' && singleResult.canUndo && singleResult.eventId && <button disabled={working.includes(singleResult.eventId)} onClick={() => void undo(singleResult.eventId!)}>실행 취소</button>}</div> :
      <details open><summary>처리 결과 · 성공 {receipt.value.items.filter(r => r.status === 'SAVED').length}건 / 전체 {receipt.value.items.length}건</summary><ReviewResults outcome={receipt.value} snapshots={receipt.snapshots} accounts={p.accounts} disabled={!!working.length} onRecover={()=>{const c=requests.find(c=>c.requestId===receipt.value.requestId);if(c)void run(c,()=>api.get('/review/batches/outcomes/'+c.requestId),true);}} onUndo={id=>void undo(id)}/></details>}</div>}
    <table className="money-notice-ledger"><thead><tr><th scope="col"><span className="sr-only">선택</span></th><th scope="col">거래처·알림</th><th scope="col">금액</th><th scope="col">내 계좌·방향</th><th scope="col">검토 사유</th><th scope="col">처리</th></tr></thead><tbody>{rows.map(row => {
      const key = reviewKey(row), locked = hasPendingCommand(key), blocked = !eligible(row), open = expanded === key, detailId = tabsId + '-detail-' + row.id;
      const merchant = reviewMerchant(row), title = merchant === '거래처 미확인' ? row.title || merchant : merchant;
      const direction = reviewDirection(row);
      return <Fragment key={key}><tr className="money-notice-record" aria-busy={locked} data-row-id={row.id}>
        <td className="notice-check">{!history && <input type="checkbox" checked={ids.includes(key)} aria-label={title+' 선택'} onChange={e => select(e.target.checked ? [...ids,key] : ids.filter(id => id !== key))}/>}</td>
        <td className="notice-title"><strong title={title}>{title}</strong><small>{merchant === title ? row.title : merchant}</small><time dateTime={row.occurredAt}>{seoul(row.occurredAt).replace('T',' ')}</time></td>
        <td className="notice-amount">{row.amount == null ? '금액 정보 없음' : (direction === '출금' ? '−' : direction === '입금' ? '+' : '')+moneyAmount(row.amount, reviewCurrency(row))}</td>
        <td className="notice-account">{p.accounts.find(a => a.id === row.accountId)?.displayName || '계좌 미지정'}<small>{direction}</small></td>
        <td className="notice-reason">{reasonLabel(row.reason)}{!history && state === 'PENDING' && blocked && <small>거래 근거 확인</small>}</td>
        <td className="notice-actions"><div className="money-notice-row-actions">{history ? <><span>{row.transactionId ? '거래 등록' : historyLabels[row.reason] ?? '처리됨'}</span>{row.transactionId && <a href={reviewLedgerHref(row.transactionId)}>가계부에서 보기</a>}{row.canUndo && row.eventId && <button disabled={working.includes(row.eventId)} onClick={() => void undo(row.eventId!)}>실행 취소</button>}</> :
        <RowActions actions={actions} locked={locked} blocked={blocked} row={row} onAction={single}/>}
        {state==='PENDING'&&row.kind==='RAW'&&row.lane==='FORMAT'&&<button disabled={locked} id={detailId+"-manual"} aria-expanded={manualId===row.id} onClick={()=>setManualId(manualId===row.id?null:row.id)}>직접 확인하여 등록</button>}
        <button className="notice-detail-button" aria-controls={detailId} aria-expanded={open} onClick={() => setExpanded(open ? null : key)}>{open ? '접기' : '상세'}</button></div>
        {rowErrors[key] && <p className="money-notice-inline-error" role="alert">{rowErrors[key]}</p>}</td></tr>
        {manualId===row.id&&state==='PENDING'&&<tr><td colSpan={6}><ReviewFinancialInline row={row} accounts={p.accounts} categories={p.categories} disabled={locked} onCancel={()=>{setManualId(null);document.getElementById(detailId+"-manual")?.focus();}} onSaved={()=>{cache.mutate('transaction');cache.mutate('reviewItem');cache.invalidate(key=>key===path);}}/></td></tr>}
        {open && <tr id={detailId} className="notice-detail"><td colSpan={6}><RowEvidence row={row}/></td></tr>}</Fragment>;
    })}</tbody></table>
    {!rows.length && !list.loading && !list.error && page && <p className="money-notice-empty"><Inbox size={24} aria-hidden="true"/><b>표시할 항목이 없습니다</b>검색 조건을 바꾸거나 다른 상태 탭을 확인하세요.</p>}
    <Pagination total={page?.total ?? 0} offset={offset} onChange={value => {if(p.changeContext?.() !== false){epoch.current++; setPreview(null); setExpanded(null); setOffset(value);}}}/>
    </div></section>
  </section>;
}

function RowActions({actions,locked,blocked,row,onAction}:{actions:ReviewAction[];locked:boolean;blocked:boolean;row:AiItem;onAction:(action:ReviewAction,row:AiItem)=>void}){
  return actions.map(action => <button key={action} className={action === move && !blocked ? 'money-primary' : ''} disabled={locked || action === move && blocked} title={action === move && blocked ? row.moveToBookkeepingBlockReason || '거래 근거 확인 필요' : undefined} onClick={() => onAction(action,row)}>{action === move && blocked ? '등록 불가' : <>{action === move && <ArrowRight size={14} aria-hidden="true"/>}{reviewActionLabel(action)}</>}</button>);
}

function RowEvidence({row}: {row: AiItem}) {
  const raw = useMoneyData<{sourcePackage:string;maskedTitle:string;maskedBody:string;missingFields:string[];existingSourceLinks:number;previousAttempt:{id?:string};currentParser:{parserVersion?:string}}>('/review/owner/'+row.id+'/diagnostic');
  return <section aria-label="원문 알림 및 처리 근거"><h3>원문 알림 및 처리 근거</h3>
    <LoadState loading={raw.loading} error={raw.error} hideLastChecked/>
    <dl>{raw.data && <><dt>원본 출처</dt><dd>{raw.data.sourcePackage}</dd><dt>원문 알림</dt><dd>{raw.data.maskedTitle}<br/>{raw.data.maskedBody || '본문 없음'}</dd><dt>재파싱 미리보기</dt><dd>원본 {row.id} · 파서 {raw.data.currentParser.parserVersion??'미지원'} · 누락 {raw.data.missingFields.join(', ')||'없음'} · 기존 연결 {raw.data.existingSourceLinks}건 · 최근 시도 {raw.data.previousAttempt.id??'없음'}</dd></>}
    <dt>검토 사유</dt><dd>{reasonLabel(row.reason)}</dd><dt>거래 근거</dt><dd>{row.moveToBookkeepingBlockReason || row.evidence?.summary || '원문과 입출금 정보를 확인해 주세요.'}</dd></dl>
    {row.state === 'PENDING' && !eligible(row) && <Link href="/money/reconciliation">잔액 점검에서 거래 근거 확인</Link>}</section>;
}

function BatchPreview({value, p, busy, close, execute}: {value: ReviewPreview; p: Props; busy: boolean; close: () => void; execute: () => void}) {
  return <section className="money-notice-preview" aria-label="선택 항목 일괄 처리 미리보기"><header><div><h3>선택 {reviewActionLabel(value.action)} · 최종 확인</h3><p>선택 {value.selectedCount}건 · 적격 {value.eligibleCount}건 · 제외 {value.excludedCount}건</p></div><button onClick={close}>닫기</button></header>
    <ul>{value.items.map(row => <li key={reviewKey(row)}><span><strong>{reviewMerchant(row)}</strong> · {row.title || '알림 제목 없음'}<small>{seoul(row.occurredAt)} · {moneyAmount(row.amount, reviewCurrency(row))} · {p.accounts.find(a=>a.id===row.accountId)?.displayName || '계좌 미지정'}</small></span><span>{row.eligible ? '처리 가능' : row.exclusionReason || '거래 근거 확인'}</span></li>)}</ul>
    <footer><small>{value.action === move ? '원본 근거를 확인한 입출금만 등록합니다. 금융 의미가 미확정인 거래는 검토 필요에 표시됩니다.' : value.action === 'REOPEN' ? '선택한 알림을 검토 대기로 복원합니다. 원장과 잔액은 유지됩니다.' : '선택한 알림을 제외합니다. 원문은 보존되며 복원할 수 있습니다.'}</small><button className="money-primary" disabled={busy || !value.eligibleCount} onClick={execute}>{value.eligibleCount}건 {reviewActionLabel(value.action)}</button></footer></section>;
}
