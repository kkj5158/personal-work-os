package com.kafka.backend.money;

import com.kafka.backend.common.OptimisticLockConflictException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.Set;
import java.util.UUID;

import static com.kafka.backend.money.MoneyService.require;

/** Only an explicit owner command can invoke the mapped meaning. Classifiers never call this adapter. */
final class MoneyCategoryFinancialPolicy {
    private final JdbcTemplate db;
    private final UUID owner;

    MoneyCategoryFinancialPolicy(JdbcTemplate db, UUID owner) {
        this.db = db;
        this.owner = owner;
    }

    String resolve(UUID category, Long version) {
        require(category != null && version != null, "금융 카테고리와 정책 버전을 확인하세요.");
        var rows = db.queryForList("""
            select f.semantic_code,f.policy_version from money_category_financial_policy f
            join money_categories c on c.user_id=f.user_id and c.id=f.category_id
            left join money_categories p on p.user_id=c.user_id and p.id=c.parent_id
            where f.user_id=? and f.category_id=? and not c.archived and not coalesce(p.archived,false)
              and c.kind=case when f.semantic_code='LOAN_PAYMENT' then 'EXPENSE' else 'INCOME' end
            for share of f,c
            """, owner,category);
        require(rows.size()==1,"활성 금융 카테고리를 다시 선택하세요.");
        var row=rows.getFirst();
        if (((Number)row.get("policy_version")).longValue()!=version)
            throw new OptimisticLockConflictException("카테고리의 금융 정책이 변경되었습니다. 다시 확인하세요.");
        return row.get("semantic_code").toString();
    }

    void bind(UUID id, UUID request, UUID category, Long version, String requestedType) {
        if (category==null && version==null) return;
        String code=resolve(category,version);
        String base=code.equals("LOAN_PAYMENT") ? "EXPENSE" : "INCOME";
        var decisions=new MoneyOwnerFinancialDecision(db,owner);
        var fact=decisions.fact(id,true);
        require(fact.get(base.equals("EXPENSE")?"from_account_id":"to_account_id")!=null
                && fact.get(base.equals("EXPENSE")?"to_account_id":"from_account_id")==null,
                "카테고리 금융 의미와 거래 방향이 다릅니다.");
        String canonical=fact.get("type").toString();
        if (code.equals(requestedType)) {
            require(code.equals(canonical) && "CONFIRMED".equals(fact.get("meaning_state")),
                    "확정된 대출·환불 관계를 확인하세요.");
            String status=switch (code) {
                case "REFUND" -> fact.get("refund_of")==null ? "REFUND_ORIGINAL_PENDING" : "NONE";
                case "LOAN_PAYMENT" -> fact.get("principal")==null ? "LOAN_SPLIT_PENDING" : "NONE";
                default -> fact.get("loan_id")==null ? "LOAN_LINK_PENDING" : "NONE";
            };
            decisions.save(id,request,code,status);
        } else {
            require((base.equals(requestedType)||"UNRESOLVED".equals(requestedType)) && base.equals(canonical),
                    "확정된 금융 관계는 원래 대출·환불 정정에서 변경하세요.");
            decisions.apply(id,new MoneyAccountLedgerService.FinancialType(request,
                    ((Number)fact.get("version")).longValue(),code,true),fact);
            var next=decisions.fact(id,false);
            require(!Set.of("RELATION_CORRECTION_REQUIRED","DIRECTION_REVIEW").contains(next.get("relationStatus")),
                    "기존 출처·금융 관계를 전용 정정에서 먼저 확인하세요.");
        }
        db.update("update money_owner_financial_decisions set semantic_category_id=? where user_id=? and transaction_id=?",
                category,owner,id);
    }
}
