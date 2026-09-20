package com.kafka.backend.authoring;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.kafka.backend.authoring.AuthoringTypes.*;

/** Isolated SQL-backed lifecycle tests. PostgreSQL-specific RLS still needs the DEV migration smoke. */
class AuthoringServiceTest {
    SingleConnectionDataSource source;
    JdbcTemplate db;
    AuthoringService service;
    AuthoringDefinitions definitions;
    UUID owner = UUID.randomUUID();
    final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach void setup() throws Exception {
        source = new SingleConnectionDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL", "sa", "", true);
        db = new JdbcTemplate(source) {
            @Override public int update(String sql, Object... args) {
                // H2 requires FORMAT JSON for a string parameter; PostgreSQL parses CAST AS JSONB.
                return super.update(sql.replace("cast(? as jsonb)", "? FORMAT JSON"), args);
            }
        };
        db.execute("create schema auth");
        db.execute("create table auth.users(id uuid primary key)");
        db.update("insert into auth.users values(?)", owner);
        String migration = Files.readString(Path.of("src/main/resources/db/migration/V40__create_authoring_sessions.sql"))
                .replaceAll("(?m)--.*$", "").replace("TIMESTAMPTZ", "TIMESTAMP WITH TIME ZONE")
                .replace("DEFAULT '{}'", "DEFAULT '{}' FORMAT JSON");
        for (String statement : migration.split(";")) {
            if (!statement.isBlank() && !statement.contains("ENABLE ROW LEVEL SECURITY")) db.execute(statement);
        }
        definitions = new AuthoringDefinitions(json);
        service = new AuthoringService(db, () -> owner, json, definitions);
    }
    @AfterEach void close() { source.destroy(); }
    Session create(String key) { return service.create(new CreateSession(key, null)); }
    Session save(Session session, Map<String, Object> answers) {
        return service.save(session.id(), new SaveSession(session.version(), session.currentSectionKey(), answers));
    }
    Map<String, Object> completionAnswers(Session session) {
        var answers = new LinkedHashMap<String, Object>();
        var questions = AuthoringAnswers.questions(session.definition());
        var keys = new HashSet<>(session.definition().completionKeys());
        questions.values().stream().filter(q -> Boolean.TRUE.equals(q.required())).forEach(q -> keys.add(q.questionKey()));
        for (String key : keys) {
            var q = questions.get(key);
            answers.put(key, switch (q.type()) {
                case "SINGLE_SELECT" -> q.options().getFirst();
                case "MULTI_SELECT" -> List.of(q.options().getFirst());
                case "SCORE" -> Map.of("value", 5);
                case "CLASSIFICATION" -> List.of(Map.of("text", "Required entry", "classification", q.options().getFirst()));
                default -> "Completed reflection";
            });
        }
        return answers;
    }
    Session complete(Session session) {
        var ready = save(session, completionAnswers(session));
        return service.complete(ready.id(), new CompleteSession(ready.version()));
    }

    @Test void definitionsHaveUniqueQuestionsAndValidCompletionAndReportReferences() {
        assertThat(definitions.all()).hasSize(3);
        for (var definition : definitions.all()) {
            var keys = AuthoringAnswers.questions(definition).keySet();
            assertThat(keys).containsAll(definition.completionKeys());
            for (var section : definition.reportSections()) assertThat(keys).containsAll(section.questionKeys());
            assertThat(definition.stoppingRules()).isNotEmpty();
        }
    }

    @Test void createSaveResumePreservesEveryAnswerTypeAndSection() {
        var session = create("recovery");
        var questions = AuthoringAnswers.questions(session.definition());
        var answers = new LinkedHashMap<String, Object>();
        answers.put("unload.writing", "한글 reflection\nsecond line");
        answers.put("arrival.reasons", List.of(questions.get("arrival.reasons").options().getFirst()));
        answers.put("level", questions.get("level").options().getFirst());
        answers.put("scan.0", Map.of("value", 7, "memo", "Some context"));
        answers.put("triage", List.of(Map.of("text", "Pay bill", "classification", "MUST", "memo", "Due today")));
        var saved = service.save(session.id(), new SaveSession(0L, "scan", answers));
        assertThat(saved.version()).isEqualTo(1);
        assertThat(saved.currentSectionKey()).isEqualTo("scan");
        assertThat(service.get(session.id()).answers()).isEqualTo(answers);
        assertThat(service.list()).singleElement().satisfies(s -> assertThat(s.id()).isEqualTo(session.id()));
        assertThat(service.get(session.id()).definition()).isEqualTo(session.definition());
    }

    @Test void staleSaveCannotOverwriteAnswersOrSection() {
        var session = create("recovery");
        save(session, Map.of("firstAction", "Latest answer"));
        assertThatThrownBy(() -> save(session, Map.of("firstAction", "Old answer"))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> service.complete(session.id(), new CompleteSession(0L))).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(service.get(session.id()).answers()).containsEntry("firstAction", "Latest answer");
    }

    @Test void completeFreezesRawAnswersReportAndDefinition() {
        var session = create("recovery");
        assertThatThrownBy(() -> service.complete(session.id(), new CompleteSession(0L))).isInstanceOf(InvalidRequestException.class);
        var answers = completionAnswers(session);
        answers.put("scan.0", Map.of("value", 2)); answers.put("scan.1", Map.of("value", 8));
        answers.put("triage", List.of(Map.of("text", "Pay bill", "classification", "MUST", "timing", "오늘"), Map.of("text", "Later task", "classification", "LATER")));
        var saved = save(session, answers);
        var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(completed.completedAt()).isNotNull();
        assertThat(completed.answers()).isEqualTo(answers);
        assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());
        assertThat(((Map<?, ?>) completed.report().get("scanSummary")).get("average")).isEqualTo(5.0);
        assertThat(service.recoveryExport(completed.id())).containsEntry("opsAvailable", false);
        assertThat((List<?>) service.recoveryExport(completed.id()).get("must")).hasSize(1);
        assertThatThrownBy(() -> save(completed, Map.of())).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.complete(completed.id(), new CompleteSession(completed.version()))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());
        // Code-controlled current definitions are no longer consulted for a historical session.
        var newerDefinitions = mock(AuthoringDefinitions.class);
        var futureService = new AuthoringService(db, () -> owner, json, newerDefinitions);
        assertThat(futureService.get(completed.id()).definition()).isEqualTo(session.definition());
        verifyNoInteractions(newerDefinitions);
    }

    @Test void emptyDraftsArePermittedButInvalidKeysShapesOptionsAndScoresAreRejected() {
        var session = create("recovery");
        var empty = new LinkedHashMap<String, Object>();
        empty.put("firstAction", null); empty.put("scan.0", Collections.singletonMap("value", null));
        empty.put("triage", List.of(Map.of("text", "", "classification", "")));
        session = save(session, empty);
        final var current = session;
        for (var answers : List.of(Map.of("unknown", "text"), Map.of("firstAction", 2), Map.of("level", "FAKE"),
                Map.of("scan.0", Map.of("value", 11)), Map.of("scan.0", Map.of("value", 2.5)),
                Map.of("triage", List.of(Map.of("text", "Task", "classification", "FAKE"))))) {
            assertThatThrownBy(() -> save(current, new LinkedHashMap<>(answers))).isInstanceOf(InvalidRequestException.class);
        }
        assertThatThrownBy(() -> service.save(current.id(), new SaveSession(current.version(), "unknown", Map.of()))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.save(current.id(), new SaveSession(null, "arrival", Map.of()))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> create("past")).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.recoveryExport(current.id())).isInstanceOf(InvalidRequestException.class);
    }

    @Test void onlyCompletedOwnedRealityCanBeReferencedAndFutureStartsEmpty() {
        var reality = create("reality");
        assertThatThrownBy(() -> service.create(new CreateSession("grounded-future", reality.id()))).isInstanceOf(InvalidRequestException.class);
        var done = complete(reality);
        var future = service.create(new CreateSession("grounded-future", done.id()));
        assertThat(future.sourceSessionId()).isEqualTo(done.id()); assertThat(future.answers()).isEmpty();
        assertThatThrownBy(() -> service.create(new CreateSession("recovery", done.id()))).isInstanceOf(InvalidRequestException.class);
        var recovery = complete(create("recovery"));
        assertThatThrownBy(() -> service.create(new CreateSession("grounded-future", recovery.id()))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.recoveryExport(done.id())).isInstanceOf(InvalidRequestException.class);
        UUID outsider = UUID.randomUUID(); db.update("insert into auth.users values(?)", outsider);
        var other = new AuthoringService(db, () -> outsider, json, definitions);
        assertThat(other.list()).isEmpty();
        assertThatThrownBy(() -> other.get(done.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.create(new CreateSession("grounded-future", done.id()))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.save(future.id(), new SaveSession(0L, future.currentSectionKey(), Map.of()))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.complete(recovery.id(), new CompleteSession(recovery.version()))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.recoveryExport(recovery.id())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test void classificationDraftsRemainEditableButCompletionRequiresClassificationAndMustTiming() {
        var session = create("recovery");
        var answers = completionAnswers(session);
        answers.put("triage", List.of(Map.of("text", "Important task", "classification", "", "timing", "")));
        var unclassified = save(session, answers);
        assertThatThrownBy(() -> service.complete(unclassified.id(), new CompleteSession(unclassified.version())))
                .isInstanceOf(InvalidRequestException.class);
        answers.put("triage", List.of(Map.of("text", "Important task", "classification", "MUST")));
        var untimed = save(unclassified, answers);
        assertThatThrownBy(() -> service.complete(untimed.id(), new CompleteSession(untimed.version())))
                .isInstanceOf(InvalidRequestException.class);
        answers.put("triage", List.of(Map.of("text", "Important task", "classification", "MUST", "timing", "내일"),
                Map.of("text", "", "classification", "", "timing", "")));
        var ready = save(untimed, answers);
        var completed = service.complete(ready.id(), new CompleteSession(ready.version()));
        assertThat((List<?>) completed.answers().get("triage")).hasSize(2);
        assertThat((List<?>) service.recoveryExport(completed.id()).get("must")).hasSize(1);
    }

    @Test void allProgramsCanProduceSeparateHistoricalReports() {
        for (String key : List.of("recovery", "reality", "grounded-future")) {
            var first = complete(create(key)); var second = complete(create(key));
            assertThat(first.id()).isNotEqualTo(second.id());
            assertThat(first.report().get("programKey")).isEqualTo(key);
            assertThat(service.get(first.id()).completedAt()).isEqualTo(first.completedAt());
        }
        assertThat(service.list()).hasSize(6);
    }
}
