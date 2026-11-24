package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.kafka.backend.money.MoneyTypes.AccountRole;
import static com.kafka.backend.money.MoneyStatisticalAccountService.Confidence.*;
import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/.+")
class MoneyStatisticalAccountPostgresTest {
    private final MoneyUnifiedBookkeepingPostgresTest fixture = new MoneyUnifiedBookkeepingPostgresTest();

    @Test void cutoffIsInclusiveThroughTheFinalPostgresMicrosecondInSeoul() {
        var now = Instant.parse("2026-11-22T09:00:00.123456789Z");
        assertThat(MoneyStatisticalAccountService.cutoff(LocalDate.parse("2026-10-31"),now))
            .isEqualTo(Instant.parse("2026-10-31T14:59:59.999999Z"));
        assertThat(MoneyStatisticalAccountService.cutoff(LocalDate.parse("2026-11-30"),now))
            .isEqualTo(Instant.parse("2026-11-22T09:00:00.123456Z"));
    }

    @Test void historicalPurposeMembershipAndEvidenceRemainScopedToCutoff() {
        fixture.check(e -> {
            var db = e.db();
            var savings = fixture.account(e,AccountRole.SPENDING);
            var installment = fixture.account(e,AccountRole.SPENDING);
            var unknown = fixture.account(e,AccountRole.SAVINGS);
            var owner = db.queryForObject("SELECT user_id FROM money_accounts WHERE id=?",UUID.class,savings.id());
            var service = new MoneyStatisticalAccountService(db,()->owner,e.product(),new MoneyMeaningService(db,()->owner,tools.jackson.databind.json.JsonMapper.builder().build()));
            var day = LocalDate.parse("2026-10-31");
            var cutoff = Timestamp.from(Instant.parse("2026-10-31T14:59:59.999999Z"));
            var opening = Timestamp.from(Instant.parse("2026-10-01T00:00:00Z"));
            var next = Timestamp.from(Instant.parse("2026-11-01T00:00:00Z"));
            var ids = String.join(",",savings.id().toString(),installment.id().toString(),unknown.id().toString());
            var members = new UUID[]{savings.id(),installment.id(),unknown.id()};
            for (int i=0;i<members.length;i++) {
                var id=members[i];
                db.update("UPDATE money_accounts SET created_at=?,include_in_assets=false WHERE id=?",opening,id);
                db.update("INSERT INTO money_statistical_membership_history VALUES (?,?,?,false,true)",owner,id,opening);
                db.update("INSERT INTO money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version) VALUES (?,?,'SAVINGS',?,?,0)",
                    owner,id,i==1?"INSTALLMENT":"SAVINGS_ACCOUNT",opening);
            }
            db.update("insert into money_tracking_settings(user_id) values(?) on conflict do nothing",owner);
            db.update("insert into money_tracking_selections(user_id,kind,effective_at,version,accounts) values(?,'SAVINGS',?,1,?), (?,'INSTALLMENT',?,1,?)",
                owner,opening,new UUID[]{savings.id(),unknown.id()},owner,opening,new UUID[]{installment.id()});
            db.update("INSERT INTO money_statistical_membership_history VALUES (?,?,?,true,true)",owner,savings.id(),next);
            db.update("INSERT INTO money_statistical_account_purposes VALUES (?,?,?,'SAVINGS',1,'OWNER')",owner,installment.id(),next);
            var checkpoint = "INSERT INTO money_balance_checkpoints(id,user_id,account_id,amount,verified_at,created_at) VALUES (?,?,?,?,?,?)";
            db.update(checkpoint,UUID.randomUUID(),owner,savings.id(),80,cutoff,cutoff);
            db.update(checkpoint,UUID.randomUUID(),owner,savings.id(),500,next,next);
            db.update(checkpoint,UUID.randomUUID(),owner,installment.id(),-12,cutoff,cutoff);
            var snapshot=service.snapshot(day,"KRW",ids);
            assertThat(snapshot.savings().total()).isNull();
            assertThat(snapshot.savings().confirmedPartialSum()).isEqualByComparingTo("80");
            assertThat(snapshot.savings().knownCount()).isEqualTo(1);
            assertThat(snapshot.savings().unknownCount()).isEqualTo(1);
            assertThat(snapshot.savings().members().stream().filter(row->row.accountId().equals(unknown.id())).findFirst().orElseThrow().balance()).isNull();
            assertThat(snapshot.installment().total()).isEqualByComparingTo("-12");
            assertThat(snapshot.installment().members().getFirst().status()).isEqualTo("OWNER_CHECKED");
            db.update(checkpoint,UUID.randomUUID(),owner,installment.id(),3,cutoff,cutoff);
            snapshot=service.snapshot(day,"KRW",ids);
            assertThat(snapshot.installment().total()).isNull();
            assertThat(snapshot.installment().conflicts()).isEqualTo(1);
        });
    }

    private static final LocalDate MONTH_END = LocalDate.parse("2026-10-31");
    private static final Instant ANCHOR = Instant.parse("2026-10-30T04:00:00Z");
    private static final Instant END = Instant.parse("2026-10-31T14:59:59.999999Z");
    private static final Instant LATER = Instant.parse("2026-10-31T15:00:00Z");

    @Test void s01s02CoveredAndUncoveredBalancesIncludeOnlyScopedSignedMovementsOnce() {
        fixture.check(e -> {
            var db = e.db();
            UUID left = fixture.account(e,AccountRole.SPENDING).id();
            UUID right = fixture.account(e,AccountRole.SPENDING).id();
            UUID zero = fixture.account(e,AccountRole.SPENDING).id();
            UUID missing = fixture.account(e,AccountRole.SPENDING).id();
            UUID unrelated = fixture.account(e,AccountRole.SPENDING).id();
            var owner = owner(e,left);
            tracked(e,owner,"SAVINGS",left,right,zero,missing);
            db.update("update money_accounts set created_at=? where id=?",time(ANCHOR.minusSeconds(60)),unrelated);
            db.update("delete from money_account_fund_group_history where user_id=? and account_id=?",owner,unrelated);
            checkpoint(e,owner,left,"500.12",ANCHOR);
            checkpoint(e,owner,right,"-320.31",ANCHOR);
            checkpoint(e,owner,zero,"0",ANCHOR);

            Instant movement = END.minusSeconds(30);
            UUID transfer = cash(e,owner,"TRANSFER",left,right,"200.23",movement,"KRW");
            UUID incoming = cash(e,owner,"INCOME",null,left,"100.02",movement.plusSeconds(1),"KRW");
            UUID nextMonth = cash(e,owner,"INCOME",null,zero,"80",LATER,"KRW");
            statement(e,owner,left,"500.12","399.91","BANK_PDF_TABLE",
                new BankRow(transfer,movement,"-200.23","299.89"), new BankRow(incoming,movement.plusSeconds(1),"100.02","399.91"));
            statement(e,owner,right,"-320.31","-120.08","BANK_PDF_TABLE",
                new BankRow(transfer,movement,"200.23","-120.08"));
            statement(e,owner,zero,"0","80","BANK_PDF_TABLE",new BankRow(nextMonth,LATER,"80","80"));
            var service = service(e,owner);
            var ids = String.join(",",left.toString(),right.toString(),zero.toString(),unrelated.toString());
            var before = db.queryForList("select id,version,amount from money_transactions where user_id=? order by id",owner);
            var snapshot = service.snapshot(MONTH_END,"KRW",ids,END);
            assertThat(snapshot.asOfCutoff()).isEqualTo(END);
            var group = snapshot.savings();
            assertThat(group.confidence()).isEqualTo(ESTIMATED);
            assertThat(group.displayTotal()).isEqualTo("279.83");
            assertThat(group.total()).isNull();
            assertThat(group.estimatedCount()).isEqualTo(3);
            assertThat(group.membershipUnknownCount()).isZero();
            var zeroMember = member(group,zero);
            assertThat(zeroMember.displayBalance()).isEqualTo("0");
            assertThat(zeroMember.confidence()).isEqualTo(ESTIMATED);
            assertThat(zeroMember.basisAt()).isEqualTo(ANCHOR);
            assertThat(zeroMember.source()).isEqualTo("OWNER_CHECKPOINT");
            assertThat(zeroMember.known()).isFalse();
            assertThat(member(group,right).displayBalance()).isEqualTo("-120.08");
            String all = ids+","+missing;
            var partial = service.snapshot(MONTH_END,"KRW",all,END).savings();
            assertThat(partial.confidence()).isEqualTo(UNKNOWN);
            assertThat(partial.displayTotal()).isNull();
            assertThat(partial.estimatedSubtotal()).isEqualTo("279.83");
            assertThat(partial.displaySubtotal()).isEqualTo("279.83");
            assertThat(partial.partial()).isTrue();
            assertThat(member(partial,missing).reason()).isEqualTo("NO_ANCHOR");
            assertThat(member(partial,missing).balance()).isNull();
            assertThat(service.snapshot(MONTH_END,"KRW",ids,END)).isEqualTo(snapshot);
            assertThat(db.queryForList("select id,version,amount from money_transactions where user_id=? order by id",owner)).isEqualTo(before);

            checkpoint(e,owner,missing,"0",ANCHOR);
            var uncovered = service.snapshot(MONTH_END,"KRW",all,END).savings();
            assertThat(member(uncovered,missing).reason()).isEqualTo("LEDGER_COVERAGE_UNPROVEN");
            assertThat(member(uncovered,missing).displayBalance()).isEqualTo("0");
            assertThat(uncovered.partial()).isFalse();
            cash(e,owner,"INCOME",null,missing,"30.75",movement,"KRW");
            assertThat(service.snapshot(MONTH_END,"KRW",all,END).savings().displaySubtotal()).isEqualTo("310.58");

            var unlinked = cash(e,owner,"INCOME",null,zero,"10",movement,"KRW");
            assertThat(member(service.snapshot(MONTH_END,"KRW",ids,END).savings(),zero).reason())
                .isEqualTo("LEDGER_MOVEMENT_UNRESOLVED");
            db.update("update money_transactions set excluded=true where id=?",unlinked);
            cash(e,owner,"INCOME",null,zero,"10",movement,"USD");
            assertThat(member(service.snapshot(MONTH_END,"KRW",ids,END).savings(),zero).reason())
                .isEqualTo("CURRENCY_SCOPE_UNVERIFIED");
            assertThat(member(service.snapshot(MONTH_END,"USD",ids,END).savings(),left).confidence()).isEqualTo(UNKNOWN);
        });
    }

    @Test void eligibleBankStatementCanVerifyCutoffButContradictoryBalanceCannot() {
        fixture.check(e -> {
            UUID account = fixture.account(e,AccountRole.SPENDING).id();
            UUID owner = owner(e,account);
            tracked(e,owner,"INSTALLMENT",account);
            Instant movement = END.minusSeconds(20);
            UUID tx = cash(e,owner,"INCOME",null,account,"10",movement,"KRW");
            UUID source = statement(e,owner,account,"100","110","BANK_PDF_TABLE",new BankRow(tx,movement,"10","110"));
            e.db().update("update money_bank_statements set date_to=? where id=?",MONTH_END,source);
            var service = service(e,owner);
            var bank = service.snapshot(MONTH_END,"KRW",account.toString(),END).installment().members().getFirst();
            assertThat(bank.confidence()).isEqualTo(VERIFIED);
            assertThat(bank.source()).isEqualTo("BANK_STATEMENT");
            assertThat(bank.bankObservedAt()).isEqualTo(END);
            assertThat(bank.displayBalance()).isEqualTo("110");
            checkpoint(e,owner,account,"99",ANCHOR);
            var conflict = service.snapshot(MONTH_END,"KRW",account.toString(),END).installment().members().getFirst();
            assertThat(conflict.confidence()).isEqualTo(CONFLICT);
            assertThat(conflict.reason()).isEqualTo("OBSERVATION_LEDGER_MISMATCH");
            assertThat(conflict.displayDifference()).isEqualTo("1");
            assertThat(conflict.displayBalance()).isEqualTo("110");
            checkpoint(e,owner,account,"105",END);
            var sameTime = service.snapshot(MONTH_END,"KRW",account.toString(),END).installment().members().getFirst();
            assertThat(sameTime.reason()).isEqualTo("OBSERVATIONS_DISAGREE");
        });
    }

    @Test void attestedNativeSourceStopsAtLastExactBankRow() {
        fixture.check(e -> {
            UUID account = fixture.account(e,AccountRole.SPENDING).id();
            UUID owner = owner(e,account);
            tracked(e,owner,"INSTALLMENT",account);
            Instant first = ANCHOR.minusSeconds(60), last = END.minusSeconds(120);
            UUID tx = cash(e,owner,"INCOME",null,account,"10",first,"KRW");
            UUID next = cash(e,owner,"EXPENSE",account,null,"5",last,"KRW");
            statement(e,owner,account,"20","25","OWNER_ATTESTED_NATIVE_REPLAY",
                new BankRow(tx,first,"10","30"),new BankRow(next,last,"-5","25"));
            checkpoint(e,owner,account,"30",ANCHOR);
            var service = service(e,owner);
            var inside = service.snapshot(MONTH_END,"KRW",account.toString(),last.minusSeconds(1)).installment().members().getFirst();
            assertThat(inside.confidence()).isEqualTo(ESTIMATED);
            assertThat(inside.displayBalance()).isEqualTo("30");
            var atLast = service.snapshot(MONTH_END,"KRW",account.toString(),last).installment().members().getFirst();
            assertThat(atLast.confidence()).isEqualTo(VERIFIED);
            assertThat(atLast.source()).isEqualTo("OWNER_ATTESTED_STATEMENT");
            assertThat(atLast.status()).isEqualTo("OWNER_CHECKED");
            assertThat(atLast.bankObservedAt()).isNull();
            var beyond = service.snapshot(MONTH_END,"KRW",account.toString(),END).installment().members().getFirst();
            assertThat(beyond.reason()).isEqualTo("LEDGER_COVERAGE_UNPROVEN");
        });
    }

    @Test void missingMembershipAffectsOnlyItsPossibleGroup() {
        fixture.check(e -> {
            UUID savings = fixture.account(e,AccountRole.SPENDING).id();
            UUID installment = fixture.account(e,AccountRole.SPENDING).id();
            UUID owner = owner(e,savings);
            tracked(e,owner,"SAVINGS",savings);
            tracked(e,owner,"INSTALLMENT",installment);
            checkpoint(e,owner,savings,"0",END);
            checkpoint(e,owner,installment,"70",END);
            var service = service(e,owner);
            var scope = savings+","+installment;
            var history = "update money_account_fund_group_history set savings_subtype=? where user_id=? and account_id=? and effective_at=?";
            var effective = time(ANCHOR.minusSeconds(120));
            e.db().update(history,null,owner,savings,effective);
            var ambiguous = service.snapshot(MONTH_END,"KRW",scope,END);
            assertThat(ambiguous.savings().members()).isEmpty();
            assertThat(ambiguous.savings().membershipUnknownCount()).isEqualTo(1);
            assertThat(ambiguous.installment().displayTotal()).isEqualTo("70");
            assertThat(ambiguous.unresolved().getFirst().possibleGroups()).containsExactly("SAVINGS");
            e.db().update(history,"SAVINGS_ACCOUNT",owner,savings,effective);
            e.db().update("delete from money_tracking_selections where user_id=? and kind='SAVINGS' and effective_at<=?",owner,time(END));
            var snapshot = service.snapshot(MONTH_END,"KRW",scope,END);
            assertThat(snapshot.savings().displayTotal()).isNull();
            assertThat(snapshot.savings().membershipUnknownCount()).isEqualTo(1);
            assertThat(snapshot.installment().displayTotal()).isEqualTo("70");
            assertThat(snapshot.unresolved().getFirst().possibleGroups()).containsExactly("SAVINGS");
        });
    }

    private static Timestamp time(Instant instant) { return Timestamp.from(instant); }

    private static UUID owner(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID account) {
        return e.db().queryForObject("select user_id from money_accounts where id=?",UUID.class,account);
    }

    private static MoneyStatisticalAccountService service(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner) {
        return new MoneyStatisticalAccountService(e.db(),()->owner,e.product(),
            new MoneyMeaningService(e.db(),()->owner,tools.jackson.databind.json.JsonMapper.builder().build()));
    }

    private static MoneyStatisticalAccountService.Member member(MoneyStatisticalAccountService.Group group, UUID account) {
        return group.members().stream().filter(m -> m.accountId().equals(account)).findFirst().orElseThrow();
    }

    private static void tracked(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner, String purpose, UUID... accounts) {
        var opening = time(ANCHOR.minusSeconds(120));
        e.db().update("insert into money_tracking_settings(user_id) values(?) on conflict do nothing",owner);
        e.db().update("insert into money_tracking_selections(user_id,kind,effective_at,version,accounts) values(?,?,?,1,?)",
            owner,purpose,opening,accounts);
        for (UUID account : accounts) {
            e.db().update("update money_accounts set created_at=? where id=?",opening,account);
            e.db().update("insert into money_statistical_membership_history values (?,?,?,false,true)",owner,account,opening);
            e.db().update("insert into money_account_fund_group_history(user_id,account_id,fund_group,savings_subtype,effective_at,account_version) values (?,?,'SAVINGS',?,?,0)",
                owner,account,purpose.equals("INSTALLMENT")?"INSTALLMENT":"SAVINGS_ACCOUNT",opening);
        }
    }

    private static void checkpoint(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner, UUID account, String amount, Instant at) {
        e.db().update("insert into money_balance_checkpoints(id,user_id,account_id,amount,verified_at,created_at) values(?,?,?,?,?,?)",
            UUID.randomUUID(),owner,account,new BigDecimal(amount),time(at),time(at));
    }

    private static UUID cash(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner, String type, UUID from, UUID to, String amount, Instant at, String currency) {
        UUID id=UUID.randomUUID();
        e.db().update("insert into money_transactions(id,user_id,type,from_account_id,to_account_id,amount,occurred_at,currency) values(?,?,?,?,?,?,?,?)",
            id,owner,type,from,to,new BigDecimal(amount),time(at),currency);
        return id;
    }

    private record BankRow(UUID transaction, Instant at, String amount, String balance) {}

    private static UUID statement(MoneyUnifiedBookkeepingPostgresTest.Env e, UUID owner, UUID account,
                                  String opening, String closing, String verification, BankRow... rows) {
        UUID id=UUID.randomUUID(), upload=UUID.randomUUID();
        String hash = id.toString().replace("-","").repeat(2);
        var db=e.db();
        db.update("insert into money_statement_uploads(id,user_id,account_id,provider,format,expected_hash,byte_length,expires_at) values(?,?,?,'IBK','PDF',?,1,now())",
            upload,owner,account,hash);
        List<BigDecimal> signed = java.util.Arrays.stream(rows).map(row -> new BigDecimal(row.amount())).toList();
        var in = signed.stream().filter(amount -> amount.signum()>0).reduce(BigDecimal.ZERO,BigDecimal::add);
        var out = signed.stream().filter(amount -> amount.signum()<0).reduce(BigDecimal.ZERO,BigDecimal::add).negate();
        db.update("""
            insert into money_bank_statements(id,user_id,account_id,upload_id,fingerprint,normalized_fingerprint,provider,currency,
              verification,date_from,date_to,row_count,outflow,inflow,opening_balance,final_balance,created_at)
            values(?,?,?,?,?,?,'IBK','KRW',?,'2026-10-30','2026-11-01',?,?,?,?,?,'2026-11-03T00:00:00Z')
            """,id,owner,account,upload,hash,hash,verification,rows.length,out,in,new BigDecimal(opening),new BigDecimal(closing));
        for (int i=0;i<rows.length;i++) {
            var row=rows[i];
            var amount=signed.get(i);
            var rowId=UUID.randomUUID();
            String cashKey=rowId.toString().replace("-","").repeat(2);
            db.update("""
                insert into money_statement_rows(id,user_id,statement_id,account_id,row_number,source_page,occurred_at,direction,amount,balance_after,description,cash_key)
                values(?,?,?,?,?,1,?,?,?,?,'synthetic',?)
                """,rowId,owner,id,account,rows.length-i,time(row.at()),amount.signum()<0?"OUT":"IN",amount.abs(),new BigDecimal(row.balance()),cashKey);
            db.update("insert into money_statement_effects(user_id,account_id,cash_key,transaction_id,row_id) values(?,?,?,?,?)",
                owner,account,cashKey,row.transaction(),rowId);
        }
        return id;
    }
}
