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

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class MoneyStatisticalAccountService {
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Set<String> PURPOSES = Set.of("INCOME", "CONSUMPTION", "SAVINGS", "INSTALLMENT", "UNASSIGNED");
    private static final List<String> ACCOUNT_COLORS = List.of("#7FAAA4", "#92A6BF", "#A29DB9", "#B2A17F", "#93AB8E", "#B38F9D", "#8FAFB5");
    private static final String PURPOSE_JOIN = """
        CROSS JOIN (SELECT cast(? as timestamptz) AS at_time) cutoff
        LEFT JOIN LATERAL (
          SELECT h.fund_group,coalesce(c.corrected_subtype,h.savings_subtype) AS subtype
          FROM money_account_fund_group_history h
          LEFT JOIN money_account_subtype_corrections c ON c.user_id=h.user_id AND c.account_id=h.account_id
            AND c.effective_at=h.effective_at AND c.recorded_at<=cutoff.at_time
          WHERE h.account_id=a.id AND h.user_id=a.user_id AND h.effective_at<=cutoff.at_time
          ORDER BY h.effective_at DESC LIMIT 1
        ) fund ON true
        CROSS JOIN LATERAL (
          SELECT fund.fund_group, fund.subtype,
            money_tracked_at(a.user_id,a.id,'SAVINGS',cutoff.at_time) AS savings_tracked,
            money_tracked_at(a.user_id,a.id,'INSTALLMENT',cutoff.at_time) AS installment_tracked,
            CASE WHEN fund.fund_group IS NULL THEN 'UNASSIGNED'
            WHEN fund.fund_group='SAVINGS' AND
              (fund.subtype IS NULL OR fund.subtype NOT IN ('SAVINGS_ACCOUNT','INSTALLMENT')) THEN 'UNASSIGNED'
            WHEN fund.fund_group='SAVINGS' THEN CASE
              WHEN money_tracked_at(a.user_id,a.id,CASE fund.subtype WHEN 'INSTALLMENT' THEN 'INSTALLMENT' ELSE 'SAVINGS' END,cutoff.at_time)
                THEN CASE fund.subtype WHEN 'INSTALLMENT' THEN 'INSTALLMENT' ELSE 'SAVINGS' END
              WHEN money_tracked_at(a.user_id,a.id,CASE fund.subtype WHEN 'INSTALLMENT' THEN 'INSTALLMENT' ELSE 'SAVINGS' END,cutoff.at_time) IS NULL THEN 'UNASSIGNED'
              ELSE 'NOT_SELECTED' END
            WHEN money_tracked_at(a.user_id,a.id,'INCOME',cutoff.at_time) THEN 'INCOME'
            WHEN money_tracked_at(a.user_id,a.id,'EXPENSE',cutoff.at_time) THEN 'CONSUMPTION'
            ELSE 'NOT_SELECTED' END AS purpose,
            (SELECT version FROM money_tracking_settings WHERE user_id=a.user_id) AS version
        ) purpose
        """;
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyProductService product;
    private final MoneyMeaningService meaning;

    public MoneyStatisticalAccountService(JdbcTemplate db, CurrentUserProvider users, MoneyProductService product, MoneyMeaningService meaning) {
        this.db = db;
        this.users = users;
        this.product = product;
        this.meaning = meaning;
    }

    public record Setting(UUID accountId, String purpose, long version) {}
    public record Change(String purpose, Long expectedVersion) {}
    public enum Confidence { VERIFIED, ESTIMATED, UNKNOWN, CONFLICT }

    public record Member(UUID accountId, String displayName, String color, String purposeAtCutoff, String currency,
                         Instant asOfCutoff, BigDecimal balance, Instant basisAt, String source, String status,
                         Instant observedAt, BigDecimal difference, boolean known, String reason,
                         Confidence confidence, boolean displayable, String displayBalance, Instant bankObservedAt, String displayDifference) {}
    public record Group(String purpose, BigDecimal total, BigDecimal confirmedPartialSum, int memberCount, int knownCount,
                        int unknownCount, long conflicts, String currency, List<Member> members,
                        Confidence confidence, String displayTotal, String verifiedSubtotal, String estimatedSubtotal,
                        int estimatedCount, int membershipUnknownCount) {}
    public record Unresolved(UUID accountId, String displayName, String reason, List<String> possibleGroups) {}
    public record Snapshot(Instant asOfCutoff, String currency, Group savings, Group installment, List<Unresolved> unresolved) {}
    private record Account(UUID id, String name, String color, String purpose, boolean membershipUnknown,
                           List<String> possibleGroups) {}
    private record Evidence(Instant at, BigDecimal amount, String source, boolean exact) {
        Evidence(Instant at, BigDecimal amount, String source) { this(at,amount,source,true); }
    }

    public List<Setting> settings() {
        return db.query("""
            SELECT a.id, coalesce(nullif(purpose.purpose,'NOT_SELECTED'),'UNASSIGNED'), coalesce(purpose.version,0)
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
        MoneyMeaningService.version(current.version(),change.expectedVersion());
        if (current.purpose().equals(change.purpose())) return current;
        // Legacy clients select a single purpose. Preserve independent tracking kinds.
        var state=meaning.tracking();
        var expense=selection(state,"expense");var income=selection(state,"income");
        var savings=selection(state,"savings");var installment=selection(state,"installment");
        var target=switch(change.purpose().equals("UNASSIGNED")?current.purpose():change.purpose()){
            case "SAVINGS" -> savings;
            case "INSTALLMENT" -> installment;
            case "INCOME" -> income;
            case "CONSUMPTION" -> expense;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        };
        if(change.purpose().equals("UNASSIGNED"))target.remove(account);
        else if(!target.contains(account))target.add(account);
        meaning.saveTracking(new MoneyMeaningService.TrackingInput(expense,income,current.version(),savings,installment));
        return settings().stream().filter(v->v.accountId().equals(account)).findFirst().orElseThrow();
    }

    private static List<UUID> selection(Map<String,Object> state,String kind) {
        return new ArrayList<>(((List<?>)state.get(kind)).stream().map(UUID.class::cast).toList());
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
            SELECT a.id,a.display_name,purpose.purpose,membership.archived IS NULL,
              purpose.fund_group,purpose.subtype,purpose.savings_tracked,purpose.installment_tracked
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
                String purpose = r.getString(3);
                boolean missingMembership = r.getBoolean(4);
                String fund = r.getString(5);
                var possible = new ArrayList<String>();
                if ("SAVINGS".equals(fund) && purpose.equals("UNASSIGNED")) {
                    String subtype = r.getString(6);
                    if ("INSTALLMENT".equals(subtype)) possible.add("INSTALLMENT");
                    else if ("SAVINGS_ACCOUNT".equals(subtype)) possible.add("SAVINGS");
                    else {
                        if (!Boolean.FALSE.equals(r.getObject(7,Boolean.class))) possible.add("SAVINGS");
                        if (!Boolean.FALSE.equals(r.getObject(8,Boolean.class))) possible.add("INSTALLMENT");
                    }
                } else if (fund == null) {
                    // A missing fund history is relevant where an effective tracking selection includes the account.
                    if (r.getBoolean(7)) possible.add("SAVINGS");
                    if (r.getBoolean(8)) possible.add("INSTALLMENT");
                }
                return new Account(id,r.getString(2),color,purpose,missingMembership,List.copyOf(possible));
            },
            at, at, owner, at).stream().filter(a -> selected == null || selected.contains(a.id())).toList();
        var unresolved = accounts.stream().filter(a -> a.membershipUnknown() || a.purpose().equals("UNASSIGNED"))
            .map(a -> new Unresolved(a.id(),a.name(),a.membershipUnknown() ? "MEMBERSHIP_HISTORY_MISSING"
                : a.possibleGroups().isEmpty() ? "PURPOSE_UNASSIGNED" : "TRACKING_OR_FUND_HISTORY_MISSING",a.possibleGroups()))
            .toList();
        var members = accounts.stream().filter(a -> a.purpose().equals("SAVINGS") || a.purpose().equals("INSTALLMENT"))
            .map(a -> member(owner,a,currency,cutoff)).toList();
        return new Snapshot(cutoff,currency,group("SAVINGS",currency,members,unresolved),
            group("INSTALLMENT",currency,members,unresolved),unresolved);
    }

    private Member member(UUID owner, Account account, String currency, Instant cutoff) {
        if (account.membershipUnknown()) {
            return result(account,currency,cutoff,null,null,Confidence.UNKNOWN,null,null,null,"MEMBERSHIP_HISTORY_MISSING");
        }
        if (!currency.equals("KRW") || MoneyStatisticalLedgerCoverage.unsupportedCurrency(db,owner,account.id(),cutoff)) {
            return result(account,currency,cutoff,null,null,Confidence.UNKNOWN,null,null,null,"CURRENCY_SCOPE_UNVERIFIED");
        }

        var statements = MoneyStatisticalLedgerCoverage.statements(db,owner,account.id(),currency);
        Timestamp at = Timestamp.from(cutoff);
        var evidence = db.query("""
            SELECT observed_at,amount,'OWNER_OBSERVATION' FROM money_balance_observations
            WHERE user_id=? AND account_id=? AND status='ACTIVE' AND updated_at<=? AND observed_at<=?
            UNION ALL
            SELECT verified_at,amount,'OWNER_CHECKPOINT' FROM money_balance_checkpoints
            WHERE user_id=? AND account_id=? AND created_at<=? AND verified_at<=?
            """, (r,n) -> new Evidence(r.getTimestamp(1).toInstant(),r.getBigDecimal(2),r.getString(3)),
            owner,account.id(),at,at,owner,account.id(),at,at);
        statements.stream().filter(s -> !s.end().isAfter(cutoff))
            .forEach(s -> evidence.add(new Evidence(s.end(),s.closing(),s.source())));
        product.statisticalNotificationObservations(account.id(),cutoff).forEach(observation ->
            evidence.add(new Evidence(observation.at(),observation.amount(),"BANK_NOTIFICATION",observation.exact())));
        evidence.sort(Comparator.comparing(Evidence::at).reversed().thenComparingInt(e -> switch (e.source()) {
            case "BANK_STATEMENT" -> 0;
            case "OWNER_ATTESTED_STATEMENT" -> 1;
            case "BANK_NOTIFICATION" -> 2;
            case "OWNER_OBSERVATION" -> 3;
            default -> 4;
        }));
        if (evidence.isEmpty()) {
            return result(account,currency,cutoff,null,null,Confidence.UNKNOWN,null,null,null,"NO_ANCHOR");
        }
        Evidence latest = evidence.getFirst();
        Instant bankObservedAt = evidence.stream().filter(e -> e.source().startsWith("BANK_"))
            .findFirst().map(Evidence::at).orElse(null);
        // A checkpoint can deliberately establish a new baseline. Compare independent observations with the
        // previous statement or checkpoint first, then a previous eligible bank push when there is no such base.
        var prior = evidence.stream().filter(e -> e.at().isBefore(latest.at())
            && !e.source().equals("OWNER_OBSERVATION")).toList();
        Evidence previous = prior.stream().filter(e -> !e.source().equals("BANK_NOTIFICATION"))
            .findFirst().orElse(prior.isEmpty() ? null : prior.getFirst());
        BigDecimal difference = disagreement(evidence,latest);
        if (difference==null && previous!=null && !latest.source().equals("OWNER_CHECKPOINT")) {
            difference = disagreement(evidence,previous);
        }
        if (difference!=null) {
            return result(account,currency,cutoff,null,latest,Confidence.CONFLICT,latest.at(),bankObservedAt,
                difference,"OBSERVATIONS_DISAGREE");
        }
        if (previous!=null && !latest.source().equals("OWNER_CHECKPOINT")) {
            difference = latest.amount().subtract(previous.amount().add(product.ledgerDelta(account.id(),previous.at(),latest.at())));
            if (difference.signum()!=0) {
                return result(account,currency,cutoff,null,previous,Confidence.CONFLICT,latest.at(),bankObservedAt,
                    difference,"OBSERVATION_LEDGER_MISMATCH");
            }
        }
        if (latest.at().equals(cutoff)) {
            var exact = evidence.stream().filter(e -> e.at().equals(cutoff) && e.exact()).findFirst();
            return exact.map(e -> result(account,currency,cutoff,e.amount(),e,Confidence.VERIFIED,latest.at(),bankObservedAt,null,null))
                .orElseGet(() -> result(account,currency,cutoff,null,latest,Confidence.UNKNOWN,latest.at(),bankObservedAt,
                    null,"NO_OBSERVATION_AT_CUTOFF"));
        }
        var calculation = MoneyStatisticalLedgerCoverage.calculate(db,owner,account.id(),latest.at(),latest.amount(),cutoff,statements);
        if (calculation.reason()!=null) {
            return result(account,currency,cutoff,null,latest,calculation.difference()==null ? Confidence.UNKNOWN : Confidence.CONFLICT,
                latest.at(),bankObservedAt,calculation.difference(),calculation.reason());
        }
        if (product.hasPendingStatisticalEvidence(account.id(),latest.at(),cutoff)) {
            return result(account,currency,cutoff,null,latest,Confidence.UNKNOWN,latest.at(),bankObservedAt,null,"PENDING_SOURCE_EVIDENCE");
        }
        return result(account,currency,cutoff,calculation.amount(),latest,Confidence.ESTIMATED,latest.at(),bankObservedAt,null,null);
    }

    private static BigDecimal disagreement(List<Evidence> evidence, Evidence chosen) {
        return evidence.stream().filter(entry -> entry.at().equals(chosen.at()))
            .map(entry -> entry.amount().subtract(chosen.amount())).filter(amount -> amount.signum()!=0)
            .sorted().findFirst().orElse(null);
    }

    private static Member result(Account a, String currency, Instant cutoff, BigDecimal balance, Evidence anchor,
                                 Confidence confidence, Instant observed, Instant bankObserved, BigDecimal difference, String reason) {
        String source = anchor==null ? null : anchor.source();
        String status = switch (confidence) {
            case VERIFIED -> source.startsWith("BANK_") ? "BANK_OBSERVED" : "OWNER_CHECKED";
            case ESTIMATED -> "LEDGER_ESTIMATE";
            case UNKNOWN -> "UNKNOWN";
            case CONFLICT -> "CONFLICT";
        };
        return new Member(a.id(),a.name(),a.color(),a.purpose(),currency,cutoff,balance,
            anchor==null ? null : anchor.at(),source,status,observed,difference,confidence==Confidence.VERIFIED,
            reason,confidence,balance!=null,decimal(balance),bankObserved,decimal(difference));
    }

    private static String decimal(BigDecimal amount) {
        return amount==null ? null : amount.stripTrailingZeros().toPlainString();
    }

    private static BigDecimal subtotal(List<Member> members) {
        return members.isEmpty() ? null : members.stream().map(Member::balance).reduce(BigDecimal.ZERO,BigDecimal::add);
    }

    private static Group group(String purpose, String currency, List<Member> rows, List<Unresolved> unresolved) {
        var members = rows.stream().filter(m -> m.purposeAtCutoff().equals(purpose)).toList();
        var verified = members.stream().filter(Member::known).toList();
        var estimates = members.stream().filter(m -> m.confidence()==Confidence.ESTIMATED).toList();
        BigDecimal confirmed = subtotal(verified);
        BigDecimal estimated = subtotal(estimates);
        int unknown = members.size()-verified.size()-estimates.size();
        long conflicts = members.stream().filter(m -> m.confidence()==Confidence.CONFLICT).count();
        int missingMembership = (int) unresolved.stream().filter(a -> a.possibleGroups().contains(purpose)).count();
        boolean complete = !members.isEmpty() && unknown==0 && missingMembership==0;
        Confidence confidence = conflicts>0 ? Confidence.CONFLICT : !complete ? Confidence.UNKNOWN
            : estimates.isEmpty() ? Confidence.VERIFIED : Confidence.ESTIMATED;
        BigDecimal displayTotal = complete ? subtotal(members) : null;
        // Legacy consumers continue to see a total only for a complete verified group.
        return new Group(purpose,confidence==Confidence.VERIFIED ? displayTotal : null,confirmed,members.size(),
            verified.size(),unknown,conflicts,currency,members,confidence,decimal(displayTotal),decimal(confirmed),
            decimal(estimated),estimates.size(),missingMembership);
    }
}
