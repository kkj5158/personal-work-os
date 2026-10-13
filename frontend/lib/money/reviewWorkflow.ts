import type { AiItem } from './ai';

export type ReviewAction = 'MOVE_TO_BOOKKEEPING' | 'DEFER' | 'NON_TRANSACTION';
export type ReviewPreviewRow = Pick<AiItem, 'id' | 'kind' | 'occurredAt' | 'merchant' | 'title' | 'amount' | 'currency' | 'effectiveCurrency' | 'accountId' | 'reason' | 'state' | 'type'> & {eligible: boolean; exclusionReason: string | null; nextAction: string; commandGroup: string; financialImpact?: string};
export type ReviewPreview = {previewId: string; scope: string; action: ReviewAction; selectedCount: number; eligibleCount: number; excludedCount: number; items: ReviewPreviewRow[]; groups: Record<string, number>};
export type ReviewResult = {id: string; kind: string; status: string; eventId?: string; canUndo?: boolean; message?: string};
export type ReviewOutcome = {requestId: string; completed: boolean; items: ReviewResult[]};
export type ReviewPage = {items: AiItem[]; total: number; reasons?: string[]};
export const reviewKey = (row: {id: string; kind: string}) => row.kind + ':' + row.id;
export const reviewActionLabel = (action: ReviewAction) => ({MOVE_TO_BOOKKEEPING: '가계부 이동', DEFER: '보류', NON_TRANSACTION: '비거래 처리'})[action];

/** Only the server can establish a domestic currency default from financial evidence. */
export function reviewCurrency(row: {currency?: string | null; effectiveCurrency?: string | null}) {
  return row.currency?.trim() || row.effectiveCurrency?.trim() || '통화 미확인';
}
export function reviewMerchant(row: {merchant: string | null; title: string | null; candidate?: AiItem['candidate']}) {
  const merchant = row.merchant?.trim();
  const sourceLabel = ['카카오뱅크 알림', 'IBK기업은행 알림', '우리은행 알림', '신한은행 알림', '원문 알림'].includes(merchant ?? '');
  const notificationTitle = merchant === row.title?.trim() && /(?:알림|안내|통지|내역)(?:\s|$)/.test(merchant ?? '');
  if (merchant && !sourceLabel && !notificationTitle && !/^(?:com|kr|net|org|io)\.[\w.]+$/.test(merchant)) return row.merchant!;
  return row.candidate?.counterpartyText?.trim() || '거래처 미확인';
}
export function reviewDirection(row: {type: string | null; candidate?: AiItem['candidate']; transferCandidates?: number; transferPartnerId?: string | null}) {
  if (row.type === 'TRANSFER' || row.transferPartnerId || (row.transferCandidates ?? 0) > 0) return '이체 확인';
  return ({EXPENSE: '출금 · 지출', INCOME: '입금 · 수입', REFUND: '환불', LOAN_PAYMENT: '대출 상환'} as Record<string, string>)[row.type ?? ''] || (row.candidate?.direction === 'IN' ? '입금' : row.candidate?.direction === 'OUT' ? '출금' : '방향 확인 필요');
}
/** Count only newly confirmed results; recovery may return the same successful item repeatedly. */
export function removeConfirmedReviewRows(page: ReviewPage, saved: ReviewResult[]) {
  const keys = new Set(saved.map(reviewKey));
  return {...page, items: page.items.filter(row => !keys.has(reviewKey(row))), total: Math.max(0, page.total - keys.size)};
}
