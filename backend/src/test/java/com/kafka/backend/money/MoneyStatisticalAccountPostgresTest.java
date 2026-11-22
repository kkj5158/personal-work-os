package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.kafka.backend.money.MoneyTypes.AccountRole;
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
            var service = new MoneyStatisticalAccountService(db,()->owner,e.product());
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
                db.update("INSERT INTO money_statistical_account_purposes VALUES (?,?,?,?,0,'BASELINE')",
                    owner,id,opening,i==1?"INSTALLMENT":"SAVINGS");
            }
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
}
