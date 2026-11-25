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

    @Test void deterministicSourceRegistrationIsProvisionalReversibleAndOwnerConfirmationSupersedesIt() {
        fixture.check(e -> {
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var services=services(e,owner);
            var account=account(e,"8847");
            var fact=admitted(e,account,true,900,"8847","오픈 송금",AT);
            var engine=new MoneyObservedDirectionService(e.db(),()->owner,e.money(),services.commands());
            var balance=e.product().balance(account.id());
            var candidate=engine.inventory().stream().filter(c->c.id().equals(fact.id())).findFirst().orElseThrow();
            assertThat(candidate.disposition()).isEqualTo("REGISTER_OBSERVED_DIRECTION");
            var request=new MoneyObservedDirectionService.Register(UUID.randomUUID(),fact.version(),candidate.fingerprint());
            assertThat(engine.register(fact.id(),request)).containsEntry("status","APPLIED");
            assertThat(engine.register(fact.id(),request)).containsEntry("status","APPLIED");
            assertThat(services.ledger().row(fact.id())).containsEntry("meaning_state","UNRESOLVED").containsEntry("provisionalDirection","EXPENSE");
            assertThat(e.web().accountLedgerBookkeepingRow(fact.id())).containsEntry("interpretationStatus","PROVISIONAL");
            var reversal=new MoneyObservedDirectionService.Reverse(UUID.randomUUID(),fact.version()+1,request.requestId());
            assertThat(engine.reverse(fact.id(),reversal)).containsEntry("status","APPLIED");
            assertThat(engine.reverse(fact.id(),reversal)).containsEntry("status","APPLIED");
            assertThat(services.ledger().row(fact.id()).get("provisionalDirection")).isNull();
            var command=new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),fact.version()+2,"EXPENSE",true);
            var receipt=services.ledger().financialType(fact.id(),command);
            assertThat(receipt).containsEntry("meaningApplied",true);
            assertThat(e.web().accountLedgerBookkeepingRow(fact.id())).containsEntry("interpretationStatus","CONFIRMED");
            assertThat(engine.inventory()).noneMatch(c->c.id().equals(fact.id()));
            var undo=new MoneyAccountLedgerService.UndoDirection(UUID.randomUUID(),fact.version()+3,command.requestId());
            assertThat(services.ledger().undoDirection(fact.id(),undo)).containsEntry("status","UNDONE");
            assertThat(services.ledger().row(fact.id())).containsEntry("meaning_state","UNRESOLVED");
            assertThat(e.product().balance(account.id())).isEqualTo(balance);
            assertThat(e.money().transaction(fact.id()).sources()).isEqualTo(fact.sources());
        });
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

    @Test void inlineOwnerCategoryAcceptsOneSidedCashWithoutAutomatedProofAndReplaysExactly() {
        fixture.check(e -> {
            var s = services(e, MoneyPostgresIntegrationTest.OWNER);
            var account = account(e, "8557");
            var proven = admitted(e, account, true, 8000, "8557", "합성 카페", AT);
            var unverified = fixture.tx(e, account.id(), true, 7000, true);
            var category = e.product().saveCategory(null,
                    new MoneyProductService.CategoryInput("합성 식비", "#778899", false, null, "EXPENSE", null, 0));
            var balance = e.product().balance(account.id()).amount();
            for (var fact : List.of(proven, unverified)) {
                var row = s.ledger().row(fact.id());
                var command = new MoneyAccountLedgerService.Category(UUID.randomUUID(), fact.version(),
                        row.get("fingerprint").toString(), category.id(),
                        ((Number)row.get("classificationVersion")).longValue(), true, null, "EXPENSE");
                if (fact.equals(unverified)) assertThat(row.get("quickConfirmAvailable")).isEqualTo(false);
                var receipt = s.ledger().category(fact.id(), command);
                assertThat(s.ledger().category(fact.id(), command)).isEqualTo(receipt);
                assertThat(s.commands().outcome(MoneyPostgresIntegrationTest.OWNER, command.requestId())).isEqualTo(receipt);
                assertThat(receipt).containsEntry("status", "APPLIED");
                var updated = e.money().transaction(fact.id());
                assertThat(updated.meaningState()).isEqualTo("CONFIRMED");
                assertThat(updated.sources()).isEqualTo(fact.sources());
                assertThat(updated.amount()).isEqualByComparingTo(fact.amount());
                assertThat(e.web().accountLedgerBookkeepingRow(fact.id())).containsEntry("categoryId", category.id());
                var stale = new MoneyAccountLedgerService.Category(UUID.randomUUID(), command.expectedVersion(),
                        command.fingerprint(), category.id(), command.expectedClassificationVersion(), true, null, "EXPENSE");
                assertThat(s.ledger().category(fact.id(), stale).get("result").toString()).contains("VERSION_CONFLICT");
            }
            assertThat(e.product().balance(account.id()).amount()).isEqualByComparingTo(balance);
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

    @Test void verifiedExternalAdmissionAfterWaitNeedsNoMerchantRuleAndDoesNotRepost() {
        fixture.check(e -> {
            UUID owner=MoneyPostgresIntegrationTest.OWNER;
            var account=account(e,"8557");
            var services=services(e,owner);
            Instant now=Instant.now().truncatedTo(ChronoUnit.SECONDS);
            var salary=notification(e,false,84671,"8557","합성 급여",now.minusSeconds(900));
            var expense=notification(e,true,3000,"8557","합성 카페",now.minusSeconds(300));
            var open=notification(e,true,4500,"8557","오픈 송금",now.minusSeconds(1));
            var processing=new MoneyProcessingService(e.db(),JsonMapper.builder().build(),
                    new DataSourceTransactionManager(e.db().getDataSource()),Clock.fixed(now.plusSeconds(30),ZoneOffset.UTC));
            assertThat(processing.runOwner(owner)).isEqualTo(3);
            assertThat(processing.runOwner(owner)).isZero();
            for(var raw:List.of(salary,expense,open)){
                UUID id=e.db().queryForObject("select transaction_id from money_transaction_sources where raw_event_id=?",UUID.class,raw.id());
                var fact=e.money().transaction(id);
                assertThat(fact.sources()).hasSize(1);
                if(raw.equals(open)){
                    assertThat(fact.meaningState()).isEqualTo("UNRESOLVED");
                    continue;
                }
                assertThat(fact.meaningState()).isEqualTo("CONFIRMED");
                assertThat(fact.type()).isEqualTo(raw.equals(salary)?TransactionType.INCOME:TransactionType.EXPENSE);
                assertThat(services.ledger().row(id)).containsEntry("meaningOrigin","AUTO");
                assertThat(e.web().accountLedgerBookkeepingRow(id).get("categoryId")).isNull();
            }
            assertThat(e.db().queryForObject("select count(*) from money_transactions where user_id=?",Integer.class,owner)).isEqualTo(3);
        });
    }

    @Test void strictOwnerDecisionConfirmsProvisionalValueAndRejectsConflictsWithoutMutation() {
        fixture.check(e -> {
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var services=services(e,owner);
            var account=account(e,"8557");
            var fact=admitted(e,account,true,3000,"8557","합성 카페",AT);
            var balance=e.product().balance(account.id());
            var command=new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),fact.version(),"EXPENSE",null,true);
            var receipt=services.ledger().financialType(fact.id(),command);
            assertThat(receipt).containsEntry("status","APPLIED").containsEntry("meaningApplied",true);
            assertThat(services.ledger().financialType(fact.id(),command)).isEqualTo(receipt);
            long version=e.money().transaction(fact.id()).version();
            var conflict=new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),version,"INCOME",null,true);
            assertThatThrownBy(()->services.ledger().financialType(fact.id(),conflict)).isInstanceOf(InvalidRequestException.class);
            assertThat(services.commands().outcome(owner,conflict.requestId())).containsEntry("status","NOT_APPLIED");
            assertThatThrownBy(()->services.ledger().financialType(fact.id(),
                    new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),fact.version(),"EXPENSE",null,true)))
                    .isInstanceOf(com.kafka.backend.common.OptimisticLockConflictException.class);
            assertThat(e.money().transaction(fact.id()).version()).isEqualTo(version);
            assertThat(e.product().balance(account.id())).isEqualTo(balance);
        });
    }

    @Test void unlinkedLateRawVetoesBothBatchAndStrictOwnerConfirmation() {
        fixture.check(e -> {
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var s=services(e,owner);
            var account=account(e,"8557");
            account(e,"8765");
            var fact=admitted(e,account,false,34671,"8557","합성 소유자",AT);
            var raw=notification(e,true,34671,"8765","합성 소유자",AT.plusSeconds(2));
            e.money().process(raw.id(),new KakaoNotificationParserV1());
            e.money().finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"LATE_POSTED_TRANSFER_LINK_REQUIRED");
            assertThat(s.engine().candidates(25,0).get("items").toString()).contains("LATE_POSTED_TRANSFER_LINK_REQUIRED");
            assertThatThrownBy(()->s.engine().batchPreview(new BatchInput(List.of(new Target(fact.id(),fact.version(),"INCOME")))))
                    .isInstanceOf(InvalidRequestException.class);
            assertThatThrownBy(()->s.ledger().financialType(fact.id(),new MoneyAccountLedgerService.FinancialType(
                    UUID.randomUUID(),fact.version(),"INCOME",null,true))).isInstanceOf(InvalidRequestException.class);
            assertThat(e.money().transaction(fact.id()).meaningState()).isEqualTo("UNRESOLVED");
            assertThat(e.money().notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
        });
    }

    @Test void deterministicHistoricalPreviewAndRecoveryPreserveCashAndClassificationAndCanBeReversed() {
        fixture.check(e -> {
            var owner=MoneyPostgresIntegrationTest.OWNER;
            var services=services(e,owner);
            var account=account(e,"8557");
            Instant at=Instant.now().minusSeconds(900).truncatedTo(ChronoUnit.SECONDS);
            var raw=notification(e,false,84671,"8557","합성 급여",at);
            var processing=new MoneyProcessingService(e.db(),JsonMapper.builder().build(),new DataSourceTransactionManager(e.db().getDataSource()),
                    Clock.fixed(Instant.now().plusSeconds(30),ZoneOffset.UTC),VerifiedMoneyTransferMatcher.WAIT,VerifiedMoneyTransferMatcher.TRANSFER_WINDOW,false,false);
            assertThat(processing.runOwner(owner)).isEqualTo(1);
            UUID id=e.db().queryForObject("select transaction_id from money_transaction_sources where raw_event_id=?",UUID.class,raw.id());
            var fact=e.money().transaction(id);
            var balance=e.product().balance(account.id());
            var reads=services.engine().backfillPreview(25,0);
            assertThat(reads.get("distribution").toString()).contains("AUTO_CONFIRM_ELIGIBLE=1");
            assertThat(reads.get("eligibleAdmissionImpact").toString()).contains(id.toString(),"categoryPreserved=true","cashDelta=0");
            var target=new BatchInput(List.of(new Target(id,fact.version(),"INCOME")),true);
            var preview=services.engine().batchPreview(target);
            var approved=command(preview,true);
            assertThat(services.engine().batchExecute(approved)).containsEntry("status","APPLIED");
            assertThat(services.engine().batchExecute(approved)).containsEntry("status","APPLIED");
            var admitted=e.money().transaction(id);
            assertThat(admitted.meaningState()).isEqualTo("CONFIRMED");
            assertThat(admitted.categoryId()).isEqualTo(fact.categoryId());
            assertThat(admitted.sources()).isEqualTo(fact.sources());
            assertThat(e.product().balance(account.id())).isEqualTo(balance);
            var reverse=new MoneyAccountLedgerService.FinancialType(UUID.randomUUID(),admitted.version(),"UNRESOLVED");
            services.ledger().financialType(id,reverse);
            assertThat(e.money().transaction(id).meaningState()).isEqualTo("UNRESOLVED");
            assertThat(e.product().balance(account.id())).isEqualTo(balance);
            assertThat(services.engine().backfillPreview(25,0).get("reasons").toString()).contains("OWNER_DECISION_PROTECTED");
        });
    }

    @Test void ownerLinksCorroboratedLateRawAndLeavesAmountOnlyCandidateUntouched() {
        fixture.check(e -> {
            UUID owner=MoneyPostgresIntegrationTest.OWNER;
            var service=services(e,owner);
            var review=new MoneyOwnerReviewService(e.db(),()->owner,JsonMapper.builder().build(),e.money(),service.commands());
            var payer=account(e,"8557");
            var recipient=account(e,"8765");
            for(boolean corroborated:List.of(true,false)){
                int amount=corroborated?34671:5000;
                Instant at=corroborated?AT:AT.plusSeconds(600);
                var credit=admitted(e,recipient,false,amount,"8765","합성 소유자",at);
                var raw=notification(e,true,amount,"8557",corroborated?"합성 소유자":"다른 상대방",at.plusSeconds(1));
                e.money().process(raw.id(),new KakaoNotificationParserV1());
                e.money().finishProcessing(raw.id(),ProcessingState.REVIEW_REQUIRED,"LATE_POSTED_TRANSFER_LINK_REQUIRED");
                var request=new MoneyOwnerReviewService.Decision(UUID.randomUUID(),review.context(raw.id()).get("fingerprint").toString(),
                        "TRANSFER",payer.id(),recipient.id(),null,payer.version(),recipient.version(),null);
                var balance=e.product().balance(recipient.id()).amount();
                var outcome=review.decide(raw.id(),request);
                if(!corroborated){
                    assertThat(outcome).containsEntry("status","NOT_APPLIED");
                    assertThat(e.money().notification(raw.id()).state()).isEqualTo(ProcessingState.REVIEW_REQUIRED);
                    assertThat(e.money().transaction(credit.id()).meaningState()).isEqualTo("UNRESOLVED");
                    continue;
                }
                assertThat(outcome).containsEntry("status","APPLIED");
                assertThat(review.decide(raw.id(),request)).isEqualTo(outcome);
                var result=(Map<?,?>)outcome.get("result");
                var transfer=e.money().transaction(UUID.fromString(result.get("transactionId").toString()));
                assertThat(transfer.type()).isEqualTo(TransactionType.TRANSFER);
                assertThat(transfer.fromAccountId()).isEqualTo(payer.id());
                assertThat(transfer.toAccountId()).isEqualTo(recipient.id());
                assertThat(transfer.sources()).hasSize(2);
                assertThat(e.money().transaction(credit.id()).mergedInto()).isEqualTo(transfer.id());
                assertThat(e.product().balance(recipient.id()).amount()).isEqualByComparingTo(balance);
                assertThat(e.db().queryForObject("select sum(amount) from money_transactions where user_id=? and from_account_id=? and not excluded and merged_into is null",
                        java.math.BigDecimal.class,owner,payer.id())).isEqualByComparingTo(Integer.toString(amount));
                assertThat(e.db().queryForObject("select count(*) from money_transactions where user_id=? and not excluded and merged_into is null",Integer.class,owner)).isEqualTo(1);
                assertThat(e.money().notification(raw.id()).state()).isEqualTo(ProcessingState.PROCESSED);
            }
        });
    }

    private BatchExecute command(Map<String, Object> preview, boolean confirmed) {
        return new BatchExecute(UUID.randomUUID(), (UUID) preview.get("previewId"),
                preview.get("fingerprint").toString(), confirmed);
    }
}
