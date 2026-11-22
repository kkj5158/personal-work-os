package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

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
    private static final Set<String> BUCKETS = Set.of("I", "E", "L", "SI", "SO", "UNKNOWN_INCOME", "UNKNOWN_SAVINGS", "UNKNOWN_TRACKING", "FAMILY_SUPPORT");
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
                          long unqualifiedIncomeCount, long unknownSavingsCount, long unknownTrackingCount, List<Slice> composition) {}

    private String accountScope(String accounts, MapSqlParameterSource params) {
        var selected = parseAccountScope(accounts);
        if (selected == null) return "";
        if (selected.isEmpty()) return " AND false";
        params.addValue("accounts", selected);
        return " AND (CASE WHEN source_type='REFUND' THEN refund_tracking_account IN (:accounts) ELSE (from_account_id IN (:accounts) OR to_account_id IN (:accounts)) END)";
    }

    static Set<UUID> parseAccountScope(String accounts) {
        if (accounts == null) return null;
        if (accounts.equals("none") || accounts.isBlank()) return Set.of();
        var values = accounts.split(",", -1);
        require(values.length <= 200 && Arrays.stream(values).allMatch(v -> v.matches("(?i)[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")), "계좌 선택을 확인하세요.");
        return new LinkedHashSet<>(Arrays.stream(values).map(UUID::fromString).toList());
    }

    public Metrics summary(LocalDate from, LocalDate to, String currency, String accounts) {
        var params = scope(from, to, currency);
        var scope = accountScope(accounts, params);
        var slices = db.query(facts + """
            SELECT bucket,
                   CASE WHEN bucket IN ('I','E') THEN assigned_category END AS category_id,
                   CASE WHEN bucket='L' THEN loan_id END AS loan_id,
                   count(*) AS n, sum(amount) AS total
            FROM contributions WHERE bucket IS NOT NULL AND bucket<>'FAMILY_SUPPORT'
            """ + scope + """
            GROUP BY 1,2,3 ORDER BY bucket, total DESC, category_id, loan_id
            """, params, (r,n) -> new Slice(r.getString("bucket"),
                r.getObject("category_id", UUID.class), r.getObject("loan_id", UUID.class),
                r.getLong("n"), r.getBigDecimal("total")));
        return metrics(currency, slices);
    }

    public record ChartPreference(boolean includeFamilySupport, long version) {}
    public record ChartPreferenceChange(Boolean includeFamilySupport, Long expectedVersion) {}
    public record IncomeComposition(BigDecimal actualIncome, BigDecimal familySupport, BigDecimal chartIncome,
                                    boolean includeFamilySupport, List<Slice> composition) {}

    public ChartPreference chartPreference() {
        return db.query("""
            SELECT include_family_support, version FROM money_composition_preferences WHERE user_id=:owner
            """, new MapSqlParameterSource("owner", users.getCurrentUserId()),
            (r, n) -> new ChartPreference(r.getBoolean(1), r.getLong(2)))
            .stream().findFirst().orElse(new ChartPreference(false, 0));
    }

    @Transactional
    public ChartPreference updateChartPreference(ChartPreferenceChange change) {
        require(change.includeFamilySupport() != null && change.expectedVersion() != null
            && change.expectedVersion() >= 0, "표시 설정 버전을 확인하세요.");
        var params = new MapSqlParameterSource("owner", users.getCurrentUserId())
            .addValue("enabled", change.includeFamilySupport()).addValue("version", change.expectedVersion());
        db.getJdbcTemplate().queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
            Object.class, "money-composition:" + users.getCurrentUserId());
        var current = chartPreference();
        if (current.includeFamilySupport() == change.includeFamilySupport()) return current;
        if (current.version() != change.expectedVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 기기에서 표시 설정을 변경했습니다.");
        }
        db.update("""
            INSERT INTO money_composition_preferences(user_id, include_family_support, version) VALUES (:owner,:enabled,1)
            ON CONFLICT (user_id) DO UPDATE SET include_family_support=excluded.include_family_support,
                version=money_composition_preferences.version+1, updated_at=clock_timestamp()
            """, params);
        return new ChartPreference(change.includeFamilySupport(), current.version() + 1);
    }

    public IncomeComposition incomeComposition(LocalDate from, LocalDate to, String currency, String accounts) {
        var params = scope(from, to, currency);
        var accountFilter = accountScope(accounts, params);
        var slices = db.query(facts + """
            SELECT bucket, assigned_category, count(*) AS n, sum(amount) AS amount
            FROM contributions WHERE bucket IN ('I','FAMILY_SUPPORT')
            """ + accountFilter + " GROUP BY bucket, assigned_category ORDER BY bucket, amount DESC, assigned_category",
            params, (r, n) -> new Slice(r.getString("bucket"), r.getObject("assigned_category", UUID.class),
                null, r.getLong("n"), r.getBigDecimal("amount")));
        var income = slices.stream().filter(row -> row.bucket().equals("I")).map(Slice::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        var support = slices.stream().filter(row -> row.bucket().equals("FAMILY_SUPPORT")).map(Slice::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        boolean include = chartPreference().includeFamilySupport();
        return new IncomeComposition(income, support, include ? income.add(support) : income, include,
            include ? slices : slices.stream().filter(row -> row.bucket().equals("I")).toList());
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
                unknownIncome, unknownSavings, slices.stream().filter(row->row.bucket().equals("UNKNOWN_TRACKING")).mapToLong(Slice::count).sum(), slices);
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
            require(Set.of("I", "E", "FAMILY_SUPPORT").contains(bucket), "분류별 조회 항목을 확인하세요.");
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
