package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyValidation.*;
import static org.assertj.core.api.Assertions.*;

import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/**
 * Full pipeline uses the real PDF parser/renderer and owned PostgreSQL; only object transport/model
 * are synthetic.
 */
@SpringBootTest(
    classes = {StudyPostgresTest.Config.class, StudyEnginePostgresTest.Config.class},
    properties = {
      "spring.flyway.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none",
      "spring.jpa.open-in-view=false",
      "spring.datasource.hikari.maximum-pool-size=2"
    })
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(
    named = "STUDY_TEST_DB",
    matches = "jdbc:postgresql://127\\.0\\.0\\.1:554(?:49|52)/postgres")
class StudyEnginePostgresTest extends StudyPostgresTest {
  @Configuration
  static class Config {
    @Bean
    EngineIO engineIO(TestStorage storage) {
      return new EngineIO(new StudyStorage(storage), storage);
    }

    @Bean
    StudyEngine engine(
        StudyService study,
        StudyEngineJobs jobs,
        StudySourceExcerpts excerpts,
        StudyEngineWorkers workers,
        PlatformTransactionManager manager,
        EngineIO io,
        StudyEnginePreferences preferences) {
      return new StudyEngine(study, jobs, excerpts, workers, manager, io, true, true, preferences);
    }
  }

  static class EngineIO extends StudyEngineIO {
    final TestStorage fake;
    boolean failAnswer;

    EngineIO(StudyStorage storage, TestStorage fake) {
      super(storage, "");
      this.fake = fake;
    }

    @Override
    void put(StudyAsset a, byte[] bytes) throws Exception {
      if (failAnswer && a.purpose.equals("answer"))
        throw new IOException("simulated interrupted second upload");
      fake.bytes.put(a.stagingKey, bytes);
      fake.promoteAndVerify(
          a.ownerId,
          a.stagingKey,
          a.finalKey,
          new com.kafka.backend.shareddesk.storage.FilePolicy.Claim(
              a.displayName, a.sizeBytes, a.sha256, a.mime));
    }
  }

  @Autowired StudyEngine engine;
  @Autowired EngineIO io;

  @Override
  @BeforeEach
  void setup() throws Exception {
    super.setup();
    db.execute(
        Files.readString(
            Path.of("src/main/resources/db/migration/V106__study_learning_engine.sql")));
    io.failAnswer = false;
  }

  byte[] textPdf(int pages, boolean text) throws Exception {
    try (var d = new PDDocument();
        var source =
            StudyEngineIO.class.getResourceAsStream("/study-font/NanumGothic-Regular.ttf");
        var out = new ByteArrayOutputStream()) {
      var font = PDType0Font.load(d, source, true);
      for (int i = 0; i < pages; i++) {
        var p = new PDPage();
        d.addPage(p);
        if (text)
          try (var c = new PDPageContentStream(d, p)) {
            c.beginText();
            c.setFont(font, 12);
            c.newLineAtOffset(50, 750);
            c.showText("작은 실험은 가설을 검증합니다. Small experiments test a hypothesis. Page " + (i + 1));
            c.endText();
          }
      }
      d.save(out);
      return out.toByteArray();
    }
  }

  UUID indexSource(int pages, boolean text) throws Exception {
    material();
    var ticket = upload(textPdf(pages, text), "material", "synthetic-text-layer.pdf");
    complete(ticket);
    UUID id =
        UUID.fromString(
            engine.index(UUID.fromString(ticket.path("id").asString())).path("id").asString());
    engine.run(id);
    return id;
  }

  ObjectNode planDay() {
    return (ObjectNode)
        engine
            .plan(
                JSON.createObjectNode()
                    .put("date", LocalDate.now(KST).toString())
                    .put("days", 1)
                    .put("operationId", UUID.randomUUID().toString()))
            .getFirst();
  }

  StudyEngineWorker worker() {
    JsonNode issued = engine.mintWorker("Synthetic worker");
    return engine.authenticate(issued.path("token").asString());
  }

  ObjectNode output(JsonNode plan, String marker) {
    ObjectNode n = JSON.createObjectNode().put("topic", "작은 실험 학습 " + marker);
    var keys = n.putArray("keys");
    var source = plan.path("passages").get(0);
    for (String part : List.of("required", "extension")) {
      var questions = n.putArray(part);
      int order = 0;
      for (var type : plan.path("questionFormat").path(part).properties())
        for (int i = 0; i < type.getValue().asInt(); i++) {
          String id = part + "-" + (++order);
          ObjectNode q = question(id, type.getKey(), order);
          if (type.getKey().endsWith("choice")) {
            var options = q.putArray("options");
            for (int o = 0; o < plan.path("choiceOptionCount").asInt(2); o++)
              options
                  .addObject()
                  .put("id", String.valueOf((char) ('A' + o)))
                  .put("text", o == 0 ? "관찰로 가설을 검증합니다." : "검증하지 않은 가정 " + o);
          }
          q.put("prompt", marker + " " + part + " " + order + ". 실험 가설을 어떻게 확인할까요?");
          q.withObject("source")
              .put(
                  "section",
                  "PDF " + source.path("pageIndex").asInt() + " / " + source.path("id").asString());
          questions.add(q);
          var k =
              keys.addObject()
                  .put("part", part)
                  .put("questionId", id)
                  .put("model", "실험은 작은 탐색입니다.")
                  .put("explanation", "지도처럼 방향을 확인합니다. 가설을 검증하는 작은 실험을 실제 프로젝트에 적용합니다.");
          if (type.getKey().endsWith("choice")) {
            if (type.getKey().equals("multiple_choice")) k.putArray("answer").add("A");
            else k.put("answer", "A");
            k.putObject("incorrectReasons").put("B", "관찰 없이 확신하는 것은 실험이 아닙니다.");
            for (var option : q.path("options"))
              if (!option.path("id").asString().equals("A"))
                k.withObject("incorrectReasons").put(option.path("id").asString(), "관찰 없는 추측입니다.");
          } else if (type.getKey().equals("true_false")) k.put("answer", false);
          else k.put("answer", "가설과 결과를 비교합니다.");
          k.putArray("rubric").add("출처의 가설 검증 개념을 설명합니다.");
          var follow = k.putArray("followUp");
          for (int f = 1; f <= 10; f++) follow.add("실험 후속 질문 " + f + "는 무엇인가요?");
          k.putArray("citations")
              .addObject()
              .put("excerptId", source.path("id").asString())
              .put("quote", source.path("text").asString().substring(0, 24));
        }
    }
    n.putObject("provenance")
        .put("provider", "test_fake")
        .put("model", "deterministic-test-only")
        .put("promptVersion", VERSION);
    return n;
  }

  ObjectNode generate(StudyEngineWorker w, String marker) {
    var job = (ObjectNode) engine.claimWorker(w);
    assertThat(job.has("id")).isTrue();
    return engine.complete(
        w,
        UUID.fromString(job.path("id").asString()),
        UUID.fromString(job.path("leaseToken").asString()),
        output(job.path("input"), marker));
  }

  @Test
  void indexesKoreanEnglishPageOrderAndResumesWithoutDuplicatePages() throws Exception {
    UUID id = indexSource(3, true);
    var found = engine.search("source", id, "실험", 0);
    assertThat(found).hasSize(3);
    assertThat(found.getFirst().path("text").asString()).contains("Small experiments");
    assertThat(found.get(2).path("pageIndex").asInt()).isEqualTo(3);
    assertThat(
            engine
                .index(UUID.fromString(found.getFirst().path("assetId").asString()))
                .path("id")
                .asString())
        .isEqualTo(id.toString());
    engine.tx(
        () -> {
          var j = engine.owned(OWNER, id);
          j.state = "QUEUED";
          j.checkpoint = 1;
          return null;
        });
    db.update("delete from study_source_excerpts where job_id=? and page_index>1", id);
    engine.run(id);
    assertThat(engine.search("source", id, "", 0)).hasSize(3);
    current.set(OTHER);
    study.snapshot();
    assertThat(engine.search("source", null, "", 0)).isEmpty();
    rejects(404, () -> engine.passage(UUID.fromString(found.getFirst().path("id").asString())));
  }

  @Test
  void textlessSourcesAreRetainedAndCannotInventLearningContent() throws Exception {
    var id = indexSource(1, false);
    assertThat(engine.search("source", id, "", 0).getFirst().path("quality").asString())
        .isEqualTo("textless");
    rejects(409, () -> planDay());
  }

  @Test
  void backgroundAppendPreservesUnrelatedDraftRevisionAndUserConflictsRemainProtected()
      throws Exception {
    indexSource(1, true);
    cmd("workbook.import", draft(1));
    var pkg = draft(1).path("workbook");
    var binding = bindingNode(pkg, "required", pkg.path("required").get(0));
    var request =
        envelope(
            "draft.save",
            JSON.createObjectNode()
                .set("binding", binding)
                .set("response", parse("{\"value\":false}")));
    planDay();
    generate(worker(), "append");
    study.command(request);
    assertThat(study.snapshot().path("drafts").size()).isEqualTo(1);
    var stale =
        envelope(
            "draft.save",
            JSON.createObjectNode()
                .set("binding", binding)
                .set("response", parse("{\"value\":true}")));
    cmd("feedback.add", parse("{\"text\":\"A genuine concurrent user command\"}"));
    rejects(409, () -> study.command(stale));
  }

  @Test
  void approvedFormatChangesFuturePlanAndExpiredPolicyDoesNotRewriteOlderQuestions()
      throws Exception {
    indexSource(1, true);
    var original = planDay();
    var w = worker();
    generate(w, "original");
    String old =
        study
            .books()
            .findByOwnerIdAndWorkbookIdAndWorkbookVersion(
                OWNER, original.path("workbookId").asString(), 1)
            .orElseThrow()
            .payload;
    cmd("policy.propose", parse("{\"change\":\"format\",\"scope\":\"next_week_only\"}"));
    String proposal = study.snapshot().path("proposals").get(0).path("id").asString();
    cmd("policy.decide", JSON.createObjectNode().put("id", proposal).put("approve", true));
    var week = LocalDate.parse(nextWeek(Clock.systemUTC()));
    var future =
        engine.plan(
            JSON.createObjectNode()
                .put("date", week.toString())
                .put("days", 7)
                .put("operationId", UUID.randomUUID().toString()));
    var planned =
        engine.tx(
            () ->
                JSON.readTree(
                    engine.owned(OWNER, UUID.fromString(future.getFirst().path("id").asString()))
                        .input));
    assertThat(planned.path("questionFormat").path("required").path("single_choice").asInt())
        .isEqualTo(3);
    assertThat(planned.path("choiceOptionCount").asInt()).isEqualTo(5);
    assertThat(planned.path("questionFormat").path("required").path("case_analysis").asInt())
        .isEqualTo(2);
    assertThat(
            effective(study.records().findByOwnerIdAndKind(OWNER, "POLICY"), week.plusWeeks(1))
                .path("format")
                .asString())
        .isEqualTo("classic");
    assertThat(
            study
                .books()
                .findByOwnerIdAndWorkbookIdAndWorkbookVersion(
                    OWNER, original.path("workbookId").asString(), 1)
                .orElseThrow()
                .payload)
        .isEqualTo(old);
  }

  @Test
  void changedSourceHashRejectsPreviouslyPlannedModelOutput() throws Exception {
    indexSource(1, true);
    planDay();
    var w = worker();
    var job = engine.claimWorker(w);
    var passage = job.path("input").path("passages").get(0);
    engine.tx(
        () -> {
          var a =
              study
                  .assets()
                  .findByOwnerIdAndId(OWNER, UUID.fromString(passage.path("assetId").asString()))
                  .orElseThrow();
          a.sha256 = "0".repeat(64);
          study.assets().save(a);
          return null;
        });
    rejects(
        400,
        () ->
            engine.complete(
                w,
                UUID.fromString(job.path("id").asString()),
                UUID.fromString(job.path("leaseToken").asString()),
                output(job.path("input"), "stale")));
    assertThat(study.snapshot().path("packages")).isEmpty();
  }

  @Test
  void actualPairPublishesAfterExplicitReviewAndPreservesAnswersUntilReview() throws Exception {
    indexSource(2, true);
    var p = planDay();
    var w = worker();
    var result = generate(w, "one");
    String book = p.path("workbookId").asString();
    int version = p.path("workbookVersion").asInt();
    assertThat(result.path("state").asString()).isEqualTo("READY");
    assertThat(study.snapshot().path("packages").get(0).path("topic").asString())
        .startsWith("Owner authored")
        .doesNotContain("schema");
    assertThat(study.snapshot().toString()).doesNotContain("지도처럼", "실험 후속 질문");
    rejects(400, () -> engine.approve(UUID.fromString(p.path("id").asString())));
    study.review(book, version, "required");
    var render = engine.approve(UUID.fromString(p.path("id").asString()));
    engine.run(UUID.fromString(render.path("id").asString()));
    var pkg = study.snapshot().path("packages").get(0);
    assertThat(pkg.path("status").asString()).isEqualTo("published");
    var a =
        study
            .assets()
            .findById(UUID.fromString(pkg.path("answerExplanationPdf").path("assetId").asString()))
            .orElseThrow();
    try (var d = Loader.loadPDF(storage.bytes.get(a.finalKey))) {
      assertThat(d.getDocumentInformation().getCustomMetadataValue("StudyDocumentKind"))
          .isEqualTo("answer");
      assertThat(new PDFTextStripper().getText(d)).contains("지도처럼", "AI에게 더 물어볼 질문", "출처:");
    }
    // A second explicit generation is a new immutable version. Old bytes/history are unchanged.
    String original =
        study
            .books()
            .findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, book, 1)
            .orElseThrow()
            .payload;
    byte[] old = storage.bytes.get(a.finalKey).clone();
    planDay();
    generate(w, "two");
    assertThat(study.books().findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, book, 2))
        .isPresent();
    assertThat(
            study
                .books()
                .findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, book, 1)
                .orElseThrow()
                .payload)
        .isEqualTo(original);
    assertThat(storage.bytes.get(a.finalKey)).isEqualTo(old);
  }

  @Test
  void weeklyBudgetBlocksNewJobsButPreservesIdempotentReplay() {
    UUID first =
        engine.tx(
            () -> {
              var initial =
                  engine.enqueue(OWNER, "INDEX", "budget-replay", JSON.createObjectNode());
              var backlog = new ArrayList<StudyEngineJob>();
              for (int i = 0; i < 299; i++) {
                var job = new StudyEngineJob();
                job.ownerId = OWNER;
                job.kind = "INDEX";
                job.jobKey = "retained-" + i;
                job.input = "{}";
                job.createdAt = Instant.now().minusSeconds(2 * 86400);
                backlog.add(job);
              }
              engine.jobs.saveAllAndFlush(backlog);
              return initial.id;
            });
    rejects(
        429,
        () -> engine.tx(() -> engine.enqueue(OWNER, "INDEX", "excess", JSON.createObjectNode())));
    assertThat(
            engine.tx(
                () -> engine.enqueue(OWNER, "INDEX", "budget-replay", JSON.createObjectNode()).id))
        .isEqualTo(first);
  }

  @Test
  void reissueCopiesQuestionsIntoNewReviewableVersionWithoutMutatingPublishedHistory()
      throws Exception {
    indexSource(1, true);
    var planned = planDay();
    UUID originalId = UUID.fromString(planned.path("id").asString());
    generate(worker(), "retained");
    String bookId = planned.path("workbookId").asString();
    study.review(bookId, 1, "required");
    var render = engine.approve(originalId);
    engine.run(UUID.fromString(render.path("id").asString()));
    var original =
        study.books().findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, bookId, 1).orElseThrow();
    String originalPayload = original.payload;
    var assets =
        study.assets().findByOwnerId(OWNER).stream()
            .filter(a -> original.rowId.equals(a.workbookRow))
            .toList();
    var retainedBytes = new HashMap<String, byte[]>();
    for (var a : assets) retainedBytes.put(a.finalKey, storage.bytes.get(a.finalKey).clone());
    var operation = JSON.createObjectNode().put("operationId", UUID.randomUUID().toString());
    var next = engine.reissue(originalId, operation);
    UUID nextId = UUID.fromString(next.path("id").asString());
    assertThat(next.path("receipt").path("warnings"))
        .isEqualTo(
            engine.tx(
                () -> JSON.readTree(engine.owned(OWNER, originalId).receipt).path("warnings")));
    assertThat(engine.reissue(originalId, operation).path("id")).isEqualTo(next.path("id"));
    assertThat(study.books().findByOwnerIdOrderByCreatedAtAsc(OWNER)).hasSize(2);
    var reissued =
        study.books().findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, bookId, 2).orElseThrow();
    assertThat(JSON.readTree(reissued.payload).path("required"))
        .isEqualTo(JSON.readTree(originalPayload).path("required"));
    assertThat(JSON.readTree(reissued.payload).path("extension"))
        .isEqualTo(JSON.readTree(originalPayload).path("extension"));
    assertThat(reissued.published).isFalse();
    for (var key : JSON.readTree(reissued.answerKeys))
      assertThat(key.path("binding").path("workbookVersion").asInt()).isEqualTo(2);
    rejects(400, () -> engine.approve(nextId));
    study.review(bookId, 2, "required");
    var rerender = engine.approve(nextId);
    engine.run(UUID.fromString(rerender.path("id").asString()));
    assertThat(
            study
                .books()
                .findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, bookId, 2)
                .orElseThrow()
                .published)
        .isTrue();
    assertThat(
            study
                .books()
                .findByOwnerIdAndWorkbookIdAndWorkbookVersion(OWNER, bookId, 1)
                .orElseThrow()
                .payload)
        .isEqualTo(originalPayload);
    retainedBytes.forEach((key, bytes) -> assertThat(storage.bytes.get(key)).isEqualTo(bytes));
    current.set(OTHER);
    study.snapshot();
    rejects(
        404,
        () ->
            engine.reissue(
                originalId,
                JSON.createObjectNode().put("operationId", UUID.randomUUID().toString())));
  }

  @Test
  void partialPdfFailureNeverPublishesAndRetryUsesSameUnpublishedVersion() throws Exception {
    indexSource(1, true);
    var p = planDay();
    generate(worker(), "partial");
    study.review(p.path("workbookId").asString(), 1, "required");
    var render = engine.approve(UUID.fromString(p.path("id").asString()));
    UUID id = UUID.fromString(render.path("id").asString());
    io.failAnswer = true;
    engine.run(id);
    assertThat(study.snapshot().path("packages").get(0).path("status").asString())
        .isEqualTo("preview");
    assertThat(engine.tx(() -> engine.owned(OWNER, id).checkpoint)).isEqualTo(1);
    io.failAnswer = false;
    engine.retry(id);
    engine.run(id);
    assertThat(study.snapshot().path("packages").get(0).path("status").asString())
        .isEqualTo("published");
    assertThat(
            study.assets().findByOwnerId(OWNER).stream()
                .filter(a -> a.purpose.equals("question"))
                .count())
        .isEqualTo(1);
  }

  @Test
  void leasedJobsRejectOtherWorkerStaleTokenAndRecoverExpiredClaims() throws Exception {
    indexSource(1, true);
    planDay();
    var w = worker();
    var other = worker();
    var job = engine.claimWorker(w);
    UUID id = UUID.fromString(job.path("id").asString()),
        token = UUID.fromString(job.path("leaseToken").asString());
    rejects(400, () -> engine.complete(other, id, token, output(job.path("input"), "bad")));
    engine.tx(
        () -> {
          engine.owned(OWNER, id).leaseUntil = Instant.now().minusSeconds(1);
          return null;
        });
    var recovered = engine.claimWorker(other);
    assertThat(recovered.path("id")).isEqualTo(job.path("id"));
    rejects(409, () -> engine.heartbeat(w, id, token));
    assertThat(recovered.path("leaseToken")).isNotEqualTo(job.path("leaseToken"));
  }

  @Test
  void invalidGroundingOrExecutableOutputCannotImportAndHasHonestFailure() throws Exception {
    indexSource(1, true);
    planDay();
    var w = worker();
    var job = engine.claimWorker(w);
    var bad = output(job.path("input"), "bad");
    bad.withArray("keys")
        .get(0)
        .withArray("citations")
        .get(0)
        .asObject()
        .put("quote", "This quotation never existed in the source.");
    rejects(
        422,
        () ->
            engine.complete(
                w,
                UUID.fromString(job.path("id").asString()),
                UUID.fromString(job.path("leaseToken").asString()),
                bad));
    assertThat(study.snapshot().path("packages")).isEmpty();
    assertThat(engine.status().path("jobs").toString())
        .contains("OUTPUT_VALIDATION_FAILED")
        .doesNotContain("never existed");
    assertThatThrownBy(() -> safeText(parse("{\"prompt\":\"<script>steal()</script>\"}")))
        .isInstanceOf(StudyException.class);
  }

  @Test
  void sundayOfflineDuplicateAndStartupCatchupQueueSevenDaysWithoutClaimingGeneration()
      throws Exception {
    indexSource(1, true);
    cmd("automation.configure", parse("{\"enabled\":true,\"time\":\"20:00\"}"));
    var sunday = LocalDate.now(KST).with(TemporalAdjusters.next(DayOfWeek.SUNDAY));
    var instant = sunday.atTime(20, 0).atZone(KST).toInstant();
    engine.tick(instant);
    engine.tick(instant.plusSeconds(30));
    long generated = engine.jobs.findAll().stream().filter(j -> j.kind.equals("GENERATE")).count();
    assertThat(generated).isEqualTo(7);
    assertThat(
            engine.jobs.findAll().stream()
                .filter(j -> j.kind.equals("GENERATE"))
                .allMatch(j -> j.state.equals("QUEUED")))
        .isTrue();
    assertThat(engine.status().path("workerOnline").asBoolean()).isFalse();
    assertThat(study.snapshot().path("packages")).isEmpty();
  }

  @Test
  void coachInterpretationNeedsApprovalAndScopePolicyExpiryUsesDateNotMaxVersion()
      throws Exception {
    cmd("feedback.add", parse("{\"text\":\"해설이 너무 기술적입니다. 직관적 비유를 사용해주세요.\"}"));
    String feedback = study.snapshot().path("feedback").get(0).path("id").asString();
    engine.analyze(feedback);
    var w = worker();
    var job = engine.claimWorker(w);
    var output =
        parse(
            "{\"classification\":\"policy_change\",\"scope\":\"next_week_only\",\"changes\":{\"explanation\":\"intuitive\"},\"reason\":\"직관적인"
                + " 비유 요청\",\"provenance\":{\"provider\":\"test_fake\",\"model\":\"test\",\"promptVersion\":\"study-engine-v2.1\"}}");
    engine.complete(
        w,
        UUID.fromString(job.path("id").asString()),
        UUID.fromString(job.path("leaseToken").asString()),
        output);
    assertThat(study.snapshot().path("policies")).hasSize(1);
    String proposal = study.snapshot().path("proposals").get(0).path("id").asString();
    cmd("policy.decide", JSON.createObjectNode().put("id", proposal).put("approve", true));
    var next = LocalDate.parse(nextWeek(Clock.systemUTC()));
    var policies = study.records().findByOwnerIdAndKind(OWNER, "POLICY");
    assertThat(effective(policies, next).path("explanation").asString()).isEqualTo("intuitive");
    assertThat(effective(policies, next.plusWeeks(1)).path("version").asInt()).isEqualTo(1);
  }
}
