package com.kafka.backend.pos;

import com.kafka.backend.common.OptimisticLockConflictException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static com.kafka.backend.pos.PosSpaceDefaultsSecurityTest.CHANGED;
import static com.kafka.backend.pos.PosSpaceDefaultsSecurityTest.INITIAL;
import static org.assertj.core.api.Assertions.*;

/** Requires a fresh, disposable database on the local QA PostgreSQL instance. */
@EnabledIfEnvironmentVariable(named = "POS_SPACE_DEFAULTS_TEST_PORT", matches = "[0-9]{4,5}")
class PosSpaceDefaultsPostgresTest {
    @Test void migrationRoundTripOwnerIsolationAndConcurrentWriteSafety(@TempDir Path migrations) throws Exception {
        var source = new DriverManagerDataSource(
                "jdbc:postgresql://127.0.0.1:" + System.getenv("POS_SPACE_DEFAULTS_TEST_PORT") + "/pos_space_defaults_qa",
                "posqa", "");
        var db = new JdbcTemplate(source);
        db.execute("create schema auth");
        db.execute("create table auth.users (id uuid primary key)");
        db.execute("create table pos_system_order (owner_id uuid primary key, system_ids text not null)");
        var owner = UUID.randomUUID();
        var other = UUID.randomUUID();
        db.update("insert into auth.users (id) values (?), (?)", owner, other);
        db.update("insert into pos_system_order (owner_id, system_ids) values (?, 'notes,work')", owner);

        String migration = "V127__pos_space_defaults.sql";
        try (var input = getClass().getResourceAsStream("/db/migration/" + migration)) {
            Files.copy(input, migrations.resolve(migration));
        }
        var flyway = Flyway.configure().dataSource(source).locations("filesystem:" + migrations)
                .baselineVersion("126").baselineOnMigrate(true).load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("127");
        assertThat(db.queryForObject("select relrowsecurity from pg_class where oid='pos_space_defaults'::regclass", Boolean.class)).isTrue();

        var a = new PosSpaceDefaultsController(db, () -> owner);
        var b = new PosSpaceDefaultsController(db, () -> other);
        var initial = PosSpaceDefaultsController.parse(INITIAL);
        assertThat(a.get()).isEqualTo(initial);
        assertThat(b.get()).isEqualTo(initial);

        concurrentSave(a, CHANGED);
        var confirmed = new PosSpaceDefaultsController(db, () -> owner).get();
        assertThat(confirmed.revision()).isEqualTo(1);
        assertThat(confirmed.defaults()).isEqualTo(PosSpaceDefaultsController.parse(CHANGED).defaults());
        assertThat(b.get()).isEqualTo(initial);
        assertThatThrownBy(() -> b.save(atRevision(CHANGED, 1))).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(b.save(INITIAL).revision()).isEqualTo(1);

        concurrentSave(a, atRevision(INITIAL, 1));
        assertThat(a.get().defaults()).isEqualTo(initial.defaults());
        assertThat(a.get().revision()).isEqualTo(2);
        assertThat(b.get().revision()).isEqualTo(1);
        assertThat(db.queryForObject("select system_ids from pos_system_order where owner_id=?", String.class, owner)).isEqualTo("notes,work");
        db.update("update pos_space_defaults set defaults=cast(? as jsonb) where owner_id=?", "{\"life\":\"WORK OS\",\"knowledge\":\"BLOG\"}", owner);
        assertThat(a.get().defaults()).containsEntry("life", "LIFE CODE").containsEntry("knowledge", "BLOG");
        assertThat(db.queryForObject("select revision from pos_space_defaults where owner_id=?", Long.class, owner)).isEqualTo(2);
    }

    private static String atRevision(String body, int revision) {
        return body.replace("\"revision\":0", "\"revision\":" + revision);
    }

    private static void concurrentSave(PosSpaceDefaultsController controller, String body) throws Exception {
        Callable<Boolean> write = () -> {
            try {
                controller.save(body);
                return true;
            } catch (OptimisticLockConflictException ignored) {
                return false;
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = executor.invokeAll(List.of(write, write));
            assertThat(List.of(results.getFirst().get(), results.getLast().get())).containsExactlyInAnyOrder(true, false);
        }
    }
}
