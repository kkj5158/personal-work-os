package com.kafka.backend.log;

import static org.assertj.core.api.Assertions.*;

import com.kafka.backend.shareddesk.storage.*;
import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

@EnabledIfEnvironmentVariable(
    named = "LOG_TEST_DB",
    matches = "jdbc:postgresql://127\\.0\\.0\\.1:55453/postgres")
class LogPostgresTest {
  static final UUID OWNER = UUID.fromString("a1070000-0000-4000-8000-000000000001"),
      OTHER = UUID.fromString("a1070000-0000-4000-8000-000000000002");
  final ThreadLocal<UUID> current = ThreadLocal.withInitial(() -> OWNER);
  JdbcTemplate db;
  LogService s;
  TestObjects objects;
  String schema;
  DriverManagerDataSource source;

  @BeforeEach
  void setup() throws Exception {
    schema = "log_test_" + UUID.randomUUID().toString().replace("-", "");
    source = new DriverManagerDataSource(System.getenv("LOG_TEST_DB"), "log_test", "");
    db = new JdbcTemplate(source);
    db.execute("create schema " + schema);
    source.setUrl(System.getenv("LOG_TEST_DB") + "?currentSchema=" + schema + ",public");
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V108__log_v4.sql")));
    db.execute(
        Files.readString(
            Path.of("src/main/resources/db/migration/V114__log_multi_image_attachments.sql")));
    objects = new TestObjects();
    s =
        new LogService(
            db, current::get, new LogStorage(objects), new DataSourceTransactionManager(source));
  }

  @AfterEach
  void cleanup() {
    current.remove();
    if (db != null) db.execute("drop schema " + schema + " cascade");
  }

  Map<String, Object> profile(String handle) {
    return s.createProfile(
        Map.of("id", UUID.randomUUID(), "name", handle, "handle", handle, "bio", "line1\nline2"));
  }

  UUID id(Map<String, Object> r) {
    return (UUID) r.get("id");
  }

  Map<String, Object> post(UUID p, String text) {
    return s.createPost(p, Map.of("id", UUID.randomUUID(), "text", text));
  }

  void denied(Runnable call, int code) {
    assertThatThrownBy(call::run)
        .isInstanceOfSatisfying(LogException.class, e -> assertThat(e.status).isEqualTo(code));
  }

  @Test
  void emptyReadDoesNotSeedOrWrite() {
    assertThat((List<?>) s.state().get("profiles")).isEmpty();
    assertThat(db.queryForObject("select count(*) from log_workspaces", Integer.class)).isZero();
  }

  @Test
  void profilesAreUniqueWithinOwnerAndCaseInsensitive() {
    profile("Kafka");
    denied(() -> profile("kafka"), 409);
    current.set(OTHER);
    assertThat(profile("kafka")).containsEntry("handle", "kafka");
    assertThat((List<?>) s.state().get("profiles")).hasSize(1);
  }

  @Test
  void profileValidationAndFinalProfileDeletionPolicy() {
    var p = profile("first");
    denied(
        () ->
            s.updateProfile(
                id(p), Map.of("revision", 1, "name", "a", "handle", "<script>", "bio", "")),
        400);
    denied(() -> s.deleteProfile(id(p), Map.of("revision", 1, "confirm", true)), 409);
    var second = profile("second");
    s.deleteProfile(id(p), Map.of("revision", 1, "confirm", true));
    assertThat(s.state()).containsEntry("activeProfileId", id(second));
    denied(() -> s.activate(id(p)), 404);
  }

  @Test
  void allReadsAndWritesRejectOtherOwnerAndProfile() {
    UUID p = id(profile("one")), q = id(profile("two"));
    var record = post(p, "private");
    UUID post = id(record);
    UUID image = readyImage(p);
    var reply = s.createReply(p, post, Map.of("id", UUID.randomUUID(), "text", "reply"));
    for (UUID wrong : new UUID[] {q, UUID.randomUUID()}) {
      denied(() -> s.getPost(wrong, post), 404);
      denied(() -> s.updatePost(wrong, post, Map.of("revision", 1, "text", "attack")), 404);
      denied(
          () -> s.action(wrong, post, Map.of("revision", 1, "action", "liked", "value", true)),
          404);
      denied(() -> s.replies(wrong, post, 0), 404);
      denied(
          () ->
              s.updateReply(wrong, post, id(reply), Map.of("revision", 1, "text", "attack"), false),
          404);
      denied(() -> s.download(wrong, image), 404);
    }
    denied(
        () ->
            s.createPost(
                q, Map.of("id", UUID.randomUUID(), "text", "attack", "images", List.of(image))),
        404);
    denied(
        () -> s.saveDraft(q, Map.of("revision", 1, "text", "attack", "images", List.of(image))),
        404);
    current.set(OTHER);
    denied(() -> s.feed(p, "threads", "", 0, 30), 404);
    denied(() -> s.draft(p), 404);
    denied(
        () -> s.updateProfile(p, Map.of("revision", 1, "name", "attack", "handle", "attack")), 404);
    denied(() -> s.deleteProfile(p, Map.of("revision", 1, "confirm", true)), 404);
    denied(() -> s.download(p, image), 404);
    denied(() -> s.complete(p, image), 404);
    denied(() -> s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "attack")), 404);
  }

  @Test
  void idempotentCreationAndRevisionsPreventLostUpdates() {
    UUID p = id(profile("one")), pid = UUID.randomUUID();
    var b = Map.<String, Object>of("id", pid, "text", "original", "createdAt", 1600000000000L);
    s.createPost(p, b);
    s.createPost(p, b);
    assertThat(s.feed(p, "threads", "", 0, 30).get("total")).isEqualTo(1);
    var updated =
        s.updatePost(p, pid, Map.of("revision", 1, "text", "new\nline", "images", List.of()));
    assertThat(updated).containsEntry("revision", 2L).containsEntry("text", "new\nline");
    denied(() -> s.updatePost(p, pid, Map.of("revision", 1, "text", "lost")), 409);
    assertThat(s.getPost(p, pid)).containsEntry("text", "new\nline");
  }

  @Test
  void flagsSearchArchivePinAndPaginationPersist() {
    UUID p = id(profile("one"));
    UUID first = id(post(p, "first unique"));
    s.createReply(p, first, Map.of("id", UUID.randomUUID(), "text", "replyneedle"));
    for (int i = 0; i < 35; i++) post(p, "record " + i);
    var pinned = s.action(p, first, Map.of("revision", 1, "action", "pinned", "value", true));
    assertThat((List<?>) s.feed(p, "threads", "", 0, 30).get("posts")).hasSize(30);
    assertThat(s.feed(p, "threads", "", 0, 30)).containsEntry("nextOffset", 30);
    assertThat(
            ((List<Map<String, Object>>) s.feed(p, "threads", "", 0, 30).get("posts")).getFirst())
        .containsEntry("id", first);
    assertThat(s.feed(p, "threads", "replyneedle", 0, 30)).containsEntry("total", 1);
    assertThat(s.feed(p, "replies", "", 0, 30)).containsEntry("total", 1);
    s.action(
        p, first, Map.of("revision", pinned.get("revision"), "action", "archived", "value", true));
    assertThat(s.feed(p, "archive", "", 0, 30)).containsEntry("total", 1);
    assertThat(s.feed(p, "threads", "unique", 0, 30)).containsEntry("total", 0);
  }

  @Test
  void draftsAreProfileScopedAndPublicationIsAtomic() {
    UUID p = id(profile("one")), q = id(profile("two"));
    UUID image = readyImage(p);
    var draft = s.saveDraft(p, Map.of("revision", 1, "text", "draft", "images", List.of(image)));
    assertThat(s.draft(q)).containsEntry("text", "");
    denied(() -> s.saveDraft(p, Map.of("revision", 1, "text", "stale")), 409);
    UUID postId = UUID.randomUUID();
    denied(() -> s.createPost(p, Map.of("id", postId, "text", "attempt", "draftRevision", 1)), 409);
    assertThat(s.feed(p, "threads", "", 0, 30)).containsEntry("total", 0);
    s.createPost(
        p,
        Map.of(
            "id",
            postId,
            "text",
            "draft",
            "images",
            List.of(image),
            "draftRevision",
            draft.get("revision")));
    assertThat(s.draft(p)).containsEntry("text", "").containsEntry("images", List.of());
    assertThat(s.getPost(p, postId)).containsEntry("images", List.of(image));
  }

  @Test
  void repliesHaveIndependentVersionsAndDates() {
    UUID p = id(profile("one")), post = id(post(p, "record")), rid = UUID.randomUUID();
    Map<String, Object> b = Map.of("id", rid, "text", "old", "createdAt", 1600000000000L);
    var r = s.createReply(p, post, b);
    s.createReply(p, post, b);
    assertThat(s.getPost(p, post)).containsEntry("replyCount", 1);
    var edited =
        s.updateReply(p, post, rid, Map.of("revision", r.get("revision"), "text", "edited"), false);
    assertThat(edited).containsEntry("text", "edited").containsEntry("createdAt", 1600000000000L);
    denied(() -> s.updateReply(p, post, rid, Map.of("revision", 1, "text", "bad"), false), 409);
    s.updateReply(p, post, rid, Map.of("revision", edited.get("revision"), "confirm", true), true);
    assertThat(s.getPost(p, post)).containsEntry("replyCount", 0);
  }

  @Test
  void attachmentCountOrderingRetentionAndPrivateBytes() {
    UUID p = id(profile("one"));
    List<UUID> images = new ArrayList<>();
    for (int i = 0; i < 21; i++) images.add(readyImage(p));
    denied(
        () -> s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "", "images", images)), 400);
    var posted =
        s.createPost(
            p, Map.of("id", UUID.randomUUID(), "text", "photos", "images", images.subList(0, 20)));
    var reversed = new ArrayList<>(images.subList(0, 20));
    Collections.reverse(reversed);
    s.updatePost(
        p, id(posted), Map.of("revision", 1, "text", "text only edit", "images", reversed));
    assertThat(s.getPost(p, id(posted))).containsEntry("images", reversed);
    assertThat(s.download(p, images.getFirst()).bytes()).isEqualTo(TestObjects.PNG);
    assertThat(s.feed(p, "media", "", 0, 30)).containsEntry("total", 1);
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(ints = {0, 1, 2, 3, 4, 20})
  void batchesPersistThroughDraftPublishEditAndIdempotentCreate(int count) {
    UUID p = id(profile("batch"));
    var images = new ArrayList<UUID>();
    for (int i = 0; i < count; i++) images.add(readyImage(p));
    var saved =
        s.saveDraft(p, Map.of("revision", 1, "text", count == 0 ? "text" : "", "images", images));
    assertThat(s.draft(p)).containsEntry("images", images);
    UUID postId = UUID.randomUUID();
    var body =
        Map.<String, Object>of(
            "id",
            postId,
            "text",
            count == 0 ? "text" : "",
            "images",
            images,
            "draftRevision",
            saved.get("revision"));
    var created = s.createPost(p, body);
    assertThat(created).containsEntry("images", images);
    assertThat(s.createPost(p, body)).containsEntry("images", images);
    assertThat(s.feed(p, "threads", "", 0, 30)).containsEntry("total", 1);
    assertThat(s.draft(p)).containsEntry("images", List.of());
    var reordered = new ArrayList<>(images);
    Collections.reverse(reordered);
    if (count > 0) reordered.removeLast();
    s.updatePost(p, postId, Map.of("revision", 1, "text", "edited", "images", reordered));
    assertThat(s.getPost(p, postId)).containsEntry("images", reordered);
    denied(
        () -> s.updatePost(p, postId, Map.of("revision", 1, "text", "stale", "images", images)),
        409);
    assertThat(s.getPost(p, postId))
        .containsEntry("images", reordered)
        .containsEntry("text", "edited");
  }

  @Test
  void configuredCapAndDuplicateListsFailAtomically() {
    UUID p = id(profile("limited"));
    UUID first = readyImage(p), second = readyImage(p);
    s.configuredMaxImagesPerPost = 1;
    assertThat(s.state())
        .containsEntry("maxImagesPerPost", 1)
        .containsEntry("maxImageBytes", 18L * 1024 * 1024);
    denied(
        () -> s.createPost(p, Map.of("id", UUID.randomUUID(), "images", List.of(first, second))),
        400);
    denied(() -> s.saveDraft(p, Map.of("revision", 1, "images", List.of(first, second))), 400);
    var post = s.createPost(p, Map.of("id", UUID.randomUUID(), "images", List.of(first)));
    denied(
        () -> s.updatePost(p, id(post), Map.of("revision", 1, "images", List.of(first, second))),
        400);
    assertThat(s.getPost(p, id(post)))
        .containsEntry("images", List.of(first))
        .containsEntry("revision", 1L);
    s.configuredMaxImagesPerPost = 20;
    denied(() -> s.saveDraft(p, Map.of("revision", 1, "images", List.of(first, first))), 400);
    assertThat(s.draft(p)).containsEntry("images", List.of()).containsEntry("revision", 1L);
  }

  @Test
  void textOnlyLegacyEditPreservesImagesAndEquivalentEditRetryDoesNotDuplicateRevision() {
    UUID p = id(profile("legacy")), image = readyImage(p);
    var post =
        s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "old", "images", List.of(image)));
    var body = Map.<String, Object>of("revision", 1, "text", "new");
    assertThat(s.updatePost(p, id(post), body))
        .containsEntry("images", List.of(image))
        .containsEntry("revision", 2L);
    assertThat(s.updatePost(p, id(post), body))
        .containsEntry("images", List.of(image))
        .containsEntry("revision", 2L);
    assertThat(s.getPost(p, id(post)))
        .containsEntry("images", List.of(image))
        .containsEntry("text", "new");
  }

  Map<String, Object> claim(UUID id, byte[] bytes) throws Exception {
    return Map.of(
        "id",
        id,
        "name",
        "photo.png",
        "mime",
        "image/png",
        "sizeBytes",
        bytes.length,
        "sha256",
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
  }

  @Test
  void uploadReservationRetriesReuseObjectsAndCannotChangeClaimOrScope() throws Exception {
    UUID p = id(profile("retry")), q = id(profile("other")), image = UUID.randomUUID();
    var claim = claim(image, TestObjects.PNG);
    s.ticket(p, claim);
    var original = s.image(OWNER, p, image);
    s.ticket(p, claim);
    assertThat(s.image(OWNER, p, image)).containsEntry("staging_key", original.get("staging_key"));
    assertThat(db.queryForObject("select count(*) from log_images", Integer.class)).isEqualTo(1);
    var changed = new HashMap<>(claim);
    changed.put("sha256", "0".repeat(64));
    denied(() -> s.ticket(p, changed), 409);
    denied(() -> s.ticket(q, claim), 404);
    objects.bytes.put(original.get("staging_key").toString(), TestObjects.PNG);
    s.complete(p, image);
    assertThat(s.complete(p, image)).containsEntry("ready", true);
    assertThat(s.ticket(p, claim)).containsEntry("ready", true);
    s.upload(p, image, TestObjects.PNG);
    assertThatThrownBy(() -> s.upload(p, image, new byte[TestObjects.PNG.length]))
        .isInstanceOf(StorageFailure.class);
    assertThat(s.download(p, image).bytes()).isEqualTo(TestObjects.PNG);
    current.set(OTHER);
    denied(() -> s.ticket(p, claim), 404);
  }

  @Test
  void corruptImageNeverBecomesReadyOrVisibleAndReservationExpiresSafely() throws Exception {
    UUID p = id(profile("corrupt")), image = UUID.randomUUID();
    byte[] broken = Arrays.copyOf(TestObjects.PNG, TestObjects.PNG.length - 12);
    var claim = claim(image, broken);
    s.ticket(p, claim);
    var row = s.image(OWNER, p, image);
    objects.bytes.put(row.get("staging_key").toString(), broken);
    denied(() -> s.complete(p, image), 422);
    denied(() -> s.createPost(p, Map.of("id", UUID.randomUUID(), "images", List.of(image))), 404);
    denied(() -> s.download(p, image), 404);
    assertThat(s.feed(p, "threads", "", 0, 30)).containsEntry("total", 0);
    db.update(
        "update log_images set created_at=current_timestamp-interval '11 minutes' where id=?",
        image);
    denied(() -> s.ticket(p, claim), 410);
    denied(() -> s.complete(p, image), 410);
  }

  @Test
  void cleanupRetainsAnAssetReusedByAnotherPostAndDraft() {
    UUID p = id(profile("shared")), image = readyImage(p);
    var first = s.createPost(p, Map.of("id", UUID.randomUUID(), "images", List.of(image)));
    var second = s.createPost(p, Map.of("id", UUID.randomUUID(), "images", List.of(image)));
    db.update(
        "update log_images set created_at=current_timestamp-interval '2 days' where id=?", image);
    s.deletePost(p, id(first), Map.of("revision", 1, "confirm", true));
    new LogMaintenance(s).cleanup();
    assertThat(s.download(p, image).bytes()).isEqualTo(TestObjects.PNG);
    s.saveDraft(p, Map.of("revision", 1, "images", List.of(image)));
    s.deletePost(p, id(second), Map.of("revision", 1, "confirm", true));
    new LogMaintenance(s).cleanup();
    assertThat(s.download(p, image).bytes()).isEqualTo(TestObjects.PNG);
  }

  @Test
  void invalidMediaAndPayloadsFailBeforeStorage() {
    UUID p = id(profile("one"));
    denied(
        () ->
            s.ticket(
                p,
                Map.of(
                    "id",
                    UUID.randomUUID(),
                    "name",
                    "payload.svg",
                    "mime",
                    "image/svg+xml",
                    "sizeBytes",
                    100,
                    "sha256",
                    "0".repeat(64))),
        400);
    denied(
        () ->
            s.ticket(
                p,
                Map.of(
                    "id",
                    UUID.randomUUID(),
                    "name",
                    "x.png",
                    "mime",
                    "image/png",
                    "sizeBytes",
                    19000000,
                    "sha256",
                    "0".repeat(64))),
        413);
    denied(() -> s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "a".repeat(50001))), 400);
    denied(() -> s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "")), 400);
    denied(() -> s.feed(p, "threads", "", 0, 51), 400);
  }

  @Test
  void cleanupOnlyDeletesExpiredUnreferencedLogObjects() {
    UUID p = id(profile("one"));
    UUID kept = readyImage(p), orphan = readyImage(p);
    postWithImage(p, kept);
    db.update(
        "update log_images set created_at=current_timestamp-interval '2 days' where owner_id=?",
        OWNER);
    new LogMaintenance(s).cleanup();
    assertThat(s.download(p, kept).bytes()).isEqualTo(TestObjects.PNG);
    denied(() -> s.download(p, orphan), 404);
    assertThat(objects.deleted).noneMatch(key -> key.contains("shared-desk"));
  }

  @Test
  void concurrentEditHasExactlyOneWinner() throws Exception {
    UUID p = id(profile("one")), id = id(post(p, "base"));
    try (var executor = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> edit =
          () -> {
            try {
              s.updatePost(p, id, Map.of("revision", 1, "text", Thread.currentThread().getName()));
              return true;
            } catch (LogException conflict) {
              assertThat(conflict.status).isEqualTo(409);
              return false;
            }
          };
      var futures = executor.invokeAll(List.of(edit, edit));
      assertThat(
              futures.stream()
                  .filter(f -> {
                    try {
                      return f.get();
                    } catch (Exception e) {
                      throw new RuntimeException(e);
                    }
                  })
                  .count())
          .isEqualTo(1);
    }
  }

  @Test
  void foreignKeysRejectDirectCrossProfileAttachments() {
    UUID p = id(profile("one")),
        q = id(profile("two")),
        image = readyImage(p),
        post = id(post(q, "safe"));
    assertThatThrownBy(() ->
            db.update(
                "insert into log_post_images(owner_id,profile_id,post_id,image_id,position)"
                    + " values(?,?,?,?,0)",
                OWNER,
                q,
                post,
                image))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  }

  @Test
  void importedPostDiscussionFlagsAndDatesAreAtomicAndIdempotent() {
    UUID p = id(profile("one")), post = UUID.randomUUID(), reply = UUID.randomUUID();
    var body =
        new HashMap<String, Object>(
            Map.of(
                "id",
                post,
                "text",
                "imported",
                "legacyKey",
                "legacy-post",
                "createdAt",
                1600000000000L,
                "updatedAt",
                1600000100000L,
                "liked",
                true,
                "archived",
                true,
                "repostedAt",
                1600000200000L,
                "replies",
                List.of(Map.of("id", reply, "text", "child", "createdAt", 1600000300000L))));
    s.createPost(p, body);
    body.put("text", "must not replace");
    s.createPost(p, body);
    assertThat(s.getPost(p, post))
        .containsEntry("text", "imported")
        .containsEntry("liked", true)
        .containsEntry("archived", true)
        .containsEntry("replyCount", 1)
        .containsEntry("createdAt", 1600000000000L)
        .containsEntry("updatedAt", 1600000100000L);
    UUID invalid = UUID.randomUUID();
    body.put("id", invalid);
    body.put("legacyKey", "legacy-invalid");
    body.put("replies", List.of(Map.of("id", UUID.randomUUID(), "text", "")));
    denied(() -> s.createPost(p, body), 400);
    denied(() -> s.getPost(p, invalid), 404);
  }

  @Test
  void replyFeedUsesReplyChronologyAndOwnerBoundary() {
    UUID p = id(profile("one")), post = id(post(p, "post"));
    s.createReply(
        p, post, Map.of("id", UUID.randomUUID(), "text", "older", "createdAt", 1600000000000L));
    s.createReply(
        p, post, Map.of("id", UUID.randomUUID(), "text", "newer", "createdAt", 1600000300000L));
    var feed = s.replyFeed(p, 0, 1);
    assertThat(feed).containsEntry("nextOffset", 1).containsEntry("total", 2);
    var entries = (List<Map<String, Object>>) feed.get("replyEntries");
    assertThat((Map<String, Object>) entries.getFirst().get("reply"))
        .containsEntry("text", "newer");
    current.set(OTHER);
    denied(() -> s.replyFeed(p, 0, 30), 404);
  }

  @Test
  void rawUploadRevalidatesBytesAndOwnerBeforeProvider() {
    UUID p = id(profile("one")), id = UUID.randomUUID();
    try {
      String hash =
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(TestObjects.PNG));
      s.ticket(
          p,
          Map.of(
              "id",
              id,
              "name",
              "photo.png",
              "sizeBytes",
              TestObjects.PNG.length,
              "sha256",
              hash,
              "mime",
              "image/png"));
      assertThatThrownBy(() -> s.upload(p, id, "bad bytes".getBytes()))
          .isInstanceOf(StorageFailure.class);
      current.set(OTHER);
      denied(() -> s.upload(p, id, TestObjects.PNG), 404);
    } catch (java.security.NoSuchAlgorithmException impossible) {
      throw new RuntimeException(impossible);
    }
  }

  @Test
  void migrationIsAdditiveAtomicAndFlywayValidated() throws Exception {
    String other = "log_upgrade_" + UUID.randomUUID().toString().replace("-", "");
    db.execute("create schema " + other);
    String url = System.getenv("LOG_TEST_DB") + "?currentSchema=" + other + ",public";
    Path dir = Files.createTempDirectory("log-v107-");
    String sql = Files.readString(Path.of("src/main/resources/db/migration/V108__log_v4.sql"));
    Files.writeString(dir.resolve("V108__log_v4.sql"), sql);
    try (var c = DriverManager.getConnection(url, "log_test", "");
        var statement = c.createStatement()) {
      statement.execute(
          "create table sentinel(id int primary key,body text);insert into sentinel"
              + " values(1,'preserved')");
      c.setAutoCommit(false);
      assertThatThrownBy(() -> statement.execute(sql + ";select 1/0"))
          .isInstanceOf(SQLException.class);
      c.rollback();
      c.setAutoCommit(true);
      var flyway =
          Flyway.configure()
              .dataSource(url, "log_test", "")
              .defaultSchema(other)
              .schemas(other)
              .locations("filesystem:" + dir.toString().replace('\\', '/'))
              .baselineOnMigrate(true)
              .baselineVersion("106")
              .cleanDisabled(true)
              .load();
      assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
      UUID upgradeOwner = UUID.randomUUID(),
          upgradeProfile = UUID.randomUUID(),
          upgradePost = UUID.randomUUID();
      statement.execute(
          "insert into log_workspaces(owner_id) values('"
              + upgradeOwner
              + "');"
              + "insert into log_profiles(id,owner_id,name,handle) values('"
              + upgradeProfile
              + "','"
              + upgradeOwner
              + "','existing','existing');"
              + "insert into log_drafts(owner_id,profile_id,text) values('"
              + upgradeOwner
              + "','"
              + upgradeProfile
              + "','draft preserved');"
              + "insert into log_posts(id,owner_id,profile_id,text) values('"
              + upgradePost
              + "','"
              + upgradeOwner
              + "','"
              + upgradeProfile
              + "','post preserved')");
      for (int i = 0; i < 4; i++) {
        UUID image = UUID.randomUUID();
        statement.execute(
            "insert into"
                + " log_images(id,owner_id,profile_id,display_name,size_bytes,sha256,mime,staging_key,final_key,state)"
                + " values('"
                + image
                + "','"
                + upgradeOwner
                + "','"
                + upgradeProfile
                + "','old.png',1,'"
                + "0".repeat(64)
                + "','image/png','s','f','READY');insert into"
                + " log_post_images(owner_id,profile_id,post_id,image_id,position) values('"
                + upgradeOwner
                + "','"
                + upgradeProfile
                + "','"
                + upgradePost
                + "','"
                + image
                + "',"
                + i
                + ");"
                + "insert into log_draft_images(owner_id,profile_id,image_id,position) values('"
                + upgradeOwner
                + "','"
                + upgradeProfile
                + "','"
                + image
                + "',"
                + i
                + ")");
      }
      Files.copy(
          Path.of("src/main/resources/db/migration/V114__log_multi_image_attachments.sql"),
          dir.resolve("V114__log_multi_image_attachments.sql"));
      assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
      flyway.validate();
      assertThat(flyway.migrate().migrationsExecuted).isZero();
      try (var r =
          statement.executeQuery(
              "select text,(select count(*) from log_post_images) n,(select count(*) from"
                  + " log_draft_images) d from log_posts")) {
        r.next();
        assertThat(r.getString("text")).isEqualTo("post preserved");
        assertThat(r.getInt("n")).isEqualTo(4);
        assertThat(r.getInt("d")).isEqualTo(4);
      }
      try (var r = statement.executeQuery("select body from sentinel where id=1")) {
        r.next();
        assertThat(r.getString(1)).isEqualTo("preserved");
      }
    } finally {
      db.execute("drop schema " + other + " cascade");
      Files.deleteIfExists(dir.resolve("V108__log_v4.sql"));
      Files.deleteIfExists(dir.resolve("V114__log_multi_image_attachments.sql"));
      Files.deleteIfExists(dir);
    }
  }

  void postWithImage(UUID p, UUID image) {
    s.createPost(p, Map.of("id", UUID.randomUUID(), "text", "kept", "images", List.of(image)));
  }

  UUID readyImage(UUID p) {
    try {
      UUID id = UUID.randomUUID();
      String hash =
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(TestObjects.PNG));
      s.ticket(
          p,
          Map.of(
              "id",
              id,
              "name",
              "photo.png",
              "sizeBytes",
              TestObjects.PNG.length,
              "sha256",
              hash,
              "mime",
              "image/png"));
      var row = s.image(OWNER, p, id);
      objects.bytes.put(row.get("staging_key").toString(), TestObjects.PNG);
      s.complete(p, id);
      return id;
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  static class TestObjects implements ObjectStorage {
    static final byte[] PNG =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=");
    final Map<String, byte[]> bytes = new ConcurrentHashMap<>();
    final Set<String> deleted = ConcurrentHashMap.newKeySet();

    public boolean enabled() {
      return true;
    }

    public String newStagingKey(UUID o) {
      return "log/test/" + o + "/staging/" + UUID.randomUUID();
    }

    public String newFinalKey(UUID o) {
      return "log/test/" + o + "/final/" + UUID.randomUUID();
    }

    public SignedTicket presignPut(UUID o, String key, FilePolicy.Claim c) {
      return new SignedTicket(
          URI.create("https://example.invalid"), Instant.now().plusSeconds(600), Map.of());
    }

    public FilePolicy.Verified promoteAndVerify(
        UUID o, String staging, String key, FilePolicy.Claim c) {
      try {
        var data = bytes.get(staging);
        var verified = FilePolicy.verify(new ByteArrayInputStream(data), c);
        bytes.put(key, data);
        return verified;
      } catch (IOException e) {
        throw new RuntimeException(e);
      }
    }

    public SignedTicket presignGet(UUID o, String key, String name) {
      throw new UnsupportedOperationException();
    }

    public void download(UUID o, String key, long size, OutputStream destination) {
      try {
        destination.write(bytes.get(key));
      } catch (IOException e) {
        throw new RuntimeException(e);
      }
    }

    public void delete(UUID o, String key) {
      bytes.remove(key);
      deleted.add(key);
    }
  }
}
