package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.jdbc.core.namedparam.NamedParameterUtils;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static com.kafka.backend.money.MoneyService.require;

@Service
@Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
public class MoneyV4ReadService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Set<String> BUCKETS = Set.of("I", "E", "L", "SI", "SO", "UNKNOWN_INCOME", "UNKNOWN_SAVINGS");
    private final NamedParameterJdbcTemplate db;
    private final CurrentUserProvider users;
    private static final String facts = loadProjection();

    private static String loadProjection() {
        try {
            return new ClassPathResource("money/v4-contributions.sql").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException error) { throw new UncheckedIOException(error); }
    }

    static String bookMembership(MapSqlParameterSource params, List<Object> args) {
        var sql = NamedParameterUtils.parseSqlStatement(facts + " SELECT id FROM contributions WHERE bucket=:bucket");
        args.addAll(Arrays.asList(NamedParameterUtils.buildValueArray(sql, params, null)));
        return " AND id IN (" + NamedParameterUtils.substituteNamedParameters(sql, params) + ")";
    }


    public MoneyV4ReadService(NamedParameterJdbcTemplate db, CurrentUserProvider users) {
        this.db = db;
        this.users = users;
    }

    private MapSqlParameterSource scope(LocalDate from, LocalDate to, String currency) {
        require(!from.isAfter(to) && currency != null && currency.matches("[A-Z]{3}"), "기간과 통화를 확인하세요.");
        return new MapSqlParameterSource("owner", users.getCurrentUserId())
            .addValue("start", Timestamp.from(from.atStartOfDay(SEOUL).toInstant()))
            .addValue("end", Timestamp.from(to.plusDays(1).atStartOfDay(SEOUL).toInstant()))
            .addValue("currency", currency);
    }

    public record Slice(String bucket, UUID categoryId, UUID loanId, long count, BigDecimal amount) {}
    public record Metrics(String currency, String timezone, BigDecimal actualIncome, BigDecimal consumption,
                          BigDecimal totalExpense, BigDecimal loanRepayment, BigDecimal savingsIn,
                          BigDecimal savingsOut, BigDecimal savingsNet, BigDecimal savingsMovement,
                          long unqualifiedIncomeCount, long unknownSavingsCount, List<Slice> composition) {}

    private String accountScope(String accounts, MapSqlParameterSource params) {
        if (accounts == null) return "";
        if (accounts.equals("none") || accounts.isBlank()) return " AND false";
        var values = accounts.split(",", -1);
        require(values.length <= 200 && Arrays.stream(values).allMatch(v -> v.matches("(?i)[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")), "계좌 선택을 확인하세요.");
        params.addValue("accounts", Arrays.stream(values).map(UUID::fromString).distinct().toList());
        return " AND (from_account_id IN (:accounts) OR to_account_id IN (:accounts))";
    }

    public Metrics summary(LocalDate from, LocalDate to, String currency, String accounts) {
        var params = scope(from, to, currency);
        var scope = accountScope(accounts, params);
        var slices = db.query(facts + """
            SELECT bucket,
                   CASE WHEN bucket IN ('I','E') THEN assigned_category END AS category_id,
                   CASE WHEN bucket='L' THEN loan_id END AS loan_id,
                   count(*) AS n, sum(amount) AS total
            FROM contributions WHERE bucket IS NOT NULL
            """ + scope + """
            GROUP BY 1,2,3 ORDER BY bucket, total DESC, category_id, loan_id
            """, params, (r,n) -> new Slice(r.getString("bucket"),
                r.getObject("category_id", UUID.class), r.getObject("loan_id", UUID.class),
                r.getLong("n"), r.getBigDecimal("total")));
        return metrics(currency, slices);
    }

    static Metrics metrics(String currency, List<Slice> slices) {
        Map<String, BigDecimal> totals = new HashMap<>();
        long unknownIncome = 0, unknownSavings = 0;
        for (var row : slices) {
            totals.merge(row.bucket(), row.amount(), BigDecimal::add);
            if (row.bucket().equals("UNKNOWN_INCOME")) unknownIncome += row.count();
            if (row.bucket().equals("UNKNOWN_SAVINGS")) unknownSavings += row.count();
        }
        var income = totals.getOrDefault("I", BigDecimal.ZERO);
        var expense = totals.getOrDefault("E", BigDecimal.ZERO);
        var loan = totals.getOrDefault("L", BigDecimal.ZERO);
        var in = totals.getOrDefault("SI", BigDecimal.ZERO);
        var out = totals.getOrDefault("SO", BigDecimal.ZERO);
        return new Metrics(currency, SEOUL.getId(), income, expense, expense.add(loan), loan,
                unknownSavings == 0 ? in : null, unknownSavings == 0 ? out : null,
                unknownSavings == 0 ? in.subtract(out) : null, unknownSavings == 0 ? in.add(out) : null,
                unknownIncome, unknownSavings, slices);
    }

    public record SavingsMember(UUID id, String name) {}
    public record SavingsBalance(String currency, LocalDate closingDate, BigDecimal recordedBalance,
                                 int coveredAccounts, List<SavingsMember> members) {}

    public SavingsBalance savingsBalance(String currency) {
        require(currency != null && currency.matches("[A-Z]{3}"), "통화를 확인하세요.");
        var params=new MapSqlParameterSource("owner",users.getCurrentUserId()).addValue("currency",currency);
        var members=db.query("""
            SELECT id, display_name FROM money_accounts WHERE user_id=:owner AND NOT archived
              AND fund_group='SAVINGS' ORDER BY fund_order,id
            """,params,(r,n)->new SavingsMember(r.getObject("id",UUID.class),r.getString("display_name")));
        if(members.isEmpty()) return new SavingsBalance(currency,null,null,0,members);
        params.addValue("members",members.stream().map(SavingsMember::id).toList());
        // A statement close is comparable across physical members on the same Korean banking date.
        // Conflicting closes and changes of membership cannot produce a verified composite balance.
        var closes=db.queryForList("""
            WITH closed AS (
              SELECT s.account_id,s.date_to, min(s.final_balance) AS balance
              FROM money_bank_statements s
              WHERE s.user_id=:owner AND s.account_id IN (:members) AND s.currency=:currency
                AND s.verification IN ('BANK_PDF_TABLE','OWNER_ATTESTED_NATIVE_REPLAY')
                AND s.final_balance IS NOT NULL AND s.date_to<=(now() AT TIME ZONE 'Asia/Seoul')::date
                AND (SELECT h.fund_group FROM money_account_fund_group_history h
                     WHERE h.user_id=s.user_id AND h.account_id=s.account_id
                       AND h.effective_at<((s.date_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')
                     ORDER BY h.effective_at DESC LIMIT 1)='SAVINGS'
              GROUP BY s.account_id,s.date_to
              HAVING min(s.final_balance)=max(s.final_balance)
            )
            SELECT date_to, count(*) AS n,sum(balance) AS amount FROM closed
            GROUP BY date_to ORDER BY date_to DESC LIMIT 1
            """,params);
        if(closes.isEmpty()) return new SavingsBalance(currency,null,null,0,members);
        var close=closes.getFirst();
        int covered=((Number)close.get("n")).intValue();
        return new SavingsBalance(currency,((java.sql.Date)close.get("date_to")).toLocalDate(),
            covered==members.size()?(BigDecimal)close.get("amount"):null,covered,members);
    }

    public record Page(long total, BigDecimal filteredAmount, List<Map<String,Object>> items) {}

    public Page items(LocalDate from, LocalDate to, String currency, String bucket, String accounts,
                      String category, String loan, String search, int limit, int offset) {
        require(BUCKETS.contains(bucket) && limit > 0 && limit <= 100 && offset >= 0, "집계 항목과 조회 범위를 확인하세요.");
        var params = scope(from, to, currency).addValue("bucket", bucket).addValue("limit", limit).addValue("offset", offset);
        var where = new StringBuilder(" FROM contributions WHERE bucket=:bucket").append(accountScope(accounts, params));
        if (category != null) {
            require(bucket.equals("I") || bucket.equals("E"), "분류별 조회 항목을 확인하세요.");
            if ("uncategorized".equals(category)) where.append(" AND assigned_category IS NULL");
            else {
                boolean direct = category.startsWith("direct:");
                params.addValue("category", MoneyMeaningService.uuid(direct ? category.substring(7) : category));
                where.append(direct ? " AND assigned_category=:category" :
                    " AND assigned_category IN (SELECT id FROM money_categories WHERE user_id=:owner AND (id=:category OR parent_id=:category))");
            }
        }
        if (loan != null) {
            require(bucket.equals("L"), "대출별 조회 항목을 확인하세요.");
            if (loan.equals("unlinked")) where.append(" AND loan_id IS NULL");
            else {
                params.addValue("loan", MoneyMeaningService.uuid(loan));
                where.append(" AND loan_id=:loan");
            }
        }
        if (search != null && !search.isBlank()) {
            require(search.length() <= 200, "검색어 길이를 확인하세요.");
            params.addValue("search", search.strip());
            where.append(" AND position(lower(:search) IN lower(concat_ws(' ', title,memo,counterparty_text,from_name,to_name)))>0");
        }
        var totals = db.queryForMap(facts + "SELECT count(*) AS n, coalesce(sum(amount),0) AS total" + where, params);
        var items = db.queryForList(facts + """
            SELECT id, version AS "transactionVersion", amount, currency, occurred_at AS "occurredAt",
                   occurrence_precision AS "occurrencePrecision", source_type AS "sourceType", title, memo,
                   counterparty_text AS "counterpartyText", from_account_id AS "fromAccountId", to_account_id AS "toAccountId",
                   from_name AS "fromName", to_name AS "toName", assigned_category AS "categoryId", loan_id AS "loanId", bucket
            """ + where + " ORDER BY occurred_at DESC,id LIMIT :limit OFFSET :offset", params);
        for (var row : items) {
            if (row.get("occurredAt") instanceof Timestamp ts) row.put("occurredAt", ts.toInstant());
        }
        return new Page(((Number) totals.get("n")).longValue(), (BigDecimal) totals.get("total"), items);
    }
}
