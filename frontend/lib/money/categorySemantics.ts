import type {Category} from './model';

export type BaseDirection = 'EXPENSE' | 'INCOME' | 'TRANSFER';

type CashRow = {
  type: string; declaredFinancialType?: string | null; financialType?: string | null;
  from_account_id?: string | null; to_account_id?: string | null;
};
export function baseDirection(row: CashRow): BaseDirection {
  const type = row.declaredFinancialType || row.financialType || row.type;
  if (row.from_account_id && row.to_account_id || ['TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL'].includes(type)) return 'TRANSFER';
  if (row.from_account_id) return 'EXPENSE';
  if (row.to_account_id) return 'INCOME';
  return ['EXPENSE','LOAN_PAYMENT'].includes(type) ? 'EXPENSE' : 'INCOME';
}
export function baseDirectionLabel(row: CashRow) {
  return {EXPENSE:'출금', INCOME:'입금', TRANSFER:'이체'}[baseDirection(row)];
}
export function activeCategories(categories: Category[], direction: BaseDirection) {
  return categories.filter(c => !c.archived && !c.effectiveArchived && (c.kind ?? 'EXPENSE') === direction);
}
export function protectedMeaning(row: {type:string; loan_id?:string|null; refund_of?:string|null}) {
  return !!row.loan_id || !!row.refund_of || ['LOAN_PAYMENT','LOAN_RECEIPT'].includes(row.type);
}
