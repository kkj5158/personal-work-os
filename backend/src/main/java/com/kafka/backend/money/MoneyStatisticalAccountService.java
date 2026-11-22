package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.MoneyAccount;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class MoneyStatisticalAccountService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Set<String> PURPOSES = Set.of("INCOME", "CONSUMPTION", "SAVINGS", "INSTALLMENT", "UNASSIGNED");
    private static final List<String> ACCOUNT_COLORS = List.of("#7FAAA4", "#92A6BF", "#A29DB9", "#B2A17F", "#93AB8E", "#B38F9D", "#8FAFB5");
    private static final String PURPOSE_JOIN = """
        LEFT JOIN LATERAL (
          SELECT purpose,version FROM money_statistical_account_purposes p
          WHERE p.account_id=a.id AND p.user_id=a.user_id AND p.effective_at<=?
          ORDER BY p.effective_at DESC LIMIT 1
        ) purpose ON true
        """;
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyProductService product;

    public MoneyStatisticalAccountService(JdbcTemplate db, CurrentUserProvider users, MoneyProductService product) {
        this.db = db;
        this.users = users;
        this.product = product;
    }

    public record Setting(UUID accountId, String purpose, long version) {}
    public record Change(String purpose, Long expectedVersion) {}
    public record Member(UUID accountId, String displayName, String color, String purposeAtCutoff, String currency,
                         Instant asOfCutoff, BigDecimal balance, Instant basisAt, String source, String status,
                         Instant observedAt, BigDecimal difference, boolean known, String reason) {}
    public record Group(String purpose, BigDecimal total, BigDecimal confirmedPartialSum, int memberCount, int knownCount,
                        int unknownCount, long conflicts, String currency, List<Member> members) {}
    public record Unresolved(UUID accountId, String displayName, String reason) {}
    public record Snapshot(Instant asOfCutoff, String currency, Group savings, Group installment, List<Unresolved> unresolved) {}
    private record Account(UUID id, String name, String color, String purpose, boolean membershipUnknown) {}
    private record Evidence(Instant at, BigDecimal amount, String source) {}

    public List<Setting> settings() {
        return db.query("""
            SELECT a.id, coalesce(purpose.purpose,'UNASSIGNED'), coalesce(purpose.version,0)
            FROM money_accounts a
            """ + PURPOSE_JOIN + " WHERE a.user_id=? ORDER BY a.id",
            (r,n) -> new Setting(r.getObject(1,UUID.class),r.getString(2),r.getLong(3)),
            Timestamp.from(Instant.now()),users.getCurrentUserId());
    }

    @Transactional
    public Setting update(UUID account, Change change) {
        require(change.purpose() != null && PURPOSES.contains(change.purpose())
            && change.expectedVersion() != null && change.expectedVersion() >= 0, "통계용 용도와 버전을 확인하세요.");
        UUID owner = users.getCurrentUserId();
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", Object.class, "money:" + owner);
        var current = settings().stream().filter(value -> value.accountId().equals(account)).findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (current.purpose().equals(change.purpose())) return current;
        if (current.version() != change.expectedVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "다른 기기에서 통계용 용도를 변경했습니다.");
        }
        long version = current.version() + 1;
        db.update("""
            INSERT INTO money_statistical_account_purposes(user_id,account_id,effective_at,purpose,version,source)
            VALUES (?,?,clock_timestamp(),?,?,'OWNER')
            """, owner, account, change.purpose(), version);
        return new Setting(account, change.purpose(), version);
    }

    static Instant cutoff(LocalDate to, Instant now) {
        Instant close = to.plusDays(1).atStartOfDay(SEOUL).toInstant().minus(1, ChronoUnit.MICROS);
        return close.isBefore(now) ? close : now.truncatedTo(ChronoUnit.MICROS);
    }

    public Snapshot snapshot(LocalDate to, String currency, String accountIds) {
        return snapshot(to, currency, accountIds, null);
    }

    public Snapshot snapshot(LocalDate to, String currency, String accountIds, Instant asOf) {
        require(currency != null && currency.matches("[A-Z]{3}"), "통화를 확인하세요.");
        Set<UUID> selected = MoneyV4ReadService.parseAccountScope(accountIds);
        UUID owner = users.getCurrentUserId();
        Instant now = Instant.now();
        require(asOf == null || !asOf.isAfter(now), "미래 시각의 잔액을 조회할 수 없습니다.");
        Instant cutoff = cutoff(to, asOf == null ? now : asOf);
        Timestamp at = Timestamp.from(cutoff);
        var accounts = db.query("""
            SELECT a.id,a.display_name,coalesce(purpose.purpose,'UNASSIGNED'),membership.archived IS NULL
            FROM money_accounts a
            """ + PURPOSE_JOIN + """
            LEFT JOIN LATERAL (
              SELECT archived,include_in_statistics FROM money_statistical_membership_history m
              WHERE m.account_id=a.id AND m.user_id=a.user_id AND m.effective_at<=?
              ORDER BY m.effective_at DESC LIMIT 1
            ) membership ON true
            WHERE a.user_id=? AND a.created_at<=?
              AND (membership.archived IS NULL OR (NOT membership.archived AND membership.include_in_statistics))
            ORDER BY a.fund_order,a.id
            """, (r,n) -> {
                var id = r.getObject(1,UUID.class);
                var color = ACCOUNT_COLORS.get((id.toString().hashCode() & Integer.MAX_VALUE) % ACCOUNT_COLORS.size());
                return new Account(id,r.getString(2),color,r.getString(3),r.getBoolean(4));
            },
            at, at, owner, at).stream().filter(a -> selected == null || selected.contains(a.id())).toList();
        var unresolved = accounts.stream().filter(a -> a.membershipUnknown() || a.purpose().equals("UNASSIGNED"))
            .map(a -> new Unresolved(a.id(),a.name(),a.membershipUnknown() ? "MEMBERSHIP_HISTORY_MISSING" : "PURPOSE_UNASSIGNED"))
            .toList();
        var balances = new HashMap<UUID,MoneyProductService.Balance>();
        if (currency.equals("KRW")) {
            product.accountBalances(cutoff).forEach(row ->
                balances.put(((MoneyAccount)row.get("account")).id(),(MoneyProductService.Balance)row.get("balance")));
        }
        var members = accounts.stream().filter(a -> a.purpose().equals("SAVINGS") || a.purpose().equals("INSTALLMENT"))
            .map(a -> member(owner,a,currency,cutoff,balances.get(a.id()))).toList();
        boolean unassigned = accounts.stream().anyMatch(a -> a.purpose().equals("UNASSIGNED"));
        return new Snapshot(cutoff,currency,group("SAVINGS",currency,members,unassigned),
            group("INSTALLMENT",currency,members,unassigned),unresolved);
    }

    private Member member(UUID owner, Account account, String currency, Instant cutoff, MoneyProductService.Balance ledger) {
        if (account.membershipUnknown()) {
            return result(account,currency,cutoff,null,null,null,"UNKNOWN",null,null,false,"MEMBERSHIP_HISTORY_MISSING");
        }
        var evidence = db.query("""
            SELECT observed_at,amount,source FROM (
              SELECT ((date_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')-interval '1 microsecond' AS observed_at,
                     final_balance AS amount, 'BANK_STATEMENT' AS source
              FROM money_bank_statements WHERE user_id=? AND account_id=? AND currency=?
                AND verification IN ('BANK_PDF_TABLE','OWNER_ATTESTED_NATIVE_REPLAY')
              UNION ALL
              SELECT observed_at,amount,'OWNER_OBSERVATION' FROM money_balance_observations
              WHERE user_id=? AND account_id=? AND status='ACTIVE' AND ?='KRW' AND updated_at<=?
              UNION ALL
              SELECT verified_at,amount,'OWNER_CHECKPOINT' FROM money_balance_checkpoints
              WHERE user_id=? AND account_id=? AND ?='KRW' AND created_at<=?
            ) observations WHERE observed_at<=? ORDER BY observed_at DESC, source
            """, (r,n) -> new Evidence(r.getTimestamp(1).toInstant(),r.getBigDecimal(2),r.getString(3)),
            owner,account.id(),currency,owner,account.id(),currency,Timestamp.from(cutoff),
            owner,account.id(),currency,Timestamp.from(cutoff),Timestamp.from(cutoff));
        Evidence latest = evidence.isEmpty() ? null : evidence.getFirst();
        Instant observedAt = latest == null ? null : latest.at();
        if (latest != null && evidence.stream().anyMatch(other ->
            other.at().equals(latest.at()) && other.amount().compareTo(latest.amount()) != 0)) {
            return result(account,currency,cutoff,null,observedAt,latest.source(),"CONFLICT",observedAt,null,false,"OBSERVATIONS_DISAGREE");
        }
        boolean foreign = db.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM money_transactions WHERE user_id=? AND currency<>? AND occurred_at<=?
              AND NOT excluded AND merged_into IS NULL AND (from_account_id=? OR to_account_id=?))
            """, Boolean.class,owner,currency,Timestamp.from(cutoff),account.id(),account.id());
        if (foreign) {
            return result(account,currency,cutoff,null,null,null,"UNKNOWN",observedAt,null,false,"CURRENCY_SCOPE_UNVERIFIED");
        }
        if (latest != null && currency.equals("KRW")) {
            var previous = evidence.stream().filter(entry -> entry.at().isBefore(latest.at())
                && !entry.source().equals("OWNER_OBSERVATION")).findFirst();
            if (previous.isPresent() && !latest.source().equals("OWNER_CHECKPOINT")) {
                var anchor = previous.get();
                BigDecimal difference = latest.amount().subtract(anchor.amount().add(
                    product.ledgerDelta(account.id(),anchor.at(),latest.at())));
                if (difference.signum() != 0) {
                    return result(account,currency,cutoff,null,anchor.at(),latest.source(),
                        "CONFLICT",observedAt,difference,false,"OBSERVATION_LEDGER_MISMATCH");
                }
            }
        }
        if (latest != null && latest.at().equals(cutoff)) {
            return result(account,currency,cutoff,latest.amount(),latest.at(),latest.source(),
                latest.source().equals("BANK_STATEMENT") ? "BANK_OBSERVED" : "OWNER_CHECKED",observedAt,null,true,null);
        }
        if (ledger != null && ledger.asOf() != null && (!ledger.provenance().contains("MANUALLY_VERIFIED")
                || evidence.stream().anyMatch(entry -> entry.source().equals("OWNER_CHECKPOINT") && entry.at().equals(ledger.asOf())))) {
            Instant basis = ledger.asOf();
            if (latest != null && latest.at().isAfter(basis) && latest.source().equals("BANK_STATEMENT")) {
                return result(account,currency,cutoff,latest.amount().add(product.ledgerDelta(account.id(),latest.at(),cutoff)),
                    latest.at(),latest.source(),"LEDGER_ESTIMATE",observedAt,null,false,"NO_OBSERVATION_AT_CUTOFF");
            }
            return result(account,currency,cutoff,ledger.amount(),basis,ledger.provenance(),"LEDGER_ESTIMATE",
                observedAt == null || basis.isAfter(observedAt) ? basis : observedAt,null,false,"NO_OBSERVATION_AT_CUTOFF");
        }
        if (latest != null && latest.source().equals("BANK_STATEMENT") && currency.equals("KRW")) {
            return result(account,currency,cutoff,latest.amount().add(product.ledgerDelta(account.id(),latest.at(),cutoff)),
                latest.at(),latest.source(),"LEDGER_ESTIMATE",observedAt,null,false,"NO_OBSERVATION_AT_CUTOFF");
        }
        return result(account,currency,cutoff,null,null,latest == null ? null : latest.source(),
            "UNKNOWN",observedAt,null,false,latest == null ? "NO_ANCHOR" : "NO_OBSERVATION_AT_CUTOFF");
    }

    private static Member result(Account a, String currency, Instant cutoff, BigDecimal balance, Instant basis,
                                 String source, String status, Instant observed, BigDecimal difference,
                                 boolean known, String reason) {
        return new Member(a.id(),a.name(),a.color(),a.purpose(),currency,cutoff,balance,basis,source,status,observed,difference,known,reason);
    }

    private static Group group(String purpose, String currency, List<Member> rows, boolean unresolved) {
        var members = rows.stream().filter(m -> m.purposeAtCutoff().equals(purpose)).toList();
        var known = members.stream().filter(Member::known).toList();
        BigDecimal partial = known.stream().map(Member::balance).reduce(BigDecimal.ZERO,BigDecimal::add);
        int unknown = members.size()-known.size();
        return new Group(purpose,unknown == 0 && !unresolved ? partial : null,known.isEmpty() ? null : partial,
            members.size(),known.size(),unknown,members.stream().filter(m -> m.status().equals("CONFLICT")).count(),currency,members);
    }
}
