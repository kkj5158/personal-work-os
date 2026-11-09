package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.*;
import static org.assertj.core.api.Assertions.*;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.shareddesk.storage.*;
import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.pdfbox.pdmodel.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/**
 * Real, owned loopback PostgreSQL/JPA. Synthetic object boundary; provider is separately qualified.
 */
@EnabledIfEnvironmentVariable(
    named = "STUDY_TEST_DB",
    matches = "jdbc:postgresql://127\\.0\\.0\\.1:55449/postgres")
@SpringBootTest(
    classes = StudyPostgresTest.Config.class,
    properties = {
      "spring.flyway.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none",
      "spring.jpa.open-in-view=false",
      "spring.datasource.hikari.maximum-pool-size=2"
    })
class StudyPostgresTest {
  static final UUID OWNER = UUID.fromString("a1040000-0000-4000-8000-000000000001"),
      OTHER = UUID.fromString("a1040000-0000-4000-8000-000000000002");
  static final AtomicReference<UUID> current = new AtomicReference<>(OWNER);

  @Configuration
  @EnableAutoConfiguration
  @EntityScan(basePackageClasses = StudyWorkspace.class)
  @EnableJpaRepositories(basePackageClasses = StudyWorkspaces.class)
  @Import(StudyService.class)
  static class Config {
    @Bean
    CurrentUserProvider currentUser() {
      return current::get;
    }

    @Bean
    TestStorage storage() {
      return new TestStorage();
    }

    @Bean
    StudyFiles files(StudyService study, TestStorage storage) {
      return new StudyFiles(study, storage, true, 104857600);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry p) {
    p.add(
        "spring.datasource.url",
        () -> System.getenv("STUDY_TEST_DB") + "?currentSchema=study_owned_test,public");
    p.add("spring.datasource.username", () -> "study_test");
    p.add("spring.datasource.password", () -> "");
    p.add("STUDY_STORAGE_ENABLED", () -> "true");
  }

  @Autowired StudyService study;
  @Autowired StudyFiles files;
  @Autowired TestStorage storage;
  @Autowired JdbcTemplate db;

  @BeforeEach
  void setup() throws Exception {
    current.set(OWNER);
    db.execute("drop schema if exists study_owned_test cascade");
    db.execute("create schema study_owned_test");
    db.execute("set search_path to study_owned_test,public");
    // Every pooled connection uses the same marked schema, configured on its JDBC URL by the
    // runner.
    db.execute("create schema if not exists auth");
    db.execute("create table if not exists auth.users(id uuid primary key)");
    db.update("insert into auth.users values(?),(?) on conflict do nothing", OWNER, OTHER);
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V104__study_foundation.sql")));
    storage.bytes.clear();
    study.snapshot();
  }

  ObjectNode envelope(String action, JsonNode data) {
    return JSON.createObjectNode()
        .put("operationId", UUID.randomUUID().toString())
        .put("expectedRevision", study.snapshot().path("revision").asLong())
        .put("action", action)
        .set("data", data);
  }

  ObjectNode cmd(String action, JsonNode data) {
    return study.command(envelope(action, data));
  }

  JsonNode parse(String json) {
    return JSON.readTree(json);
  }

  void material() {
    cmd(
        "material.save",
        parse(
            "{\"id\":\"source\",\"title\":\"Owner"
                + " authored\",\"domain\":\"test\",\"scope\":\"chapter"
                + " 1\",\"weight\":50,\"included\":true,\"rights\":\"author\"}"));
  }

  ObjectNode question(String id, String kind, int order) {
    ObjectNode q =
        JSON.createObjectNode()
            .put("id", id)
            .put("version", 1)
            .put("order", order)
            .put("kind", kind)
            .put("prompt", "Synthetic " + id)
            .put("responseSchema", SCHEMAS.get(kind));
    q.putObject("source").put("materialId", "source").put("section", "chapter 1");
    if (kind.endsWith("choice")) {
      ArrayNode o = q.putArray("options");
      o.addObject().put("id", "A").put("text", "One");
      o.addObject().put("id", "B").put("text", "Two");
    }
    if (kind.equals("case_analysis")) q.put("context", "Synthetic case");
    return q;
  }

  ObjectNode draft(int version) {
    ObjectNode p =
        JSON.createObjectNode()
            .put("id", "workbook")
            .put("version", version)
            .put("date", "2026-11-09")
            .put("topic", "Manual workbook")
            .put("policyVersion", 1);
    p.putArray("required")
        .add(question("false", "true_false", 1))
        .add(question("choice", "multiple_choice", 2));
    p.putArray("extension").add(question("diagram", "diagram", 1));
    ArrayNode keys = JSON.createArrayNode();
    for (String part : List.of("required", "extension"))
      for (JsonNode q : p.path(part)) {
        ObjectNode k =
            keys.addObject()
                .put("model", "Private model")
                .put("explanation", "Private explanation");
        k.set("binding", bindingNode(p, part, q));
        k.putArray("rubric").add("Private rubric");
        k.putArray("followUp");
      }
    return JSON.createObjectNode().set("workbook", p).set("answerKeys", keys);
  }

  ObjectNode bindingNode(JsonNode p, String part, JsonNode q) {
    return JSON.createObjectNode()
        .put("workbookId", p.path("id").asString())
        .put("workbookVersion", p.path("version").asInt())
        .put("part", part)
        .put("questionId", q.path("id").asString())
        .put("questionVersion", q.path("version").asInt());
  }

  void workbook() {
    material();
    cmd("workbook.import", draft(1));
  }

  void rejects(int status, Runnable r) {
    assertThatThrownBy(r::run)
        .isInstanceOfSatisfying(StudyException.class, e -> assertThat(e.status).isEqualTo(status));
  }

  @Test
  void metadataPersistsOwnerIsolationAndNoAnswersInSnapshot() {
    workbook();
    assertThat(study.snapshot().toString())
        .contains("Owner authored")
        .doesNotContain("Private model", "Private explanation", "Private rubric");
    current.set(OTHER);
    assertThat(study.snapshot().path("sources")).isEmpty();
    rejects(404, () -> study.review("workbook", 1, "required"));
    current.set(OWNER);
    assertThat(study.snapshot().path("packages")).hasSize(1);
    assertThat(study.review("workbook", 1, "required")).hasSize(2);
    assertThat(
            db.queryForObject(
                "select count(*) from study_records where kind='REVIEW'", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void draftFalseEmptyDiscardConflictAndIdempotentAttempts() {
    workbook();
    JsonNode p = draft(1).path("workbook"),
        b = bindingNode(p, "required", p.path("required").get(0));
    ObjectNode data =
        JSON.createObjectNode().set("binding", b).set("response", parse("{\"value\":false}"));
    ObjectNode request = envelope("draft.save", data);
    study.command(request);
    study.command(request);
    String key = binding(p, "required", p.path("required").get(0));
    assertThat(study.snapshot().path("drafts").path(key).path("response").path("value").asBoolean())
        .isFalse();
    ObjectNode changed = request.deepCopy();
    changed.withObject("data").set("response", parse("{\"value\":true}"));
    rejects(409, () -> study.command(changed));
    ObjectNode input = attemptInput(p, "required", "online", List.of(key));
    input.withObject("responses").set(key, parse("{\"value\":false}"));
    ObjectNode submit = envelope("attempt.submit", input);
    study.command(submit);
    study.command(submit);
    assertThat(study.snapshot().path("attempts")).hasSize(1);
    cmd(
        "draft.discard",
        parse("{\"workbookId\":\"workbook\",\"workbookVersion\":1,\"part\":\"required\"}"));
    assertThat(study.snapshot().path("drafts")).isEmpty();
    assertThat(study.snapshot().path("attempts")).hasSize(1);
    JsonNode q = p.path("required").get(1);
    ObjectNode multi =
        JSON.createObjectNode()
            .set("binding", bindingNode(p, "required", q))
            .set("response", parse("{\"selected\":[\"A\"]}"));
    cmd("draft.save", multi);
    multi.set("response", parse("{\"selected\":[]}"));
    cmd("draft.save", multi);
    assertThat(study.snapshot().path("drafts")).isEmpty();
    multi.set("response", parse("{\"selected\":[\"A\",\"A\"]}"));
    rejects(400, () -> cmd("draft.save", multi));
  }

  ObjectNode attemptInput(JsonNode p, String part, String mode, List<String> coverage) {
    ObjectNode n =
        JSON.createObjectNode()
            .put("workbookId", p.path("id").asString())
            .put("workbookVersion", p.path("version").asInt())
            .put("part", part)
            .put("mode", mode)
            .put("note", "Synthetic");
    n.set("coverage", JSON.valueToTree(coverage));
    n.putObject("responses");
    n.putArray("attachments");
    return n;
  }

  @Test
  void allQuestionKindsAndMalformedSchemaFailBeforePersistence() {
    material();
    ObjectNode overflowingVersion = draft(1);
    overflowingVersion.withObject("workbook").put("version", 4294967297L);
    rejects(400, () -> cmd("workbook.import", overflowingVersion));
    ObjectNode input = draft(1), p = (ObjectNode) input.get("workbook");
    p.withArray("required").get(0).asObject().put("kind", "unknown");
    rejects(400, () -> cmd("workbook.import", input));
    assertThat(study.snapshot().path("packages")).isEmpty();
    for (String kind : SCHEMAS.keySet())
      questions(JSON.createArrayNode().add(question(kind, kind, 1)), Set.of("source"));
    ObjectNode leaked = draft(1);
    leaked.withObject("workbook").withArray("required").get(0).asObject().put("answer", "secret");
    rejects(400, () -> cmd("workbook.import", leaked));
    ObjectNode badSource = draft(1);
    badSource
        .withObject("workbook")
        .withArray("required")
        .get(0)
        .path("source")
        .asObject()
        .put("materialId", "foreign");
    rejects(400, () -> cmd("workbook.import", badSource));
  }

  byte[] pdf(String kind, int version) throws Exception {
    try (var document = new PDDocument();
        var out = new ByteArrayOutputStream()) {
      document.addPage(new PDPage());
      var info = document.getDocumentInformation();
      info.setCustomMetadataValue("StudyWorkbookId", "workbook");
      info.setCustomMetadataValue("StudyWorkbookVersion", String.valueOf(version));
      info.setCustomMetadataValue("StudyDocumentKind", kind);
      document.save(out);
      return out.toByteArray();
    }
  }

  ObjectNode upload(byte[] bytes, String purpose, String name) throws Exception {
    ObjectNode data =
        JSON.createObjectNode()
            .put("purpose", purpose)
            .put("name", name)
            .put("size", bytes.length)
            .put("type", "application/pdf")
            .put(
                "sha256",
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
    if (purpose.equals("material")) data.put("materialId", "source");
    else data.put("workbookId", "workbook").put("workbookVersion", 1);
    ObjectNode init = envelope("upload", data);
    ObjectNode ticket = files.create(init);
    UUID id = UUID.fromString(ticket.path("id").asString());
    StudyAsset a = study.assets().findById(id).orElseThrow();
    storage.bytes.put(a.stagingKey, bytes);
    return ticket;
  }

  ObjectNode complete(ObjectNode ticket) {
    return files.complete(
        UUID.fromString(ticket.path("id").asString()),
        envelope("finalize", JSON.createObjectNode()));
  }

  @Test
  void durableProtocolMaterialHandwrittenOwnershipAndImmutableHistory() throws Exception {
    workbook();
    ObjectNode source = upload(pdf("material", 1), "material", "source.pdf");
    assertThat(complete(source).path("state").asString()).isEqualTo("READY");
    var output = new ByteArrayOutputStream();
    files.download(UUID.fromString(source.path("id").asString()), output);
    assertThat(output.toByteArray()).isEqualTo(pdfBytes(source));
    ObjectNode scan = upload(pdf("handwritten", 1), "handwritten", "scan.pdf");
    ObjectNode finish = envelope("finalize", JSON.createObjectNode());
    UUID scanId = UUID.fromString(scan.path("id").asString());
    files.complete(scanId, finish);
    files.complete(scanId, finish);
    JsonNode p = draft(1).path("workbook");
    String key = binding(p, "extension", p.path("extension").get(0));
    ObjectNode attempt = attemptInput(p, "extension", "handwritten", List.of(key));
    attempt.withArray("attachments").addObject().put("id", scanId.toString());
    cmd("attempt.submit", attempt);
    assertThat(study.snapshot().path("attempts").get(0).path("evaluation").asString())
        .isEqualTo("submitted_ungraded");
    rejects(400, () -> files.remove(scanId, envelope("remove", JSON.createObjectNode())));
    current.set(OTHER);
    study.snapshot();
    rejects(404, () -> files.readable(scanId));
    current.set(OWNER);
    cmd("workbook.import", draft(2));
    assertThat(study.snapshot().path("attempts").get(0).path("workbookVersion").asInt())
        .isEqualTo(1);
  }

  byte[] pdfBytes(ObjectNode ticket) {
    StudyAsset a =
        study.assets().findById(UUID.fromString(ticket.path("id").asString())).orElseThrow();
    return storage.bytes.get(a.finalKey);
  }

  @Test
  void publicationRequiresBothRealVersionBoundPdfBytesAndPrivateReview() throws Exception {
    workbook();
    ObjectNode q = upload(pdf("question", 1), "question", "question.pdf");
    complete(q);
    ObjectNode pair =
        JSON.createObjectNode()
            .put("questionAssetId", q.path("id").asString())
            .put("answerAssetId", UUID.randomUUID().toString());
    rejects(404, () -> files.publish("workbook", 1, envelope("publish", pair)));
    ObjectNode wrong = upload(pdf("answer", 2), "answer", "wrong.pdf");
    assertThat(complete(wrong).path("state").asString()).isEqualTo("FAILED");
    ObjectNode a = upload(pdf("answer", 1), "answer", "answer.pdf");
    complete(a);
    pair.put("answerAssetId", a.path("id").asString());
    files.publish("workbook", 1, envelope("publish", pair));
    assertThat(study.snapshot().path("packages").get(0).path("status").asString())
        .isEqualTo("published");
    UUID answerId = UUID.fromString(a.path("id").asString());
    rejects(403, () -> files.readable(answerId));
    study.review("workbook", 1, "required");
    assertThat(files.readable(answerId).state).isEqualTo("ATTACHED");
    rejects(400, () -> files.remove(answerId, envelope("remove", JSON.createObjectNode())));
    rejects(409, () -> cmd("workbook.import", draft(1)));
  }

  @Test
  void invalidMagicTruncatedPdfLimitsAndOrphanReconciliation() throws Exception {
    workbook();
    ObjectNode invalid = upload("%PDF-1.7\ntruncated".getBytes(), "material", "bad.pdf");
    assertThat(complete(invalid).path("state").asString()).isEqualTo("FAILED");
    ObjectNode a = upload(pdf("handwritten", 1), "handwritten", "interrupted.pdf");
    StudyAsset orphan =
        study.assets().findById(UUID.fromString(a.path("id").asString())).orElseThrow();
    orphan.expiresAt = Instant.now().minusSeconds(1000);
    study.assets().save(orphan);
    assertThat(files.reconcile()).containsEntry("removed", 1);
    assertThat(study.assets().findById(orphan.id).orElseThrow().state).isEqualTo("DELETED");
    ObjectNode huge =
        JSON.createObjectNode()
            .put("purpose", "handwritten")
            .put("name", "large.pdf")
            .put("size", 20971521)
            .put("sha256", "0".repeat(64))
            .put("type", "application/pdf")
            .put("workbookId", "workbook")
            .put("workbookVersion", 1);
    rejects(413, () -> files.create(envelope("upload", huge)));
  }

  @Test
  void coachPendingApprovalRejectionRollbackAndHistoricalSnapshot() {
    workbook();
    String original = study.snapshot().path("packages").toString();
    cmd("feedback.add", parse("{\"text\":\"Please use concrete examples\"}"));
    assertThat(study.snapshot().path("feedback").get(0).path("state").asString())
        .isEqualTo("pending_analysis");
    cmd("policy.propose", parse("{\"change\":\"format\",\"scope\":\"next_week_only\"}"));
    String id = study.snapshot().path("proposals").get(0).path("id").asString();
    cmd("policy.decide", JSON.createObjectNode().put("id", id).put("approve", true));
    assertThat(study.snapshot().path("policies")).hasSize(2);
    cmd("policy.propose", parse("{\"change\":\"explanation\"}"));
    id = study.snapshot().path("proposals").get(1).path("id").asString();
    cmd("policy.decide", JSON.createObjectNode().put("id", id).put("approve", false));
    assertThat(study.snapshot().path("policies")).hasSize(2);
    cmd("policy.rollback", parse("{\"version\":1}"));
    assertThat(study.snapshot().path("policies")).hasSize(3);
    assertThat(study.snapshot().path("packages").toString()).isEqualTo(original);
    cmd("automation.configure", parse("{\"enabled\":true}"));
    assertThat(study.snapshot().path("automation").path("connected").asBoolean()).isFalse();
  }

  @Test
  void kstSundayRemainsCurrentUntilMonday() {
    assertThat(week(Clock.fixed(Instant.parse("2026-11-01T14:59:59Z"), ZoneOffset.UTC)))
        .isEqualTo("2026-10-26");
    assertThat(week(Clock.fixed(Instant.parse("2026-11-01T15:00:00Z"), ZoneOffset.UTC)))
        .isEqualTo("2026-11-02");
  }

  static class TestStorage implements ObjectStorage {
    final Map<String, byte[]> bytes = new HashMap<>();

    public boolean enabled() {
      return true;
    }

    public String newStagingKey(UUID owner) {
      return owner + "/staging/" + UUID.randomUUID();
    }

    public String newFinalKey(UUID owner) {
      return owner + "/final/" + UUID.randomUUID();
    }

    public SignedTicket presignPut(UUID owner, String key, FilePolicy.Claim c) {
      return new SignedTicket(
          URI.create("https://synthetic.invalid/upload"), Instant.now().plusSeconds(600), Map.of());
    }

    public FilePolicy.Verified promoteAndVerify(
        UUID owner, String staging, String target, FilePolicy.Claim c) {
      byte[] data = bytes.get(staging);
      if (data == null) throw new StorageFailure(StorageFailure.Code.NOT_FOUND);
      try {
        FilePolicy.Verified verified = FilePolicy.verify(new ByteArrayInputStream(data), c);
        bytes.put(target, data.clone());
        return verified;
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    }

    public SignedTicket presignGet(UUID owner, String key, String name) {
      throw new UnsupportedOperationException();
    }

    public void download(UUID owner, String key, long expected, OutputStream out) {
      try {
        byte[] data = bytes.get(key);
        if (data == null) throw new StorageFailure(StorageFailure.Code.NOT_FOUND);
        out.write(data);
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    }

    public void delete(UUID owner, String key) {
      bytes.remove(key);
    }
  }
}
