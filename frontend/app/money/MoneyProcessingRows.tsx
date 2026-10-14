"use client";
import {useEffect, useRef} from 'react';
import {moneyAmount} from '@/lib/money/accounts';
import {seoul} from '@/lib/money/model';
import {type ProcessingPage, type ProcessingRow} from '@/lib/money/processing';
import {affectedBy, resourceKey} from '@/lib/money/cache';
import {useMoneyCache} from './MoneyDataProvider';
import {useMoneyData} from './MoneyWebData';

export const PROCESSING_POLL_MS = 3_000;
/** Poll only the source projection; refresh canonical projections when an observed item leaves. */
export function useMoneyProcessing(path: string | null, bookkeepingPath?: string) {
  const cache = useMoneyCache();
  const result = useMoneyData<ProcessingPage>(path);
  const previous = useRef<Map<string, string> | null>(null);
  useEffect(() => {previous.current = null;}, [path]);
  useEffect(() => {
    if (!path || !result.data || result.loading || result.error) return;
    const current = new Map(result.data.items.map(row => [row.rawEventId, row.status]));
    const old = previous.current;
    previous.current = current;
    const mutation = old && [...old.keys()].some(id => !current.has(id)) ? 'transaction'
      : old && [...current].some(([id, status]) => status === 'REVIEW_REQUIRED' && old.get(id) !== status) ? 'review' : null;
    // This response already refreshed the source projection; retain it while canonical views reload.
    if (mutation) cache.invalidate(key => key !== resourceKey(path) && affectedBy(mutation, key));
  }, [cache, path, result.data, result.loading, result.error]);
  useEffect(() => {
    if (!path) return;
    const key = resourceKey(path);
    let ticks = 0;
    const refresh = (target: string) => {
      const targetKey = resourceKey(target);
      if (cache.snapshot(targetKey).loading) return;
      cache.invalidate(value => value === targetKey);
      void cache.load(targetKey).catch(() => {});
    };
    const poll = () => {
      if (document.visibilityState === 'hidden' || cache.snapshot(key).loading) return;
      refresh(key);
      // Conclusive admissions can finish between source polls, leaving no pending row to observe.
      if (bookkeepingPath && ++ticks % 3 === 0) refresh(bookkeepingPath);
    };
    const timer = window.setInterval(poll, PROCESSING_POLL_MS);
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    return () => {window.clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll);};
  }, [cache, path, bookkeepingPath]);
  return result;
}

export function MoneyProcessingRows({items, onReview}: {items: ProcessingRow[]; onReview: () => void}) {
  return <>{items.map(row => <tr key={'processing:' + row.rawEventId} data-processing-id={row.rawEventId} className="money-processing-row">
    <td><span className="money-muted" aria-label="읽기 전용 알림">—</span></td>
    <td><time dateTime={row.occurredAt}>{seoul(row.occurredAt)}</time><small className="money-muted">{row.direction === 'IN' ? '입금' : '출금'} 알림</small></td>
    <td><strong>{row.counterparty || '거래처 정보 없음'}</strong></td>
    <td><div className={'number ' + (row.direction === 'IN' ? 'meaning-income' : 'meaning-expense')}>{row.direction === 'IN' ? '+' : '−'}{moneyAmount(row.amount, row.currency)}</div><small>{[row.bankProvider, row.accountName].filter(Boolean).join(' · ')}</small></td>
    <td><span role="status">{row.status === 'REVIEW_REQUIRED' ? '검토 필요' : '처리 중'}</span></td>
    <td className="money-muted">{row.reasonText || '금융 거래 확인 중'}</td>
    <td className="money-muted">등록 후 분류 가능</td>
    <td>{row.status === 'REVIEW_REQUIRED' ? <button onClick={onReview}>검토 필요로 이동</button> : <span className="money-muted">확인 중</span>}</td>
  </tr>)}</>;
}
