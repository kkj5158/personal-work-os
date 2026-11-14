package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.*;

import com.kafka.backend.common.CurrentUserProvider;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

@Service
@Transactional
public class StudyService {
  final StudyWorkspaces spaces;
  final StudyWorkbooks books;
  final StudyRecords records;
  final StudyAssets assets;
  final CurrentUserProvider users;
  final Clock clock = Clock.systemUTC();

  public StudyService(
      StudyWorkspaces spaces,
      StudyWorkbooks books,
      StudyRecords records,
      StudyAssets assets,
      CurrentUserProvider users) {
    this.spaces = spaces;
    this.books = books;
    this.records = records;
    this.assets = assets;
    this.users = users;
  }

  UUID owner() {
    return users.getCurrentUserId();
  }

  StudyAssets assets() {
    return assets;
  }

  StudyWorkbooks books() {
    return books;
  }

  StudyRecords records() {
    return records;
  }

  StudyWorkspace lock() {
    return spaces.lock(owner()).orElseThrow(StudyException::missing);
  }

  StudyRecord record(String kind, String key) {
    return records
        .findByOwnerIdAndKindAndRecordKey(owner(), kind, key)
        .orElseThrow(StudyException::missing);
  }

  StudyWorkbook book(String id, int version) {
    return books
        .findByOwnerIdAndWorkbookIdAndWorkbookVersion(owner(), id, version)
        .orElseThrow(StudyException::missing);
  }

  StudyWorkbook book(JsonNode n) {
    return book(text(n, "workbookId", 180), positive(n, "workbookVersion"));
  }

  ObjectNode node(String json) {
    return (ObjectNode) JSON.readTree(json);
  }

  StudyRecord put(String kind, String key, JsonNode value, UUID workbook) {
    StudyRecord r =
        records.findByOwnerIdAndKindAndRecordKey(owner(), kind, key).orElseGet(StudyRecord::new);
    r.ownerId = owner();
    r.kind = kind;
    r.recordKey = key;
    r.payload = value.toString();
    r.workbookRow = workbook;
    return records.save(r);
  }

  void touch(StudyWorkspace w) {
    w.updatedAt = Instant.now(clock);
    spaces.saveAndFlush(w);
  }

  String digest(JsonNode n) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(n.toString().getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException();
    }
  }

  boolean replay(JsonNode request) {
    return replay(request, "commands");
  }

  boolean replay(JsonNode request, String scope) {
    String id = text(request, "operationId", 36);
    try {
      UUID.fromString(id);
    } catch (Exception e) {
      throw invalid();
    }
    var receipt = records.findByOwnerIdAndKindAndRecordKey(owner(), "RECEIPT", id);
    if (receipt.isEmpty()) return false;
    requireHash(receipt.get().payload, scopedDigest(request, scope));
    return true;
  }

  void requireHash(String a, String b) {
    if (!a.equals(b)) throw conflict();
  }

  String scopedDigest(JsonNode request, String scope) {
    return digest(JSON.createObjectNode().put("scope", scope).set("request", request));
  }

  void receipt(JsonNode request) {
    receipt(request, "commands");
  }

  void receipt(JsonNode request, String scope) {
    StudyRecord r = new StudyRecord();
    r.ownerId = owner();
    r.kind = "RECEIPT";
    r.recordKey = text(request, "operationId", 36);
    r.payload = scopedDigest(request, scope);
    records.save(r);
  }

  void revision(StudyWorkspace w, JsonNode request) {
    require(
        request.path("expectedRevision").isIntegralNumber()
            && request.path("expectedRevision").asDouble() >= 0
            && request.path("expectedRevision").asDouble() <= Long.MAX_VALUE
            && request.path("expectedRevision").asLong() >= 0);
    if (request.path("expectedRevision").asLong() != w.revision) throw conflict();
  }

  public ObjectNode snapshot() {
    // Initialization is idempotent under a DB uniqueness constraint; a rare first-load race retries
    // as 409.
    if (!spaces.existsById(owner())) {
      spaces.saveAndFlush(new StudyWorkspace(owner()));
      ObjectNode policy =
          JSON.createObjectNode()
              .put("version", 1)
              .put("format", "classic")
              .put("explanation", "standard")
              .put("effectiveWeek", week(clock))
              .put("scope", "ongoing")
              .put("reason", "수동 학습 기본 정책");
      put("POLICY", "1", policy, null);
    }
    StudyWorkspace w = lock();
    ObjectNode out = JSON.createObjectNode();
    out.put("revision", w.revision);
    out.put("ownerId", owner().toString());
    for (String name :
        List.of(
            "sources",
            "policies",
            "proposals",
            "feedback",
            "attempts",
            "roadmap",
            "batches",
            "packages")) out.putArray(name);
    ObjectNode drafts = out.putObject("drafts");
    Map<String, String> names =
        Map.of(
            "MATERIAL",
            "sources",
            "POLICY",
            "policies",
            "PROPOSAL",
            "proposals",
            "FEEDBACK",
            "feedback",
            "ATTEMPT",
            "attempts");
    ObjectNode automation =
        out.putObject("automation")
            .put("enabled", false)
            .put("timeLabel", "일요일 저녁 · Asia/Seoul")
            .put("connected", false);
    for (StudyRecord r : records.findByOwnerIdOrderByCreatedAtAsc(owner())) {
      if (names.containsKey(r.kind))
        ((ArrayNode) out.get(names.get(r.kind))).add(JSON.readTree(r.payload));
      else if (r.kind.equals("DRAFT")) drafts.set(r.recordKey, JSON.readTree(r.payload));
      else if (r.kind.equals("AUTOMATION"))
        automation.put("enabled", node(r.payload).path("enabled").asBoolean());
    }
    Map<String, ObjectNode> batches = new TreeMap<>();
    for (StudyWorkbook b : books.findByOwnerIdOrderByCreatedAtAsc(owner())) {
      ObjectNode p = publicBook(b);
      ((ArrayNode) out.get("packages")).add(p);
      String start =
          LocalDate.parse(p.path("date").asString())
              .with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
              .toString();
      ObjectNode batch =
          batches.computeIfAbsent(
              start,
              k -> {
                ObjectNode n =
                    JSON.createObjectNode()
                        .put("id", k)
                        .put("start", k)
                        .put("end", LocalDate.parse(k).plusDays(6).toString())
                        .put("status", "preview");
                n.putArray("packageIds");
                return n;
              });
      ArrayNode ids = (ArrayNode) batch.get("packageIds");
      boolean found = false;
      for (JsonNode v : ids) if (v.asString().equals(b.workbookId)) found = true;
      if (!found) ids.add(b.workbookId);
    }
    batches.values().forEach(n -> ((ArrayNode) out.get("batches")).add(n));
    out.put("currentWeek", week(clock));
    return out;
  }

  ObjectNode publicBook(StudyWorkbook b) {
    ObjectNode p = node(b.payload);
    p.put("status", b.published ? "published" : "preview");
    for (String kind : List.of("question", "answer")) {
      ObjectNode d =
          p.putObject(kind.equals("question") ? "questionPdf" : "answerExplanationPdf")
              .put("workbookId", b.workbookId)
              .put("workbookVersion", b.workbookVersion)
              .put("kind", kind)
              .put("state", "missing");
      for (StudyAsset a : assets.findByOwnerId(owner()))
        if (b.rowId.equals(a.workbookRow) && a.purpose.equals(kind) && a.state.equals("ATTACHED")) {
          d.put("state", "ready");
          d.put("assetId", a.id.toString());
          d.put("url", "/api/study/assets/" + a.id + "/content");
        }
    }
    return p;
  }

  public ObjectNode command(JsonNode request) {
    require(request.toString().length() <= 2000000);
    StudyWorkspace w = lock();
    if (replay(request)) return snapshot();
    revision(w, request);
    String action = text(request, "action", 40);
    JsonNode data = request.path("data");
    switch (action) {
      case "material.save" -> material(data);
      case "material.delete" -> {
        StudyRecord source = record("MATERIAL", text(data, "id", 180));
        for (StudyWorkbook b : books.findByOwnerIdOrderByCreatedAtAsc(owner()))
          for (String part : List.of("required", "extension"))
            for (JsonNode q : node(b.payload).path(part))
              if (q.path("source").path("materialId").asString().equals(source.recordKey))
                throw conflict();
        for (StudyAsset a : assets.findByOwnerId(owner()))
          if (source.id.equals(a.materialRow) && !a.state.equals("DELETED")) throw conflict();
        records.delete(source);
      }
      case "workbook.import" -> importBook(data);
      case "draft.save" -> draft(data);
      case "draft.discard" -> {
        StudyWorkbook b = book(data);
        String part = part(data);
        for (StudyRecord r : records.findByOwnerIdAndKind(owner(), "DRAFT"))
          if (b.rowId.equals(r.workbookRow)
              && node(r.payload).path("binding").path("part").asString().equals(part))
            records.delete(r);
      }
      case "attempt.submit" -> attempt(data);
      case "feedback.add" -> {
        String id = UUID.randomUUID().toString();
        put(
            "FEEDBACK",
            id,
            JSON.createObjectNode()
                .put("id", id)
                .put("text", text(data, "text", 4000).strip())
                .put("state", "pending_analysis")
                .put("createdAt", Instant.now(clock).toString()),
            null);
      }
      case "policy.propose" -> propose(data);
      case "policy.decide" -> decide(data);
      case "policy.rollback" -> {
        JsonNode old = node(record("POLICY", String.valueOf(positive(data, "version"))).payload);
        ObjectNode next = (ObjectNode) old.deepCopy();
        next.put("version", latestPolicy().path("version").asInt() + 1)
            .put("effectiveWeek", nextWeek(clock))
            .put("scope", "ongoing")
            .put("reason", "v" + data.path("version").asInt() + " 설정 복원 (새 버전)");
        next.remove("expiresWeek");
        put("POLICY", next.path("version").asString(), next, null);
      }
      case "automation.configure" -> {
        fields(data, "enabled");
        require(data.path("enabled").isBoolean());
        put("AUTOMATION", "settings", data, null);
      }
      default -> throw invalid();
    }
    receipt(request);
    touch(w);
    return snapshot();
  }

  void material(JsonNode data) {
    fields(
        data,
        "id",
        "title",
        "domain",
        "weight",
        "included",
        "scope",
        "status",
        "rights",
        "format",
        "progress",
        "active");
    String id = text(data, "id", 180);
    text(data, "title", 1000);
    text(data, "scope", 16000);
    text(data, "domain", 500);
    require(
        data.path("weight").isNumber()
            && data.path("weight").asDouble() >= 0
            && data.path("weight").asDouble() <= 100
            && data.path("included").isBoolean());
    if (data.has("rights")) text(data, "rights", 2000);
    if (data.has("format"))
      require(Set.of("pdf", "note", "book").contains(data.path("format").asString()));
    if (data.has("progress"))
      require(
          data.path("progress").isNumber()
              && data.path("progress").asDouble() >= 0
              && data.path("progress").asDouble() <= 100);
    if (data.has("active")) require(data.path("active").isBoolean());
    ObjectNode n = (ObjectNode) data.deepCopy();
    n.put("status", "metadata");
    StudyRecord old =
        records.findByOwnerIdAndKindAndRecordKey(owner(), "MATERIAL", id).orElse(null);
    n.put("version", old == null ? 1 : node(old.payload).path("version").asInt() + 1);
    put("MATERIAL", id, n, null);
    put("MATERIAL_VERSION", id + "/" + n.path("version").asInt(), n, null);
  }

  void importBook(JsonNode data) {
    fields(data, "workbook", "answerKeys");
    JsonNode pkg = data.path("workbook");
    Set<String> sources = new HashSet<>();
    records.findByOwnerIdAndKind(owner(), "MATERIAL").forEach(r -> sources.add(r.recordKey));
    Set<Integer> policies = new HashSet<>();
    records
        .findByOwnerIdAndKind(owner(), "POLICY")
        .forEach(r -> policies.add(node(r.payload).path("version").asInt()));
    workbook(pkg, data.path("answerKeys"), sources, policies);
    String id = text(pkg, "id", 180);
    int version = positive(pkg, "version");
    if (books.findByOwnerIdAndWorkbookIdAndWorkbookVersion(owner(), id, version).isPresent())
      throw conflict();
    int max =
        books.findByOwnerIdOrderByCreatedAtAsc(owner()).stream()
            .filter(b -> b.workbookId.equals(id))
            .mapToInt(b -> b.workbookVersion)
            .max()
            .orElse(0);
    require(version == max + 1);
    for (StudyWorkbook previous : books.findByOwnerIdOrderByCreatedAtAsc(owner())) {
      if (previous.workbookId.equals(id))
        require(previous.studyDate.toString().equals(pkg.path("date").asString()));
      else require(!previous.studyDate.toString().equals(pkg.path("date").asString()));
    }
    StudyWorkbook b = new StudyWorkbook();
    b.studyDate = LocalDate.parse(pkg.path("date").asString());
    b.ownerId = owner();
    b.workbookId = id;
    b.workbookVersion = version;
    b.payload = pkg.toString();
    b.answerKeys = data.path("answerKeys").toString();
    books.saveAndFlush(b);
  }

  void draft(JsonNode data) {
    fields(data, "binding", "response");
    JsonNode binding = data.path("binding");
    fields(binding, "workbookId", "workbookVersion", "part", "questionId", "questionVersion");
    StudyWorkbook b = book(binding);
    JsonNode q = question(node(b.payload), binding), r = data.path("response");
    String key = binding(binding);
    if (empty(q, r)) {
      records.findByOwnerIdAndKindAndRecordKey(owner(), "DRAFT", key).ifPresent(records::delete);
      return;
    }
    response(q, r);
    ObjectNode n = JSON.createObjectNode();
    n.set("binding", binding);
    n.set("response", r);
    n.put("updatedAt", Instant.now(clock).toString());
    put("DRAFT", key, n, b.rowId);
  }

  void attempt(JsonNode data) {
    fields(
        data,
        "workbookId",
        "workbookVersion",
        "part",
        "mode",
        "coverage",
        "responses",
        "attachments",
        "note");
    StudyWorkbook b = book(data);
    String part = part(data), mode = text(data, "mode", 20);
    require(Set.of("online", "handwritten").contains(mode));
    JsonNode pkg = node(b.payload),
        coverage = data.path("coverage"),
        responses = data.path("responses"),
        attachments = data.path("attachments");
    require(
        coverage.isArray()
            && !coverage.isEmpty()
            && coverage.size() <= 40
            && responses.isObject()
            && attachments.isArray());
    require(data.path("note").isString() && data.path("note").asString().length() <= 2000);
    Map<String, JsonNode> valid = new HashMap<>();
    pkg.path(part).forEach(q -> valid.put(binding(pkg, part, q), q));
    Set<String> seen = new HashSet<>();
    for (JsonNode key : coverage)
      require(key.isString() && valid.containsKey(key.asString()) && seen.add(key.asString()));
    ArrayNode attached = JSON.createArrayNode();
    if (mode.equals("online")) {
      require(attachments.isEmpty() && responses.size() == seen.size());
      for (String key : seen) response(valid.get(key), responses.path(key));
    } else {
      require(responses.isEmpty() && !attachments.isEmpty() && attachments.size() <= 10);
      Set<UUID> ids = new HashSet<>();
      int order = 0;
      for (JsonNode meta : attachments) {
        UUID id;
        try {
          id = UUID.fromString(text(meta, "id", 36));
        } catch (IllegalArgumentException e) {
          throw invalid();
        }
        require(ids.add(id));
        StudyAsset a = assets.findByOwnerIdAndId(owner(), id).orElseThrow(StudyException::missing);
        require(
            a.purpose.equals("handwritten")
                && b.rowId.equals(a.workbookRow)
                && Set.of("READY", "ATTACHED").contains(a.state));
        ObjectNode m = assetMetadata(a).put("order", order++);
        attached.add(m);
        a.state = "ATTACHED";
      }
    }
    String id = UUID.randomUUID().toString();
    ObjectNode n = (ObjectNode) data.deepCopy();
    n.set("attachments", attached);
    n.put("id", id)
        .put("createdAt", Instant.now(clock).toString())
        .put("simulated", false)
        .put("evaluation", "submitted_ungraded");
    put("ATTEMPT", id, n, b.rowId);
  }

  ObjectNode assetMetadata(StudyAsset a) {
    return JSON.createObjectNode()
        .put("id", a.id.toString())
        .put("name", a.displayName)
        .put("type", a.mime)
        .put("size", a.sizeBytes);
  }

  ObjectNode latestPolicy() {
    return records.findByOwnerIdAndKind(owner(), "POLICY").stream()
        .map(r -> node(r.payload))
        .max(Comparator.comparingInt(p -> p.path("version").asInt()))
        .orElseThrow(StudyException::missing);
  }

  void propose(JsonNode data) {
    fields(data, "change", "scope");
    String change = text(data, "change", 30);
    require(Set.of("format", "explanation").contains(change));
    String scope = data.has("scope") ? text(data, "scope", 30) : "ongoing";
    require(Set.of("this_week", "next_week_only", "ongoing").contains(scope));
    ObjectNode before = latestPolicy(), after = before.deepCopy();
    after
        .put("version", before.path("version").asInt() + 1)
        .put("effectiveWeek", scope.equals("this_week") ? week(clock) : nextWeek(clock))
        .put("scope", scope)
        .put("reason", "사용자가 선택한 수동 정책 제안 · AI 분석 없음");
    if (!scope.equals("ongoing"))
      after.put(
          "expiresWeek",
          LocalDate.parse(scope.equals("this_week") ? week(clock) : nextWeek(clock))
              .plusDays(7)
              .toString());
    else after.remove("expiresWeek");
    if (change.equals("format")) after.put("format", "case");
    else after.put("explanation", "intuitive");
    String id = UUID.randomUUID().toString();
    ObjectNode p = JSON.createObjectNode().put("id", id).put("status", "pending");
    p.set("before", before);
    p.set("after", after);
    put("PROPOSAL", id, p, null);
  }

  void decide(JsonNode data) {
    fields(data, "id", "approve");
    StudyRecord r = record("PROPOSAL", text(data, "id", 36));
    ObjectNode p = node(r.payload);
    require(data.path("approve").isBoolean());
    if (!p.path("status").asString().equals("pending")) throw conflict();
    p.put("status", data.path("approve").asBoolean() ? "approved" : "rejected");
    if (data.path("approve").asBoolean()) {
      ObjectNode before = (ObjectNode) p.get("before"),
          after = (ObjectNode) p.get("after"),
          latest = latestPolicy();
      if (!before.equals(latest)) throw conflict();
      after.put("version", latest.path("version").asInt() + 1);
      put("POLICY", after.path("version").asString(), after, null);
    }
    r.payload = p.toString();
  }

  public JsonNode review(String id, int version, String part) {
    require(Set.of("required", "extension").contains(part));
    StudyWorkspace w = lock();
    StudyWorkbook b = book(id, version);
    String event = UUID.randomUUID().toString();
    put(
        "REVIEW",
        event,
        JSON.createObjectNode().put("part", part).put("createdAt", Instant.now(clock).toString()),
        b.rowId);
    touch(w);
    ArrayNode result = JSON.createArrayNode();
    for (JsonNode k : JSON.readTree(b.answerKeys))
      if (k.path("binding").path("part").asString().equals(part)) result.add(k);
    return result;
  }

  boolean reviewed(UUID workbook) {
    return records.findByOwnerIdAndKind(owner(), "REVIEW").stream()
        .anyMatch(r -> workbook.equals(r.workbookRow));
  }
}
