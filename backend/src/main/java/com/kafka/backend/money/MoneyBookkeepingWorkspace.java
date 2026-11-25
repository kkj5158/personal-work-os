package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static com.kafka.backend.money.MoneyService.require;

@Service
@Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
public class MoneyBookkeepingWorkspace {
    public record Filter(LocalDate from, LocalDate to, String search, String accountIds, String categoryIds,
            String baseDirection, Boolean uncategorized, String currency, BigDecimal minAmount, BigDecimal maxAmount,
            Integer limit, Integer offset, Boolean allPeriods) {}
    public enum Lane { UNRESOLVED, FOLLOWUP, FAILED }
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String ACTIVE = " from money_transactions t" + MoneyOwnerFinancialDecision.JOIN
            + " where t.user_id=? and not t.excluded and t.merged_into is null"
            + " and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT')";
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyAccountLedgerService ledger;
    private final MoneyFinancialEngineService engine;
    private final MoneyService money;

    public MoneyBookkeepingWorkspace(JdbcTemplate db, CurrentUserProvider users, MoneyAccountLedgerService ledger,
            MoneyFinancialEngineService engine, MoneyService money) {
        this.db=db; this.users=users; this.ledger=ledger; this.engine=engine; this.money=money;
    }

    public Map<String,Object> confirmed(Filter f) {
        boolean allPeriods=Boolean.TRUE.equals(f.allPeriods());
        if(allPeriods) {
            require(Boolean.TRUE.equals(f.uncategorized()) && f.from()==null && f.to()==null,
                    "전체 기간 조회는 미분류 거래에 사용할 수 있습니다.");
        } else {
            require(f.from()!=null && f.to()!=null && !f.to().isBefore(f.from()) && ChronoUnit.DAYS.between(f.from(),f.to())<=366,
                    "조회 기간은 1일부터 367일까지 선택하세요.");
        }
        int limit=f.limit()==null?50:f.limit(), offset=f.offset()==null?0:f.offset();
        validatePage(limit,offset);
        UUID owner=users.getCurrentUserId();
        var args=new ArrayList<Object>(List.of(owner));
        var where=new StringBuilder(ACTIVE).append(" and t.meaning_state='CONFIRMED'");
        if(!allPeriods) {
            where.append(" and t.occurred_at>=? and t.occurred_at<?");
            args.add(Timestamp.from(f.from().atStartOfDay(SEOUL).toInstant()));
            args.add(Timestamp.from(f.to().plusDays(1).atStartOfDay(SEOUL).toInstant()));
        }
        if(f.accountIds()!=null) {
            var accounts=ids(f.accountIds());
            where.append(" and (t.from_account_id=any(?) or t.to_account_id=any(?))");
            args.add(accounts); args.add(accounts);
        }
        if(f.currency()!=null) {
            require(f.currency().matches("[A-Z]{3}"),"통화 코드를 확인하세요.");
            where.append(" and t.currency=?"); args.add(f.currency());
        }
        if(f.baseDirection()!=null) {
            var types=switch(f.baseDirection()) {
                case "INCOME" -> "('INCOME','REFUND','LOAN_RECEIPT')";
                case "EXPENSE" -> "('EXPENSE','LOAN_PAYMENT')";
                case "TRANSFER" -> "('TRANSFER')";
                default -> throw new InvalidRequestException("수입·지출·이체 중 선택하세요.");
            };
            where.append(" and t.type in ").append(types);
        }
        MoneyWebRevisionService.amountRange(f.minAmount(),f.maxAmount());
        if(f.minAmount()!=null){where.append(" and t.amount>=?"); args.add(f.minAmount());}
        if(f.maxAmount()!=null){where.append(" and t.amount<=?"); args.add(f.maxAmount());}
        MoneyService.text(f.search(),200,false,"검색");
        boolean searching=f.search()!=null&&!f.search().isBlank();
        boolean uncategorized=Boolean.TRUE.equals(f.uncategorized());
        String cte="";
        if(searching || uncategorized || f.categoryIds()!=null) {
            cte=MoneyWebService.V4_BOOK;
            args.addFirst(owner);
            if(searching) {
                where.append("""
                     and (position(lower(?) in lower(concat_ws(' ',t.title,t.memo,t.counterparty_text)))>0
                       or exists(select 1 from effective e where e.id=t.id and
                         position(lower(?) in lower(concat_ws(' ',e.title,e.memo,e."counterpartyText")))>0))
                    """);
                args.add(f.search()); args.add(f.search());
            }
            if(uncategorized || f.categoryIds()!=null) {
                var categories=new ArrayList<String>();
                if(uncategorized) categories.add("e.\"categoryId\" is null");
                if(f.categoryIds()!=null) {categories.add("e.\"categoryId\"=any(?)"); args.add(ids(f.categoryIds()));}
                where.append(" and exists(select 1 from effective e where e.id=t.id and (")
                        .append(String.join(" or ",categories)).append("))");
            }
        }
        return page(cte,where.toString(),args,limit,offset).asMap();
    }

    public Map<String,Object> review(Lane lane,int limit,int offset) {
        validatePage(limit,offset);
        UUID owner=users.getCurrentUserId();
        if(lane==Lane.FAILED) {
            String failures=" from money_command_outcomes where user_id=? and status='NOT_APPLIED'";
            return Map.of("total",db.queryForObject("select count(*)"+failures,Long.class,owner),
                    "items",db.queryForList("select request_id as id,command,result->>'reason' as reason,"
                            +"result->>'message' as message,created_at as \"occurredAt\""+failures
                            +" order by created_at desc,request_id limit ? offset ?",owner,limit,offset));
        }
        String relation="("+MoneyOwnerFinancialDecision.RELATION+")";
        String where=ACTIVE+(lane==Lane.FOLLOWUP?" and "+relation+"<>'NONE'":
                " and t.meaning_state='UNRESOLVED' and "+relation+"='NONE'");
        var result=page("",where,new ArrayList<>(List.of(owner)),limit,offset);
        var accounts=lane==Lane.UNRESOLVED?money.accounts():List.<MoneyTypes.MoneyAccount>of();
        for(var item:result.items()) {
            var reason=lane==Lane.FOLLOWUP?item.get("relationStatus"):
                    engine.classify(money.transaction((UUID)item.get("id")),accounts).reason();
            item.put("reviewReason",reason);
        }
        return result.asMap();
    }

    private record Page(List<Map<String,Object>> items,long total) {
        Map<String,Object> asMap(){return Map.of("items",items,"total",total);}
    }

    private Page page(String cte,String where,List<Object> args,int limit,int offset) {
        long total=db.queryForObject(cte+"select count(*)"+where,Long.class,args.toArray());
        args.add(limit); args.add(offset);
        var items=db.queryForList(cte+"select t.*,"+MoneyOwnerFinancialDecision.FIELDS+where
                +" order by t.occurred_at desc,t.id limit ? offset ?",args.toArray());
        for(var row:items) {
            row.remove("user_id");
            row.replaceAll((key,value)->value instanceof Timestamp t?t.toInstant():value);
        }
        ledger.enrich(items,null);
        return new Page(items,total);
    }

    private static void validatePage(int limit,int offset) {
        require(limit>=1 && limit<=50 && offset>=0 && offset<=10000,"조회 범위를 확인하세요.");
    }
    private static UUID[] ids(String value) {
        if(value.isBlank() || value.equals("none")) return new UUID[0];
        try {
            String[] parts=value.split(",",-1);
            require(parts.length<=200,"조회 항목이 너무 많습니다.");
            return Arrays.stream(parts).map(UUID::fromString).toArray(UUID[]::new);
        } catch(IllegalArgumentException ex){throw new InvalidRequestException("조회 식별자를 확인하세요.");}
    }
}
