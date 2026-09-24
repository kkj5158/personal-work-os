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
        String migration = (Files.readString(Path.of("src/main/resources/db/migration/V40__create_authoring_sessions.sql"))
                + Files.readString(Path.of("src/main/resources/db/migration/V49__authoring_session_title_memo.sql")))
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
        return service.save(session.id(), new SaveSession(session.version(), session.currentSectionKey(), answers, null, null));
    }
    Map<String, Object> completionAnswers(Session session) {
        return AuthoringFixtures.required(session);
    }
    Session complete(Session session) {
        var ready = save(session, completionAnswers(session));
        return service.complete(ready.id(), new CompleteSession(ready.version()));
    }
    Definition definition(String key, String version) {
        try (var stream = getClass().getResourceAsStream("/authoring/" + key + "/" + version + ".json")) {
            return json.readValue(stream, Definition.class);
        } catch (java.io.IOException e) { throw new java.io.UncheckedIOException(e); }
    }
    /** Starts a session frozen on an earlier content version, as existing user sessions are. */
    Session createVersion(String key, String version) {
        var registry = mock(AuthoringDefinitions.class);
        when(registry.current(key)).thenReturn(definition(key, version));
        var created = new AuthoringService(db, () -> owner, json, registry).create(new CreateSession(key, null));
        return service.get(created.id());
    }
    Session legacy(String key) { return createVersion(key, Set.of("sexual-pattern", "responsibility").contains(key) ? "2026-09-23" : "2026-09-21"); }
    static final String CURRENT = "2026-09-24";

    @Test void definitionsHaveUniqueQuestionsAndValidCompletionAndReportReferences() {
        assertThat(definitions.all()).hasSize(9);
        assertThat(definitions.all()).extracting(Definition::programKey, Definition::group).containsExactly(
                tuple("quick-motivation", "QUICK"), tuple("recovery", "CORE"), tuple("reality", "CORE"), tuple("present-life", "CORE"),
                tuple("grounded-future", "CORE"), tuple("past", "CORE"), tuple("review", "CORE"),
                tuple("sexual-pattern", "TOPIC"), tuple("responsibility", "TOPIC"));
        for (var definition : definitions.all()) {
            var keys = AuthoringAnswers.questions(definition).keySet();
            assertThat(keys).containsAll(definition.completionKeys());
            for (var section : definition.reportSections()) assertThat(keys).containsAll(section.questionKeys());
            assertThat(definition.stoppingRules()).isNotEmpty();
            assertThat(definition.version()).isEqualTo(CURRENT);
            for (var question : AuthoringAnswers.questions(definition).values()) if (AuthoringAnswers.virtual(question)) {
                assertThat(keys).contains((String) question.metadata().get("sourceQuestionKey"));
            }
        }
    }

    @Test void legacySexualPatternKeepsEveryChapterOptionalAndReportsAuthoredValuesBeforeRawWriting() {
        var session = legacy("sexual-pattern");
        var definition = session.definition();
        assertThat(session.programTitle()).isEqualTo("성중독과 삶의 회복 - 자유롭고 온전하게 살아가기");
        assertThat(definition.sections()).extracting(Section::sectionKey).containsExactly("opening", "change", "pattern",
                "wanted", "history", "responsibility", "boundaries", "plan", "return", "closing");
        assertThat(definition.completionKeys()).isEmpty();
        assertThat(AuthoringAnswers.questions(definition).values()).noneMatch(q -> Boolean.TRUE.equals(q.required()));
        assertThat(definition.reportSections().getFirst().title()).startsWith("실전 요약");
        assertThat(definition.reportSections().getLast().title()).isEqualTo("아직 모르거나 상담에서 다룰 내용");

        // A deferred history chapter and an unanswered first action must not block completion.
        var answers = new LinkedHashMap<String, Object>();
        answers.put("boundaries.takeaway.limit", "테스트용 작성 내용입니다.");
        answers.put("history.writing", "지금은 쓰지 않겠습니다");
        answers.put("plan.writing", "테스트용 작성 내용입니다.\n두 번째 줄.");
        var saved = save(session, answers);
        var completed = service.complete(saved.id(), new CompleteSession(saved.version()));

        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(completed.answers()).isEqualTo(answers);
        assertThat(completed.report()).doesNotContainKey("scanSummary");
        @SuppressWarnings("unchecked") var sections = (List<Map<String, Object>>) completed.report().get("sections");
        var titles = sections.stream().map(s -> (String) s.get("title")).toList();
        assertThat(titles.indexOf("실전 요약 · 나의 경계")).isLessThan(titles.indexOf("원문 · 반복이 시작되는 순간"));
        assertThat(json.writeValueAsString(completed.report())).contains("두 번째 줄.", "지금은 쓰지 않겠습니다");
        var boundary = sections.stream().filter(s -> s.get("title").equals("실전 요약 · 나의 경계")).findFirst().orElseThrow();
        @SuppressWarnings("unchecked") var items = (List<Map<String, Object>>) boundary.get("items");
        assertThat(items).hasSize(4).last().satisfies(item -> assertThat(item.get("value")).isEqualTo("테스트용 작성 내용입니다."));
        assertThat(items.getFirst().get("value")).isNull();
    }

    @Test void legacyResponsibilityKeepsFixedThemeWithPerSessionSituationAndProminentJoyMeaning() {
        var definition = definition("responsibility", "2026-09-23");
        assertThat(definition.reportTitle()).isEqualTo("나의 자립·책임 약속");
        assertThat(definition.sections()).extracting(Section::sectionKey).containsExactly("situation", "current_share", "adult_agency",
                "social_commitments", "economic_independence", "joy_and_meaning", "difficult_moments", "responsibility_commitment");
        var closing = List.of("acceptedResponsibility", "socialPrinciples", "economicStep", "joyMeaning", "difficultyResponse", "firstActionAndReview");
        assertThat(definition.sections().getLast().questions()).extracting(Question::questionKey).containsExactlyElementsOf(closing);
        for (int i = 1; i < 7; i++) assertThat(definition.sections().get(i).questions()).singleElement()
                .satisfies(q -> assertThat(q.type()).isEqualTo("FREE_TEXT"));
        assertThat(definition.completionKeys()).containsExactlyElementsOf(List.of("situation", "acceptedResponsibility", "socialPrinciples",
                "economicStep", "joyMeaning", "difficultyResponse", "firstActionAndReview"));
        assertThat(json.writeValueAsString(definition)).doesNotContain("쿠팡 근무 규칙").contains("확정한 약속은 이행합니다", "사실을 인정하고 필요한 수습");

        var work = legacy("responsibility");
        var household = legacy("responsibility");
        assertThat(work.programTitle()).isEqualTo("자립하는 삶, 책임지는 삶");
        assertThat(work.answers()).isEmpty();
        var workAnswers = new LinkedHashMap<String, Object>(Map.of("situation", "테스트용 근무 약속 상황", "social_commitments.writing", "근무 원문"));
        var drafted = save(work, workAnswers);
        assertThatThrownBy(() -> service.complete(drafted.id(), new CompleteSession(drafted.version())))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("acceptedResponsibility");
        var householdSaved = save(household, Map.of("situation", "테스트용 생활비 분담 상황"));
        assertThat(service.get(householdSaved.id()).answers()).containsOnlyKeys("situation").containsEntry("situation", "테스트용 생활비 분담 상황");

        for (String key : closing) workAnswers.put(key, key.equals("joyMeaning") ? "지금부터 누릴 작은 기쁨" : "확인 필요");
        var ready = save(drafted, workAnswers);
        var done = service.complete(ready.id(), new CompleteSession(ready.version()));
        assertThat(done.answers()).isEqualTo(workAnswers);
        assertThat(service.get(done.id()).report()).isEqualTo(done.report());
        @SuppressWarnings("unchecked") var sections = (List<Map<String, Object>>) done.report().get("sections");
        assertThat(sections.getFirst().get("title")).isEqualTo("이번에 돌아볼 상황");
        @SuppressWarnings("unchecked") var summary = (List<Map<String, Object>>) sections.get(1).get("items");
        assertThat(summary).extracting(item -> item.get("questionKey")).containsExactlyElementsOf(closing);
        assertThat(summary.get(3)).containsEntry("prompt", "내가 지키고 싶은 기쁨과 삶의 의미").containsEntry("value", "지금부터 누릴 작은 기쁨");
        assertThat(json.writeValueAsString(done.report())).contains("테스트용 근무 약속 상황", "근무 원문");
        assertThat(service.get(householdSaved.id()).status()).isEqualTo("IN_PROGRESS");
        assertThatThrownBy(() -> save(done, Map.of("situation", "changed"))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.get(done.id()).answers()).containsEntry("situation", "테스트용 근무 약속 상황");
    }

    @Test void titleAndMemoAreOwnerMetadataEditableAfterCompletionWithoutTouchingTheReport() {
        assertThat(definitions.all()).extracting(Definition::title).containsExactly("다시 시작하기", "삶의 중심 되찾기",
                "지금의 삶 들여다보기", "지금의 삶을 누리기", "앞으로의 삶 설계하기", "나를 만든 시간들", "변화와 방향 돌아보기",
                "성중독과 삶의 회복 - 자유롭고 온전하게 살아가기", "자립하는 삶, 책임지는 삶");
        var session = create("recovery");
        assertThat(session.title()).isNull();
        assertThat(session.memo()).isNull();
        assertThat(session.programTitle()).isEqualTo("삶의 중심 되찾기");
        var answers = completionAnswers(session);
        var saved = service.save(session.id(), new SaveSession(session.version(), session.currentSectionKey(), answers,
                "다시 생활 리듬이 무너진 이유 정리", "9월 야간근무 이후\n생활패턴 확인"));
        assertThat(service.get(saved.id())).satisfies(s -> {
            assertThat(s.title()).isEqualTo("다시 생활 리듬이 무너진 이유 정리");
            assertThat(s.memo()).isEqualTo("9월 야간근무 이후\n생활패턴 확인");
            assertThat(s.answers()).isEqualTo(answers).doesNotContainKeys("title", "memo");
        });
        assertThat(service.list()).singleElement().satisfies(s -> assertThat(s.title()).isEqualTo("다시 생활 리듬이 무너진 이유 정리"));

        var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
        var report = completed.report();
        assertThat(json.writeValueAsString(report)).doesNotContain("다시 생활 리듬", "야간근무");
        var renamed = service.saveMetadata(completed.id(), new SaveMetadata(completed.version(), "새 제목", ""));
        assertThat(renamed.status()).isEqualTo("COMPLETED");
        assertThat(renamed.title()).isEqualTo("새 제목");
        assertThat(renamed.memo()).isNull();
        assertThat(renamed.version()).isEqualTo(completed.version() + 1);
        assertThat(renamed.report()).isEqualTo(report);
        assertThat(renamed.answers()).isEqualTo(completed.answers());
        assertThat(renamed.completedAt()).isEqualTo(completed.completedAt());
        assertThatThrownBy(() -> service.saveMetadata(completed.id(), new SaveMetadata(completed.version(), "stale", null)))
                .isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> service.saveMetadata(renamed.id(), new SaveMetadata(renamed.version(), "두 줄\n제목", null)))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.saveMetadata(renamed.id(), new SaveMetadata(renamed.version(), "x".repeat(201), null)))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.saveMetadata(renamed.id(), new SaveMetadata(renamed.version(), null, "m".repeat(5001))))
                .isInstanceOf(InvalidRequestException.class);
        var outsider = new AuthoringService(db, UUID::randomUUID, json, definitions);
        assertThatThrownBy(() -> outsider.saveMetadata(renamed.id(), new SaveMetadata(renamed.version(), "침입", null)))
                .isInstanceOf(ResourceNotFoundException.class);
        assertThat(service.get(renamed.id()).title()).isEqualTo("새 제목");
    }

    @Test void recoveryReportFreezesThreeHighestAndLowestAreasInCanonicalTieOrder() {
        var session = legacy("recovery");
        var answers = completionAnswers(session);
        answers.put("scan.0", Map.of("value", 4));
        answers.put("scan.1", Map.of("value", 8));
        answers.put("scan.2", Map.of("value", 7));
        answers.put("scan.3", Map.of("value", 4));
        var saved = save(session, answers);
        var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
        @SuppressWarnings("unchecked") var summary = (Map<String,Object>) completed.report().get("scanSummary");
        @SuppressWarnings("unchecked") var high = (List<Map<String,Object>>) summary.get("highest");
        @SuppressWarnings("unchecked") var low = (List<Map<String,Object>>) summary.get("lowest");
        assertThat(high.stream().map(row -> row.get("questionKey"))).containsExactly("scan.1", "scan.2", "scan.0");
        assertThat(low.stream().map(row -> row.get("questionKey"))).containsExactly("scan.0", "scan.3", "scan.2");
        assertThat(((Number) summary.get("average")).doubleValue()).isEqualTo(5.75);
    }

    @Test void createSaveResumePreservesEveryAnswerTypeAndSection() {
        var session = legacy("recovery");
        var questions = AuthoringAnswers.questions(session.definition());
        var answers = new LinkedHashMap<String, Object>();
        answers.put("unload.writing", "한글 reflection\nsecond line");
        answers.put("arrival.reasons", List.of(questions.get("arrival.reasons").options().getFirst()));
        answers.put("level", questions.get("level").options().getFirst());
        answers.put("scan.0", Map.of("value", 7, "memo", "Some context"));
        answers.put("triage", List.of(Map.of("text", "Pay bill", "classification", "MUST", "memo", "Due today")));
        var saved = service.save(session.id(), new SaveSession(0L, "scan", answers, null, null));
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
        var session = legacy("recovery");
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
        // A historical session keeps its frozen definition; only today's display name is read from the registry.
        var newerDefinitions = mock(AuthoringDefinitions.class);
        var futureService = new AuthoringService(db, () -> owner, json, newerDefinitions);
        assertThat(futureService.get(completed.id()).definition()).isEqualTo(session.definition());
        verify(newerDefinitions).title("recovery");
        verifyNoMoreInteractions(newerDefinitions);
    }

    @Test void emptyDraftsArePermittedButInvalidKeysShapesOptionsAndScoresAreRejected() {
        var session = legacy("recovery");
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
        assertThatThrownBy(() -> service.save(current.id(), new SaveSession(current.version(), "unknown", Map.of(), null, null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.save(current.id(), new SaveSession(null, "arrival", Map.of(), null, null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> create("unknown")).isInstanceOf(InvalidRequestException.class);
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
        assertThatThrownBy(() -> other.save(future.id(), new SaveSession(0L, future.currentSectionKey(), Map.of(), null, null))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.complete(recovery.id(), new CompleteSession(recovery.version()))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> other.recoveryExport(recovery.id())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test void classificationDraftsRemainEditableButCompletionRequiresClassificationAndMustTiming() {
        var session = legacy("recovery");
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
        var reviewSource = complete(create("reality"));
        for (String key : List.of("quick-motivation", "recovery", "reality", "grounded-future", "past", "review", "sexual-pattern", "responsibility", "present-life")) {
            var first = complete(service.create(new CreateSession(key, key.equals("review") ? reviewSource.id() : null)));
            var second = complete(service.create(new CreateSession(key, key.equals("review") ? reviewSource.id() : null)));
            assertThat(first.id()).isNotEqualTo(second.id());
            assertThat(first.report().get("programKey")).isEqualTo(key);
            assertThat(service.get(first.id()).completedAt()).isEqualTo(first.completedAt());
        }
        assertThat(service.list()).hasSize(19);
    }

    @Test void legacyFrozenDefinitionsStillResumeAndCompleteWithoutMappingOldAnswers() {
        var versions = List.of(List.of("recovery", "2026-09-20"), List.of("reality", "2026-09-20"), List.of("grounded-future", "2026-09-20"),
                List.of("quick-motivation", "2026-09-21"), List.of("recovery", "2026-09-21"), List.of("reality", "2026-09-21"),
                List.of("grounded-future", "2026-09-21"), List.of("past", "2026-09-21"),
                List.of("sexual-pattern", "2026-09-23"), List.of("responsibility", "2026-09-23"));
        for (var pair : versions) {
            String key = pair.get(0), version = pair.get(1);
            var legacy = definition(key, version);
            var session = createVersion(key, version);
            var answers = completionAnswers(session);
            if (key.equals("recovery") && version.equals("2026-09-20")) answers.put("base.0", "Legacy sleep minimum");
            var saved = save(session, answers);
            // Resuming reads the frozen definition, never today's content.
            assertThat(service.get(saved.id()).definition()).isEqualTo(legacy);
            var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
            assertThat(completed.specVersion()).as(key + " " + version).isEqualTo(version);
            assertThat(completed.definition()).isEqualTo(legacy);
            assertThat(completed.answers()).isEqualTo(answers);
            assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());
            assertThat(completed.programTitle()).isEqualTo(definitions.current(key).title());
            if (key.equals("recovery") && version.equals("2026-09-20")) {
                assertThat(json.writeValueAsString(service.recoveryExport(completed.id()))).contains("Legacy sleep minimum");
            }
            assertThat(create(key).specVersion()).isEqualTo(CURRENT);
        }
    }

    @Test void integratedBaseIsRequiredAndExportPreservesItsRawText() {
        var session = create("recovery");
        var answers = completionAnswers(session);
        answers.remove("base");
        var incomplete = save(session, answers);
        assertThatThrownBy(() -> service.complete(incomplete.id(), new CompleteSession(incomplete.version())))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("base");
        String raw = "잠은 6시간\n식사는 하루 두 번. 나머지는 다음 주.";
        answers.put("base", raw);
        var saved = save(incomplete, answers);
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        assertThat(done.answers()).containsEntry("base", raw);
        assertThat((List<?>) service.recoveryExport(done.id()).get("minimumOperatingState")).singleElement()
                .satisfies(item -> assertThat(((Map<?, ?>) item).get("value")).isEqualTo(raw));
    }

    @Test void goalsRoundTripReorderAndDeepDiveSnapshotUseOneAnswerArray() {
        var session = legacy("grounded-future");
        var goals = AuthoringFixtures.goals(6);
        Collections.swap(goals, 0, 5);
        var answers = completionAnswers(session); answers.put("goals", goals);
        var saved = service.save(session.id(), new SaveSession(0L, "goal-deep-dive", answers, null, null));
        assertThat(service.get(saved.id()).answers().get("goals")).isEqualTo(goals);
        assertThat(service.get(saved.id()).currentSectionKey()).isEqualTo("goal-deep-dive");
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        @SuppressWarnings("unchecked") var sections = (List<Map<String, Object>>) done.report().get("sections");
        for (String title : List.of("Goals", "Goal Deep Dive")) {
            var section = sections.stream().filter(s -> s.get("title").equals(title)).findFirst().orElseThrow();
            @SuppressWarnings("unchecked") var items = (List<Map<String, Object>>) section.get("items");
            assertThat(items.getFirst().get("value")).isEqualTo(goals);
        }
        assertThat(done.answers()).doesNotContainKey("goals.deepDive");
    }

    @Test void goalDraftsAcceptPartialWritingButRejectBoundsDuplicateIdsAndMissingDeepDivesAtCompletion() {
        var session = legacy("grounded-future");
        var draft = save(session, Map.of("goals", List.of(Map.of("id", "g", "title", ""))));
        var goals = AuthoringFixtures.goals(6); goals.getFirst().put("benchmark", "");
        var answers = completionAnswers(draft); answers.put("goals", goals);
        var incomplete = save(draft, answers);
        assertThatThrownBy(() -> service.complete(incomplete.id(), new CompleteSession(incomplete.version()))).isInstanceOf(InvalidRequestException.class);
        var duplicate = AuthoringFixtures.goals(6); duplicate.get(1).put("id", duplicate.getFirst().get("id"));
        for (var bad : List.of(AuthoringFixtures.goals(9), duplicate)) {
            assertThatThrownBy(() -> save(incomplete, Map.of("goals", bad))).isInstanceOf(InvalidRequestException.class);
        }
        assertThatThrownBy(() -> save(incomplete, Map.of("goals.deepDive", goals))).isInstanceOf(InvalidRequestException.class);
        answers.put("goals", AuthoringFixtures.goals(5));
        var tooFew = save(incomplete, answers);
        assertThatThrownBy(() -> service.complete(tooFew.id(), new CompleteSession(tooFew.version()))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void pastCriticalDeselectionPreservesEventsEffectsAndSnapshotStages() {
        var session = legacy("past");
        var epochs = AuthoringFixtures.epochs();
        var saved = service.save(session.id(), new SaveSession(0L, "effects", Map.of("epochs", epochs), null, null));
        @SuppressWarnings("unchecked") var experiences = (List<Map<String,Object>>) epochs.getFirst().get("experiences");
        experiences.getFirst().put("critical", false);
        var deselected = service.save(saved.id(), new SaveSession(saved.version(), "critical", Map.of("epochs", epochs), null, null));
        assertThat(service.get(deselected.id()).answers().get("epochs")).isEqualTo(epochs);
        var done = service.complete(deselected.id(), new CompleteSession(deselected.version()));
        assertThat(done.answers().get("epochs")).isEqualTo(epochs);
        assertThat(json.writeValueAsString(done.report())).contains("What happened 0", "How it shaped me 0", "Critical 10");
        assertThat(done.definition().sections()).extracting(Section::sectionKey).containsExactly("epochs", "experiences", "effects", "critical", "report");
    }

    @Test void pastValidatesSevenEpochsSixExperiencesUniqueIdsAndTenCriticalLimit() {
        var session = legacy("past");
        assertThatThrownBy(() -> save(session, Map.of("epochs", AuthoringFixtures.epochs().subList(0, 6)))).isInstanceOf(InvalidRequestException.class);
        var epochs = AuthoringFixtures.epochs();
        epochs.get(1).put("id", "epoch-0");
        assertThatThrownBy(() -> save(session, Map.of("epochs", epochs))).isInstanceOf(InvalidRequestException.class);
        var tooMany = AuthoringFixtures.epochs();
        var experiences = new ArrayList<Map<String,Object>>();
        for (int i = 0; i < 7; i++) experiences.add(Map.of("id", "extra-"+i, "critical", false));
        tooMany.getFirst().put("experiences", experiences);
        assertThatThrownBy(() -> save(session, Map.of("epochs", tooMany))).isInstanceOf(InvalidRequestException.class);
        var critical = AuthoringFixtures.epochs();
        for (int i = 0; i < 7; i++) critical.get(i).put("experiences", List.of(Map.of("id", "a-"+i,"critical",true),Map.of("id","b-"+i,"critical",true)));
        assertThatThrownBy(() -> save(session, Map.of("epochs", critical))).isInstanceOf(InvalidRequestException.class);
        var draft = AuthoringFixtures.epochs(); draft.getFirst().put("experiences", List.of());
        var saved = save(session, Map.of("epochs", draft));
        assertThatThrownBy(() -> service.complete(saved.id(), new CompleteSession(saved.version()))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void reviewRequiresOwnedCompletedSupportedSourceAndNeverChangesItsSnapshot() {
        assertThatThrownBy(() -> create("review")).isInstanceOf(InvalidRequestException.class);
        var unfinished = create("reality");
        assertThatThrownBy(() -> service.create(new CreateSession("review", unfinished.id()))).isInstanceOf(InvalidRequestException.class);
        var quick = complete(create("quick-motivation"));
        assertThatThrownBy(() -> service.create(new CreateSession("review", quick.id()))).isInstanceOf(InvalidRequestException.class);
        var sources = new ArrayList<Session>();
        for (String key : List.of("recovery", "reality", "grounded-future", "past", "sexual-pattern", "responsibility")) {
            sources.add(complete(create(key)));
            sources.add(complete(legacy(key)));
        }
        sources.add(complete(create("present-life")));
        for (var original : sources) {
            String key = original.programKey();
            var draft = service.create(new CreateSession("review", original.id()));
            var answers = completionAnswers(draft);
            answers.put("changes", "Second focus");
            answers.put("decision.try", "Third focus");
            var saved = save(draft, answers);
            var review = service.complete(saved.id(), new CompleteSession(saved.version()));
            assertThat(review.answers()).containsEntry("changes", "Second focus").containsEntry("decision.try", "Third focus");
            assertThat(json.writeValueAsString(review.report())).contains("Second focus", "Third focus");
            assertThat(AuthoringAnswers.questions(review.definition())).doesNotContainKeys("statement", "nextFocus2");
            assertThat(review.sourceSessionId()).isEqualTo(original.id());
            var sourceMetadata = (Map<?,?>) review.report().get("source");
            assertThat(sourceMetadata.get("id")).isEqualTo(original.id().toString());
            assertThat(sourceMetadata.get("programKey")).isEqualTo(key);
            assertThat(service.get(original.id())).isEqualTo(original);
            assertThatThrownBy(() -> service.create(new CreateSession("review", review.id()))).isInstanceOf(InvalidRequestException.class);
            var outsider = new AuthoringService(db, UUID::randomUUID, json, definitions);
            assertThatThrownBy(() -> outsider.create(new CreateSession("review", original.id()))).isInstanceOf(ResourceNotFoundException.class);
        }
    }

    private static List<String> keys(Definition definition) {
        return definition.sections().stream().flatMap(s -> s.questions().stream()).map(Question::questionKey).toList();
    }
    private static Question question(Definition definition, String key) { return AuthoringAnswers.questions(definition).get(key); }
    private static List<String> types(Definition definition) {
        return definition.sections().stream().flatMap(s -> s.questions().stream()).map(Question::type).distinct().toList();
    }

    @Test void currentDefinitionsCarryTheRevisedKoreanContentWithoutRemovedStages() {
        var quick = definitions.current("quick-motivation");
        assertThat(quick.sections()).extracting(Section::sectionKey).containsExactly("task", "why", "blocker", "first-action");
        assertThat(question(quick, "start.task").prompt()).isEqualTo("지금 여러 가지를 한꺼번에 해결하려 하지 않고, 한 가지 일만 시작한다면 무엇을 하겠나요?");
        assertThat(question(quick, "start.blocker").prompt()).isEqualTo("지금 이 일을 시작하기 어렵게 만드는 것은 무엇이며, 그 어려움을 조금 줄이려면 무엇을 바꿀 수 있나요?");
        assertThat(question(quick, "firstAction").helperText()).startsWith("가능하면 30분 안에 시작할 수 있는 행동 하나를 적어보세요.");
        assertThat(keys(quick)).doesNotContain("cost", "what", "why").hasSize(4);
        assertThat(quick.reportSections().getFirst().questionKeys()).containsExactly("firstAction");

        var recovery = definitions.current("recovery");
        assertThat(recovery.sections()).extracting(Section::title).containsExactly("지금 가장 버거운 것", "여기까지 오게 된 흐름",
                "지금 처리할 것과 내려놓을 것", "며칠간 지킬 최소한의 생활", "먼저 되살릴 한 가지", "첫 행동 선택");
        assertThat(types(recovery)).doesNotContain("SCORE", "SINGLE_SELECT", "MULTI_SELECT");
        assertThat(question(recovery, "triage").options()).containsExactly("지금 처리하기", "나중으로 미루기", "이번에는 내려놓기");
        assertThat(question(recovery, "triage").metadata()).doesNotContainKeys("timing", "sourceQuestionKey");
        assertThat(keys(recovery)).doesNotContain("level", "today", "tomorrow", "axis", "notYet", "unload.writing", "context.causes", "close.summary");

        var reality = definitions.current("reality");
        assertThat(reality.sections()).hasSize(6);
        assertThat(reality.sections().getLast().prompt()).isEqualTo("앞에서 살펴본 생활을 바탕으로, 앞으로 한동안 무엇을 유지하고 무엇을 바꾸겠나요?");
        assertThat(reality.sections().getLast().questions()).extracting(Question::prompt).containsExactly("계속 지킬 것", "바꿀 방식", "그만둘 것", "시험해볼 것");
        assertThat(types(reality)).containsExactly("FREE_TEXT");
        assertThat(keys(reality)).doesNotContain("statement", "gap", "map.stableBase", "map.bottleneck", "scan.0");
        assertThat(reality.completionKeys()).isEmpty();

        var future = definitions.current("grounded-future");
        assertThat(future.sections()).extracting(Section::sectionKey).containsExactly("ground", "vision", "identity", "avoid", "ordinary-day", "goals", "plan");
        var goals = question(future, "goals");
        assertThat(goals.metadata()).containsEntry("minItems", 1).containsEntry("maxItems", 5).containsEntry("plan", true);
        assertThat((List<?>) goals.metadata().get("planGuides")).hasSize(3);
        assertThat(types(future)).doesNotContain("GOAL_DEEP_DIVE");
        assertThat(keys(future)).doesNotContain("backcast", "commitment.keep", "life.social", "identity.title", "realityCheck");

        var past = definitions.current("past");
        assertThat(past.sections()).extracting(Section::sectionKey).containsExactly("epochs", "experiences", "effects", "critical");
        assertThat(question(past, "epochs").metadata()).containsEntry("minItems", 7).containsEntry("maxItems", 7);
        assertThat(json.writeValueAsString(past)).doesNotContain("네 개", "4개");
        assertThat(past.completionKeys()).containsExactly("epochs");

        var review = definitions.current("review");
        assertThat(review.sections()).extracting(Section::sectionKey).containsExactly("look-back", "changes", "learned", "adjust", "next");
        assertThat(keys(review)).doesNotContain("statement", "nextFocus", "nextFocus2", "lookBack");

        var sexual = definitions.current("sexual-pattern");
        assertThat(sexual.title()).isEqualTo("성중독과 삶의 회복 - 자유롭고 온전하게 살아가기");
        assertThat(sexual.sections()).hasSize(7);
        assertThat(sexual.sections().get(3).title()).contains("선택");
        var plan = sexual.sections().getLast();
        assertThat(plan.questions()).extracting(Question::questionKey).containsExactly("plan.before", "plan.after", "firstAction");
        assertThat(plan.questions()).extracting(Question::prompt).startsWith("기준을 넘기 전", "이미 같은 행동을 한 뒤");
        assertThat(json.writeValueAsString(sexual)).contains("약의 복용이나 용량은 이 프로그램의 답변만으로 바꾸지 마세요.")
                .doesNotContain("치료 완료", "회복 완료", "중독 극복");
        assertThat(sexual.completionKeys()).isEmpty();
        assertThat(sexual.reportSections().subList(0, 3)).extracting(ReportSection::title).containsExactly("앞으로 지킬 기준", "기준을 넘기 전 대응", "이미 행동한 뒤 다시 돌아오는 방법");

        var responsibility = definitions.current("responsibility");
        assertThat(responsibility.sections()).hasSize(7);
        assertThat(responsibility.sections().subList(0, 6)).allSatisfy(s -> assertThat(s.questions()).anyMatch(q -> q.questionKey().endsWith(".writing")));
        assertThat(responsibility.sections().getLast().questions()).extracting(Question::questionKey).containsExactly("firstAction", "reviewAt");
        assertThat(keys(responsibility)).doesNotContain("acceptedResponsibility", "socialPrinciples", "economicStep", "joyMeaning", "difficultyResponse");
        assertThat(question(responsibility, "situation").metadata()).containsEntry("context", true).doesNotContainKey("gate");
        assertThat(responsibility.reportTitle()).isNull();

        for (var definition : definitions.all()) {
            assertThat(definition.sections()).as(definition.programKey()).allSatisfy(s -> assertThat(s.questions()).isNotEmpty());
            for (var q : AuthoringAnswers.questions(definition).values()) {
                assertThat(q.prompt()).as(q.questionKey()).isNotBlank().doesNotMatch("[A-Z]{3,}( [A-Z]+)*");
            }
        }
    }

    @Test void futureAcceptsOneGoalWithOneIntegratedPlanButCapsNewSessionsAtFive() {
        var session = create("grounded-future");
        var goal = new LinkedHashMap<String, Object>(Map.of("id", "g1", "title", "생활비 스스로 마련하기", "plan", "무엇이 달라지는지\n실제로 할 일\n언제 확인할지"));
        var saved = save(session, Map.of("goals", List.of(goal), "firstAction", "이번 주 지출 확인"));
        assertThat(service.get(saved.id()).answers().get("goals")).isEqualTo(List.of(goal));
        assertThatThrownBy(() -> save(saved, Map.of("goals", AuthoringFixtures.goals(6)))).isInstanceOf(InvalidRequestException.class);
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        assertThat(json.writeValueAsString(done.report())).contains("무엇이 달라지는지", "이번 주 지출 확인");
        var untitled = save(create("grounded-future"), Map.of("goals", List.of(Map.of("id", "g", "title", " ")), "firstAction", "x"));
        assertThatThrownBy(() -> service.complete(untitled.id(), new CompleteSession(untitled.version()))).isInstanceOf(InvalidRequestException.class);
    }

    @Test void pastCompletesWithoutSelectingImportantExperiencesAndKeepsDeselectedWriting() {
        var epochs = AuthoringFixtures.epochs();
        for (var epoch : epochs) for (Object item : (List<?>) epoch.get("experiences")) {
            @SuppressWarnings("unchecked") var experience = (Map<String, Object>) item;
            experience.put("critical", false);
        }
        var saved = save(create("past"), Map.of("epochs", epochs));
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        assertThat(done.answers().get("epochs")).isEqualTo(epochs);
        assertThat(json.writeValueAsString(done.report())).contains("What happened 0", "How it shaped me 0");
    }

    @Test void sexualPatternDeferredConditionsAndSeparatePlansComplete() {
        var session = create("sexual-pattern");
        var answers = new LinkedHashMap<String, Object>(Map.of("history.writing", "지금은 쓰지 않겠습니다",
                "plan.before", "기준을 넘기 전 계획", "plan.after", "행동한 뒤 계획"));
        var saved = service.save(session.id(), new SaveSession(session.version(), "plan", answers, null, null));
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        @SuppressWarnings("unchecked") var sections = (List<Map<String, Object>>) done.report().get("sections");
        @SuppressWarnings("unchecked") var before = (List<Map<String, Object>>) sections.get(1).get("items");
        @SuppressWarnings("unchecked") var after = (List<Map<String, Object>>) sections.get(2).get("items");
        assertThat(before.getFirst().get("value")).isEqualTo("기준을 넘기 전 계획");
        assertThat(after.getFirst().get("value")).isEqualTo("행동한 뒤 계획");
        assertThat(done.answers()).isEqualTo(answers);
    }

    @Test void newRecoveryExportsItsOwnDecisionsWithoutFabricatingRemovedFields() {
        var session = create("recovery");
        var answers = completionAnswers(session);
        answers.put("triage", List.of(Map.of("text", "월세 이체", "classification", "지금 처리하기"),
                Map.of("text", "책장 정리", "classification", "이번에는 내려놓기")));
        var saved = save(session, answers);
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        var export = service.recoveryExport(done.id());
        assertThat((List<?>) export.get("must")).singleElement().satisfies(row -> assertThat(((Map<?, ?>) row).get("text")).isEqualTo("월세 이체"));
        assertThat(export.get("level")).isNull();
        assertThat(export.get("axis")).isNull();
        assertThat(done.report()).doesNotContainKey("scanSummary");
    }

    @Test void presentLifeFollowsSpecV1WithOptionalCompactValuesAndVerbatimContemplation() {
        var definition = definitions.current("present-life");
        assertThat(definition.version()).isEqualTo(CURRENT);
        assertThat(definition.group()).isEqualTo("CORE");
        assertThat(definition.title()).isEqualTo("지금의 삶을 누리기");
        assertThat(definition.subtitle()).isEqualTo("현재의 조건에서 충분히 좋은 삶을 발견하고 지켜가기");
        assertThat(definition.reportTitle()).isEqualTo("나의 충분히 좋은 삶");
        assertThat(definitions.all()).extracting(Definition::programKey).containsSubsequence("reality", "present-life", "grounded-future");
        assertThat(definition.sections()).extracting(Section::title).containsExactly("지금 이미 누리고 있는 것", "반복해도 좋은 평범한 삶",
                "이 삶을 지탱하는 최소한의 노력", "이 삶에서 지켜야 할 것", "이 삶을 흐트러뜨리는 것", "이 삶에 머물러 보기", "묵상을 마치며");
        assertThat(question(definition, "enjoying").prompt()).isEqualTo("지금 내 삶에서 이미 누리고 있고, 실제로 좋거나 고맙다고 느끼는 것은 무엇인가요?");
        assertThat(question(definition, "ordinaryLife").prompt()).isEqualTo("지금의 조건이 크게 달라지지 않더라도, 어떤 하루와 한 주라면 반복해서 살아도 꽤 괜찮다고 느낄 수 있을까요?");
        assertThat(question(definition, "minimumEffort").prompt()).isEqualTo("이런 생활을 계속 누리기 위해, 내가 최소한 꾸준히 해야 하는 것은 무엇인가요?");
        assertThat(question(definition, "protect").prompt()).isEqualTo("지금의 삶에서 잃거나 함부로 희생하고 싶지 않은 것은 무엇인가요?");
        assertThat(question(definition, "disrupting").prompt()).isEqualTo("내가 반복하면 지금의 괜찮은 삶을 무너뜨리는 행동이나 패턴은 무엇인가요?");
        var stay = question(definition, "stay");
        assertThat(stay.prompt()).isEqualTo("앞에서 적은 삶이 실제로 이어지고 있다고 상상해보세요. 그 삶의 평범한 장면들은 어떤 모습인가요?");
        assertThat(stay.helperText()).contains("- 이 삶의 아침은 어떤 모습인가요?", "- 이 삶을 충분히 바라보았을 때, 굳이 더 필요하지 않다고 느껴지는 것은 무엇인가요?",
                "감사해야 한다고 자신을 설득할 필요는 없습니다.");
        assertThat(stay.helperText().lines().filter(line -> line.startsWith("- "))).hasSize(10);
        assertThat(definition.sections().get(5).questions()).singleElement();
        assertThat(definition.sections().getLast().questions()).extracting(Question::prompt)
                .containsExactly("더 자주 알아차리고 싶은 한 장면", "가장 중요하게 지킬 것", "이번 주의 작은 행동");
        assertThat(definition.sections().get(4).questions()).extracting(Question::prompt).containsExactly(
                "내가 반복하면 지금의 괜찮은 삶을 무너뜨리는 행동이나 패턴은 무엇인가요?", "피하고 싶은 것", "줄이고 싶은 것", "범위를 정하고 싶은 것");
        assertThat(definition.completionKeys()).isEmpty();
        assertThat(AuthoringAnswers.questions(definition).values()).noneMatch(q -> Boolean.TRUE.equals(q.required()));
        assertThat(types(definition)).containsExactly("FREE_TEXT");
        assertThat(json.writeValueAsString(definition)).doesNotContain("점수", "score");
        assertThat(definition.reportSections()).extracting(ReportSection::title).containsExactly("지금 이미 누리고 있는 것",
                "내가 반복하고 싶은 평범한 삶", "이 삶을 지탱하는 최소한의 노력", "이 삶에서 지켜야 할 것", "이 삶을 흐트러뜨리는 것",
                "이 삶에 머물러 보기", "묵상을 마치며");

        // An empty session completes: no closing field, compact value or positive wording is required.
        var empty = create("present-life");
        var emptyDone = service.complete(empty.id(), new CompleteSession(empty.version()));
        assertThat(emptyDone.status()).isEqualTo("COMPLETED");

        String contemplation = "아침 햇빛이 드는 방.\n\n천천히 커피를 마시고, 저녁에는 산책을 한다.\n아직 잘 모르겠다.";
        var answers = new LinkedHashMap<String, Object>(Map.of("stay", contemplation, "minimumEffort", "잠을 충분히 잔다", "closing.action", "이번 주 산책 두 번"));
        var saved = service.save(create("present-life").id(), new SaveSession(0L, "stay", answers, "평범한 하루", null));
        var done = service.complete(saved.id(), new CompleteSession(saved.version()));
        @SuppressWarnings("unchecked") var sections = (List<Map<String, Object>>) done.report().get("sections");
        @SuppressWarnings("unchecked") var stayItems = (List<Map<String, Object>>) sections.get(5).get("items");
        assertThat(stayItems).singleElement().satisfies(item -> assertThat(item.get("value")).isEqualTo(contemplation));
        @SuppressWarnings("unchecked") var effort = (List<Map<String, Object>>) sections.get(2).get("items");
        assertThat(effort).extracting(item -> item.get("value")).containsExactly("잠을 충분히 잔다", null);
        assertThat(done.report()).doesNotContainKey("scanSummary");
        assertThat(service.get(done.id()).report()).isEqualTo(done.report());
        assertThat(done.title()).isEqualTo("평범한 하루");
    }
}
