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
        return AuthoringFixtures.required(session);
    }
    Session complete(Session session) {
        var ready = save(session, completionAnswers(session));
        return service.complete(ready.id(), new CompleteSession(ready.version()));
    }

    @Test void definitionsHaveUniqueQuestionsAndValidCompletionAndReportReferences() {
        assertThat(definitions.all()).hasSize(8);
        for (var definition : definitions.all()) {
            var keys = AuthoringAnswers.questions(definition).keySet();
            assertThat(keys).containsAll(definition.completionKeys());
            for (var section : definition.reportSections()) assertThat(keys).containsAll(section.questionKeys());
            assertThat(definition.stoppingRules()).isNotEmpty();
            assertThat(definition.version()).isEqualTo(Set.of("sexual-pattern", "responsibility").contains(definition.programKey()) ? "2026-09-23" : "2026-09-21");
            for (var question : AuthoringAnswers.questions(definition).values()) if (AuthoringAnswers.virtual(question)) {
                assertThat(keys).contains((String) question.metadata().get("sourceQuestionKey"));
            }
        }
    }

    @Test void sexualPatternKeepsEveryChapterOptionalAndReportsAuthoredValuesBeforeRawWriting() {
        var definition = definitions.current("sexual-pattern");
        assertThat(definition.title()).isEqualTo("성적 행동 돌아보기와 삶의 회복");
        assertThat(definition.sections()).extracting(Section::sectionKey).containsExactly("opening", "change", "pattern",
                "wanted", "history", "responsibility", "boundaries", "plan", "return", "closing");
        assertThat(definition.completionKeys()).isEmpty();
        assertThat(AuthoringAnswers.questions(definition).values()).noneMatch(q -> Boolean.TRUE.equals(q.required()));
        assertThat(definition.reportSections().getFirst().title()).startsWith("실전 요약");
        assertThat(definition.reportSections().getLast().title()).isEqualTo("아직 모르거나 상담에서 다룰 내용");

        // A deferred history chapter and an unanswered first action must not block completion.
        var session = create("sexual-pattern");
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

    @Test void responsibilityKeepsFixedThemeWithPerSessionSituationAndProminentJoyMeaning() {
        var definition = definitions.current("responsibility");
        assertThat(definition.title()).isEqualTo("자립과 책임 글쓰기");
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

        var work = create("responsibility");
        var household = create("responsibility");
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

    @Test void recoveryReportFreezesThreeHighestAndLowestAreasInCanonicalTieOrder() {
        var session = create("recovery");
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
        var reviewSource = complete(create("reality"));
        for (String key : List.of("quick-motivation", "recovery", "reality", "grounded-future", "past", "review", "sexual-pattern", "responsibility")) {
            var first = complete(service.create(new CreateSession(key, key.equals("review") ? reviewSource.id() : null)));
            var second = complete(service.create(new CreateSession(key, key.equals("review") ? reviewSource.id() : null)));
            assertThat(first.id()).isNotEqualTo(second.id());
            assertThat(first.report().get("programKey")).isEqualTo(key);
            assertThat(service.get(first.id()).completedAt()).isEqualTo(first.completedAt());
        }
        assertThat(service.list()).hasSize(17);
    }

    @Test void legacyFrozenDefinitionsStillResumeAndCompleteWithoutMappingOldAnswers() throws Exception {
        for (String key : List.of("recovery", "reality", "grounded-future")) {
            Definition legacy;
            try (var stream = getClass().getResourceAsStream("/authoring/" + key + "/2026-09-20.json")) {
                legacy = json.readValue(stream, Definition.class);
            }
            var registry = mock(AuthoringDefinitions.class);
            when(registry.current(key)).thenReturn(legacy);
            var legacyService = new AuthoringService(db, () -> owner, json, registry);
            var session = legacyService.create(new CreateSession(key, null));
            var answers = completionAnswers(session);
            if (key.equals("recovery")) answers.put("base.0", "Legacy sleep minimum");
            var saved = save(session, answers);
            var completed = service.complete(saved.id(), new CompleteSession(saved.version()));
            assertThat(completed.specVersion()).isEqualTo("2026-09-20");
            assertThat(completed.definition()).isEqualTo(legacy);
            assertThat(completed.answers()).isEqualTo(answers);
            assertThat(service.get(completed.id()).report()).isEqualTo(completed.report());
            if (key.equals("recovery")) {
                assertThat(json.writeValueAsString(service.recoveryExport(completed.id()))).contains("Legacy sleep minimum");
            }
            assertThat(create(key).specVersion()).isEqualTo("2026-09-21");
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
        var session = create("grounded-future");
        var goals = AuthoringFixtures.goals(6);
        Collections.swap(goals, 0, 5);
        var answers = completionAnswers(session); answers.put("goals", goals);
        var saved = service.save(session.id(), new SaveSession(0L, "goal-deep-dive", answers));
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
        var session = create("grounded-future");
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
        var session = create("past");
        var epochs = AuthoringFixtures.epochs();
        var saved = service.save(session.id(), new SaveSession(0L, "effects", Map.of("epochs", epochs)));
        @SuppressWarnings("unchecked") var experiences = (List<Map<String,Object>>) epochs.getFirst().get("experiences");
        experiences.getFirst().put("critical", false);
        var deselected = service.save(saved.id(), new SaveSession(saved.version(), "critical", Map.of("epochs", epochs)));
        assertThat(service.get(deselected.id()).answers().get("epochs")).isEqualTo(epochs);
        var done = service.complete(deselected.id(), new CompleteSession(deselected.version()));
        assertThat(done.answers().get("epochs")).isEqualTo(epochs);
        assertThat(json.writeValueAsString(done.report())).contains("What happened 0", "How it shaped me 0", "Critical 10");
        assertThat(done.definition().sections()).extracting(Section::sectionKey).containsExactly("epochs", "experiences", "effects", "critical", "report");
    }

    @Test void pastValidatesSevenEpochsSixExperiencesUniqueIdsAndTenCriticalLimit() {
        var session = create("past");
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
        for (String key : List.of("recovery", "reality", "grounded-future", "past", "sexual-pattern", "responsibility")) {
            var original = complete(create(key));
            var draft = service.create(new CreateSession("review", original.id()));
            var answers = completionAnswers(draft);
            answers.put("nextFocus2", "Second focus");
            answers.put("nextFocus3", "Third focus");
            var saved = save(draft, answers);
            var review = service.complete(saved.id(), new CompleteSession(saved.version()));
            assertThat(review.answers()).containsEntry("nextFocus2", "Second focus").containsEntry("nextFocus3", "Third focus");
            assertThat(json.writeValueAsString(review.report())).contains("Second focus", "Third focus");
            assertThat(AuthoringAnswers.questions(review.definition())).doesNotContainKey("nextFocus4");
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
}
