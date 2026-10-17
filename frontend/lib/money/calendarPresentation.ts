import { reviewMerchant } from "./reviewWorkflow";

/** Read the ledger projection only; generic bank titles are not spending destinations. */
export function calendarDestination(row: { counterpartyText: string | null; title: string }): string {
  const reliable = (text: string) => text.trim() && !/(?:알림|안내|통지|입출금\s*내역|거래\s*내역)(?=[\s\p{P}\p{S}]|$)/u.test(text.trim());
  const merchant = reviewMerchant({ merchant: row.counterpartyText, title: row.title });
  if (merchant !== "거래처 미확인" && reliable(merchant)) return merchant.trim();
  const title = reviewMerchant({ merchant: row.title, title: null });
  return title !== "거래처 미확인" && reliable(title) ? title.trim() : "거래처 미확인";
}
