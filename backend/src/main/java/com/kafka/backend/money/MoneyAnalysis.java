package com.kafka.backend.money;

import java.util.Set;

/**
 * One definition of financial contributions, shared by summary and evidence queries.
 * The savings and living (spending) areas are the owner-chosen fund groups (V65), so
 * Web Overview and Mobile net savings/flow use the same boundary at occurrence time.
 */
final class MoneyAnalysis {
    private MoneyAnalysis() {}
    static final Set<String> RELATIONS=Set.of("INCOME","CONSUMPTION","SAVINGS","SPENDING_ALLOCATION","LOAN_PRINCIPAL","UNRESOLVED_LOAN");
    static final String FACTS="""
        with owned as (
          select * from money_accounts where user_id=?
        ), facts as materialized (
          select t.*,f.display_name from_name,d.display_name to_name,
            coalesce(fh.fund_group='SAVINGS',false) from_saving,coalesce(dh.fund_group='SAVINGS',false) to_saving,
            coalesce(fh.fund_group='LIVING',false) from_spending,coalesce(dh.fund_group='LIVING',false) to_spending,
            case when t.type='INCOME' then t.amount else 0 end income,
            case when t.type='EXPENSE' then t.amount when t.type='REFUND' and t.refund_of is not null then -t.amount
              when t.type='LOAN_PAYMENT' then coalesce(t.interest+t.fee,0) else 0 end consumption,
            case when t.type='TRANSFER' and fh.fund_group is not null and dh.fund_group is not null
              and (fh.fund_group='SAVINGS')<>(dh.fund_group='SAVINGS')
              then case when dh.fund_group='SAVINGS' then t.amount else -t.amount end else 0 end savings
          from money_transactions t left join owned f on f.id=t.from_account_id
          left join owned d on d.id=t.to_account_id
          left join lateral (select h.fund_group from money_account_fund_group_history h
            where h.user_id=t.user_id and h.account_id=f.id and h.effective_at<=t.occurred_at
            order by h.effective_at desc limit 1) fh on true
          left join lateral (select h.fund_group from money_account_fund_group_history h
            where h.user_id=t.user_id and h.account_id=d.id and h.effective_at<=t.occurred_at
            order by h.effective_at desc limit 1) dh on true
          where t.user_id=? and t.meaning_state='CONFIRMED' and not t.excluded and t.merged_into is null and t.occurred_at>=? and t.occurred_at<?
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
