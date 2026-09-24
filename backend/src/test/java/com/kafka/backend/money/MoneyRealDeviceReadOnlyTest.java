package com.kafka.backend.money;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Opt-in read-only verification. Bodies are only processed in memory, never printed or exported. */
@EnabledIfEnvironmentVariable(named="MONEY_VERIFY_DEVICE_AUDIT",matches="true")
class MoneyRealDeviceReadOnlyTest {
    @Test void eighteenFinancialSourcesRemainUnmodifiedAndParseAgainstVerifiedAccountRegistry() throws Exception {
        try(var c=MoneyPostgresIntegrationTest.connection()){
            c.setReadOnly(true);c.setAutoCommit(false);
            try {
                var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));var service=MoneyPostgresIntegrationTest.service(db,MoneyPostgresIntegrationTest.OWNER);
                var raws=db.query("select * from public.money_raw_notifications where user_id=? and posted_at between '2026-09-24T07:54:36Z' and '2026-09-24T08:00:16Z' order by posted_at",(r,n)->new MoneyRawNotification(
                    r.getObject("id",UUID.class),r.getString("source_package"),r.getString("notification_key"),null,r.getString("title"),r.getString("body"),r.getString("big_text"),
                    r.getTimestamp("posted_at").toInstant(),r.getTimestamp("received_at").toInstant(),Map.of(),r.getString("dedupe_key"),ProcessingState.valueOf(r.getString("state")),r.getLong("processing_version")),MoneyPostgresIntegrationTest.OWNER);
                assertThat(raws.size()).isEqualTo(18);List<ParseAttempt> attempts=new ArrayList<>();int ordinal=0;
                for(var raw:raws){var attempt=VerifiedMoneyFixtures.attempt(raw);ordinal++;
                    assertThat(attempt.status()).as("audit E%02d parser status",ordinal).isEqualTo("PARSED");
                    assertThat(raw.state()).isEqualTo(ProcessingState.RECEIVED);assertThat(raw.processingVersion()).isZero();attempts.add(attempt);
                }
                var matcher=new VerifiedMoneyTransferMatcher(Clock.fixed(VerifiedMoneyFixtures.NOW,ZoneOffset.UTC));
                var proposals=matcher.propose(new MoneyTransferMatcher.Context(VerifiedMoneyFixtures.accounts(),attempts,List.of()));
                long transfers=proposals.stream().filter(p->p.transaction()!=null).count();
                assertThat(transfers).as("real audit logical transfers").isEqualTo(10);
                assertThat(proposals.stream().filter(p->p.transaction()!=null).mapToInt(p->p.sources().size()).sum()).isEqualTo(18);
                int[][] groups={{0,1},{3,2},{4,5},{7,6},{8,9},{11,10},{12},{13},{15,14},{16,17}};
                for(var group:groups){Set<UUID> expected=new HashSet<>();for(int i:group)expected.add(raws.get(i).id());
                    assertThat(proposals.stream().anyMatch(p->p.transaction()!=null&&new HashSet<>(p.sources().stream().map(TransactionSource::rawEventId).toList()).equals(expected)))
                        .as("audited scenario source pairing").isTrue();}
            }finally{c.rollback();}
        }
    }
}
