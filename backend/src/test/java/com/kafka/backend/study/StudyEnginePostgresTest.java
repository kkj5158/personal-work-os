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
            for (String line : List.of(
                "작은 실험은 가설을 검증합니다. Small experiments test a hypothesis.",
                "가설의 핵심은 행동으로 확인할 수 있는 구체적인 예측입니다.",
                "예측의 지표를 정하고, 먼저 비교할 기준과 관찰 시점을 기록합니다.",
                "조건을 바꿀 때는 다른 변수를 고정하고 측정 결과를 구분해서 기록합니다.",
                "표본이 적으면 현재 관찰이 모든 상황에 적용되는지 판단하기 어렵습니다.",
                "결과가 예상과 다르면 실행 오류와 가설 오류를 차례로 조사합니다.",
                "대안별 비용과 예상 학습 효과를 비교하면 다음 실험을 좁힐 수 있습니다.",
                "실행을 다시 할 때도 관찰 항목과 비교 기준을 그대로 유지합니다.",
                "여러 출처가 불일치하는 경우 불확실성을 남기고 자료를 다시 확인합니다.",
                "사례별 실제 시간과 비용을 기록하면 계획과 실행 내용을 비교할 수 있습니다.",
                "일정을 변경한 기록은 담당자가 확인한 시간 범위에서 해석해야 합니다.",
                "자료가 부족하면 결론 적용 범위를 좁혀서 다음 검증을 설계합니다.",
                "다음 날 다시 확인할 수 있는 측정 자료를 남겨 판단을 재현합니다. " + (i + 1))) {
              c.showText(line);
              c.newLineAtOffset(0, -15);
            }
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
    boolean quality = StudyQuality.enabled(plan);
    var source = plan.path("passages").get(0);
    var prompts = List.of(
        "예약팀이 노쇼를 줄이려 합니다. 문자 발송 시간과 예약 변경율이 함께 달라졌을 때, 문자 효과를 비교하는 실험을 어떻게 설계할까요?",
        "상품 출시 후 가입 수가 늘었지만 유료 고객은 줄었습니다. 이미 수집한 기록 중 어떤 행동을 비교할지 정하고 선택 이유를 설명하세요.",
        "지원 상담원이 새 양식을 사용한 지 이틀 만에 만족도가 내려갔습니다. 교육 시간과 양식 성능을 구별하는 점검 순서를 선택하세요.",
        "기존 주문 흐름을 유지하면서 배송 버튼을 바꿔야 합니다. 소량의 시험으로 실제 주문 오류와 화면 변경의 영향 중 무엇을 구별할 수 있나요?",
        "연구팀이 한 학교에서만 관찰한 결과로 전국 정책을 정하려 합니다. 목표 모집단과 자료의 공통점 및 차이를 고려해 후속 조사를 선택하세요.",
        "잠재 독자의 추천 성향과 실제 구독 기록이 충돌합니다. 서로 다른 관찰의 의미를 설명하고, 다음 검증의 비교 지표와 유효 범위를 정하세요.",
        "지점별 주문 이력이 일부 누락되고 할인 정책도 중간에 바뀌었습니다. 파일에서 확인 가능한 사실, 정책 변화의 영향, 후속 관찰 조건을 구분하세요.",
        "비용을 낮추는 운영 실험이 동시에 두 가지 도구를 변경했습니다. 팀은 가용 시간을 1주로 제한했습니다. 대안의 비용과 해석 가능성을 비교하고 시행·검토 계획을 쓰세요.");
    var replacements = List.of(
        "라디오 청취 조사에서 아침 방송 편성이 바뀐 직후 응답률도 떨어졌습니다. 시간대와 조사 절차 중 어느 효과인지 파악할 관찰 자료를 고르세요.",
        "물류 창고에서 동선 개선을 시험하려는데 주말 수요가 평일보다 높습니다. 현재 측정 비용과 표본 편향을 고려해 두 비교 방법의 장단점을 판단하세요.",
        "교육 프로그램의 조기 중단 건수가 줄었지만 신청 자격도 달라졌습니다. 새 프로그램이 원인이었다는 주장을 평가할 판정 근거 세트를 제안하세요.",
        "좌석 안내 표시를 바꾼 도서관 직원이 설문과 실제 길찾기 기록에서 서로 다른 결과를 봤습니다. 관찰한 행동별로 어느 신호가 중요한지 선택하세요.",
        "리허설 영상에서 동작 시간이 짧아졌으나 촬영 위치도 바뀌었습니다. 카메라와 연습 효과를 구분해 측정하는 데 사용할 자료를 판단하세요.",
        "야간 주차장에 동작 감지 센서를 시험합니다. 현장의 비와 이용객 수가 동시에 달라집니다. 위험 조건, 비교 대상, 해석의 한계를 다섯 문장으로 설명하세요.",
        "아침 회의 시간을 조정한 뒤 전달 누락이 많아졌습니다. 참석자 구성도 달라졌습니다. 부서별 기록을 조사해 원인을 나누고 추가 관찰을 계획하세요.",
        "공용 주방의 청소 절차가 효과적인지 판단해야 하지만 사용률 자료가 없습니다. 자료가 있는 구간만 분석할 때의 편향과 추가 점검 비용을 검토해 실행안을 쓰세요.");
    var chosen = marker.equals("two") ? replacements : prompts;
    int questionIndex = 0;

    for (String part : List.of("required", "extension")) {
      var questions = n.putArray(part);
      int order = 0;
      for (var type : plan.path("questionFormat").path(part).properties())
        for (int i = 0; i < type.getValue().asInt(); i++) {
          String id = part + "-" + (++order);
          if (quality) {
            String concept = plan.path("blueprint").path("slots").path(part).get(order - 1).path("conceptId").asString();
            String ref = plan.path("blueprint").path("testedConcepts").path(concept)
                .path("sourcePageRefs").get(0).path("excerptId").asString();
            source = plan.path("passages").valueStream().filter(x -> x.path("id").asString().equals(ref)).findFirst().orElseThrow();
          }
          ObjectNode q = question(id, type.getKey(), order);
          if (type.getKey().endsWith("choice")) {
            var options = q.putArray("options");
            for (int o = 0; o < plan.path("choiceOptionCount").asInt(2); o++)
              options
                  .addObject()
                  .put("id", String.valueOf((char) ('A' + o)))
                  .put("text", List.of("시점과 기준이 일치하는 집단을 비교한다", "기존 전체 기록의 평균을 활용한다", "이상치가 나타난 시점만 분리해 자료를 수집한다", "담당자 인터뷰에서 변화가 시작된 시점을 찾는다", "비교 전에 작은 표본을 현장에서 다시 측정한다").get(o));
          }
          q.put("prompt", chosen.get(questionIndex++));
          if (type.getKey().equals("case_analysis"))
            q.put("context", "팀에서는 현장 관찰에 하루만 더 쓸 수 있습니다. 주간 발표에 필요한 근거와 사후 검증 자료를 어떤 순서로 확보할지 설계합니다.");
          q.withObject("source")
              .put(
                  "section",
                  quality ? source.path("id").asString() : "PDF " + source.path("pageIndex").asInt() + " / " + source.path("id").asString());
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
                k.withObject("incorrectReasons").put(option.path("id").asString(), switch (option.path("id").asString()) {
                  case "B" -> "평균이 시점별로 다른 조건을 상쇄할 수 있습니다.";
                  case "C" -> "특정 시점 위주의 수집은 관찰된 변화가 얼마나 흔한지 확인하기 어렵습니다.";
                  case "D" -> "기억에 의존하는 진술에는 원래의 기록과 비교할 자료가 필요합니다.";
                  default -> "기존 집단과 범위가 다르면 비교에 필요한 통제가 빠질 수 있습니다.";
                });
          } else if (type.getKey().equals("true_false")) k.put("answer", false);
          else k.put("answer", "가설과 결과를 비교합니다.");
          k.putArray("rubric").add("출처의 가설 검증 개념을 설명합니다.")
              .add("관찰의 시점과 비교 기준을 연결합니다.").add("주장의 한계를 표시합니다.");
          if (quality) {
            k.putArray("reasoningMoves").add("관찰 시각을 기록한 자료를 찾는다")
                .add("비교 집단 간 조건 차이를 정리한다").add("관찰이 해석을 지지하는 범위를 설명한다");
            k.putArray("hints").add("원인이 둘 이상일 수 있는 곳은 어디인가요?")
                .add("어느 기록이 먼저 생겼는지와 표본의 규모를 살펴보세요.")
                .add("조건 차이, 이용할 증거, 남는 의문을 세 칸으로 나눠 보세요.");
          } else {
            var follow = k.putArray("followUp");
            for (int f = 1; f <= 10; f++) follow.add("실험 후속 질문 " + f + "는 무엇인가요?");
          }
          k.putArray("citations")
              .addObject()
              .put("excerptId", source.path("id").asString())
              .put("quote", source.path("text").asString().substring(0, 24));
        }
    }
    if (quality) {
      var followUps = n.putArray("followUps");
      List.of("자료를 얻기 어렵다면 어느 항목을 생략할 수 있나요?", "관찰 범위를 확대하면 비용이 어떻게 달라지나요?",
          "어떤 기록이 먼저 생성되었다는 사실을 어떻게 증명하나요?", "이 사례에서 결과를 다시 확인할 사람은 누구인가요?",
          "표본의 대표성을 흔드는 조건을 하나 제시하세요.", "보기에 비슷한 두 지표의 의미를 구별할 수 있나요?",
          "판단 이후 추가 자료가 들어오면 절차를 어떻게 바꿀까요?", "팀에 결과를 전달할 때 어떤 한계를 적어둘까요?",
          "예산이 좁아졌을 때의 비교 우선순위를 정해볼까요?", "관측 결과와 목표가 다를 때 다음 계획을 어떻게 세울까요?")
          .forEach(followUps::add);
    }
    n.putObject("provenance")
        .put("provider", "test_fake")
        .put("model", "deterministic-test-only")
        .put("promptVersion", quality ? QUALITY_VERSION : VERSION);
    if (StudyReasoning.enabled(plan)) {
      separateReview(n);
      var proof = n.putObject("preflight").put("version", StudyReasoning.VERSION).put("reviewVersion", StudyReasoning.REVIEW);
      proof.set("inputDigest", plan.path("inputDigest"));
      var records = proof.putArray("slots");
      for (String part : List.of("required", "extension")) for (var q : n.path(part)) {
        int order = q.path("order").asInt();
        var slot = plan.path("blueprint").path("slots").path(part).path(order - 1);
        var concept = plan.path("blueprint").path("testedConcepts").path(slot.path("conceptId").asString());
        var record = records.addObject().put("part", part).put("order", order).putNull("issue")
            .put("questionId", q.path("id").asString()).put("questionVersion", 1).put("kind", q.path("kind").asString());
        var ref = concept.path("sourcePageRefs").path(0).deepCopy().asObject();
        ref.set("materialVersion", concept.path("sourceVersion"));
        record.set("binding", ref);
        var d = record.putObject("design").put("part", part).put("order", order).put("pattern", "next_test")
            .put("target", "multi_evidence").put("objective", "Choose a test").put("scenario", "Hypothetical")
            .put("criteria", "Minimize irreversible changes").put("rationale", "Two independently variable observations");
        d.set("excerptId", ref.path("excerptId"));
        d.putArray("factors").add("group").add("method"); d.putArray("alternatives").add("inspect intake").add("inspect storage");
        d.putArray("hintPolicy").add("orient").add("weigh").add("procedure"); d.putArray("notGiven").add("future results");
        d.set("cases", JSON.readTree("""
            [{"values":["remote","trace"],"best":0},{"values":["remote","replay"],"best":1},{"values":["local","trace"],"best":1}]
            """));
        record.putObject("review").put("part", part).put("order", order).put("issue", "none")
            .put("evidence", "Synthetic adjudication").set("answers", JSON.readTree("[[0],[1],[1],[0,1],[0,1]]"));
      }
    }
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
    assertThat(engine.status().path("sources").get(0).path("state").asString()).isEqualTo("needs_source_check");
  }

  @Test
  void sourceReadinessAndIndexKickoffRemainBoundToExactMaterialVersion() throws Exception {
    var id = indexSource(1, true);
    var status = engine.status().path("sources").get(0);
    assertThat(status.path("state").asString()).isEqualTo("ready");
    assertThat(status.path("materialVersion").asInt()).isEqualTo(1);
    assertThat(status.path("usableExcerptCount").asInt()).isPositive();
    var asset = UUID.fromString(status.path("assetId").asString());
    assertThat(engine.index(asset, 1).path("id").asString()).isEqualTo(id.toString());
    material();
    rejects(409, () -> engine.index(asset, 1));
    assertThat(engine.status().path("sources").get(0).path("state").asString()).isEqualTo("missing");
    var next = engine.index(asset, 2);
    assertThat(next.path("materialVersion").asInt()).isEqualTo(2);
    assertThat(next.path("id").asString()).isNotEqualTo(id.toString());
    assertThat(engine.status().path("sources").get(0).path("state").asString()).isEqualTo("queued");
  }

  @Test
  void explicitSourceSelectionIsEligibleOwnedAndFrozenForOperationReplay() throws Exception {
    indexSource(1, true);
    var request = JSON.createObjectNode().put("date", LocalDate.now(KST).toString()).put("days", 1)
        .put("operationId", UUID.randomUUID().toString());
    request.putArray("materialIds").add("source");
    var first = engine.plan(request).getFirst();
    assertThat(engine.plan(request).getFirst().path("id").asString()).isEqualTo(first.path("id").asString());
    assertThat(first.path("plan").path("selectedMaterialIds").get(0).asString()).isEqualTo("source");
    var changed = request.deepCopy(); changed.putArray("materialIds").add("foreign");
    rejects(400, () -> engine.plan(changed));
    changed.put("operationId", UUID.randomUUID().toString());
    rejects(409, () -> engine.plan(changed));
    request.remove("materialIds");
    rejects(400, () -> engine.plan(request));
  }

  @Test
  void jobHistoryPaginatesAllOwnedAttemptsAndFiltersAcrossPagesWithoutLeakingKeys() {
    engine.tx(() -> {
      for (int i = 0; i < 125; i++) {
        var job = new StudyEngineJob(); job.ownerId = OWNER; job.kind = i % 2 == 0 ? "GENERATE" : "INDEX";
        job.jobKey = "history/" + i; job.input = "{\"date\":\"2026-11-17\",\"week\":\"2026-11-16\"}";
        job.state = i % 2 == 0 ? "FAILED" : "QUEUED"; job.result = "{\"privateAnswer\":\"secret\"}";
        engine.jobs.save(job);
      }
      return null;
    });
    assertThat(engine.history(0, "", "", "", "").path("totalElements").asInt()).isEqualTo(125);
    assertThat(engine.history(2, "", "", "", "").path("jobs").size()).isEqualTo(25);
    var filtered = engine.history(1, "GENERATE", "FAILED", "2026-11-17", "2026-11-16");
    assertThat(filtered.path("totalElements").asInt()).isEqualTo(63);
    assertThat(filtered.path("jobs").size()).isEqualTo(13);
    assertThat(filtered.toString()).doesNotContain("privateAnswer", "secret");
    assertThat(engine.status().path("jobsTruncated").asBoolean()).isTrue();
    current.set(OTHER); study.snapshot();
    assertThat(engine.history(0, "", "", "", "").path("totalElements").asInt()).isZero();
  }

  @Test
  void planPreviewUsesApprovedEffectivePolicyWithoutCreatingAJobOrMutation() {
    var before = study.snapshot();
    var date = LocalDate.now(KST);
    var preview = engine.preview(date);
    assertThat(preview.path("questionFormat")).isEqualTo(format(effective(study.records().findByOwnerIdAndKind(OWNER, "POLICY"), date)));
    assertThat(preview.path("sourceLimit").asInt()).isEqualTo(StudySourceSelection.DAILY_LIMIT);
    assertThat(preview.path("minutes").path("required").asInt()).isEqualTo(15);
    assertThat(study.snapshot().path("revision")).isEqualTo(before.path("revision"));
    assertThat(engine.status().path("jobs").size()).isZero();
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
    assertThat(engine.complete(w, UUID.fromString(job.path("id").asString()),
        UUID.fromString(job.path("leaseToken").asString()), output(job.path("input"), "stale"))
        .path("state").asString()).isEqualTo("PARTIAL");
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
    study.review(book, version, "extension");
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
    var question = study.assets().findById(UUID.fromString(pkg.path("questionPdf").path("assetId").asString())).orElseThrow();
    try (var d = Loader.loadPDF(storage.bytes.get(question.finalKey))) {
      assertThat(d.getDocumentInformation().getCustomMetadataValue("StudyDocumentKind")).isEqualTo("question");
      assertThat(d.getDocumentInformation().getCustomMetadataValue("StudyWorkbookVersion")).isEqualTo("1");
      assertThat(d.getPages()).allMatch(page -> Math.abs(page.getMediaBox().getWidth() - 595.28) < 0.1
          && Math.abs(page.getMediaBox().getHeight() - 841.89) < 0.1);
      assertThat(new PDFTextStripper().getText(d)).contains("선택 부록", "힌트 3", "원인이 둘 이상")
          .doesNotContain("정답·모범 답안", "지도처럼", "excerptId=");
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
  void frontMatterRangeBeyondFirstBatchAndBoundedBadGeneration() throws Exception {
    indexSource(1, true);
    UUID index = UUID.fromString(engine.status().path("sources").get(0).path("jobId").asString());
    engine.tx(() -> {
      var sample = engine.excerpts.findByOwnerIdAndJobIdOrderByPageIndexAscOrdinalAsc(
          OWNER, index, org.springframework.data.domain.PageRequest.of(0, 1)).getFirst();
      for (int page = 2; page <= 335; page++) {
        var e = new StudySourceExcerpt();
        e.ownerId = OWNER;
        e.jobId = index;
        e.materialId = sample.materialId;
        e.materialVersion = sample.materialVersion;
        e.assetId = sample.assetId;
        e.sourceHash = sample.sourceHash;
        e.pageIndex = page;
        e.ordinal = 1;
        e.quality = "usable";
        e.body = page < 310 ? "목차\n책표지와 발행 정보 ISBN 978-11-0000-000-0"
            : sample.body + " Section " + ((char) ('A' + page - 310)) + ".";
        engine.excerpts.save(e);
      }
      engine.owned(OWNER, index).receipt = "{\"pages\":335}";
      return null;
    });
    var request = JSON.createObjectNode().put("date", LocalDate.now(KST).toString())
        .put("days", 1).put("operationId", UUID.randomUUID().toString());
    request.putArray("materialIds").add("source");
    request.putObject("sourceRanges").putObject("source").put("firstPage", 2).put("lastPage", 10);
    assertThatThrownBy(() -> engine.plan(request)).isInstanceOfSatisfying(StudyException.class,
        e -> assertThat(e.code).isEqualTo("NEEDS_SOURCE_REVIEW"));
    assertThat(engine.jobs.findAll().stream().noneMatch(j -> j.kind.equals("GENERATE"))).isTrue();
    request.putObject("sourceRanges").putObject("source").put("firstPage", 310).put("lastPage", 335);
    var planned = engine.plan(request).getFirst();
    var frozen = request.deepCopy();
    frozen.path("sourceRanges").path("source").asObject().put("firstPage", 311);
    rejects(400, () -> engine.plan(frozen));
    var w = worker();
    for (int attempt = 1; attempt <= 3; attempt++) {
      var claim = engine.claimWorker(w);
      var input = claim.path("input");
      assertThat(input.path("passages").size()).isLessThanOrEqualTo(StudySourceSelection.DAILY_LIMIT);
      assertThat(input.path("passages").valueStream().allMatch(ref -> ref.path("pageIndex").asInt() >= 310)).isTrue();
      if (attempt > 1) assertThat(input.path("repairFeedback").path("issues").toString()).contains("FRONT_MATTER_TRIVIA");
      var candidate = output(input, "negative");
      candidate.path("required").get(0).asObject().put("prompt", "표지 문구에 있는 ISBN은 어떤 뜻인가요?");
      var job = UUID.fromString(claim.path("id").asString());
      var token = UUID.fromString(claim.path("leaseToken").asString());
      var rejected = engine.complete(w, job, token, candidate);
      assertThat(rejected.path("state").asString()).isEqualTo(attempt < 3 ? "PARTIAL" : "BLOCKED");
      assertThat(rejected.path("receipt").path("qualityAttempts").size()).isEqualTo(attempt);
      assertThat(engine.complete(w, job, token, candidate)).isEqualTo(rejected);
    }
    rejects(400, () -> engine.approve(UUID.fromString(planned.path("id").asString())));
    rejects(409, () -> engine.retry(UUID.fromString(planned.path("id").asString())));
    assertThat(study.snapshot().path("packages")).isEmpty();
  }

  @Test
  void reviewFindingsReachOnlyTheOwningWorkerOnBothRetries() throws Exception {
    indexSource(1, true);
    UUID unrelated = engine.tx(() -> engine.enqueue(OWNER, "COACH", "other-queued-work", JSON.createObjectNode()).id);
    var planned = planDay();
    UUID id = UUID.fromString(planned.path("id").asString());
    var w = worker();
    String previousEvidence = "";
    JsonNode frozen = null;
    for (int attempt = 1; attempt <= 3; attempt++) {
      var claim = engine.claimWorker(w, id);
      var input = claim.path("input").asObject();
      if (attempt == 1) frozen = input.deepCopy();
      else {
        var feedback = input.remove("repairFeedback");
        assertThat(input).isEqualTo(frozen);
        assertThat(feedback.path("planDigest")).isEqualTo(frozen.path("inputDigest"));
        assertThat(feedback.path("previousAttempt").asInt()).isEqualTo(attempt - 1);
        var finding = feedback.path("reviewFindings").get(0);
        assertThat(finding.path("questionId").asString()).isEqualTo("required-2");
        assertThat(finding.path("part").asString()).isEqualTo("required");
        assertThat(finding.path("order").asInt()).isEqualTo(2);
        assertThat(finding.path("code").asString()).isEqualTo("REVIEW_TRIVIAL_REASONING");
        assertThat(finding.path("evidence").asString()).isEqualTo(previousEvidence);
        assertThat(finding.path("occurrences").asInt()).isEqualTo(attempt - 1);
        assertThat(finding.path("answerCue").asString()).contains("효력일");
        assertThat(finding.path("revisedJudgment").asString()).contains("자료의 권한");
        assertThat(feedback.toString()).doesNotContain("incorrectReasons", "real-draft-marker");
        assertThat(feedback.path("reviewFindings").size()).isEqualTo(attempt == 2 ? 2 : 1);
      }
      var candidate = output(input, "semantic-counterexample");
      var question = candidate.path("required").get(1).asObject();
      question.put("context", "가상 사례입니다. 결재 효력일과 완료 기준이 각각 기록 A의 날짜와 수치에 해당한다고 명시했습니다. real-draft-marker");
      assertThat(StudyQuality.questionIssues(question, candidate.path("keys").get(1))).isEmpty();
      var verdicts = separateReview(candidate);
      previousEvidence = "지문이 이미 효력일과 완료 기준을 제시해 값을 대응시키면 됩니다. 검토 " + attempt;
      verdicts.get(1).asObject().put("issue", "trivial_reasoning").put("evidence", previousEvidence)
          .put("answerCue", "지문의 확정된 효력일과 기준").put("revisedJudgment", "충돌한 자료의 권한과 적용 범위를 비교하는 상황으로 변경");
      if (attempt == 1) {
        int essayIndex = input.path("blueprint").path("slots").path("required").valueStream()
            .filter(slot -> slot.path("kind").asString().equals("essay")).findFirst().orElseThrow().path("order").asInt() - 1;
        verdicts.get(essayIndex).asObject().put("issue", "spoils_answer")
            .put("evidence", "첫 힌트에서 학습자가 추론할 두 결론을 모두 제시합니다.");
      }
      var token = UUID.fromString(claim.path("leaseToken").asString());
      var result = engine.complete(w, id, token, candidate);
      assertThat(result.path("state").asString()).isEqualTo(attempt < 3 ? "PARTIAL" : "BLOCKED");
      assertThat(result.path("receipt").path("qualityAttempts").size()).isEqualTo(attempt);
      assertThat(result.toString()).doesNotContain(previousEvidence, "revisedJudgment", "real-draft-marker", "privateReviewAttempts");
      assertThat(engine.complete(w, id, token, candidate)).isEqualTo(result);
      int completed = attempt;
      engine.tx(() -> {
        var stored = engine.owned(OWNER, id);
        assertThat(JSON.readTree(stored.receipt).path("privateReviewAttempts").size()).isEqualTo(completed);
        assertThat(stored.result).contains("real-draft-marker");
        return null;
      });
      current.set(OTHER);
      study.snapshot();
      var other = worker();
      assertThat(engine.claimWorker(other).path("state").asString()).isEqualTo("IDLE");
      rejects(404, () -> engine.claimWorker(other, id));
      assertThat(engine.status().path("jobs").toString()).doesNotContain(id.toString());
      current.set(OWNER);
    }
    assertThat(study.snapshot().path("packages")).isEmpty();
    rejects(409, () -> engine.retry(id));
    assertThat(engine.claimWorker(w, id).path("state").asString()).isEqualTo("IDLE");
    assertThat(engine.tx(() -> engine.owned(OWNER, unrelated).attempts)).isZero();
  }

  @Test
  void reviewRequiresExactPartOrderAndIdAndUncertaintyStillRequiresOwnerReview() throws Exception {
    indexSource(1, true);
    planDay();
    var input = engine.claimWorker(worker()).path("input");
    var good = output(input, "bound-review");
    var verdicts = separateReview(good);
    verdicts.get(0).asObject().put("issue", "uncertain");
    assertThatThrownBy(() -> validate(good, input, Set.of())).isInstanceOfSatisfying(StudyQuality.Rejected.class,
        e -> assertThat(e.evaluation.path("issues").toString()).contains("REVIEW_UNCERTAIN"));
    var legacy = input.deepCopy().asObject().without("reasoningContract");
    good.remove("preflight");
    var evaluated = validate(good, legacy, Set.of()).path("quality");
    assertThat(evaluated.path("result").asString()).isEqualTo("needs_owner_review");
    assertThat(evaluated.path("warnings").toString()).contains("판단 보류");
    assertThat(evaluated.path("independentReview").path("humanApproval").asBoolean()).isFalse();

    for (var mismatch : Map.of("part", "extension", "order", 99, "questionId", "extension-1", "evidence", " ").entrySet()) {
      var invalid = good.deepCopy();
      invalid.path("independentReview").path("verdicts").get(0).asObject()
          .set(mismatch.getKey(), JSON.valueToTree(mismatch.getValue()));
      rejects(400, () -> validate(invalid, legacy, Set.of()));
    }
    var unknownVersion = good.deepCopy();
    unknownVersion.path("independentReview").asObject().put("version", "unknown-review");
    rejects(400, () -> validate(unknownVersion, legacy, Set.of()));
  }

  @Test
  void qualityRepairDoesNotRelaxDistractorHintDuplicateOrSourceChecks() throws Exception {
    indexSource(1, true);
    planDay();
    var input = engine.claimWorker(worker()).path("input");
    var good = output(input, "unchanged-gates");
    assertThat(validate(good, input, Set.of()).path("quality").path("issues").isEmpty()).isTrue();
    var bad = good.deepCopy();
    var first = bad.path("required").get(0).asObject();
    var options = first.path("options");
    options.get(1).asObject().put("text", "라면");
    var key = bad.path("keys").get(0).asObject();
    key.path("hints").asArray().set(2, options.get(0).path("text"));
    first.put("guidance", "excerptId= / pageIndex=");
    assertThatThrownBy(() -> validate(bad, input, Set.of(first.path("prompt").asString())))
        .isInstanceOfSatisfying(StudyQuality.Rejected.class, e -> assertThat(e.evaluation.path("issues").toString())
            .contains("WEAK_DISTRACTORS", "HINT_ANSWER_LEAK", "PRESENTATION_INTEGRITY", "SEMANTIC_DUPLICATION"));

    var duplicateLabel = good.deepCopy();
    duplicateLabel.path("required").get(0).path("options").get(1).asObject().put("id", "A");
    rejects(400, () -> validate(duplicateLabel, input, Set.of()));
    var wrongPage = good.deepCopy();
    wrongPage.path("required").get(0).path("source").asObject().put("section", "PDF 99");
    assertThatThrownBy(() -> validate(wrongPage, input, Set.of()))
        .isInstanceOfSatisfying(StudyException.class, e -> assertThat(e.code).isEqualTo("PRIMARY_CITATION_REQUIRED"));
  }

  @Test
  void blueprintFailureStaysPrivateAndNeverGeneratesAWorkbook() throws Exception {
    indexSource(1, true);
    planDay();
    var w = worker();
    for (int i = 1; i <= 3; i++) {
      var claim = engine.claimWorker(w);
      var input = claim.path("input");
      var example = output(input, "preflight");
      var packet = JSON.createObjectNode();
      packet.set("preflight", example.path("preflight"));
      packet.set("provenance", example.path("provenance"));
      var failed = packet.path("preflight").path("slots").path(0).asObject();
      failed.put("issue", "SINGLE_CLUE_SHORTCUT");
      failed.path("review").asObject().put("evidence", "PRIVATE_REVIEW_SENTINEL");
      if (i > 1) {
        assertThat(claim.path("previousPreflight").isObject()).isTrue();
        assertThat(claim.path("input").path("repairFeedback").toString()).contains("PRIVATE_REVIEW_SENTINEL");
        assertThat(claim.has("previousCandidate")).isFalse();
      }
      var id = UUID.fromString(claim.path("id").asString());
      var token = UUID.fromString(claim.path("leaseToken").asString());
      var receipt = engine.complete(w, id, token, packet);
      assertThat(receipt.path("state").asString()).isEqualTo(i < 3 ? "PARTIAL" : "BLOCKED");
      assertThat(receipt.toString()).contains("BLUEPRINT_REPAIR_REQUIRED", "SINGLE_CLUE_SHORTCUT")
          .doesNotContain("PRIVATE_REVIEW_SENTINEL", "alternatives", "rationale");
      assertThat(engine.complete(w, id, token, packet)).isEqualTo(receipt);
    }
    assertThat(engine.claimWorker(w).path("state").asString()).isEqualTo("IDLE");
    assertThat(study.snapshot().path("packages")).isEmpty();
  }

  @Test
  void reasoningProofCannotBeReplayedAcrossSourcesOrVersions() throws Exception {
    indexSource(1, true);
    planDay();
    var input = engine.claimWorker(worker()).path("input");
    var good = output(input, "proof-bindings");
    var missing = good.deepCopy().without("preflight");
    rejects(400, () -> validate(missing, input, Set.of()));
    for (String field : List.of("inputDigest", "sourceHash", "questionVersion")) {
      var wrong = good.deepCopy();
      var proof = wrong.path("preflight").asObject();
      var record = proof.path("slots").path(0).asObject();
      if (field.equals("inputDigest")) proof.put(field, "stale");
      else if (field.equals("sourceHash")) record.path("binding").asObject().put(field, "different");
      else record.put(field, 2);
      rejects(400, () -> validate(wrong, input, Set.of()));
    }
    var quote = good.deepCopy();
    quote.path("keys").path(0).path("citations").path(0).asObject().put("quote", "a deliberately corrupted sentence");
    assertThatThrownBy(() -> validate(quote, input, Set.of())).isInstanceOfSatisfying(StudyQuality.Rejected.class,
        e -> assertThat(e.evaluation.path("questions").path(0).path("issues").toString()).contains("SOURCE_QUOTE_MISMATCH"));

    var quality = validate(good, input, Set.of()).path("quality");
    var altered = good.deepCopy();
    altered.path("keys").path(0).path("hints").asArray().set(0, JSON.getNodeFactory().stringNode("changed"));
    assertThatThrownBy(() -> StudyReasoning.preserve(good, quality, altered)).isInstanceOfSatisfying(StudyException.class,
        e -> assertThat(e.code).isEqualTo("PROTECTED_SLOT_CHANGED"));
  }

  private ArrayNode separateReview(ObjectNode candidate) {
    var review = candidate.putObject("independentReview").put("version", "study-v31-review-2")
        .put("model", "synthetic-review-contract-fixture").putArray("verdicts");
    for (String part : List.of("required", "extension")) {
      for (var question : candidate.path(part)) {
        review.addObject().put("questionId", question.path("id").asString()).put("part", part)
            .put("order", question.path("order").asInt()).put("issue", "none")
            .put("evidence", "검토 계약 시험용 근거입니다.").put("answerCue", "해당 없음").put("revisedJudgment", "해당 없음");
      }
    }
    return review;
  }

  @Test
  void hintsPersistAcrossDuplicateAndConcurrentRequestsWithoutRewritingAttempts() throws Exception {
    indexSource(1, true);
    var planned = planDay();
    generate(worker(), "hints");
    String book = planned.path("workbookId").asString();
    var job = UUID.fromString(planned.path("id").asString());
    rejects(404, () -> study.hints(book, 1, "required", "required-1", 1, 0));
    study.review(book, 1, "required");
    rejects(400, () -> engine.approve(job));
    study.review(book, 1, "extension");
    var render = engine.approve(job);
    engine.run(UUID.fromString(render.path("id").asString()));
    assertThat(study.snapshot().toString()).doesNotContain("원인이 둘 이상", "지도처럼", "incorrectReasons");
    for (String part : List.of("required", "extension")) {
      var questions = study.snapshot().path("packages").get(0).path(part);
      var q = questions.get(questions.size() - 1);
      String qid = q.path("id").asString();
      assertThat(study.hints(book, 1, part, qid, 1, 0).path("hints").size()).isZero();
      rejects(400, () -> study.hints(book, 1, part, qid, 1, 3));
      rejects(400, () -> study.hints(book, 1, part, qid, 2, 1));
      var first = study.hints(book, 1, part, qid, 1, 1);
      assertThat(study.hints(book, 1, part, qid, 1, 1)).isEqualTo(first);
      var tasks = new ArrayList<java.util.concurrent.Future<JsonNode>>();
      try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
        for (int i = 0; i < 2; i++) tasks.add(pool.submit(() -> study.hints(book, 1, part, qid, 1, 2)));
        for (var result : tasks) assertThat(result.get().path("revealedHintCount").asInt()).isEqualTo(2);
      }
      assertThat(study.hints(book, 1, part, qid, 1, 3).path("revealedHintCount").asInt()).isEqualTo(3);
      assertThat(study.hints(book, 1, part, qid, 1, 0).path("hints").size()).isEqualTo(3);
    }
    var pkg = study.snapshot().path("packages").get(0);
    var q = pkg.path("required").get(0);
    String key = binding(pkg, "required", q), questionId = q.path("id").asString();
    var submit = JSON.createObjectNode()
        .put("workbookId", book).put("workbookVersion", 1).put("part", "required")
        .put("mode", "online").put("note", "");
    submit.putArray("coverage").add(key);
    submit.putObject("responses").putObject(key).put("selected", "A");
    submit.putArray("attachments");
    cmd("attempt.submit", submit);
    study.hints(book, 1, "required", questionId, 1, 1);
    cmd("attempt.submit", submit);
    var attempts = study.snapshot().path("attempts");
    assertThat(attempts.get(0).path("revealedHintCounts").path(key).asInt(-1)).isZero();
    assertThat(attempts.get(1).path("revealedHintCounts").path(key).asInt(-1)).isEqualTo(1);
    var reissued = engine.reissue(job, JSON.createObjectNode().put("operationId", UUID.randomUUID().toString()));
    assertThat(reissued.path("workbookVersion").asInt()).isEqualTo(2);
    rejects(404, () -> study.hints(book, 2, "required", questionId, 1, 0));
    current.set(OTHER);
    study.snapshot();
    rejects(404, () -> study.hints(book, 1, "required", questionId, 1, 0));
  }

  @Test
  @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "STUDY_PRIVATE_PILOT", matches = ".+")
  void privateChapterPilotChecksExactPagesInFullBook() throws Exception {
    byte[] file = Files.readAllBytes(Path.of(System.getenv("STUDY_PRIVATE_PILOT")));
    assertThat(hash(file)).isEqualTo("e9331c80662ecbaf26d44d8cd671e8556b2cb1fbcef341cf1112cbd52f113c67");
    material();
    var ticket = upload(file, "material", "local-private-pilot.pdf");
    complete(ticket);
    UUID job = UUID.fromString(engine.index(UUID.fromString(ticket.path("id").asString())).path("id").asString());
    engine.run(job);
    assertThat(engine.status().path("sources").get(0).path("physicalPages").asInt()).isEqualTo(335);
    var chapter = engine.tx(() -> StudySourceSelection.load(engine.excerpts, OWNER, job,
        new StudySourceSelection.PageRange(26, 53)));
    var front = engine.tx(() -> StudySourceSelection.load(engine.excerpts, OWNER, job,
        new StudySourceSelection.PageRange(1, 5)));
    var pages = chapter.candidates.stream().map(c -> c.excerpt().pageIndex).toList();
    assertThat(pages.size()).isGreaterThanOrEqualTo(14);
    assertThat(pages).allMatch(page -> page >= 26 && page <= 53);
    assertThat(front.candidates).isEmpty();
    var concepts = chapter.candidates.stream().map(StudySourceSelection.Candidate::conceptId).distinct().count();
    assertThat(concepts).isGreaterThanOrEqualTo(7);
    var dataset = JSON.readTree(Files.readString(Path.of(System.getenv("STUDY_PRIVATE_PILOT")).resolveSibling("golden.json")));
    for (var sample : dataset.path("cases")) {
      String label = sample.path("label").asString(), id = sample.path("id").asString();
      if (label.equals("approved_style")) {
        var q = JSON.createObjectNode().put("prompt", sample.path("prompt").asString())
            .put("kind", sample.path("type").asString());
        if (sample.has("options")) q.set("options", sample.path("options"));
        String model = sample.path("modelAnswer").asString("Provide the directly relevant interface and a reusable usage example.");
        var key = JSON.createObjectNode().put("model", model)
            .put("explanation", sample.path("rationale").asString(model))
            .set("answer", sample.has("answer") ? sample.path("answer") : JSON.getNodeFactory().stringNode(model))
            .set("hints", sample.path("hints"));
        if (sample.has("distractorReasons")) key.set("incorrectReasons", sample.path("distractorReasons"));
        key.set("rubric", sample.has("rubricCriteria") ? sample.path("rubricCriteria")
            : JSON.createArrayNode().add("Cites existing project-specific facts.").add("Compares noise and usefulness."));
        var moves = key.putArray("reasoningMoves");
        sample.path("reasoningMoves").valueStream().limit(3).forEach(moves::add);
        assertThat(StudyQuality.questionIssues(q, key)).as(id).isEmpty();
        assertThat(sample.path("sourcePrintedPages").valueStream().anyMatch(page -> pages.contains(page.asInt() + 1))).isTrue();
        System.out.println("GOLDEN " + id + " PASS deterministic checks and Chapter 1 page availability");
      } else if (Set.of("negative_cover_trivia", "negative_isbn", "negative_too_easy_prior_chat").contains(id)) {
        var q = JSON.createObjectNode().put("prompt", sample.path("prompt").asString()).put("kind", "single_choice");
        assertThat(StudyQuality.questionIssues(q, JSON.createObjectNode())).as(id)
            .contains(label.equals("rejected_too_easy") ? "REASONING_DEPTH" : "FRONT_MATTER_TRIVIA");
        System.out.println("GOLDEN " + id + " REJECT");
      }
    }
    var spread = StudySourceSelection.acrossRange(chapter.candidates);
    assertThat(spread).hasSize(StudySourceSelection.DAILY_LIMIT);
    assertThat(spread.stream().map(StudySourceSelection.Candidate::conceptId)).doesNotHaveDuplicates();
    var chosenPages = spread.stream().map(c -> c.excerpt().pageIndex).toList();
    assertThat(chosenPages.getFirst()).isBetween(26, 29);
    assertThat(chosenPages.getLast()).isBetween(50, 53);
    System.out.println("PRIVATE_DAILY_SELECTED_PDF_PAGES " + chosenPages);
    System.out.printf("PRIVATE_PILOT 335 pages; teaching pages %s; section-page neighborhoods %d; Ch1 %s; front %s%n",
        pages, concepts, chapter.diagnostics, front.diagnostics);
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
    study.review(bookId, 1, "extension");
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
    study.review(bookId, 2, "extension");
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
    study.review(p.path("workbookId").asString(), 1, "extension");
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
    assertThat(engine.complete(w, UUID.fromString(job.path("id").asString()),
        UUID.fromString(job.path("leaseToken").asString()), bad).path("state").asString()).isEqualTo("PARTIAL");
    assertThat(study.snapshot().path("packages")).isEmpty();
    assertThat(engine.status().path("jobs").toString())
        .contains("QUALITY_REVIEW_REQUIRED", "SOURCE_QUOTE_MISMATCH")
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
