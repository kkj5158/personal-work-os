package com.kafka.backend.authoring;

import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;

import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.kafka.backend.authoring.AuthoringTypes.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Opt-in DEV PostgreSQL persistence smoke against the existing migrated schema.
 * Every write uses one non-autocommit connection and is unconditionally rolled back;
 * this test never runs Flyway, creates schema/users, or changes existing session rows.
 */
@EnabledIfEnvironmentVariable(named = "DEV_DB_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "APP_DEV_USER_ID", matches = ".+")
class AuthoringPostgresIntegrationTest {
    @Test void jsonbSnapshotsConcurrencyOwnershipAndRealityReferenceRoundTripWithoutLeavingRows() throws Exception {
        UUID owner = UUID.fromString(System.getenv("APP_DEV_USER_ID"));
        var json = JsonMapper.builder().build();
        var definitions = new AuthoringDefinitions(json);
        List<UUID> createdIds = new ArrayList<>();

        try (var connection = DriverManager.getConnection(System.getenv("DEV_DB_URL"),
                System.getenv("DEV_DB_USERNAME"), System.getenv("DEV_DB_PASSWORD"))) {
            connection.setAutoCommit(false);
            var source = new SingleConnectionDataSource(connection, true);
            var db = new JdbcTemplate(source);
            db.execute("set local statement_timeout = '15s'");
            db.execute("set local lock_timeout = '5s'");
            try {
                var service = new AuthoringService(db, () -> owner, json, definitions);
                var recovery = service.create(new CreateSession("recovery", null));
                createdIds.add(recovery.id());
                assertThat(recovery.answers()).isEmpty();
                assertThat(recovery.version()).isZero();
                assertThat(recovery.definition()).isEqualTo(definitions.current("recovery"));
                assertThat(db.queryForObject("select jsonb_typeof(definition) from authoring_sessions where id=? and user_id=?",
                        String.class, recovery.id(), owner)).isEqualTo("object");

                var answers = requiredAnswers(recovery);
                answers.put("unload.writing", "PostgreSQL rollback verification — 원본\n두 번째 줄");
                answers.put("arrival.reasons", List.of("수면", "공간"));
                answers.put("level", AuthoringAnswers.questions(recovery.definition()).get("level").options().getFirst());
                answers.put("scan.0", Map.of("value", 2, "memo", "수면 메모"));
                answers.put("scan.1", Map.of("value", 8));
                answers.put("triage", List.of(Map.of("text", "Test first action", "classification", "MUST", "timing", "오늘"),
                        Map.of("text", "Test deferred task", "classification", "LATER")));
                var saved = service.save(recovery.id(), new SaveSession(0L, "scan", answers));
                assertThat(saved.version()).isEqualTo(1L);
                assertThat(saved.currentSectionKey()).isEqualTo("scan");
                // A fresh service reads the original nested JSON shapes from PostgreSQL JSONB.
                var resumed = new AuthoringService(db, () -> owner, json, definitions).get(saved.id());
                assertThat(resumed.answers()).isEqualTo(answers);
                assertThat(db.queryForObject("select jsonb_typeof(answers -> 'triage') from authoring_sessions where id=? and user_id=?",
                        String.class, saved.id(), owner)).isEqualTo("array");
                assertThatThrownBy(() -> service.save(saved.id(), new SaveSession(0L, "arrival", Map.of())))
                        .isInstanceOf(OptimisticLockConflictException.class);
                assertThat(service.get(saved.id()).answers()).isEqualTo(answers);

                var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
                assertThat(completed.status()).isEqualTo("COMPLETED");
                assertThat(completed.version()).isEqualTo(2L);
                assertThat(completed.completedAt()).isNotNull();
                assertThat(completed.answers()).isEqualTo(answers);
                assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());
                assertThat(service.get(completed.id()).definition()).isEqualTo(recovery.definition());
                assertThat(db.queryForObject("select jsonb_typeof(report) from authoring_sessions where id=? and user_id=?",
                        String.class, completed.id(), owner)).isEqualTo("object");
                assertThat(service.recoveryExport(completed.id())).containsEntry("opsAvailable", false);
                assertThat((List<?>) service.recoveryExport(completed.id()).get("must")).hasSize(1);
                assertThatThrownBy(() -> service.save(completed.id(), new SaveSession(completed.version(), "arrival", Map.of())))
                        .isInstanceOf(InvalidRequestException.class);
                assertThatThrownBy(() -> service.complete(completed.id(), new CompleteSession(completed.version())))
                        .isInstanceOf(InvalidRequestException.class);
                assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());

                var reality = service.create(new CreateSession("reality", null));
                createdIds.add(reality.id());
                assertThatThrownBy(() -> service.create(new CreateSession("grounded-future", reality.id())))
                        .isInstanceOf(InvalidRequestException.class);
                var realitySaved = service.save(reality.id(), new SaveSession(0L, "close", requiredAnswers(reality)));
                var realityCompleted = service.complete(reality.id(), new CompleteSession(realitySaved.version()));
                var future = service.create(new CreateSession("grounded-future", realityCompleted.id()));
                createdIds.add(future.id());
                assertThat(service.get(future.id()).sourceSessionId()).isEqualTo(reality.id());
                assertThat(future.answers()).isEmpty();
                assertThatThrownBy(() -> service.create(new CreateSession("grounded-future", completed.id())))
                        .isInstanceOf(InvalidRequestException.class);
                // Repeated structures, grouped writing, and virtual report stages round-trip as JSONB.
                for (String key : List.of("quick-motivation", "grounded-future", "past", "review")) {
                    var session = service.create(new CreateSession(key, key.equals("review") ? realityCompleted.id() : null));
                    createdIds.add(session.id());
                    var authored = requiredAnswers(session);
                    var updated = service.save(session.id(), new SaveSession(0L,
                            session.definition().sections().getLast().sectionKey(), authored));
                    assertThat(new AuthoringService(db, () -> owner, json, definitions).get(session.id()).answers()).isEqualTo(authored);
                    var snapshot = service.complete(session.id(), new CompleteSession(updated.version()));
                    assertThat(snapshot.answers()).isEqualTo(authored);
                    assertThat(service.get(snapshot.id()).report()).isEqualTo(snapshot.report());
                    if (key.equals("review")) {
                        assertThat(service.get(realityCompleted.id())).isEqualTo(realityCompleted);
                        assertThat(((Map<?,?>) snapshot.report().get("source")).get("id")).isEqualTo(realityCompleted.id().toString());
                    }
                }
                assertThat(service.list()).extracting(Summary::id).containsAll(createdIds);

                // No auth.users fixtures are needed to prove that foreign-owner reads/writes fail.
                UUID foreignOwner = UUID.randomUUID();
                var outsider = new AuthoringService(db, () -> foreignOwner, json, definitions);
                assertThat(outsider.list()).isEmpty();
                assertThatThrownBy(() -> outsider.get(completed.id())).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(() -> outsider.save(future.id(), new SaveSession(0L, future.currentSectionKey(), Map.of())))
                        .isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(() -> outsider.complete(future.id(), new CompleteSession(0L)))
                        .isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(() -> outsider.recoveryExport(completed.id())).isInstanceOf(ResourceNotFoundException.class);
                assertThatThrownBy(() -> outsider.create(new CreateSession("grounded-future", reality.id())))
                        .isInstanceOf(ResourceNotFoundException.class);
            } finally {
                connection.rollback();
            }
            try {
                for (UUID id : createdIds) {
                    assertThat(db.queryForObject("select count(*) from authoring_sessions where id=?", Integer.class, id))
                            .as("Rollback removes the test-created session").isZero();
                }
            } finally {
                connection.rollback();
            }
        }
    }

    private static Map<String, Object> requiredAnswers(Session session) {
        return AuthoringFixtures.required(session);
    }
}
