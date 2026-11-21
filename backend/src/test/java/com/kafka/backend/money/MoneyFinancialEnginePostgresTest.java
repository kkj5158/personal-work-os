package com.kafka.backend.money;

import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyFinancialEngineService.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "DEV_DB_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
class MoneyFinancialEnginePostgresTest {
    private static final Instant AT = Instant.parse("2026-09-26T01:00:00Z");
    private final MoneyUnifiedBookkeepingPostgresTest fixture = new MoneyUnifiedBookkeepingPostgresTest();

    private record Services(MoneyAccountLedgerService ledger, MoneyFinancialEngineService engine, MoneyCommandService commands) {}

    private Services services(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner) {
        var mapper = JsonMapper.builder().build();
        var tm = new DataSourceTransactionManager(e.db().getDataSource());
        tm.setNestedTransactionAllowed(true);
        var money = new MoneyService(e.db(), () -> owner, mapper);
        var commands = new MoneyCommandService(e.db(), mapper, tm);
        var ledger = new MoneyAccountLedgerService(e.db(), () -> owner, mapper, money, e.unified(), e.web(), commands, tm);
        return new Services(ledger, new MoneyFinancialEngineService(e.db(), () -> owner, mapper, money, ledger,
                commands, new MockEnvironment()), commands);
    }

    private MoneyAccount account(MoneyUnifiedBookkeepingPostgresTest.Env e, String suffix) {
        return e.money().createAccount(new AccountInput("KAKAO", "합성 계좌 " + suffix, AccountRole.SPENDING,
                null, suffix));
    }

    private MoneyRawNotification notification(MoneyUnifiedBookkeepingPostgresTest.Env e, boolean out, int amount,
            String suffix, String merchant, Instant at) {
        String account = "입출금통장(" + suffix + ")";
        return e.money().ingest(Map.of("sourcePackage", "com.kakaobank.channel", "idempotencyKey", UUID.randomUUID().toString(),
                "postedAt", at.toString(), "title", (out ? "출금 " : "입금 ") + amount + "원",
                "text", (out ? account + " → " + merchant : merchant + " → " + account) + " 잔액 900원")).notification();
    }

    private MoneyTransaction admitted(MoneyUnifiedBookkeepingPostgresTest.Env e, MoneyAccount account, boolean out,
            int amount, String suffix, String merchant, Instant at) {
        var raw = notification(e, out, amount, suffix, merchant, at);
        var attempt = e.money().process(raw.id(), new KakaoNotificationParserV1());
        assertThat(attempt.status()).isEqualTo("PARSED");
        var source = VerifiedMoneyTransferMatcher.source(attempt, SourceRelationship.PRIMARY, "VERIFIED_CASH_UNRESOLVED");
        var candidate = attempt.candidate();
        return e.money().transaction(e.money().recordUnresolvedTransactionId(new TransactionInput(
                out ? TransactionType.EXPENSE : TransactionType.INCOME, out ? account.id() : null,
                out ? null : account.id(), candidate.amount(), "KRW", candidate.occurredAt(), merchant, List.of(source))));
    }

    private MoneyAccountLedgerService.EditRequest quick(Services s, MoneyTransaction t, UUID requestId) {
        return new MoneyAccountLedgerService.EditRequest(s.ledger().row(t.id()).get("fingerprint").toString(),
                MoneyAccountLedgerService.quickEdit(requestId, t, "QUICK_CONFIRM"));
    }

    private Map<String, Object> quickConfirm(Services s, MoneyTransaction fact) {
        var draft = quick(s, fact, UUID.randomUUID());
        var preview = s.ledger().preview(fact.id(), draft);
        assertThat(preview.get("status")).isEqualTo("APPLIED");
        assertThat(s.commands().outcome(MoneyPostgresIntegrationTest.OWNER, draft.edit().requestId()).get("status"))
                .isEqualTo("UNKNOWN");
        var approved = new MoneyAccountLedgerService.EditRequest(draft.fingerprint(), draft.edit(),
                preview.get("previewToken").toString());
        var result = s.ledger().execute(fact.id(), approved);
        assertThat(result.get("status")).isEqualTo("APPLIED");
        assertThat(s.ledger().execute(fact.id(), approved)).isEqualTo(result);
        return result;
    }

    @Test void quickConfirmationPreservesCashSourcesAndOwnerProtectsIt() {
        fixture.check(e -> {
            var s = services(e, MoneyPostgresIntegrationTest.OWNER);
            var account = account(e, "8557");
            var fact = admitted(e, account, true, 100, "8557", "합성 카페", AT);
            var raw = e.money().notification(fact.sources().getFirst().rawEventId());
            var balance = e.product().balance(account.id()).amount();
            assertThat(s.ledger().row(fact.id()).get("quickConfirmAvailable")).isEqualTo(true);
            quickConfirm(s, fact);
            var updated = e.money().transaction(fact.id());
            assertThat(updated.meaningState()).isEqualTo("CONFIRMED");
            assertThat(updated.amount()).isEqualByComparingTo(fact.amount());
            assertThat(updated.occurredAt()).isEqualTo(fact.occurredAt());
            assertThat(updated.sources()).isEqualTo(fact.sources());
            assertThat(e.money().notification(raw.id())).isEqualTo(raw);
            assertThat(e.product().balance(account.id()).amount()).isEqualByComparingTo(balance);
            assertThat(e.db().queryForObject("select count(*) from money_transactions", Integer.class)).isEqualTo(1);
            assertThat(s.ledger().row(fact.id())).containsEntry("meaningOrigin", "OWNER").containsEntry("quickConfirmAvailable", false);
            assertThat(s.ledger().preview(fact.id(), quick(s, updated, UUID.randomUUID())).get("status")).isEqualTo("NOT_APPLIED");
            var manual = fixture.tx(e, account.id(), true, 70, true);
            assertThat(s.ledger().preview(manual.id(), quick(s, manual, UUID.randomUUID())).get("status")).isEqualTo("NOT_APPLIED");
        });
    }

    @Test void shadowIsDeterministicAndBatchRejectsStaleTargetsAtomically() {
        fixture.check(e -> {
            var s = services(e, MoneyPostgresIntegrationTest.OWNER);
            var account = account(e, "8557");
            var a = admitted(e, account, true, 100, "8557", "합성 카페", AT);
            var b = admitted(e, account, false, 200, "8557", "합성 외부", AT.plusSeconds(90));
            var balance = e.product().balance(account.id()).amount();
            var snapshot = s.engine().backfillPreview(25, 0);
            var shadowId = UUID.randomUUID();
            assertThat(s.engine().shadow(shadowId).get("fingerprint")).isEqualTo(snapshot.get("fingerprint"));
            assertThat(s.engine().shadow(shadowId)).isEqualTo(s.engine().shadowRun(shadowId, 1, 0));
            assertThat(s.engine().backfillPreview(25, 0)).isEqualTo(snapshot);
            var stranger = services(e, UUID.randomUUID()).engine();
            assertThatThrownBy(() -> stranger.shadowRun(shadowId, 25, 0)).isInstanceOf(ResourceNotFoundException.class);
            assertThatThrownBy(() -> stranger.history(a.id())).isInstanceOf(ResourceNotFoundException.class);
            var selected = new BatchInput(List.of(new Target(a.id(), a.version(), "EXPENSE"),
                    new Target(b.id(), b.version(), "INCOME")));
            var preview = s.engine().batchPreview(selected);
            assertThatThrownBy(() -> s.engine().batchExecute(command(preview, false))).isInstanceOf(InvalidRequestException.class);
            e.db().update("update money_transactions set version=version+1 where id=?", b.id());
            var stale = command(preview, true);
            assertThat(s.engine().batchExecute(stale).get("status")).isEqualTo("NOT_APPLIED");
            assertThat(s.engine().batchExecute(stale)).isEqualTo(s.commands().outcome(MoneyPostgresIntegrationTest.OWNER, stale.requestId()));
            assertThat(e.money().transaction(a.id()).meaningState()).isEqualTo("UNRESOLVED");
            var next = s.engine().batchPreview(new BatchInput(List.of(new Target(a.id(), a.version(), "EXPENSE"),
                    new Target(b.id(), b.version()+1, "INCOME"))));
            var approved = command(next, true);
            assertThat(s.engine().batchExecute(approved).get("status")).isEqualTo("APPLIED");
            assertThat(s.engine().batchExecute(approved).get("status")).isEqualTo("APPLIED");
            assertThat(e.product().balance(account.id()).amount()).isEqualByComparingTo(balance);
            assertThat(e.money().transaction(a.id()).amount()).isEqualByComparingTo(a.amount());
            assertThat(e.money().transaction(b.id()).amount()).isEqualByComparingTo(b.amount());
            assertThat(e.db().queryForObject("select count(*) from money_transactions", Integer.class)).isEqualTo(2);
        });
    }

    @Test void transferRequiresReciprocalSourceEvidenceAndAmbiguityPreventsQuickConfirmation() {
        fixture.check(e -> {
            var s = services(e, MoneyPostgresIntegrationTest.OWNER);
            var a = account(e, "8557");
            var b = account(e, "8765");
            var c = account(e, "4321");
            var out = admitted(e, a, true, 100, "8557", "합성 소유자", AT);
            var in = admitted(e, b, false, 100, "8765", "합성 소유자", AT.plusSeconds(1));
            var found = s.engine().candidates(25, 0);
            assertThat(found.get("items").toString()).contains("proposedType=TRANSFER", in.id().toString(), out.id().toString());
            assertThat(s.ledger().row(out.id()).get("quickConfirmAvailable")).isEqualTo(false);
            admitted(e, c, false, 100, "4321", "합성 소유자", AT.plusSeconds(2));
            assertThat(s.engine().candidates(25, 0).get("items").toString()).contains("AMBIGUOUS_TRANSFER_PAIR");
            assertThat(e.money().transaction(out.id()).meaningState()).isEqualTo("UNRESOLVED");
        });
    }

    @Test void devFlagOnlyConfirmsNewAdmissionWithExplicitCurrentRule() {
        fixture.check(e -> {
            var owner = MoneyPostgresIntegrationTest.OWNER;
            var s = services(e, owner);
            var account = account(e, "8557");
            var basis = admitted(e, account, true, 100, "8557", "합성 카페", AT);
            quickConfirm(s, basis);
            var rule = new RuleInput(UUID.randomUUID(), basis.id(), basis.version()+1, 0L, true);
            assertThat(s.engine().saveRule(rule).get("status")).isEqualTo("APPLIED");
            var old = admitted(e, account, true, 123, "8557", "합성 카페", AT.plusSeconds(9000));
            assertThat(s.engine().candidates(25, 0).get("items").toString()).contains("AUTO_CONFIRM_ELIGIBLE");
            var flag = new MockEnvironment().withProperty("app.money.financial-engine-auto-confirm", "true")
                    .withProperty("app.db-environment", "DEV");
            flag.setActiveProfiles("prod");
            assertThat(MoneyFinancialEngineService.autoEnabled(flag)).isFalse();
            flag.setActiveProfiles("dev", "prod");
            assertThat(MoneyFinancialEngineService.autoEnabled(flag)).isFalse();
            flag.setActiveProfiles("dev");
            assertThat(MoneyFinancialEngineService.autoEnabled(flag)).isTrue();
            flag.setActiveProfiles("hosted-dev");
            assertThat(MoneyFinancialEngineService.autoEnabled(flag)).isTrue();
            flag.setProperty("app.db-environment", "PROD");
            assertThat(MoneyFinancialEngineService.autoEnabled(flag)).isFalse();
            assertThat(MoneyFinancialEngineService.autoEnabled(new MockEnvironment())).isFalse();
            Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
            var raw = notification(e, true, 120, "8557", "합성 카페", now.minusSeconds(1));
            var manager = new DataSourceTransactionManager(e.db().getDataSource());
            Clock clock = Clock.fixed(now.plusSeconds(20), ZoneOffset.UTC);
            var processing = new MoneyProcessingService(e.db(), JsonMapper.builder().build(), manager, clock,
                    VerifiedMoneyTransferMatcher.WAIT, VerifiedMoneyTransferMatcher.TRANSFER_WINDOW, true);
            assertThat(processing.runOwner(owner)).isEqualTo(1);
            var id = e.db().queryForObject("select transaction_id from money_transaction_sources where raw_event_id=?",
                    UUID.class, raw.id());
            assertThat(e.money().transaction(id).meaningState()).isEqualTo("CONFIRMED");
            assertThat(s.ledger().row(id).get("meaningOrigin")).isEqualTo("AUTO");
            assertThat(e.money().transaction(old.id()).meaningState()).isEqualTo("UNRESOLVED");
            assertThat(processing.runOwner(owner)).isZero();
        });
    }

    private BatchExecute command(Map<String, Object> preview, boolean confirmed) {
        return new BatchExecute(UUID.randomUUID(), (UUID) preview.get("previewId"),
                preview.get("fingerprint").toString(), confirmed);
    }
}
