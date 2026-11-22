WITH facts AS (
    SELECT t.id, t.currency, t.amount, t.occurred_at, t.version,
           t.type AS source_type, t.meaning_state, t.from_account_id, t.to_account_id,
           t.title, t.memo, t.counterparty_text, t.occurrence_precision, src.display_name AS from_name, dest.display_name AS to_name,
           t.loan_id, t.principal, t.interest, t.fee, t.refund_of,
           CASE WHEN jsonb_exists(b.overrides, 'categoryId') THEN (b.overrides->>'categoryId')::uuid
                ELSE coalesce((rp.defaults->>'categoryId')::uuid, t.category_id) END AS assigned_category,
           d.declared_type, d.relation_status,
           fh.fund_group AS from_group, th.fund_group AS to_group,
           EXISTS (SELECT 1 FROM money_tracking_accounts ta
                   WHERE ta.user_id=t.user_id AND ta.account_id=t.to_account_id AND ta.kind='INCOME') AND NOT coalesce(dest.archived,true) AS income_tracked,
           EXISTS (SELECT 1 FROM money_tracking_accounts ta
                   WHERE ta.user_id=t.user_id AND ta.account_id=t.from_account_id AND ta.kind='EXPENSE') AND NOT coalesce(src.archived,true) AS expense_tracked,
           coalesce(src.include_in_statistics,true) AND coalesce(dest.include_in_statistics,true) AS statistics_accounts
    FROM money_transactions t
    LEFT JOIN money_accounts src ON src.user_id=t.user_id AND src.id=t.from_account_id
    LEFT JOIN money_accounts dest ON dest.user_id=t.user_id AND dest.id=t.to_account_id
    LEFT JOIN money_bookkeeping_overrides b ON b.user_id=t.user_id AND b.transaction_id=t.id AND b.slot=0
    LEFT JOIN money_rule_projections rp ON rp.user_id=t.user_id AND rp.transaction_id=t.id
    LEFT JOIN money_owner_financial_decisions d ON d.user_id=t.user_id AND d.transaction_id=t.id
    LEFT JOIN LATERAL (SELECT h.fund_group FROM money_account_fund_group_history h
        WHERE h.user_id=t.user_id AND h.account_id=t.from_account_id AND h.effective_at<=t.occurred_at
        ORDER BY h.effective_at DESC LIMIT 1) fh ON t.type='TRANSFER'
    LEFT JOIN LATERAL (SELECT h.fund_group FROM money_account_fund_group_history h
        WHERE h.user_id=t.user_id AND h.account_id=t.to_account_id AND h.effective_at<=t.occurred_at
        ORDER BY h.effective_at DESC LIMIT 1) th ON t.type='TRANSFER'
    WHERE t.user_id=:owner AND t.occurred_at>=:start AND t.occurred_at<:end
      AND t.currency=:currency AND t.merged_into IS NULL AND NOT t.excluded
      AND NOT coalesce((b.overrides->>'excluded')::boolean,false)
      AND t.type NOT IN ('INITIAL_BALANCE','BALANCE_ADJUSTMENT')
), classified AS (
    SELECT f.*, coalesce(cp.basis, pp.basis) AS income_basis,
           CASE WHEN f.declared_type='LOAN_PAYMENT' AND f.relation_status='LOAN_SPLIT_PENDING'
                     AND f.source_type='EXPENSE' AND f.meaning_state='UNRESOLVED'
                     AND f.from_account_id IS NOT NULL AND f.to_account_id IS NULL THEN 'LOAN_PAYMENT'
                WHEN f.meaning_state='CONFIRMED' THEN f.source_type END AS applied_type
    FROM facts f
    LEFT JOIN money_categories c ON c.user_id=:owner AND c.id=f.assigned_category AND c.kind='INCOME'
    LEFT JOIN money_v4_income_categories cp ON cp.user_id=c.user_id AND cp.category_id=c.id
    LEFT JOIN money_v4_income_categories pp ON pp.user_id=c.user_id AND pp.category_id=c.parent_id
), contributions AS (
    SELECT classified.*, CASE
      WHEN applied_type='INCOME' AND declared_type IS DISTINCT FROM 'REFUND' AND income_tracked AND income_basis='QUALIFIED' THEN 'I'
      WHEN applied_type='INCOME' AND declared_type IS DISTINCT FROM 'REFUND'
        AND declared_type IS DISTINCT FROM 'LOAN_RECEIPT' AND declared_type IS DISTINCT FROM 'TRANSFER'
        AND from_account_id IS NULL AND to_account_id IS NOT NULL AND income_tracked
        AND income_basis='FAMILY_SUPPORT' THEN 'FAMILY_SUPPORT'
      WHEN applied_type='INCOME' AND declared_type IS DISTINCT FROM 'REFUND' AND income_tracked AND income_basis IS NULL THEN 'UNKNOWN_INCOME'
      WHEN applied_type='EXPENSE' AND expense_tracked THEN 'E'
      WHEN applied_type='LOAN_PAYMENT' AND expense_tracked THEN 'L'
      WHEN applied_type='TRANSFER' AND statistics_accounts AND (from_group IS NULL OR to_group IS NULL) THEN 'UNKNOWN_SAVINGS'
      WHEN applied_type='TRANSFER' AND statistics_accounts AND from_group<>'SAVINGS' AND to_group='SAVINGS' THEN 'SI'
      WHEN applied_type='TRANSFER' AND statistics_accounts AND from_group='SAVINGS' AND to_group<>'SAVINGS' THEN 'SO'
    END AS bucket
    FROM classified
)
