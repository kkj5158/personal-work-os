"use client";
import {useEffect, useRef, useState, type SetStateAction} from 'react';
import {moneyApi as api, seoul} from '@/lib/money/model';
import type {AiItem} from '@/lib/money/ai';
import {moneyAmount} from '@/lib/money/accounts';
import {reviewReasons} from '@/lib/money/meaning';
import {affectedBy, resourceKey} from '@/lib/money/cache';
import {reviewActionLabel, reviewCurrency, reviewDirection, reviewKey, reviewMerchant, removeConfirmedReviewRows, type ReviewAction, type ReviewOutcome, type ReviewPage, type ReviewPreview} from '@/lib/money/reviewWorkflow';
import {useMoneyCache, useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData, LoadState} from './MoneyWebData';
import {Pagination, type Props} from './MoneyWebViews';
import './money-notification-review.css';

type Request = {previewId: string; requestId: string; path: string; action: ReviewAction; skipped: ReviewOutcome['items']; targetKeys: string[]; generation: number; loadedAt: number | null};
const actions: ReviewAction[] = ['MOVE_TO_BOOKKEEPING', 'DEFER', 'NON_TRANSACTION'];
const reasonLabel = (reason: string) => reason === 'MOVE_TO_BOOKKEEPING' ? '가계부 이동 완료' : reviewReasons[reason] ?? reason;
const errorText = (error: unknown) => error instanceof Error ? error.message : '처리하지 못했습니다.';
const statusLabel: Record<string, string> = {SAVED: '서버 확인 완료', FAILED: '처리 실패', CONFLICT: '최신 상태 확인 필요', UNKNOWN: '결과 미확인', SKIPPED: '처리 제외', UNDONE: '취소 완료'};

/** Financial eligibility and commands share the durable server preview/execute boundary. */
export function NotificationReview(p: Props) {
  const cache = useMoneyCache();
  const [state, setState] = useMoneyViewState('notice-review-state', () => 'PENDING');
  const [search, setSearch] = useMoneyViewState('notice-review-search', () => '');
  const [account, setAccount] = useMoneyViewState('notice-review-account', () => '');
  const [reason, setReason] = useMoneyViewState('notice-review-reason', () => '');
  const [offset, setOffset] = useMoneyViewState('notice-review-offset', () => 0);
  const [ids, setIds] = useMoneyViewState<string[]>('notice-review-ids', () => []);
  const [outcome, setOutcome] = useMoneyViewState<ReviewOutcome | null>('notice-review-outcome', () => null);
  const [request, setRequest] = useMoneyViewState<Request | null>('notice-review-request', () => null);
  const [applied, setApplied] = useMoneyViewState<string[]>('notice-review-applied', () => []);
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [busy, setBusy] = useState(false), [busyRow, setBusyRow] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReviewOutcome | null>(null), [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const lock = useRef(false), context = useRef(''), selectionEpoch = useRef(0);
  const filters = {state, search, accountId: account || null, reason: reason || null};
  const q = new URLSearchParams({state, search, limit: '50', offset: String(offset)});
  if (account) q.set('accountId', account);
  if (reason) q.set('reason', reason);
  const path = '/ai/workbench?' + q;
  useEffect(() => {context.current = path;}, [path]);
  const list = useMoneyData<ReviewPage>(path), rows = list.data?.items ?? [];
  const hidden = ids.filter(id => !rows.some(row => reviewKey(row) === id)).length;
  // A partial batch can remove an entire later page. Keep surviving failures reachable
  // while preserving the user's position whenever that page still exists.
  useEffect(() => {
    if (list.loading || !list.data) return;
    const lastOffset = Math.floor(Math.max(0, list.data.total - 1) / 50) * 50;
    if (offset > lastOffset) setOffset(lastOffset);
  }, [list.loading, list.data, offset, setOffset]);
  // Poll for feedback only. Results are applied by the command receipt or explicit recovery.
  useEffect(() => {
    if (!busy || !request) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {const value = await api.get<ReviewOutcome>('/review/batches/outcomes/' + request!.requestId); if (!stopped) setProgress(value);}
      catch {/* A start receipt may still be committing. Never retry the mutation. */}
      finally {if (!stopped) timer = setTimeout(() => void poll(), 2000);}
    }
    timer = setTimeout(() => void poll(), 1500);
    return () => {stopped = true; clearTimeout(timer);};
  }, [busy, request]);

  function change(update: () => void) {
    if (p.changeContext?.() === false) return;
    update(); setOffset(0); selectIds([]); setError('');
  }
  function selectIds(value: SetStateAction<string[]>) {
    selectionEpoch.current++; setPreview(null); setIds(value);
  }
  function apply(value: ReviewOutcome, command: Request) {
    if (command.generation !== cache.scopeSnapshot()) return;
    const saved = value.items.filter(row => row.status === 'SAVED');
    const fresh = saved.filter(row => !applied.includes(value.requestId + ':' + reviewKey(row)));
    if (fresh.length) {
      const patchable = cache.snapshot(command.path).lastSuccessAt === command.loadedAt;
      let refillEmptyPage = false;
      if (patchable) cache.update<ReviewPage>(command.path, page => {
        const next = removeConfirmedReviewRows(page, fresh);
        const pageOffset = Number(new URLSearchParams(command.path.split('?')[1]).get('offset') ?? 0);
        // The remaining rows may have shifted here from a later page. Refill only
        // this empty, still-valid page so they cannot be hidden behind disabled paging.
        refillEmptyPage = !next.items.length && next.total > pageOffset;
        return next;
      });
      // Other filtered pages/projections revalidate; the active frozen queue is patched once.
      cache.invalidate(key => (!patchable || refillEmptyPage || key !== resourceKey(command.path)) && affectedBy('ai', key));
      setApplied(old => [...new Set([...old, ...fresh.map(row => value.requestId + ':' + reviewKey(row))])]);
    }
    setOutcome({...value, items: [...value.items, ...command.skipped]});
    setIds(old => old.filter(id => !saved.some(row => reviewKey(row) === id)));
    setRowErrors(old => {
      const next = {...old};
      for (const row of [...value.items, ...command.skipped]) {
        if (row.status === 'SAVED') delete next[reviewKey(row)];
        else next[reviewKey(row)] = row.message || statusLabel[row.status] || row.status;
      }
      return next;
    });
    if (value.completed) setRequest(null);
  }
  async function execute(value: ReviewPreview, origin: string, generation = cache.scopeSnapshot()) {
    if (generation !== cache.scopeSnapshot()) return;
    const command: Request = {previewId: value.previewId, requestId: crypto.randomUUID(), path: origin, action: value.action, targetKeys: value.items.filter(row => row.eligible).map(reviewKey), skipped: value.items.filter(row => !row.eligible).map(row => ({id: row.id, kind: row.kind, status: 'SKIPPED', message: row.exclusionReason || row.nextAction})), generation, loadedAt: cache.snapshot(origin).lastSuccessAt};
    setProgress(null); setOutcome(null); setRequest(command); setPreview(null);
    try {apply(await api.post<ReviewOutcome>('/review/batches/execute', {previewId: command.previewId, requestId: command.requestId}), command);}
    catch (error) {
      const message = errorText(error) + ' 결과가 미확인입니다. 원래 요청의 결과를 조회하세요.';
      setError(message);
      setRowErrors(old => ({...old, ...Object.fromEntries(command.targetKeys.map(key => [key, message]))}));
    }
  }
  async function prepare(action: ReviewAction, targets = ids, directRow?: AiItem, selectOnly = false) {
    if (lock.current || request) return;
    lock.current = true; setBusy(true); setBusyRow(directRow ? reviewKey(directRow) : null); setError('');
    const origin = context.current, epoch = selectionEpoch.current, generation = cache.scopeSnapshot();
    try {
      const value = await api.post<ReviewPreview>('/review/batches/preview', {...filters, scope: selectOnly ? 'FILTER' : 'SELECTED', action, items: targets.map(value => {const [kind, id] = value.split(':'); return {kind, id};})});
      if (generation !== cache.scopeSnapshot()) return;
      if (selectOnly) {if (origin === context.current && epoch === selectionEpoch.current) selectIds(old => [...new Set([...old, ...value.items.map(reviewKey)])]);}
      else if (directRow) {
        const row = value.items.find(row => reviewKey(row) === reviewKey(directRow));
        if (!row?.eligible || value.eligibleCount !== 1 || value.items.length !== 1) setRowErrors(old => ({...old, [reviewKey(directRow)]: row?.exclusionReason || row?.nextAction || '현재 금융 근거로 처리할 수 없습니다. 최신 상태를 확인하세요.'}));
        else await execute(value, origin, generation);
      } else if (origin === context.current && epoch === selectionEpoch.current) setPreview(value);
    } catch (error) {
      if (directRow) setRowErrors(old => ({...old, [reviewKey(directRow)]: errorText(error)}));
      else setError(errorText(error));
    } finally {lock.current = false; setBusy(false); setBusyRow(null);}
  }
  async function confirmBulk() {
    if (!preview || !preview.eligibleCount || lock.current || request) return;
    lock.current = true; setBusy(true); setError('');
    try {await execute(preview, context.current);}
    finally {lock.current = false; setBusy(false);}
  }
  async function recover() {
    if (!request || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {apply(await api.get<ReviewOutcome>('/review/batches/outcomes/' + request.requestId), request);}
    catch (error) {setError(errorText(error) + ' 원래 요청 ID를 보존하고 다시 조회하세요.');}
    finally {lock.current = false; setBusy(false);}
  }
  async function undo(eventId: string) {
    if (lock.current || request) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api.post('/ai/events/' + eventId + '/undo', {}); cache.mutate('ai');
      setOutcome(old => old ? {...old, items: old.items.map(row => row.eventId === eventId ? {...row, status: 'UNDONE'} : row)} : null);
    } catch (error) {setError(errorText(error));}
    finally {lock.current = false; setBusy(false);}
  }
  const disabled = busy || !!request;
  const counts = {success: outcome?.items.filter(row => row.status === 'SAVED').length ?? 0, failed: outcome?.items.filter(row => ['FAILED', 'CONFLICT'].includes(row.status)).length ?? 0, skipped: outcome?.items.filter(row => row.status === 'SKIPPED').length ?? 0, unknown: outcome?.items.filter(row => row.status === 'UNKNOWN').length ?? 0};
  return <section className="money-ai money-notice-review" aria-label="검토 필요 알림 작업함">
    <p className="money-muted">거래처와 금융 근거를 확인한 뒤 가계부 이동 · 보류 · 비거래 처리를 선택하세요. 분류 없이도 가계부에 등록할 수 있습니다.</p>
    <div className="money-ai-tabs" role="tablist" aria-label="검토 상태">{[['PENDING', '검토 대기'], ['DEFERRED', '보류'], ['COMPLETED', '처리 이력']].map(([value, label]) => <button key={value} role="tab" aria-selected={state === value} onClick={() => change(() => setState(value))}>{label}</button>)}</div>
    <div className="money-ai-filters"><input type="search" aria-label="거래처·알림 검색" placeholder="거래처·알림 검색" value={search} onChange={event => change(() => setSearch(event.target.value))}/><select aria-label="검토 계좌" value={account} onChange={event => change(() => setAccount(event.target.value))}><option value="">전체 계좌</option>{p.accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select><select aria-label="검토 사유" value={reason} onChange={event => change(() => setReason(event.target.value))}><option value="">전체 검토 사유</option>{[...new Set([...(list.data?.reasons ?? []), ...(reason ? [reason] : [])])].map(value => <option key={value} value={value}>{reasonLabel(value)}</option>)}</select><button onClick={() => {setPreview(null); cache.mutate('ai');}}>새로고침</button></div>
    <div className="money-notice-toolbar">
      <section aria-label="처리 대상 선택"><div><strong>처리 대상 선택</strong><span>선택 {ids.length}건 · 현재 화면 밖 {hidden}건</span></div><div><button disabled={!rows.length} onClick={() => {selectIds(old => [...new Set([...old, ...rows.map(reviewKey)])]);}}>현재 페이지 전체 선택</button><button disabled={disabled || !list.data?.total} onClick={() => void prepare('DEFER', [], undefined, true)}>필터 결과 전체 선택 ({list.data?.total ?? 0}건)</button><button disabled={!ids.length} onClick={() => {selectIds([]);}}>선택 해제</button></div></section>
      <section aria-label="선택 항목 일괄 처리"><div><strong>선택 항목 일괄 처리</strong><span>선택 후 처리 범위를 미리 확인합니다.</span></div><div>{actions.map(action => <button key={action} className={action === 'MOVE_TO_BOOKKEEPING' ? 'money-primary' : ''} disabled={disabled || !ids.length || state === 'COMPLETED' || action === 'DEFER' && state === 'DEFERRED'} onClick={() => void prepare(action)}>{reviewActionLabel(action)}</button>)}</div></section>
    </div>
    <LoadState loading={list.loading} error={list.error || error} lastSuccessAt={list.lastSuccessAt}/>
    {busy && <p role="status" aria-live="polite">{busyRow ? '선택한 거래 처리 중…' : '처리 범위 확인 중…'}</p>}
    {request && <div className="money-notice-recovery" role="status"><strong>{busy ? '서버 처리 중' : '원래 요청 결과 확인 필요'}</strong><p>{reviewActionLabel(request.action)} · 확정 전에는 새 처리 요청을 보내지 않습니다.</p>{busy && <p aria-live="polite">서버 결과 확인 {progress?.items.filter(row => row.status !== 'UNKNOWN').length ?? 0}/{request.targetKeys.length}건</p>}<button disabled={busy} onClick={() => void recover()}>원래 요청 결과 조회</button></div>}
    {preview && <ReviewPreview value={preview} p={p} busy={disabled} close={() => setPreview(null)} execute={() => void confirmBulk()}/>}
    {outcome && <details className="money-card money-notice-results" open><summary>처리 결과 · 성공 {counts.success}건 · 실패 {counts.failed}건 · 제외 {counts.skipped}건{counts.unknown > 0 && ` · 미확인 ${counts.unknown}건`}</summary><div className="money-notice-result-items" role="region" aria-label="거래별 처리 결과" tabIndex={0}>{outcome.items.map(row => <p key={reviewKey(row)}><span>{row.id} · {statusLabel[row.status] ?? row.status}</span>{row.message && <small>{row.message}</small>}{row.canUndo && row.eventId && row.status === 'SAVED' && <button disabled={disabled} onClick={() => void undo(row.eventId!)}>실행 취소</button>}</p>)}</div></details>}
    <div className="money-table-wrap"><table className="money-table money-notice-ledger"><thead><tr><th><input type="checkbox" aria-label="현재 페이지 선택" checked={!!rows.length && rows.every(row => ids.includes(reviewKey(row)))} onChange={event => {const checked = event.target.checked; selectIds(old => checked ? [...new Set([...old, ...rows.map(reviewKey)])] : old.filter(value => !rows.some(row => reviewKey(row) === value)));}}/></th><th>일시</th><th>거래처·알림</th><th>금액</th><th>내 계좌·방향</th><th>상태</th><th>검토 사유</th><th>처리</th></tr></thead><tbody>{rows.map(row => <tr key={reviewKey(row)} aria-busy={busyRow === reviewKey(row)}><td><input type="checkbox" aria-label={`${reviewMerchant(row)} 선택`} checked={ids.includes(reviewKey(row))} onChange={event => {const checked = event.target.checked; selectIds(old => checked ? [...new Set([...old, reviewKey(row)])] : old.filter(value => value !== reviewKey(row)));}}/></td><td>{seoul(row.occurredAt).replace('T', ' ')}</td><td><strong className="money-notice-merchant" title={reviewMerchant(row)}>{reviewMerchant(row)}</strong><small className="money-notice-notification" title={row.title || ''}>{row.title || '알림 제목 없음'}</small></td><td className="money-notice-amount">{moneyAmount(row.amount, reviewCurrency(row))}</td><td>{p.accounts.find(account => account.id === row.accountId)?.displayName || '내 계좌 확인 필요'}<small>{reviewDirection(row)}</small></td><td>{row.kind === 'RAW' ? row.state === 'COMPLETED' && row.reason === 'MOVE_TO_BOOKKEEPING' ? '가계부 등록' : '미등록 알림' : '금융 거래'}<small>{row.state === 'COMPLETED' ? '처리됨' : row.state === 'DEFERRED' ? '보류' : '검토 대기'}</small></td><td>{reasonLabel(row.reason)}{row.moveToBookkeepingEligible === false && row.moveToBookkeepingBlockReason && <small>{row.moveToBookkeepingBlockReason}</small>}</td><td><div className="money-notice-row-actions">{actions.map(action => <button key={action} className={action === 'MOVE_TO_BOOKKEEPING' ? 'money-primary' : ''} disabled={disabled || row.state === 'COMPLETED' || action === 'DEFER' && row.state === 'DEFERRED'} onClick={() => void prepare(action, [reviewKey(row)], row)}>{busyRow === reviewKey(row) && request?.action === action ? '처리 중…' : reviewActionLabel(action)}</button>)}</div>{rowErrors[reviewKey(row)] && <p className="money-notice-inline-error" role="alert">{rowErrors[reviewKey(row)]}</p>}{row.state === 'COMPLETED' && row.canUndo && row.eventId && <button className="money-notice-undo" disabled={disabled} onClick={() => void undo(row.eventId!)}>실행 취소</button>}</td></tr>)}</tbody></table>{!rows.length && !list.loading && <p className="money-empty">조건에 맞는 검토 항목이 없습니다.</p>}</div>
    <Pagination total={list.data?.total ?? 0} offset={offset} onChange={value => {if (p.changeContext?.() !== false) {setPreview(null); setOffset(value);}}}/>
    <p className="money-muted">확인된 항목만 처리합니다. 금액·내 계좌·통화·중복·이체 근거가 불명확하면 사유를 확인하고 보류하세요. 원문과 이력은 보존됩니다.</p>
  </section>;
}

function ReviewPreview({value, p, busy, close, execute}: {value: ReviewPreview; p: Props; busy: boolean; close: () => void; execute: () => void}) {
  return <section className="money-notice-preview" aria-label="선택 항목 일괄 처리 미리보기"><header><div><h2>{reviewActionLabel(value.action)} 미리보기</h2><p>선택 {value.selectedCount}건 · 적격 {value.eligibleCount}건 · 제외 {value.excludedCount}건</p></div><button disabled={busy} onClick={close} aria-label="미리보기 닫기">×</button></header><div className="money-table-wrap" role="region" aria-label="처리 대상 표" tabIndex={0}><table className="money-table"><thead><tr><th>거래처·알림</th><th>금액</th><th>내 계좌·방향</th><th>처리·제외 사유</th><th>금융 영향</th></tr></thead><tbody>{value.items.map(row => <tr key={reviewKey(row)}><td><strong>{reviewMerchant(row)}</strong><small>{row.title || '알림 제목 없음'} · {seoul(row.occurredAt).replace('T', ' ')}</small></td><td>{moneyAmount(row.amount, reviewCurrency(row))}</td><td>{p.accounts.find(account => account.id === row.accountId)?.displayName || '내 계좌 확인 필요'}<small>{reviewDirection(row)}</small></td><td>{row.eligible ? reviewActionLabel(value.action) : row.exclusionReason}<small>{row.nextAction}</small></td><td>{row.financialImpact || (row.eligible ? reviewActionLabel(value.action) : '처리 제외')}</td></tr>)}</tbody></table></div><p className="money-notice-impact">{value.action === 'MOVE_TO_BOOKKEEPING' ? '적격 거래만 가계부에 등록하거나 기존 거래에 연결합니다. 미분류로 등록할 수 있으며 금융 원장과 잔액에 반영됩니다.' : value.action === 'DEFER' ? '검토를 보류합니다. 기존 금융 원장과 잔액은 바뀌지 않습니다.' : '적격 알림만 비거래로 처리합니다. 등록된 금융 거래를 이 작업으로 취소하지 않습니다.'} 각 항목은 개별 확정되며 실패·제외 항목은 유지됩니다.</p><footer><button disabled={busy} onClick={close}>취소</button><button className="money-primary" disabled={busy || !value.eligibleCount} onClick={execute}>{value.eligibleCount}건 {reviewActionLabel(value.action)}</button></footer></section>;
}
