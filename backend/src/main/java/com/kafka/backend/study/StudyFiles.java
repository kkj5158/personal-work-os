package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.*;

import com.kafka.backend.shareddesk.storage.*;
import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

@Service
@Transactional
public class StudyFiles {
  final StudyService study;
  final ObjectStorage storage;
  final boolean enabled;
  final long materialLimit;

  @org.springframework.beans.factory.annotation.Autowired
  public StudyFiles(
      StudyService study,
      StudyStorage storage,
      @Value("${STUDY_STORAGE_ENABLED:false}") boolean enabled,
      @Value("${STUDY_MATERIAL_MAX_BYTES:104857600}") long materialLimit) {
    this(study, storage.objects, enabled, materialLimit);
  }

  StudyFiles(StudyService study, ObjectStorage storage, boolean enabled, long materialLimit) {
    this.study = study;
    this.storage = storage;
    this.enabled = enabled;
    this.materialLimit = Math.min(FilePolicy.MAX_BYTES, Math.max(1, materialLimit));
  }

  boolean available() {
    return enabled && storage.enabled();
  }

  public Map<String, Object> capabilities() {
    return Map.of(
        "storage",
        available() ? "connected" : "BLOCKED",
        "handwrittenMaxFiles",
        10,
        "handwrittenMaxBytes",
        20971520,
        "materialMaxBytes",
        materialLimit,
        "ai",
        false,
        "ocr",
        false,
        "pdfGeneration",
        false,
        "scheduler",
        false,
        "email",
        false,
        "scan",
        "format_screening_only");
  }

  void connected() {
    if (!available())
      throw new StudyException(
          503, "STORAGE_BLOCKED", "승인된 비공개 파일 저장소 연결이 필요합니다. 업로드는 실행되지 않았습니다.");
  }

  StudyAsset asset(UUID id) {
    return study
        .assets()
        .findByOwnerIdAndId(study.owner(), id)
        .orElseThrow(StudyException::missing);
  }

  FilePolicy.Claim claim(StudyAsset a) {
    return new FilePolicy.Claim(a.displayName, a.sizeBytes, a.sha256, a.mime);
  }

  ObjectNode status(StudyAsset a) {
    return study.assetMetadata(a).put("state", a.state).put("purpose", a.purpose);
  }

  public ObjectNode create(JsonNode request) {
    connected();
    var w = study.lock();
    boolean replay = study.replay(request, "assets.create");
    UUID id = UUID.fromString(text(request, "operationId", 36));
    if (replay) {
      StudyAsset previous = asset(id);
      require(previous.state.equals("UPLOADING") && previous.expiresAt.isAfter(Instant.now()));
      previous.expiresAt = Instant.now().plusSeconds(600);
      return ticket(previous);
    }
    study.revision(w, request);
    JsonNode d = request.path("data");
    fields(
        d,
        "purpose",
        "workbookId",
        "workbookVersion",
        "materialId",
        "name",
        "size",
        "type",
        "sha256");
    String purpose = text(d, "purpose", 20);
    require(Set.of("material", "handwritten", "question", "answer").contains(purpose));
    require(d.path("size").isIntegralNumber() && d.path("size").asDouble() >= 1);
    if (d.path("size").asDouble() > (purpose.equals("handwritten") ? 20971520 : materialLimit))
      throw new StudyException(413, "FILE_TOO_LARGE", "파일 크기 제한을 초과했습니다.");
    FilePolicy.Claim c =
        new FilePolicy.Claim(
            text(d, "name", 180),
            d.path("size").asLong(),
            text(d, "sha256", 64),
            text(d, "type", 80));
    require(
        (purpose.equals("handwritten")
                ? Set.of("application/pdf", "image/jpeg", "image/png")
                : Set.of("application/pdf"))
            .contains(c.claimedMime()));
    if (c.sizeBytes() > (purpose.equals("handwritten") ? 20971520 : materialLimit))
      throw new StudyException(413, "FILE_TOO_LARGE", "파일 크기 제한을 초과했습니다.");
    var owned = study.assets().findByOwnerId(study.owner());
    long reserved =
        owned.stream().filter(a -> !a.state.equals("DELETED")).mapToLong(a -> a.sizeBytes).sum();
    if (reserved + c.sizeBytes() > 1024L * 1024 * 1024)
      throw new StudyException(413, "QUOTA_EXCEEDED", "학습 저장 공간 1GiB 제한을 초과했습니다.");
    if (owned.stream().filter(a -> a.state.equals("UPLOADING")).count() >= 10)
      throw new StudyException(429, "UPLOAD_LIMIT", "미완료 업로드를 정리한 뒤 다시 시도하세요.");
    StudyAsset a = new StudyAsset();
    a.id = id;
    a.ownerId = study.owner();
    a.purpose = purpose;
    if (purpose.equals("material"))
      a.materialRow = study.record("MATERIAL", text(d, "materialId", 180)).id;
    else {
      StudyWorkbook book = study.book(d);
      if (!purpose.equals("handwritten")) require(!book.published);
      a.workbookRow = book.rowId;
    }
    a.displayName = c.displayName();
    a.sizeBytes = c.sizeBytes();
    a.mime = c.claimedMime();
    a.sha256 = c.sha256();
    a.stagingKey = storage.newStagingKey(a.ownerId);
    a.finalKey = storage.newFinalKey(a.ownerId);
    a.state = "UPLOADING";
    a.expiresAt = Instant.now().plusSeconds(600);
    study.assets().saveAndFlush(a);
    ObjectNode result = ticket(a);
    study.receipt(request, "assets.create");
    study.touch(w);
    return result;
  }

  ObjectNode ticket(StudyAsset a) {
    var ticket = storage.presignPut(a.ownerId, a.stagingKey, claim(a));
    ObjectNode n = status(a);
    n.put("url", ticket.url().toString()).put("expiresAt", a.expiresAt.toString());
    n.set("headers", JSON.valueToTree(ticket.requiredHeaders()));
    return n;
  }

  public ObjectNode complete(UUID id, JsonNode request) {
    connected();
    var w = study.lock();
    StudyAsset a = asset(id);
    if (study.replay(request, "assets.complete/" + id)
        || Set.of("READY", "ATTACHED").contains(a.state)) return status(a);
    study.revision(w, request);
    require(a.state.equals("UPLOADING") && a.expiresAt.isAfter(Instant.now()));
    Path tmp = null;
    try {
      storage.promoteAndVerify(a.ownerId, a.stagingKey, a.finalKey, claim(a));
      tmp = Files.createTempFile("study-verify-", ".bin");
      try (var out = Files.newOutputStream(tmp)) {
        storage.download(a.ownerId, a.finalKey, a.sizeBytes, out);
      }
      StudyWorkbook b =
          a.workbookRow == null
              ? null
              : study.books().findById(a.workbookRow).orElseThrow(StudyException::missing);
      StudyFileValidation.inspect(tmp, a, b);
      a.state = "READY";
    } catch (Exception invalid) {
      a.state = "FAILED";
    } finally {
      if (tmp != null)
        try {
          Files.deleteIfExists(tmp);
        } catch (IOException ignored) {
          /* ephemeral system temp, no path exposed */
        }
    }
    study.receipt(request, "assets.complete/" + id);
    study.touch(w);
    return status(a);
  }

  public ObjectNode publish(String id, int version, JsonNode request) {
    connected();
    var w = study.lock();
    if (study.replay(request, "publish/" + id + "/" + version)) return study.snapshot();
    study.revision(w, request);
    StudyWorkbook b = study.book(id, version);
    if (b.published) throw conflict();
    JsonNode d = request.path("data");
    fields(d, "questionAssetId", "answerAssetId");
    List<StudyAsset> pair = new ArrayList<>();
    for (String kind : List.of("question", "answer")) {
      StudyAsset a = asset(uuid(d, kind + "AssetId"));
      require(a.purpose.equals(kind) && b.rowId.equals(a.workbookRow) && a.state.equals("READY"));
      // Re-read the exact immutable verified bytes immediately before atomically publishing.
      Path tmp = null;
      try {
        tmp = Files.createTempFile("study-publish-", ".bin");
        try (var output = Files.newOutputStream(tmp)) {
          storage.download(a.ownerId, a.finalKey, a.sizeBytes, output);
        }
        StudyFileValidation.inspect(tmp, a, b);
      } catch (Exception e) {
        throw new StudyException(
            422, "INVALID_DOCUMENT_PAIR", "같은 버전의 실제 문제·해설 PDF 쌍을 확인할 수 없습니다.");
      } finally {
        if (tmp != null)
          try {
            Files.deleteIfExists(tmp);
          } catch (IOException ignored) {
          }
      }
      pair.add(a);
    }
    pair.forEach(a -> a.state = "ATTACHED");
    b.published = true;
    study.receipt(request, "publish/" + id + "/" + version);
    study.touch(w);
    return study.snapshot();
  }

  static UUID uuid(JsonNode d, String key) {
    try {
      return UUID.fromString(text(d, key, 36));
    } catch (IllegalArgumentException e) {
      throw invalid();
    }
  }

  public ObjectNode remove(UUID id, JsonNode request) {
    connected();
    var w = study.lock();
    StudyAsset a = asset(id);
    if (study.replay(request, "assets.remove/" + id)) return status(a);
    study.revision(w, request);
    require(!a.state.equals("ATTACHED"));
    if (a.state.equals("UPLOADING") && a.expiresAt.plusSeconds(60).isAfter(Instant.now()))
      throw new StudyException(409, "UPLOAD_TICKET_ACTIVE", "업로드 URL 만료 후 원본을 정리할 수 있습니다.");
    storage.delete(a.ownerId, a.stagingKey);
    storage.delete(a.ownerId, a.finalKey);
    a.state = "DELETED";
    study.receipt(request, "assets.remove/" + id);
    study.touch(w);
    return status(a);
  }

  public Map<String, Object> reconcile() {
    connected();
    var w = study.lock();
    int count = 0;
    for (StudyAsset a : study.assets().findByOwnerId(study.owner()))
      if (!Set.of("ATTACHED", "READY", "DELETED").contains(a.state)
          && a.expiresAt.plusSeconds(60).isBefore(Instant.now())) {
        storage.delete(a.ownerId, a.stagingKey);
        storage.delete(a.ownerId, a.finalKey);
        a.state = "DELETED";
        count++;
      } else if (a.state.equals("READY") || a.state.equals("ATTACHED")) {
        if (a.expiresAt.plusSeconds(60).isBefore(Instant.now()))
          storage.delete(a.ownerId, a.stagingKey);
      }
    study.touch(w);
    return Map.of("removed", count);
  }

  public List<ObjectNode> list() {
    return study.assets().findByOwnerId(study.owner()).stream()
        .filter(a -> !a.state.equals("DELETED"))
        .map(
            a -> {
              ObjectNode n = status(a);
              if (a.materialRow != null)
                n.put(
                    "materialId", study.records().findById(a.materialRow).orElseThrow().recordKey);
              if (a.workbookRow != null) {
                StudyWorkbook b = study.books().findById(a.workbookRow).orElseThrow();
                n.put("workbookId", b.workbookId).put("workbookVersion", b.workbookVersion);
              }
              return n;
            })
        .toList();
  }

  StudyAsset readable(UUID id) {
    connected();
    StudyAsset a = asset(id);
    require(Set.of("READY", "ATTACHED").contains(a.state));
    if (a.purpose.equals("answer") && !study.reviewed(a.workbookRow))
      throw new StudyException(403, "REVIEW_REQUIRED", "명시적으로 정답·해설을 연 뒤 접근할 수 있습니다.");
    return a;
  }

  public void download(UUID id, OutputStream output) {
    StudyAsset a = readable(id);
    storage.download(a.ownerId, a.finalKey, a.sizeBytes, output);
  }
}
