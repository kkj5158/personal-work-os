package com.kafka.backend.money;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.sql.Timestamp;

import org.springframework.jdbc.core.JdbcTemplate;

import static com.kafka.backend.money.MoneyTypes.*;

/** Policy B evidence shared by the ledger, Shadow Mode and live admission. */
final class MoneyFinancialEvidence {
    static final String VERSION = "1.1.0";
    private static final Set<String> ORDINARY_SOURCES = Set.of(
            "VERIFIED_CASH_UNRESOLVED", "VERIFIED_ORDINARY_AFTER_WAIT");

    record Proof(UUID accountId, Direction direction, String provider, String merchantKey,
                 UUID rawId, UUID attemptId, String parserVersion) {}

    static ParseAttempt primaryAttempt(MoneyService money, MoneyTransaction fact) {
        if (fact.sources().size() != 1) return null;
        var source = fact.sources().getFirst();
        if (source.parseAttemptId() == null || source.relationship() != SourceRelationship.PRIMARY) return null;
        var attempts = money.attempts(source.rawEventId());
        if (attempts.isEmpty()) return null;
        var latest = attempts.getLast();
        var candidate = latest.candidate();
        if (!source.parseAttemptId().equals(latest.id()) || !"PARSED".equals(latest.status())
                || !MoneyOrdinaryAdmission.domestic(candidate)
                || !MoneyOrdinaryAdmission.supportedParserVersion(candidate.provider(), latest.parserVersion())
                || !Objects.equals(candidate.rawEventId(), source.rawEventId())
                || !Objects.equals(latest.parserKey(), candidate.provider().toLowerCase(Locale.ROOT) + "-push")
                || candidate.amount() == null || candidate.amount().compareTo(fact.amount()) != 0
                || !Objects.equals(candidate.occurredAt(), fact.occurredAt())
                || !Objects.equals(MoneyOrdinaryAdmission.currency(candidate), fact.currency())) return null;
        var raw = money.notification(source.rawEventId());
        return raw.state() == ProcessingState.PROCESSED
                && Objects.equals(raw.sourcePackage(), MoneyOrdinaryAdmission.PACKAGES.get(candidate.provider())) ? latest : null;
    }

    static Proof ordinary(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact) {
        return ordinary(db, owner, money, fact, money.accounts());
    }

    static Proof ordinary(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact, List<MoneyAccount> accounts) {
        if (fact.excluded() || fact.mergedInto() != null || fact.manual() || fact.refundOf() != null
                || fact.transferDestinationStatus() != null || fact.sources().size() != 1) return null;
        Direction direction = simpleDirection(fact);
        if (direction == null) return null;
        var source = fact.sources().getFirst();
        if (!ORDINARY_SOURCES.contains(Objects.toString(source.evidence().get("rule"), ""))) return null;
        var latest = primaryAttempt(money, fact);
        if (latest == null) return null;
        var candidate = latest.candidate();
        if (!MoneyOrdinaryAdmission.ordinary(candidate) || MoneyOrdinaryAdmission.numericOtherSide(candidate)
                || candidate.direction() != direction
                || !merchantKey(candidate.counterpartyText()).equals(merchantKey(fact.counterpartyText()))) return null;
        var resolver = new MoneyAccountResolver();
        var own = resolver.resolve(accounts, candidate.provider(),
                direction == Direction.OUT ? candidate.sourceAccountHint() : candidate.destinationAccountHint());
        var opposite = resolver.resolve(accounts, candidate.provider(),
                direction == Direction.OUT ? candidate.destinationAccountHint() : candidate.sourceAccountHint());
        UUID accountId = direction == Direction.OUT ? fact.fromAccountId() : fact.toAccountId();
        if (!own.resolved() || !accountId.equals(own.account().id()) || own.account().archived() || opposite.resolved()) return null;

        if (Boolean.TRUE.equals(db.queryForObject("""
                select exists(select 1 from money_transactions
                  where user_id=? and (id=? and loan_id is not null or refund_of=? and not excluded))
                """, Boolean.class, owner, fact.id(), fact.id()))) return null;
        return new Proof(accountId, direction, candidate.provider(), merchantKey(candidate.counterpartyText()),
                source.rawEventId(), latest.id(), latest.parserVersion());
    }

    static Direction simpleDirection(MoneyTransaction fact) {
        if (fact.type() == TransactionType.EXPENSE && fact.fromAccountId() != null && fact.toAccountId() == null) return Direction.OUT;
        if (fact.type() == TransactionType.INCOME && fact.toAccountId() != null && fact.fromAccountId() == null) return Direction.IN;
        return null;
    }

    static String merchantKey(String text) {
        return VerifiedMoneyTransferMatcher.counterpart(text).toLowerCase(Locale.ROOT);
    }

    static boolean ownerProtected(JdbcTemplate db, UUID owner, UUID id) {
        return Boolean.TRUE.equals(db.queryForObject("""
                select exists(select 1 from money_meaning_audit
                   where user_id=? and subject_id=? and (action in
                      ('ACCOUNT_LEDGER_FINANCIAL_TYPE','UNIFIED_TYPE','UNIFIED_CORRECT','UNIFIED_LINK_TRANSFER','UNIFIED_UNLINK_TRANSFER',
                       'UNIFIED_UNDO_UNLINK','ACCOUNT_LEDGER_UNRESOLVED','ACCOUNT_LEDGER_LOAN_RECEIPT',
                       'OWNER_REVIEW_MANUAL_FINANCIAL_V2','OWNER_REVIEW_FINANCIAL_V2','REVIEW_COMPLETE')
                      or action like 'FINANCIAL_ENGINE_OWNER%'))
                """, Boolean.class, owner, id));
    }

    static Proof requireQuick(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact, String requestedType) {
        var proof = quickProof(db, owner, money, fact, money.accounts());
        MoneyService.require(fact.type().name().equals(requestedType) && proof != null,
                "원본과 입출금 방향이 일치하는 미확정 소비·수입만 빠르게 확정할 수 있습니다. 상세 편집에서 근거를 확인하세요.");
        return proof;
    }

    static Proof quickProof(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact, List<MoneyAccount> accounts) {
        if (!"UNRESOLVED".equals(fact.meaningState()) || ownerProtected(db, owner, fact.id())) return null;
        var proof = ordinary(db, owner, money, fact, accounts);
        return proof != null && transfer(db, owner, money, fact, accounts) == null ? proof : null;
    }

    record Transfer(String reason, UUID counterpartId) {}
    private record Neighbor(UUID id, String reason) {}

    static Transfer transfer(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact, List<MoneyAccount> accounts) {
        var own = resolved(money, fact, accounts);
        if (own == null || MoneyOrdinaryAdmission.explicitExternal(own.c())) return null;
        var neighbors = neighbors(db, owner, money, fact, accounts, own);
        if (neighbors.isEmpty()) return null;
        if (neighbors.size() > 1) return new Transfer("AMBIGUOUS_TRANSFER_PAIR", null);
        var match = neighbors.getFirst();
        var other = money.transaction(match.id());
        var reciprocal = neighbors(db, owner, money, other, accounts, resolved(money, other, accounts));
        if (reciprocal.size() != 1 || !reciprocal.getFirst().id().equals(fact.id())) {
            return new Transfer("AMBIGUOUS_TRANSFER_PAIR", null);
        }
        if (!"UNRESOLVED".equals(other.meaningState()) || ownerProtected(db, owner, other.id())) {
            return new Transfer("TRANSFER_COUNTERPART_PROTECTED", match.id());
        }
        return new Transfer(match.reason(), match.id());
    }

    private static List<Neighbor> neighbors(JdbcTemplate db, UUID owner, MoneyService money, MoneyTransaction fact,
            List<MoneyAccount> accounts, VerifiedMoneyTransferMatcher.Resolved own) {
        var window = VerifiedMoneyTransferMatcher.TRANSFER_WINDOW;
        var ids = db.queryForList("""
                select id from money_transactions where user_id=? and not excluded and merged_into is null
                    and amount=? and currency=? and occurred_at between ? and ? and type=?
                    and (from_account_id is null) <> (to_account_id is null)
                    and coalesce(from_account_id,to_account_id)<>?
                 order by occurred_at,id limit 51
                """, UUID.class, owner, fact.amount(), fact.currency(),
                Timestamp.from(fact.occurredAt().minus(window)), Timestamp.from(fact.occurredAt().plus(window)),
                own.c().direction() == Direction.OUT ? "INCOME" : "EXPENSE", own.own().id());
        if (ids.size() > 50) return List.of(new Neighbor(fact.id(), "AMBIGUOUS_TRANSFER_PAIR"),
                new Neighbor(fact.id(), "AMBIGUOUS_TRANSFER_PAIR"));
        var result = new java.util.ArrayList<Neighbor>();
        for (var id : ids) {
            var other = resolved(money, money.transaction(id), accounts);
            if (other == null) continue;
            String reason = VerifiedMoneyTransferMatcher.pairEvidence(own, other);
            if (reason != null) result.add(new Neighbor(id, reason));
        }
        return result;
    }

    private static VerifiedMoneyTransferMatcher.Resolved resolved(MoneyService money, MoneyTransaction fact, List<MoneyAccount> accounts) {
        Direction direction = simpleDirection(fact);
        if (direction == null || fact.transferDestinationStatus() != null || fact.refundOf() != null) return null;
        var attempt = primaryAttempt(money, fact);
        if (attempt == null || attempt.candidate().direction() != direction) return null;
        var candidate = attempt.candidate();
        var resolver = new MoneyAccountResolver();
        var from = resolver.resolve(accounts, candidate.provider(), candidate.sourceAccountHint()).account();
        var to = resolver.resolve(accounts, candidate.provider(), candidate.destinationAccountHint()).account();
        var side = direction == Direction.OUT ? from : to;
        UUID id = direction == Direction.OUT ? fact.fromAccountId() : fact.toAccountId();
        return side != null && id.equals(side.id()) && !side.archived()
                ? new VerifiedMoneyTransferMatcher.Resolved(attempt, from, to) : null;
    }

    static Rule approvedRule(JdbcTemplate db, UUID owner, Proof proof) {
        var matches = db.query("""
                select r.id, r.version from money_financial_rules r
                  join money_transactions b on b.user_id=r.user_id and b.id=r.basis_id
                  join money_transaction_sources s on s.user_id=b.user_id and s.transaction_id=b.id and s.relationship='PRIMARY'
                  join money_raw_notifications raw on raw.user_id=s.user_id and raw.id=s.raw_event_id and raw.state='PROCESSED'
                  join lateral(select p.id from money_parse_attempts p where p.user_id=s.user_id and p.raw_event_id=s.raw_event_id
                    order by p.created_at desc,p.id desc limit 1) latest on latest.id=s.parse_attempt_id
                 where r.user_id=? and r.account_id=? and r.provider=? and r.merchant_key=?
                   and r.direction=? and r.active and b.version=r.basis_version and not b.excluded
                   and b.merged_into is null and b.meaning_state='CONFIRMED'
                   and not exists(select 1 from money_transaction_sources extra
                      where extra.user_id=b.user_id and extra.transaction_id=b.id and extra.raw_event_id<>s.raw_event_id)
                   and exists(select 1 from money_meaning_audit a where a.user_id=b.user_id and a.subject_id=b.id
                       and a.action='FINANCIAL_ENGINE_OWNER_CONFIRM' and a.next_value->>'version'=b.version::text
                       and a.next_value #>> '{proof,rawId}'=s.raw_event_id::text
                       and a.next_value #>> '{proof,attemptId}'=latest.id::text)
                """, (rs, n) -> new Rule(rs.getObject("id", UUID.class), rs.getLong("version")),
                owner, proof.accountId(), proof.provider(), proof.merchantKey(), proof.direction().name());
        return matches.isEmpty() ? null : matches.getFirst();
    }

    record Rule(UUID id, long version) {}
}
