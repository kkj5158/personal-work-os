package com.kafka.backend.money;

import com.kafka.backend.common.ResourceNotFoundException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

import static com.kafka.backend.money.MoneyService.require;

/** The transaction still owns the cash leg. This table records the owner intention and its last disposition. */
final class MoneyOwnerFinancialDecision {
    static final String JOIN = " left join money_owner_financial_decisions d on d.user_id=t.user_id and d.transaction_id=t.id ";
    static final String CANONICAL = "case when t.meaning_state='UNRESOLVED' then 'UNRESOLVED' else t.type end";
    static final String DERIVED = MoneySavingsReadService.displayTypeSql("t");
    static final String DISPLAY = "coalesce(d.declared_type,case when t.meaning_state='UNRESOLVED' then 'UNRESOLVED' else " + DERIVED + " end)";
    // Resolve late verified relationships and historical savings-route changes from their canonical records.
    static final String RELATION = """
        case
          when d.declared_type='REFUND' and t.type in ('INCOME','REFUND') and t.meaning_state='CONFIRMED' then case when t.refund_of is null then 'REFUND_ORIGINAL_PENDING' else 'NONE' end
          when d.relation_status='DIRECTION_REVIEW' then 'DIRECTION_REVIEW'
          when d.declared_type in ('SAVINGS','SAVINGS_WITHDRAWAL') and t.type='TRANSFER'
            then case when d.declared_type=(%s) then 'NONE' else 'SAVINGS_ROUTE_PENDING' end
          when d.declared_type is null or d.declared_type=(%s) then
            case when t.type='TRANSFER' and (t.from_account_id is null or t.to_account_id is null)
                     and (to_jsonb(t)->>'transfer_destination_status') is null then 'TRANSFER_PAIR_PENDING'
                 when t.type='REFUND' and t.refund_of is null then 'REFUND_ORIGINAL_PENDING'
                 when t.type='LOAN_PAYMENT' and t.principal is null then 'LOAN_SPLIT_PENDING'
                 else 'NONE' end
          when d.relation_status='NONE' then 'RELATION_CORRECTION_REQUIRED'
          else d.relation_status end
        """.formatted(DERIVED, CANONICAL);
    static final String CASH_DIRECTION = "case when t.type='TRANSFER' or (d.declared_type in ('TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL') and d.relation_status in ('TRANSFER_PAIR_PENDING','SAVINGS_ROUTE_PENDING','NONE')) then 'TRANSFER' when t.from_account_id is not null then 'EXPENSE' when t.to_account_id is not null then 'INCOME' end";
    private static final String BASE = """
        case when t.meaning_state='CONFIRMED' then
          case when t.type in ('REFUND','LOAN_RECEIPT','INCOME') then 'INCOME'
               when t.type in ('LOAN_PAYMENT','EXPENSE') then 'EXPENSE'
               when t.type='TRANSFER' then 'TRANSFER' end end
        """;
    static final String FIELDS = DISPLAY + " as display_type, " + CANONICAL + " as \"canonicalType\", "
        + BASE + " as \"baseFinancialType\", "
        + "coalesce(d.semantic_category_id,(select fp.category_id from money_category_financial_policy fp where fp.user_id=t.user_id and fp.semantic_code=t.type and t.meaning_state='CONFIRMED')) as \"semanticCategoryId\", d.request_id as \"decisionRequestId\", d.version as \"decisionVersion\", d.actor_id as \"decisionActorId\", d.declared_type as \"declaredFinancialType\", " + RELATION + " as \"relationStatus\"";
    private static final Set<String> OUT = Set.of("EXPENSE","LOAN_PAYMENT","SAVINGS");
    private static final Set<String> IN = Set.of("INCOME","LOAN_RECEIPT","REFUND","SAVINGS_WITHDRAWAL");
    private static final Set<String> SAVINGS = Set.of("SAVINGS","SAVINGS_WITHDRAWAL");
    private final JdbcTemplate db;
    private final UUID owner;

    MoneyOwnerFinancialDecision(JdbcTemplate db, UUID owner) {
        this.db = db;
        this.owner = owner;
    }

    Map<String,Object> fact(UUID id, boolean lock) {
        var rows = db.queryForList("select t.*, " + FIELDS + " from money_transactions t" + JOIN
            + " where t.user_id=? and t.id=?" + (lock ? " for update of t" : ""), owner, id);
        if (rows.isEmpty()) throw new ResourceNotFoundException("소유 거래를 찾을 수 없습니다.");
        return rows.getFirst();
    }

    private record Transition(String type, String state, String relation) {}

    void apply(UUID id, MoneyAccountLedgerService.FinancialType input, Map<String,Object> before) {
        MoneyMeaningService.version(((Number)before.get("version")).longValue(), input.expectedVersion());
        require(!Boolean.TRUE.equals(before.get("excluded")) && before.get("merged_into")==null
            && !Set.of("INITIAL_BALANCE","BALANCE_ADJUSTMENT").contains(before.get("type")),
            "활성 계좌 거래를 선택하세요.");
        var next = transition(id, before, input.financialType());
        if (Boolean.TRUE.equals(input.v4()) && "REFUND".equals(input.financialType())
                && before.get("from_account_id")==null && before.get("to_account_id")!=null
                && Set.of("REFUND","INCOME").contains(before.get("type"))
                && !Set.of("DIRECTION_REVIEW","RELATION_CORRECTION_REQUIRED").contains(next.relation())) {
            next = new Transition("REFUND","CONFIRMED",before.get("refund_of")==null?"REFUND_ORIGINAL_PENDING":"NONE");
        }
        // Category history, classification overrides and source/balance fields remain untouched.
        // For an unresolved one-leg interpretation, the same directional category is dormant.
        db.update("""
            update money_transactions set type=?,meaning_state=?,version=version+1
             where user_id=? and id=?
            """, next.type(),next.state(),owner,id);
        save(id,input.requestId(),input.financialType(),next.relation());
    }

    private Transition transition(UUID id, Map<String,Object> fact, String desired) {
        String type=fact.get("type").toString(), state=fact.get("meaning_state").toString();
        boolean debit=fact.get("from_account_id")!=null, credit=fact.get("to_account_id")!=null;
        if (debit && credit) {
            if ("TRANSFER".equals(desired)) return new Transition(type,state,"NONE");
            if (SAVINGS.contains(desired)) return new Transition(type,state,"SAVINGS_ROUTE_PENDING");
            return new Transition(type,state,"RELATION_CORRECTION_REQUIRED");
        }
        if ((debit && IN.contains(desired)) || (credit && OUT.contains(desired)))
            return new Transition(type,state,"DIRECTION_REVIEW");
        boolean sourceConflict = Boolean.TRUE.equals(db.queryForObject("""
            select exists(select 1 from money_transaction_sources s join money_parse_attempts p
              on p.user_id=s.user_id and p.raw_event_id=s.raw_event_id and p.id=s.parse_attempt_id
              where s.user_id=? and s.transaction_id=? and s.relationship='PRIMARY' and p.direction<>?)
            """,Boolean.class,owner,id,debit?"OUT":"IN"));
        if (sourceConflict) return new Transition(type,state,"DIRECTION_REVIEW");
        if (desired.equals(type) && "CONFIRMED".equals(state)) {
            return new Transition(type,state,pending(type,fact));
        }
        boolean protectedRelation = fact.get("loan_id")!=null || fact.get("refund_of")!=null
            || fact.get("transfer_destination_status")!=null || Boolean.TRUE.equals(db.queryForObject("""
               select exists(select 1 from money_transactions where user_id=? and refund_of=?
                             and not excluded and merged_into is null)
               """,Boolean.class,owner,id));
        if (protectedRelation) return new Transition(type,state,"RELATION_CORRECTION_REQUIRED");
        String ordinary = debit ? "EXPENSE" : "INCOME";
        if (ordinary.equals(desired)) return new Transition(ordinary,"CONFIRMED","NONE");
        if ("UNRESOLVED".equals(desired)) return new Transition(ordinary,"UNRESOLVED","NONE");
        return new Transition(ordinary,"UNRESOLVED",pending(desired,fact));
    }

    private static String pending(String desired, Map<String,Object> fact) {
        return switch (desired) {
            case "TRANSFER" -> fact.get("transfer_destination_status")==null ? "TRANSFER_PAIR_PENDING" : "NONE";
            case "SAVINGS","SAVINGS_WITHDRAWAL" -> "SAVINGS_ROUTE_PENDING";
            case "LOAN_PAYMENT" -> fact.get("principal")==null ? "LOAN_SPLIT_PENDING" : "NONE";
            case "REFUND" -> fact.get("refund_of")==null ? "REFUND_ORIGINAL_PENDING" : "NONE";
            case "LOAN_RECEIPT" -> fact.get("loan_id")==null ? "LOAN_LINK_PENDING" : "NONE";
            default -> "NONE";
        };
    }

    void save(UUID id, UUID request, String desired, String relation) {
        db.update("""
            insert into money_owner_financial_decisions
              (user_id,transaction_id,actor_id,request_id,version,declared_type,relation_status)
            values(?,?,?,?,1,?,?)
            on conflict(user_id,transaction_id) do update set
              actor_id=excluded.actor_id,request_id=excluded.request_id,declared_type=excluded.declared_type,
              semantic_category_id=case when excluded.declared_type=money_owner_financial_decisions.declared_type then money_owner_financial_decisions.semantic_category_id end,
              relation_status=excluded.relation_status,version=money_owner_financial_decisions.version+1,updated_at=now()
            """,owner,id,owner,request,desired,relation);
    }

    /** Successful advanced owner TYPE edits supersede a previous inline decision. */
    void supersede(UUID id, UUID request, String desired) {
        var old=db.queryForList("select declared_type from money_owner_financial_decisions where user_id=? and transaction_id=?",
            String.class,owner,id);
        if (!old.isEmpty()) {
            var current=fact(id,false);
            save(id,request,desired,pending(desired,current));
        }
    }

    static boolean meaningApplied(Map<String,Object> row) {
        Object desired=row.get("declaredFinancialType");
        if (desired==null) return !"UNRESOLVED".equals(row.get("canonicalType"));
        if ("DIRECTION_REVIEW".equals(row.get("relationStatus"))) return false;
        if ("REFUND".equals(desired) && "INCOME".equals(row.get("canonicalType")) && "NONE".equals(row.get("relationStatus"))) return true;
        if (SAVINGS.contains(desired)) return "NONE".equals(row.get("relationStatus"));
        return Objects.equals(desired,row.get("canonicalType"));
    }
}
