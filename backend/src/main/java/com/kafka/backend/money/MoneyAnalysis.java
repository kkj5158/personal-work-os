package com.kafka.backend.money;

import java.util.Set;

/**
 * One definition of financial contributions, shared by summary and evidence queries.
 * The savings and living (spending) areas are the owner-chosen fund groups (V65), so
 * Web Overview and Mobile net savings/flow use the same boundary.
 */
final class MoneyAnalysis {
    private MoneyAnalysis() {}
    static final Set<String> RELATIONS=Set.of("INCOME","CONSUMPTION","SAVINGS","SPENDING_ALLOCATION","LOAN_PRINCIPAL","UNRESOLVED_LOAN");
    static final String FACTS="""
        with owned as (
          select *,fund_group='SAVINGS' saving,
            fund_group='LIVING' spending from money_accounts where user_id=?
        ), facts as materialized (
          select t.*,f.display_name from_name,d.display_name to_name,
            coalesce(f.saving,false) from_saving,coalesce(d.saving,false) to_saving,
            coalesce(f.spending,false) from_spending,coalesce(d.spending,false) to_spending,
            case when t.type='INCOME' then t.amount else 0 end income,
            case when t.type='EXPENSE' then t.amount when t.type='REFUND' then -t.amount
              when t.type='LOAN_PAYMENT' then coalesce(t.interest+t.fee,0) else 0 end consumption,
            case when t.type='TRANSFER' and coalesce(f.saving,false)<>coalesce(d.saving,false)
              then case when d.saving then t.amount else -t.amount end else 0 end savings
          from money_transactions t left join owned f on f.id=t.from_account_id
          left join owned d on d.id=t.to_account_id
          where t.user_id=? and not t.excluded and t.merged_into is null and t.occurred_at>=? and t.occurred_at<?
            and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT')
            and coalesce(f.include_in_statistics,true) and coalesce(d.include_in_statistics,true)
        ), relations as (
          select facts.*,v.relation,v.contribution from facts cross join lateral (
            select 'INCOME' relation,income contribution where type='INCOME'
            union all select 'CONSUMPTION',consumption where type in ('EXPENSE','REFUND') or (type='LOAN_PAYMENT' and consumption<>0)
            union all select 'SAVINGS',savings where type='TRANSFER' and from_saving<>to_saving
            union all select 'SPENDING_ALLOCATION',case when to_spending then amount else -amount end
              where type='TRANSFER' and not from_saving and not to_saving and from_spending<>to_spending
            union all select 'LOAN_PRINCIPAL',principal where type='LOAN_PAYMENT' and principal is not null
            union all select 'UNRESOLVED_LOAN',amount where type='LOAN_PAYMENT' and principal is null
          ) v
        )
        """;
}
