package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.*;

import java.io.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;

@Component
class StudyEngineIO {
  final StudyStorage storage;
  final String fontPath;

  StudyEngineIO(
      StudyStorage storage,
      @org.springframework.beans.factory.annotation.Value("${STUDY_PDF_FONT:}") String fontPath) {
    this.storage = storage;
    this.fontPath = fontPath;
  }

  InputStream font() throws IOException {
    return fontPath.isBlank()
        ? StudyEngineIO.class.getResourceAsStream("/study-font/NanumGothic-Regular.ttf")
        : Files.newInputStream(Path.of(fontPath));
  }

  boolean fontAvailable() {
    try (var f = font()) {
      return f != null;
    } catch (IOException e) {
      return false;
    }
  }

  void put(StudyAsset a, byte[] bytes) throws Exception {
    var claim =
        new com.kafka.backend.shareddesk.storage.FilePolicy.Claim(
            a.displayName, a.sizeBytes, a.sha256, a.mime);
    var ticket = storage.objects.presignPut(a.ownerId, a.stagingKey, claim);
    var request = HttpRequest.newBuilder(ticket.url()).timeout(Duration.ofSeconds(90));
    ticket.requiredHeaders().forEach(request::header);
    var response =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build()
            .send(
                request.PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)).build(),
                HttpResponse.BodyHandlers.discarding());
    if (response.statusCode() / 100 != 2) throw new IOException("PRIVATE_OBJECT_PUT_FAILED");
    storage.objects.promoteAndVerify(a.ownerId, a.stagingKey, a.finalKey, claim);
  }

  Path download(StudyAsset a) throws IOException {
    Path path = Files.createTempFile("study-engine-", ".pdf");
    try (var out = Files.newOutputStream(path)) {
      storage.objects.download(a.ownerId, a.finalKey, a.sizeBytes, out);
    } catch (Exception e) {
      Files.deleteIfExists(path);
      throw e;
    }
    try (var input = Files.newInputStream(path)) {
      com.kafka.backend.shareddesk.storage.FilePolicy.verify(
          input,
          new com.kafka.backend.shareddesk.storage.FilePolicy.Claim(
              a.displayName, a.sizeBytes, a.sha256, a.mime));
    } catch (Exception invalid) {
      Files.deleteIfExists(path);
      throw invalid;
    }
    return path;
  }

  void index(StudyEngine engine, StudyEngineJob job) throws Exception {
    JsonNode input = JSON.readTree(job.input);
    var asset =
        engine.tx(
            () ->
                engine
                    .study
                    .assets()
                    .findByOwnerIdAndId(
                        job.ownerId, UUID.fromString(input.path("assetId").asString()))
                    .orElseThrow(StudyException::missing));
    require(
        asset.purpose.equals("material")
            && asset.sha256.equals(input.path("sourceHash").asString())
            && Set.of("READY", "ATTACHED").contains(asset.state));
    Path path = download(asset);
    try (var document =
        Loader.loadPDF(
            path.toFile(), org.apache.pdfbox.io.IOUtils.createTempFileOnlyStreamCache())) {
      require(!document.isEncrypted() && document.getNumberOfPages() <= 2000);
      var labels = document.getDocumentCatalog().getPageLabels();
      String[] printed = labels == null ? null : labels.getLabelsByPageIndices();
      var stripper = new PDFTextStripper();
      stripper.setSortByPosition(true);
      long chars = 0;
      int usable = 0;
      for (int page = 1; page <= document.getNumberOfPages(); page++) {
        if (page <= job.checkpoint) continue;
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        String text = stripper.getText(document).strip();
        chars += text.length();
        require(chars <= 12000000 && text.length() <= 100000);
        final int index = page;
        final String label = printed != null && page <= printed.length ? printed[page - 1] : null;
        final String quality = quality(text);
        if (quality.equals("usable")) usable++;
        engine.tx(
            () -> {
              var current = engine.owned(job.ownerId, job.id);
              engine.lease(current, job.leaseToken);
              var existing =
                  engine.excerpts.findByOwnerIdAndJobIdOrderByPageIndexAscOrdinalAsc(
                      job.ownerId, job.id, org.springframework.data.domain.PageRequest.of(0, 1));
              // Each entire page and its checkpoint commit atomically; a crash cannot leave half a
              // page.
              for (int start = 0, order = 0; start < Math.max(1, text.length()); start += 1800) {
                var e = new StudySourceExcerpt();
                e.ownerId = job.ownerId;
                e.jobId = job.id;
                e.materialId = input.path("materialId").asString();
                e.materialVersion = input.path("materialVersion").asInt();
                e.assetId = asset.id;
                e.sourceHash = asset.sha256;
                e.pageIndex = index;
                e.ordinal = ++order;
                e.pageLabel =
                    label == null ? null : label.substring(0, Math.min(120, label.length()));
                e.quality = quality;
                e.body = text.substring(start, Math.min(start + 1800, text.length()));
                engine.excerpts.save(e);
              }
              current.checkpoint = index;
              current.leaseUntil = Instant.now().plusSeconds(600);
              current.updatedAt = Instant.now();
              return null;
            });
      }
      engine.tx(
          () -> {
            var current = engine.owned(job.ownerId, job.id);
            engine.lease(current, job.leaseToken);
            current.state = "READY";
            current.receipt =
                "{\"parser\":\"pdfbox-3.0.8/text-v1\",\"ocrPerformed\":false,\"pages\":"
                    + document.getNumberOfPages()
                    + "}";
            return null;
          });
    } finally {
      Files.deleteIfExists(path);
    }
  }

  static String quality(String text) {
    if (text.isBlank()) return "textless";
    long useful = text.codePoints().filter(Character::isLetterOrDigit).count();
    long broken =
        text.codePoints()
            .filter(
                c ->
                    c == 0xfffd || Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')
            .count();
    return useful < 12 || broken > Math.max(1, text.length() / 30)
        ? "needs_source_check"
        : "usable";
  }

  void render(StudyEngine engine, StudyEngineJob job) throws Exception {
    if (!fontAvailable())
      throw new StudyException(503, "FONT_REQUIRED", "Korean PDF font unavailable");
    JsonNode input = JSON.readTree(job.input);
    require(input.path("approvedByOwner").asBoolean());
    var book =
        engine.tx(
            () ->
                engine
                    .study
                    .books()
                    .findByOwnerIdAndWorkbookIdAndWorkbookVersion(
                        job.ownerId,
                        input.path("workbookId").asString(),
                        input.path("workbookVersion").asInt())
                    .orElseThrow(StudyException::missing));
    if (book.published) {
      engine.tx(
          () -> {
            var j = engine.owned(job.ownerId, job.id);
            engine.lease(j, job.leaseToken);
            j.state = "PUBLISHED";
            return null;
          });
      return;
    }
    List<StudyAsset> pair = new ArrayList<>();
    for (String kind : List.of("question", "answer")) {
      byte[] bytes;
      try (var f = font();
          var renderer = new StudyPdfRenderer(f)) {
        bytes = renderer.build(JSON.readTree(book.payload), JSON.readTree(book.answerKeys), kind);
      }
      require(bytes.length <= 104857600);
      var a =
          engine.tx(
              () -> {
                engine.workspace(job.ownerId);
                var j = engine.owned(job.ownerId, job.id);
                engine.lease(j, job.leaseToken);
                var derivatives = j.result == null ? JSON.createObjectNode() : object(j.result);
                var prior =
                    derivatives.has(kind)
                        ? engine
                            .study
                            .assets()
                            .findByOwnerIdAndId(
                                job.ownerId, UUID.fromString(derivatives.path(kind).asString()))
                        : Optional.<StudyAsset>empty();
                var asset = prior.orElseGet(StudyAsset::new);
                if (prior.isEmpty()) {
                  long reserved =
                      engine.study.assets().findByOwnerId(job.ownerId).stream()
                          .filter(x -> !x.state.equals("DELETED"))
                          .mapToLong(x -> x.sizeBytes)
                          .sum();
                  if (reserved + bytes.length > 1024L * 1024 * 1024)
                    throw new StudyException(413, "QUOTA_EXCEEDED", "학습 저장 공간 1GiB 제한입니다.");
                }
                require(!"ATTACHED".equals(asset.state));
                if (prior.isPresent())
                  require(
                      asset.sha256.equals(hash(bytes))
                          && asset.sizeBytes == bytes.length
                          && asset.workbookRow.equals(book.rowId)
                          && asset.purpose.equals(kind));
                asset.ownerId = job.ownerId;
                asset.workbookRow = book.rowId;
                asset.purpose = kind;
                asset.mime = "application/pdf";
                asset.displayName =
                    "study-" + book.studyDate + "-v" + book.workbookVersion + "-" + kind + ".pdf";
                asset.sizeBytes = bytes.length;
                asset.sha256 = hash(bytes);
                if (asset.stagingKey == null) {
                  asset.stagingKey = storage.objects.newStagingKey(job.ownerId);
                  asset.finalKey = storage.objects.newFinalKey(job.ownerId);
                }
                asset.state = "UPLOADING";
                asset.expiresAt = Instant.now().plusSeconds(600);
                derivatives.put(kind, asset.id.toString());
                j.result = derivatives.toString();
                return engine.study.assets().saveAndFlush(asset);
              });
      boolean alreadyStored = false;
      try {
        verify(a, book);
        alreadyStored = true;
      } catch (IOException
          | com.kafka.backend.shareddesk.storage.StorageFailure
          | StudyException absentOrUnverified) {
        /* retry never overwrites a final object */
      }
      if (!alreadyStored) put(a, bytes);
      verify(a, book);
      engine.tx(
          () -> {
            var j = engine.owned(job.ownerId, job.id);
            engine.lease(j, job.leaseToken);
            engine.study.assets().findByOwnerIdAndId(job.ownerId, a.id).orElseThrow().state =
                "READY";
            j.checkpoint = kind.equals("question") ? 1 : 2;
            j.leaseUntil = Instant.now().plusSeconds(600);
            return null;
          });
      pair.add(a);
    }
    // Verify both private objects before the one DB publication transaction.
    for (var a : pair) verify(a, book);
    engine.tx(
        () -> {
          engine.workspace(job.ownerId);
          var j = engine.owned(job.ownerId, job.id);
          engine.lease(j, job.leaseToken);
          var b = engine.study.books().findById(book.rowId).orElseThrow();
          require(!b.published && b.ownerId.equals(job.ownerId));
          for (var a : pair) {
            var owned = engine.study.assets().findByOwnerIdAndId(job.ownerId, a.id).orElseThrow();
            require(owned.state.equals("READY") && owned.sha256.equals(a.sha256));
            owned.state = "ATTACHED";
          }
          b.published = true;
          j.state = "PUBLISHED";
          var generated = engine.owned(job.ownerId, UUID.fromString(job.jobKey));
          generated.state = "PUBLISHED";
          j.receipt =
              JSON.createObjectNode()
                  .put("pairVerified", true)
                  .put("renderer", VERSION)
                  .put("questionAssetId", pair.get(0).id.toString())
                  .put("answerAssetId", pair.get(1).id.toString())
                  .toString();
          return null;
        });
  }

  void verify(StudyAsset a, StudyWorkbook b) throws IOException {
    Path tmp = download(a);
    try {
      StudyFileValidation.inspect(tmp, a, b);
    } finally {
      Files.deleteIfExists(tmp);
    }
  }
}
