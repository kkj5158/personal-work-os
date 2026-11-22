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
          when d.declared_type='REFUND' and d.relation_status='NONE' and t.type in ('INCOME','REFUND') and t.meaning_state='CONFIRMED' then 'NONE'
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
    private static final String BASE = """
        case when t.meaning_state='CONFIRMED' then
          case when t.type in ('REFUND','LOAN_RECEIPT','INCOME') then 'INCOME'
               when t.type in ('LOAN_PAYMENT','EXPENSE') then 'EXPENSE'
               when t.type='TRANSFER' then 'TRANSFER' end end
        """;
    static final String FIELDS = DISPLAY + " as display_type, " + CANONICAL + " as \"canonicalType\", "
        + BASE + " as \"baseFinancialType\", "
        + "d.request_id as \"decisionRequestId\", d.version as \"decisionVersion\", d.actor_id as \"decisionActorId\", d.declared_type as \"declaredFinancialType\", " + RELATION + " as \"relationStatus\"";
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
            boolean legacy = "REFUND".equals(before.get("type"));
            var categories=db.queryForList("""
                select b.category_id from money_v4_income_categories b join money_categories c on c.user_id=b.user_id and c.id=b.category_id
                left join money_categories parent on parent.user_id=c.user_id and parent.id=c.parent_id
                where b.user_id=? and b.basis='REFUND' and not c.archived and not coalesce(parent.archived,false)
                """, UUID.class,owner);
            if (categories.isEmpty()) {
                // A new installation may have the stock dictionary without a refund leaf.
                // A renamed or archived configured leaf or an ambiguous custom refund must be resolved by its owner.
                var parents=db.queryForList("""
                    select c.id from money_categories c where c.user_id=? and c.kind='INCOME' and c.seeded
                    and c.name='기타수입' and c.parent_id is null and not c.archived
                    and not exists(select 1 from money_v4_income_categories p where p.user_id=c.user_id and p.basis='REFUND')
                    and not exists(select 1 from money_categories leaf where leaf.user_id=c.user_id and leaf.kind='INCOME'
                        and replace(leaf.name,' ','') like '%환불%')
                    """,UUID.class,owner);
                if (parents.size()==1) {
                    var leaf=UUID.randomUUID();
                    db.update("""
                        insert into money_categories(id,user_id,name,color,kind,sort_order,parent_id,seeded)
                        values(?,?,'환불금','#4FAF83','INCOME',(select coalesce(max(sort_order),-1)+1
                            from money_categories where user_id=? and parent_id=?),?,true)
                        """,leaf,owner,owner,parents.getFirst(),parents.getFirst());
                    db.update("insert into money_v4_income_categories(user_id,category_id,basis) values(?,?,'REFUND')",owner,leaf);
                    categories=List.of(leaf);
                }
            }
            require(categories.size()==1,"환불 수입에 사용할 활성 분류를 확인하세요.");
            // Preserve previous directly picked categories. The explicit refund detail also excludes the receipt from I.
            if (!legacy) db.update("update money_transactions set category_id=coalesce(category_id,?) where user_id=? and id=?",categories.getFirst(),owner,id);
            next = new Transition(legacy ? "REFUND" : "INCOME","CONFIRMED","NONE");
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
