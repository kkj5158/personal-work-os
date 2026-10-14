/** Read-only source observations. These never enter BookPage or classification commands. */
export type ProcessingRow = {
  rawEventId: string;
  direction: 'IN' | 'OUT';
  amount: number;
  currency: string;
  accountId: string;
  accountName: string;
  bankProvider: string;
  counterparty: string | null;
  occurredAt: string;
  status: 'PROCESSING' | 'REVIEW_REQUIRED';
  reasonCode: string | null;
  reasonText: string | null;
};
export type ProcessingPage = {items: ProcessingRow[]; truncated: boolean};
export type ProcessingFilters = {
  kind: 'INCOME' | 'EXPENSE';
  search: string;
  accountIds: string[] | null;
  trackedAccountIds: string[];
  minAmount: string;
  maxAmount: string;
  categoryFiltered: boolean;
  classificationState: string;
  classificationOrigin: string;
};
export function processingPath(from: string, to: string) {
  return '/processing?' + new URLSearchParams({from, to});
}
export function visibleProcessingRows(items: ProcessingRow[], filters: ProcessingFilters, books: {sourceRawEventIds?: string[]}[]) {
  if (filters.categoryFiltered || filters.classificationOrigin || !['ALL', 'UNCLASSIFIED'].includes(filters.classificationState)) return [];
  const represented = new Set(books.flatMap(row => row.sourceRawEventIds ?? []));
  const seen = new Set<string>();
  const search = filters.search.trim().toLocaleLowerCase('ko-KR');
  return items.filter(row => {
    if (represented.has(row.rawEventId) || seen.has(row.rawEventId)) return false;
    seen.add(row.rawEventId);
    if (row.direction !== (filters.kind === 'INCOME' ? 'IN' : 'OUT')) return false;
    if (!filters.trackedAccountIds.includes(row.accountId) || filters.accountIds && !filters.accountIds.includes(row.accountId)) return false;
    if (search && ![row.counterparty, row.accountName, row.bankProvider].some(value => value?.toLocaleLowerCase('ko-KR').includes(search))) return false;
    // The existing amount filter is expressed in KRW, never compare foreign currencies.
    if ((filters.minAmount || filters.maxAmount) && row.currency !== 'KRW') return false;
    if (filters.minAmount && row.amount < Number(filters.minAmount) || filters.maxAmount && row.amount > Number(filters.maxAmount)) return false;
    return true;
  });
}
