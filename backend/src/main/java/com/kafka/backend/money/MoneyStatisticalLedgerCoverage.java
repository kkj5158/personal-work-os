package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.kafka.backend.money.MoneyStatisticalAccountService.SEOUL;

/** Statement coverage is positive evidence. An empty notification or ledger query cannot prove inactivity. */
final class MoneyStatisticalLedgerCoverage {
    private MoneyStatisticalLedgerCoverage() {}

    static final String STATEMENTS = """
        SELECT s.id,s.verification,s.opening_balance,s.final_balance,s.row_count,
          CASE WHEN s.verification='BANK_PDF_TABLE'
            THEN (s.date_from::timestamp AT TIME ZONE 'Asia/Seoul')-interval '1 microsecond'
            ELSE bounds.first_at END AS starts_at,
          CASE WHEN s.verification='BANK_PDF_TABLE' AND s.date_to<(s.created_at AT TIME ZONE 'Asia/Seoul')::date
            THEN ((s.date_to+1)::timestamp AT TIME ZONE 'Asia/Seoul')-interval '1 microsecond'
            ELSE bounds.last_at END AS ends_at
        FROM money_bank_statements s
        JOIN LATERAL (
          SELECT min(r.occurred_at) AS first_at,max(r.occurred_at) AS last_at,
            bool_and(r.time_precision='SECOND') AS exact_rows
          FROM money_statement_rows r WHERE r.user_id=s.user_id AND r.statement_id=s.id AND r.account_id=s.account_id
        ) bounds ON true
        WHERE s.user_id=? AND s.account_id=? AND s.currency=?
          AND (s.verification='BANK_PDF_TABLE'
            OR (s.verification='OWNER_ATTESTED_NATIVE_REPLAY' AND bounds.exact_rows))
        """;

    record Statement(UUID id, String source, BigDecimal opening, BigDecimal closing, int rowCount, Instant start, Instant end) {}
    record Result(BigDecimal amount, String reason, BigDecimal difference) {}
    private record Row(UUID transaction, Instant at, BigDecimal amount, BigDecimal balanceAfter) {}
    private record Leg(UUID id, Instant at, BigDecimal amount, boolean incomplete, boolean dayPrecision) {}

    static List<Statement> statements(JdbcTemplate db, UUID owner, UUID account, String currency) {
        return db.query("SELECT * FROM ("+STATEMENTS+") s WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL",
            (r,n) -> new Statement(r.getObject(1,UUID.class),
                r.getString(2).equals("BANK_PDF_TABLE") ? "BANK_STATEMENT" : "OWNER_ATTESTED_STATEMENT",
                r.getBigDecimal(3),r.getBigDecimal(4),r.getInt(5),r.getTimestamp(6).toInstant(),r.getTimestamp(7).toInstant()),
            owner,account,currency);
    }

    static boolean unsupportedCurrency(JdbcTemplate db, UUID owner, UUID account, Instant cutoff) {
        return Boolean.TRUE.equals(db.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM money_transactions t
              WHERE t.user_id=? AND t.currency<>'KRW' AND NOT t.excluded AND t.merged_into IS NULL
                AND (t.from_account_id=? OR t.to_account_id=?) AND """+" "+MoneyProductService.effectiveAt("?::uuid")+"""
                 <=?)
            OR EXISTS (SELECT 1 FROM money_bank_statements WHERE user_id=? AND account_id=? AND currency<>'KRW'
                AND date_from<=(?::timestamptz AT TIME ZONE 'Asia/Seoul')::date)
            """, Boolean.class,owner,account,account,account,Timestamp.from(cutoff),owner,account,Timestamp.from(cutoff)));
    }

    static Result calculate(JdbcTemplate db, UUID owner, UUID account, Instant anchorAt, BigDecimal anchor,
                            Instant cutoff, List<Statement> statements) {
        var candidates = statements.stream().filter(s -> s.end().isAfter(anchorAt) && s.start().isBefore(cutoff))
            .sorted(Comparator.comparing(Statement::end).reversed().thenComparing(Statement::id)).toList();
        if (!covered(anchorAt,cutoff,candidates)) return unknown("LEDGER_COVERAGE_UNPROVEN");
        var legs = db.query("""
            SELECT id,effective_at,signed_amount,incomplete,day_precision FROM (
              SELECT t.id,
            """+" "+MoneyProductService.effectiveAt("scope.account")+" AS effective_at,"+"""
                CASE WHEN t.to_account_id=scope.account THEN t.amount ELSE -t.amount END AS signed_amount,
                (t.from_account_id=t.to_account_id OR (t.type='TRANSFER' AND t.transfer_destination_status IS NULL
                  AND (t.from_account_id IS NULL OR t.to_account_id IS NULL))) IS TRUE AS incomplete,
                t.occurrence_precision='DAY' AS day_precision
              FROM money_transactions t CROSS JOIN (SELECT ?::uuid AS account) scope
              WHERE t.user_id=? AND NOT t.excluded AND t.merged_into IS NULL AND t.currency='KRW'
                AND t.type NOT IN ('INITIAL_BALANCE','BALANCE_ADJUSTMENT')
                AND (t.from_account_id=scope.account OR t.to_account_id=scope.account)
            ) legs WHERE effective_at>? AND effective_at<=?
            """, (r,n) -> new Leg(r.getObject(1,UUID.class),r.getTimestamp(2).toInstant(),r.getBigDecimal(3),r.getBoolean(4),r.getBoolean(5)),
            account,owner,Timestamp.from(anchorAt),Timestamp.from(cutoff));
        if (legs.stream().anyMatch(Leg::incomplete)) return unknown("LEDGER_MOVEMENT_UNRESOLVED");
        Instant beforeAnchorDay = anchorAt.atZone(SEOUL).toLocalDate().atStartOfDay(SEOUL).toInstant().minusNanos(1000);
        if (MoneyOccurrencePrecision.uncertain(db,owner,account,beforeAnchorDay,anchorAt)
            || MoneyOccurrencePrecision.uncertain(db,owner,account,anchorAt,cutoff)) {
            return unknown("LEDGER_TIME_UNCERTAIN");
        }
        Instant from = anchorAt;
        BigDecimal balance = anchor;
        while (from.isBefore(cutoff)) {
            Statement statement = covering(from,candidates);
            Instant until = statement.end().isBefore(cutoff) ? statement.end() : cutoff;
            Result segment = corroborate(db,owner,account,statement,from,until,balance,legs);
            if (segment.reason()!=null) return segment;
            for (Statement witness : candidates) {
                if (witness.equals(statement) || !witness.end().isAfter(from) || !witness.start().isBefore(until)) continue;
                Instant starts = witness.start().isAfter(from) ? witness.start() : from;
                Instant ends = witness.end().isBefore(until) ? witness.end() : until;
                Instant segmentStart = from;
                BigDecimal expected = balance.add(legs.stream()
                    .filter(leg -> leg.at().isAfter(segmentStart) && !leg.at().isAfter(starts))
                    .map(Leg::amount).reduce(BigDecimal.ZERO,BigDecimal::add));
                Result overlap = corroborate(db,owner,account,witness,starts,ends,expected,legs);
                if (overlap.reason()!=null) return overlap;
            }
            balance = segment.amount();
            from = until;
        }
        return new Result(balance,null,null);
    }

    private static Result corroborate(JdbcTemplate db, UUID owner, UUID account, Statement statement, Instant from,
                                      Instant until, BigDecimal balance, List<Leg> legs) {
        var rows = db.query("""
            SELECT e.transaction_id,r.occurred_at,CASE WHEN r.direction='IN' THEN r.amount ELSE -r.amount END,
                   r.balance_after
            FROM money_statement_rows r
            LEFT JOIN money_statement_effects e ON e.user_id=r.user_id AND e.account_id=r.account_id AND e.cash_key=r.cash_key
            WHERE r.user_id=? AND r.account_id=? AND r.statement_id=?
            ORDER BY r.row_number DESC
            """, (r,n) -> new Row(r.getObject(1,UUID.class),r.getTimestamp(2).toInstant(),r.getBigDecimal(3),r.getBigDecimal(4)),
            owner,account,statement.id());
        if (rows.size()!=statement.rowCount()) return unknown("LEDGER_COVERAGE_UNPROVEN");
        BigDecimal statementBalance = rows.stream().filter(row -> !row.at().isAfter(from)).reduce((a,b) -> b)
            .map(Row::balanceAfter).orElse(statement.opening());
        BigDecimal difference = statementBalance.subtract(balance);
        if (difference.signum()!=0) return new Result(null,"OBSERVATION_LEDGER_MISMATCH",difference);
        var remaining = legs.stream().filter(l -> l.at().isAfter(from) && !l.at().isAfter(until))
            .collect(Collectors.toMap(Leg::id,Function.identity()));
        for (Row row : rows) {
            if (!row.at().isAfter(from) || row.at().isAfter(until)) continue;
            Leg leg = remaining.remove(row.transaction());
            if (leg==null) return unknown("LEDGER_MOVEMENT_UNRESOLVED");
            BigDecimal movementDifference = row.amount().subtract(leg.amount());
            if (movementDifference.signum()!=0) return new Result(null,"OBSERVATION_LEDGER_MISMATCH",movementDifference);
            boolean sameTime = leg.dayPrecision() ? row.at().atZone(SEOUL).toLocalDate()
                .equals(leg.at().atZone(SEOUL).toLocalDate()) : row.at().equals(leg.at());
            if (!sameTime) return unknown("LEDGER_TIME_UNCERTAIN");
            balance = balance.add(leg.amount());
        }
        if (!remaining.isEmpty()) return unknown("LEDGER_MOVEMENT_UNRESOLVED");
        return new Result(balance,null,null);
    }

    private static Statement covering(Instant from, List<Statement> statements) {
        return statements.stream().filter(s -> !s.start().isAfter(from) && s.end().isAfter(from)).findFirst().orElse(null);
    }

    private static boolean covered(Instant from, Instant cutoff, List<Statement> statements) {
        while (from.isBefore(cutoff)) {
            Statement next = covering(from,statements);
            if (next==null) return false;
            from = next.end();
        }
        return true;
    }

    private static Result unknown(String reason) {
        return new Result(null,reason,null);
    }
}
