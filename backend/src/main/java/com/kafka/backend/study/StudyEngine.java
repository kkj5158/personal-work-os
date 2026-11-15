package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.*;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/**
 * Each claim/checkpoint/commit is short. Parsing, model execution and object I/O run outside it.
 */
@Service
public class StudyEngine {
  final StudyService study;
  final StudyEngineJobs jobs;
  final StudySourceExcerpts excerpts;
  final StudyEngineWorkers workers;
  final TransactionTemplate transactions;
  final StudyEngineIO io;
  final boolean schedulerEnabled;
  final boolean testAdapterAllowed;
  final StudyEnginePreferences preferences;
  final Clock clock = Clock.systemUTC();

  public StudyEngine(
      StudyService study,
      StudyEngineJobs jobs,
      StudySourceExcerpts excerpts,
      StudyEngineWorkers workers,
      PlatformTransactionManager manager,
      StudyEngineIO io,
      @org.springframework.beans.factory.annotation.Value("${STUDY_ENGINE_ENABLED:false}")
          boolean schedulerEnabled,
      @org.springframework.beans.factory.annotation.Value("${STUDY_ENGINE_TEST_ADAPTER:false}")
          boolean testAdapterAllowed,
      StudyEnginePreferences preferences) {
    this.study = study;
    this.jobs = jobs;
    this.excerpts = excerpts;
    this.workers = workers;
    this.io = io;
    transactions = new TransactionTemplate(manager);
    this.schedulerEnabled = schedulerEnabled;
    this.testAdapterAllowed = testAdapterAllowed;
    this.preferences = preferences;
  }

  <T> T tx(Supplier<T> action) {
    return transactions.execute(status -> action.get());
  }

  StudyEngineJob owned(UUID owner, UUID id) {
    return jobs.lock(owner, id).orElseThrow(StudyException::missing);
  }

  void workspace(UUID owner) {
    study.spaces().lock(owner).orElseThrow(StudyException::missing);
  }

  StudyEngineJob enqueue(UUID owner, String kind, String key, JsonNode input) {
    var old = jobs.findByOwnerIdAndKindAndJobKey(owner, kind, key);
    if (old.isPresent()) return old.get();
    if (jobs.findByOwnerIdOrderByCreatedAtDesc(owner, PageRequest.of(0, 200)).stream()
            .filter(j -> j.createdAt.isAfter(Instant.now(clock).minusSeconds(86400)))
            .count()
        >= 100) throw new StudyException(429, "ENGINE_BUDGET", "일일 작업 100개 제한입니다.");
    StudyEngineJob j = new StudyEngineJob();
    j.ownerId = owner;
    j.kind = kind;
    j.jobKey = key;
    j.input = input.toString();
    return jobs.saveAndFlush(j);
  }

  ObjectNode publicJob(StudyEngineJob j) {
    ObjectNode n =
        JSON.createObjectNode()
            .put("id", j.id.toString())
            .put("kind", j.kind)
            .put("state", j.state)
            .put("attempts", j.attempts)
            .put("checkpoint", j.checkpoint)
            .put("updatedAt", j.updatedAt.toString());
    JsonNode input = JSON.readTree(j.input), receipt = JSON.readTree(j.receipt);
    for (String f :
        List.of(
            "date", "week", "materialId", "assetId", "batchId", "workbookId", "workbookVersion"))
      if (input.has(f)) n.set(f, input.path(f));
    // Receipts contain no answer key, token, object key, model response or source textbook text.
    n.set("receipt", receipt);
    if (j.kind.equals("GENERATE"))
      n.set("plan", ((ObjectNode) input.deepCopy()).without("passages"));
    return n;
  }

  public ObjectNode status() {
    UUID owner = study.owner();
    return tx(
        () -> {
          ObjectNode out =
              JSON.createObjectNode()
                  .put("engineEnabled", schedulerEnabled)
                  .put("version", VERSION)
                  .put("provider", "local_worker_pull")
                  .put("paidProvider", "disabled")
                  .put("ocr", "embedded_text_only")
                  .put("pdf", io.fontAvailable() ? "ready" : "BLOCKED_FONT")
                  .put("email", "disabled");
          var a = out.putArray("jobs");
          jobs.findByOwnerIdOrderByCreatedAtDesc(owner, PageRequest.of(0, 100))
              .forEach(j -> a.add(publicJob(j)));
          var ws = out.putArray("workers");
          boolean online = false;
          for (var w : workers.findByOwnerId(owner)) {
            boolean alive =
                !w.revoked
                    && w.expiresAt.isAfter(Instant.now(clock))
                    && w.lastSeen != null
                    && w.lastSeen.isAfter(Instant.now(clock).minusSeconds(120));
            online |= alive;
            ws.addObject()
                .put("id", w.id.toString())
                .put("label", w.label)
                .put("expiresAt", w.expiresAt.toString())
                .put("online", alive)
                .put("revoked", w.revoked);
          }
          out.put("workerOnline", online);
          JsonNode settings =
              study
                  .records()
                  .findByOwnerIdAndKindAndRecordKey(owner, "AUTOMATION", "settings")
                  .map(r -> JSON.readTree(r.payload))
                  .orElse(JSON.createObjectNode());
          String time = settings.path("time").asString("20:00");
          out.putObject("schedule")
              .put("enabled", settings.path("enabled").asBoolean())
              .put("time", time)
              .put("zone", "Asia/Seoul")
              .put("nextRun", nextRun(Instant.now(clock), time).toString());
          out.set("goals", goals(owner));
          return out;
        });
  }

  JsonNode goals(UUID owner) {
    return preferences
        .findById(owner)
        .map(p -> JSON.readTree(p.payload))
        .orElse(
            JSON.readTree(
                "{\"goal\":\"자료 순서대로 핵심 개념과 실제 적용"
                    + " 학습\",\"interests\":\"\",\"weeklyTarget\":{\"new\":60,\"review\":25,\"application\":15}}"));
  }

  public JsonNode configureGoals(JsonNode input) {
    fields(input, "goal", "interests", "weeklyTarget");
    text(input, "goal", 2000);
    require(
        input.path("interests").isString() && input.path("interests").asString().length() <= 2000);
    fields(input.path("weeklyTarget"), "new", "review", "application");
    int total = 0;
    for (String key : List.of("new", "review", "application")) {
      JsonNode n = input.path("weeklyTarget").path(key);
      require(n.isIntegralNumber() && n.asDouble() >= 0 && n.asDouble() <= 100);
      total += n.asInt();
    }
    require(total == 100);
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var p = new StudyEnginePreference();
          p.ownerId = owner;
          p.payload = input.toString();
          preferences.save(p);
          return input;
        });
  }

  public ObjectNode index(UUID assetId) {
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          StudyAsset a =
              study
                  .assets()
                  .findByOwnerIdAndId(owner, assetId)
                  .orElseThrow(StudyException::missing);
          require(a.purpose.equals("material") && Set.of("READY", "ATTACHED").contains(a.state));
          StudyRecord material =
              study.records().findById(a.materialRow).orElseThrow(StudyException::missing);
          JsonNode m = JSON.readTree(material.payload);
          var input =
              JSON.createObjectNode()
                  .put("assetId", a.id.toString())
                  .put("materialId", material.recordKey)
                  .put("materialVersion", m.path("version").asInt())
                  .put("sourceHash", a.sha256)
                  .put("parserVersion", "pdfbox-3.0.8/text-v1");
          return publicJob(
              enqueue(
                  owner, "INDEX", a.id + "/" + a.sha256 + "/" + m.path("version").asInt(), input));
        });
  }

  public List<ObjectNode> search(String material, UUID job, String term, int page) {
    require(material.length() <= 180 && term.length() <= 120 && page >= 0 && page <= 10000);
    UUID owner = study.owner();
    return tx(
        () ->
            excerpts
                .search(owner, material, job == null ? null : job.toString(), term, 30, page * 30)
                .stream()
                .map(StudyEngineRules::excerpt)
                .toList());
  }

  public ObjectNode passage(UUID id) {
    UUID owner = study.owner();
    return tx(
        () -> excerpt(excerpts.findByOwnerIdAndId(owner, id).orElseThrow(StudyException::missing)));
  }

  public List<ObjectNode> plan(JsonNode request) {
    fields(request, "date", "days", "operationId");
    String op = text(request, "operationId", 36);
    UUID.fromString(op);
    LocalDate date = LocalDate.parse(text(request, "date", 10));
    int days = positive(request, "days");
    require(days == 1 || days == 7);
    if (days == 7) require(date.getDayOfWeek() == DayOfWeek.MONDAY);
    require(
        !date.isBefore(LocalDate.now(clock.withZone(KST)))
            && !date.isAfter(LocalDate.now(clock.withZone(KST)).plusDays(90)));
    UUID owner = study.owner();
    return tx(() -> plan(owner, date, days, "manual/" + op));
  }

  List<ObjectNode> plan(UUID owner, LocalDate date, int days, String key) {
    workspace(owner);
    var previous = jobs.findByOwnerIdAndKindAndJobKey(owner, "GENERATE", key + "/0");
    if (previous.isPresent()) {
      JsonNode old = JSON.readTree(previous.get().input);
      require(
          old.path("date").asString().equals(date.toString())
              && old.path("batchDays").asInt() == days);
      var result = new ArrayList<ObjectNode>();
      for (int i = 0; i < days; i++)
        result.add(
            publicJob(
                jobs.findByOwnerIdAndKindAndJobKey(owner, "GENERATE", key + "/" + i)
                    .orElseThrow()));
      return result;
    }
    List<StudySourceExcerpt> passages = new ArrayList<>();
    var indices =
        jobs.findByOwnerIdAndKindAndStateOrderByCreatedAtDesc(
            owner, "INDEX", "READY", PageRequest.of(0, 500));
    for (StudyRecord m : study.records().findByOwnerIdAndKind(owner, "MATERIAL")) {
      JsonNode meta = JSON.readTree(m.payload);
      if (!meta.path("included").asBoolean() || !meta.path("active").asBoolean(true)) continue;
      var latest =
          indices.stream()
              .filter(
                  j -> {
                    JsonNode p = JSON.readTree(j.input);
                    return p.path("materialId").asString().equals(m.recordKey)
                        && p.path("materialVersion").asInt() == meta.path("version").asInt();
                  })
              .findFirst();
      if (latest.isPresent())
        passages.addAll(
            excerpts
                .findByOwnerIdAndJobIdOrderByPageIndexAscOrdinalAsc(
                    owner, latest.get().id, PageRequest.of(0, 120))
                .stream()
                .filter(e -> e.quality.equals("usable"))
                .toList());
    }
    if (passages.isEmpty())
      throw new StudyException(409, "SOURCE_INDEX_REQUIRED", "포함된 자료의 현재 버전을 색인한 뒤 생성하세요.");
    Set<String> covered = new HashSet<>();
    study
        .records()
        .findByOwnerIdAndKind(owner, "ATTEMPT")
        .forEach(
            r -> JSON.readTree(r.payload).path("coverage").forEach(c -> covered.add(c.asString())));
    Set<String> learned = new HashSet<>();
    for (var b : study.books().findByOwnerIdOrderByCreatedAtAsc(owner)) {
      var pkg = JSON.readTree(b.payload);
      for (String part : List.of("required", "extension"))
        for (JsonNode q : pkg.path(part))
          if (covered.contains(binding(pkg, part, q))) {
            String section = q.path("source").path("section").asString();
            passages.stream()
                .filter(e -> section.contains(e.id.toString()))
                .forEach(e -> learned.add(e.id.toString()));
          }
    }
    boolean history = !learned.isEmpty();
    var reviewPassages = passages.stream().filter(e -> learned.contains(e.id.toString())).toList();
    var newPassages = passages.stream().filter(e -> !learned.contains(e.id.toString())).toList();
    var policies = study.records().findByOwnerIdAndKind(owner, "POLICY");
    List<ObjectNode> result = new ArrayList<>();
    for (int i = 0; i < days; i++) {
      var day = date.plusDays(i);
      JsonNode goalSnapshot = goals(owner);
      double position = (i + 0.5) / days * 100;
      int newRatio =
          goalSnapshot.path("weeklyTarget").path("new").asInt()
              + (history ? 0 : goalSnapshot.path("weeklyTarget").path("review").asInt());
      boolean review =
          history
              && position >= newRatio
              && position < newRatio + goalSnapshot.path("weeklyTarget").path("review").asInt();
      var pool = review ? reviewPassages : newPassages.isEmpty() ? passages : newPassages;
      ObjectNode p = StudyEngineRules.plan(day, effective(policies, day), pool, i, history);
      JsonNode goals = goals(owner);
      p.set("goals", goals);
      ObjectNode target = (ObjectNode) goals.path("weeklyTarget").deepCopy();
      if (!history) {
        target.put("new", target.path("new").asInt() + target.path("review").asInt());
        target.put("review", 0);
      }
      p.set("weeklyTarget", target);
      p.put("tag", review ? "review" : position < newRatio ? "new" : "application");
      p.put(
          "reviewEvidence",
          history ? "submitted_question_source_spans" : "no_recorded_completed_source_spans");
      var old =
          study.books().findByOwnerIdOrderByCreatedAtAsc(owner).stream()
              .filter(b -> b.studyDate.equals(day))
              .max(Comparator.comparingInt(b -> b.workbookVersion));
      p.put("workbookId", old.map(b -> b.workbookId).orElse("study-" + day));
      p.put("workbookVersion", old.map(b -> b.workbookVersion + 1).orElse(1));
      p.put("batchId", hash(owner + "/" + key).substring(0, 32))
          .put("batchDays", days)
          .put("inputDigest", hash(p.toString()));
      var recent = p.putArray("recentQuestionPrompts");
      var prior = study.books().findByOwnerIdOrderByCreatedAtAsc(owner);
      int promptCount = 0;
      for (var b : prior.reversed()) {
        if (promptCount >= 40) break;
        for (String part : List.of("required", "extension"))
          for (JsonNode q : JSON.readTree(b.payload).path(part)) {
            if (promptCount++ < 40) recent.add(q.path("prompt").asString());
          }
      }
      result.add(publicJob(enqueue(owner, "GENERATE", key + "/" + i, p)));
    }
    return result;
  }

  public ObjectNode mintWorker(String label) {
    require(label != null && !label.isBlank() && label.length() <= 120);
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          require(
              workers.findByOwnerId(owner).stream()
                      .filter(w -> !w.revoked && w.expiresAt.isAfter(Instant.now(clock)))
                      .count()
                  < 5);
          byte[] random = new byte[32];
          new java.security.SecureRandom().nextBytes(random);
          String token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
          StudyEngineWorker w = new StudyEngineWorker();
          w.ownerId = owner;
          w.label = label;
          w.tokenHash = hash(token);
          w.expiresAt = Instant.now(clock).plusSeconds(7 * 86400);
          workers.save(w);
          return JSON.createObjectNode()
              .put("id", w.id.toString())
              .put("token", token)
              .put("expiresAt", w.expiresAt.toString());
        });
  }

  public void revoke(UUID id) {
    UUID owner = study.owner();
    tx(
        () -> {
          var w = workers.findByOwnerIdAndId(owner, id).orElseThrow(StudyException::missing);
          w.revoked = true;
          return null;
        });
  }

  StudyEngineWorker authenticate(String token) {
    if (token == null || token.length() != 43)
      throw new StudyException(401, "WORKER_AUTH_REQUIRED", "Worker authentication required");
    return tx(
        () -> {
          var w =
              workers
                  .findByTokenHash(hash(token))
                  .orElseThrow(
                      () ->
                          new StudyException(
                              401, "WORKER_AUTH_REQUIRED", "Worker authentication required"));
          if (w.revoked || !w.expiresAt.isAfter(Instant.now(clock)))
            throw new StudyException(401, "WORKER_EXPIRED", "Worker token expired");
          return w;
        });
  }

  StudyEngineJob claim(UUID owner, UUID id, UUID worker, Set<String> kinds) {
    return tx(
        () -> {
          var j = owned(owner, id);
          require(kinds.contains(j.kind));
          Instant now = Instant.now(clock);
          boolean expired =
              j.state.equals("RUNNING") && j.leaseUntil != null && !j.leaseUntil.isAfter(now);
          if (!Set.of("QUEUED", "PARTIAL").contains(j.state) && !expired) return null;
          if (j.attempts >= 3 + j.manualRetries) {
            j.state = "FAILED";
            j.receipt = "{\"error\":\"ATTEMPT_LIMIT\"}";
            return null;
          }
          j.state = "RUNNING";
          j.attempts++;
          j.workerId = worker;
          j.leaseToken = UUID.randomUUID();
          j.leaseUntil = now.plusSeconds(600);
          j.updatedAt = now;
          jobs.saveAndFlush(j);
          return j;
        });
  }

  void lease(StudyEngineJob j, UUID token) {
    if (!j.state.equals("RUNNING")
        || !Objects.equals(j.leaseToken, token)
        || j.leaseUntil == null
        || !j.leaseUntil.isAfter(Instant.now(clock))) throw conflict();
  }

  public JsonNode claimWorker(StudyEngineWorker worker) {
    tx(
        () -> {
          var w = workers.findById(worker.id).orElseThrow();
          w.lastSeen = Instant.now(clock);
          return null;
        });
    var candidates =
        tx(
            () ->
                jobs.findByOwnerIdAndKindInAndStateInOrderByCreatedAtAsc(
                    worker.ownerId,
                    Set.of("GENERATE", "COACH"),
                    Set.of("QUEUED", "PARTIAL", "RUNNING"),
                    PageRequest.of(0, 100)));
    for (var j : candidates) {
      var claimed = claim(worker.ownerId, j.id, worker.id, Set.of("GENERATE", "COACH"));
      if (claimed != null)
        return JSON.createObjectNode()
            .put("id", claimed.id.toString())
            .put("kind", claimed.kind)
            .put("leaseToken", claimed.leaseToken.toString())
            .put("leaseUntil", claimed.leaseUntil.toString())
            .set("input", JSON.readTree(claimed.input));
    }
    return JSON.createObjectNode().put("state", "IDLE");
  }

  public void heartbeat(StudyEngineWorker worker, UUID id, UUID token) {
    tx(
        () -> {
          var j = owned(worker.ownerId, id);
          lease(j, token);
          require(worker.id.equals(j.workerId));
          j.leaseUntil = Instant.now(clock).plusSeconds(600);
          var w = workers.findById(worker.id).orElseThrow();
          w.lastSeen = Instant.now(clock);
          return null;
        });
  }

  public ObjectNode complete(StudyEngineWorker worker, UUID id, UUID token, JsonNode output) {
    require(output.toString().length() <= 1500000);
    try {
      return tx(
          () -> {
            workspace(worker.ownerId);
            var j = owned(worker.ownerId, id);
            require(worker.id.equals(j.workerId));
            String digest = hash(output.toString());
            if (Set.of("READY", "PUBLISHED").contains(j.state)
                && JSON.readTree(j.receipt).path("outputDigest").asString().equals(digest))
              return publicJob(j);
            lease(j, token);
            if (j.kind.equals("GENERATE")) acceptQuestions(j, output);
            else if (j.kind.equals("COACH")) acceptCoach(j, output);
            else throw invalid();
            j.result = output.toString();
            j.state = "READY";
            j.updatedAt = Instant.now(clock);
            ObjectNode receipt = object(j.receipt);
            receipt.put("outputDigest", digest);
            j.receipt = receipt.toString();
            return publicJob(j);
          });
    } catch (StudyException e) {
      tx(
          () -> {
            var j = owned(worker.ownerId, id);
            if (j.state.equals("RUNNING")
                && Objects.equals(j.leaseToken, token)
                && Objects.equals(j.workerId, worker.id)) {
              j.state = "FAILED";
              j.receipt =
                  JSON.createObjectNode()
                      .put("error", "OUTPUT_VALIDATION_FAILED")
                      .put("reason", e.code)
                      .toString();
            }
            return null;
          });
      throw e;
    }
  }

  void acceptQuestions(StudyEngineJob j, JsonNode output) {
    require(
        Set.of("codex_cli", "ollama")
                .contains(output.path("provenance").path("provider").asString())
            || (testAdapterAllowed
                && output.path("provenance").path("provider").asString().equals("test_fake")));
    JsonNode p = JSON.readTree(j.input);
    Set<String> recent = new HashSet<>();
    var all = study.books().findByOwnerIdOrderByCreatedAtAsc(j.ownerId);
    all.stream()
        .filter(b -> b.studyDate.isAfter(LocalDate.parse(p.path("date").asString()).minusDays(90)))
        .forEach(
            b -> {
              var pkg = JSON.readTree(b.payload);
              for (String part : List.of("required", "extension"))
                pkg.path(part).forEach(q -> recent.add(normalized(q.path("prompt").asString())));
            });
    ObjectNode receipt = validate(output, p, recent);
    // Detect changed/deleted originals or stale material metadata before importing.
    for (JsonNode passage : p.path("passages")) {
      var e =
          excerpts
              .findByOwnerIdAndId(j.ownerId, UUID.fromString(passage.path("id").asString()))
              .orElseThrow(StudyException::missing);
      require(excerpt(e).equals(passage));
      var a =
          study
              .assets()
              .findByOwnerIdAndId(j.ownerId, e.assetId)
              .orElseThrow(StudyException::missing);
      require(a.sha256.equals(e.sourceHash) && Set.of("READY", "ATTACHED").contains(a.state));
      var m =
          study
              .records()
              .findByOwnerIdAndKindAndRecordKey(j.ownerId, "MATERIAL", e.materialId)
              .orElseThrow(StudyException::missing);
      require(JSON.readTree(m.payload).path("version").asInt() == e.materialVersion);
    }
    ObjectNode pkg =
        JSON.createObjectNode()
            .put("id", p.path("workbookId").asString())
            .put("version", p.path("workbookVersion").asInt())
            .put("date", p.path("date").asString())
            .put("topic", output.path("topic").asString())
            .put("policyVersion", p.path("policy").path("version").asInt());
    pkg.set("required", output.path("required"));
    pkg.set("extension", output.path("extension"));
    var keys = JSON.createArrayNode();
    for (JsonNode k : output.path("keys")) {
      ObjectNode key =
          keys.addObject()
              .put("model", k.path("model").asString() + "\n정답: " + k.path("answer").toString())
              .put(
                  "explanation",
                  k.path("explanation").asString() + "\n근거: " + k.path("citations").toString());
      key.putObject("binding")
          .put("workbookId", pkg.path("id").asString())
          .put("workbookVersion", pkg.path("version").asInt())
          .put("part", k.path("part").asString())
          .put("questionId", k.path("questionId").asString())
          .put("questionVersion", 1);
      key.set("rubric", k.path("rubric"));
      key.set("followUp", k.path("followUp"));
      if (k.has("incorrectReasons")) key.set("incorrectReasons", k.path("incorrectReasons"));
    }
    Set<String> sources = new HashSet<>();
    study
        .records()
        .findByOwnerIdAndKind(j.ownerId, "MATERIAL")
        .forEach(m -> sources.add(m.recordKey));
    Set<Integer> policies = new HashSet<>();
    study
        .records()
        .findByOwnerIdAndKind(j.ownerId, "POLICY")
        .forEach(r -> policies.add(JSON.readTree(r.payload).path("version").asInt()));
    workbook(pkg, keys, sources, policies);
    int version =
        all.stream()
                .filter(b -> b.workbookId.equals(pkg.path("id").asString()))
                .mapToInt(b -> b.workbookVersion)
                .max()
                .orElse(0)
            + 1;
    require(version == pkg.path("version").asInt());
    for (var old : all)
      if (old.studyDate.toString().equals(pkg.path("date").asString()))
        require(old.workbookId.equals(pkg.path("id").asString()));
    StudyWorkbook b = new StudyWorkbook();
    b.ownerId = j.ownerId;
    b.workbookId = pkg.path("id").asString();
    b.workbookVersion = version;
    b.studyDate = LocalDate.parse(pkg.path("date").asString());
    b.payload = pkg.toString();
    b.answerKeys = keys.toString();
    study.books().saveAndFlush(b);
    receipt.put("workbookId", b.workbookId).put("workbookVersion", b.workbookVersion);
    j.receipt = receipt.toString();
    StudyWorkspace space = study.spaces().findById(j.ownerId).orElseThrow();
    study.touch(space);
  }

  public ObjectNode approve(UUID id) {
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var j = owned(owner, id);
          require(j.kind.equals("GENERATE") && j.state.equals("READY"));
          ObjectNode input = object(j.input);
          input.put("approvedByOwner", true).put("approvedAt", Instant.now(clock).toString());
          var book =
              study
                  .books()
                  .findByOwnerIdAndWorkbookIdAndWorkbookVersion(
                      owner,
                      input.path("workbookId").asString(),
                      input.path("workbookVersion").asInt())
                  .orElseThrow(StudyException::missing);
          require(
              study.records().findByOwnerIdAndKind(owner, "REVIEW").stream()
                  .anyMatch(r -> book.rowId.equals(r.workbookRow)));
          var render = enqueue(owner, "RENDER", id.toString(), input);
          return publicJob(render);
        });
  }

  public ObjectNode retry(UUID id) {
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var j = owned(owner, id);
          require(Set.of("FAILED", "BLOCKED", "PARTIAL").contains(j.state));
          require(j.manualRetries < 3);
          j.manualRetries++;
          j.state = "QUEUED";
          j.leaseToken = null;
          j.leaseUntil = null;
          j.updatedAt = Instant.now(clock);
          return publicJob(j);
        });
  }

  public ObjectNode cancel(UUID id) {
    UUID owner = study.owner();
    return tx(
        () -> {
          var j = owned(owner, id);
          require(!j.state.equals("PUBLISHED"));
          j.state = "CANCELLED";
          j.leaseToken = null;
          return publicJob(j);
        });
  }

  public ObjectNode analyze(String feedbackId) {
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var r =
              study
                  .records()
                  .findByOwnerIdAndKindAndRecordKey(owner, "FEEDBACK", feedbackId)
                  .orElseThrow(StudyException::missing);
          var p =
              JSON.createObjectNode()
                  .put("feedbackId", feedbackId)
                  .put("text", JSON.readTree(r.payload).path("text").asString())
                  .put("promptVersion", VERSION);
          p.set(
              "policy",
              effective(
                  study.records().findByOwnerIdAndKind(owner, "POLICY"),
                  LocalDate.now(clock.withZone(KST)).plusWeeks(1)));
          return publicJob(enqueue(owner, "COACH", feedbackId, p));
        });
  }

  void acceptCoach(StudyEngineJob j, JsonNode output) {
    fields(output, "classification", "scope", "changes", "reason", "provenance");
    safeText(output);
    fields(output.path("provenance"), "provider", "model", "promptVersion");
    text(output.path("provenance"), "model", 180);
    require(text(output.path("provenance"), "promptVersion", 100).equals(VERSION));
    require(
        Set.of("codex_cli", "ollama")
                .contains(output.path("provenance").path("provider").asString())
            || (testAdapterAllowed
                && output.path("provenance").path("provider").asString().equals("test_fake")));
    String type = text(output, "classification", 50);
    require(
        Set.of("learning_question", "general_feedback", "policy_change", "correctness_dispute")
            .contains(type));
    String scope = text(output, "scope", 30);
    require(Set.of("this_week", "next_week_only", "ongoing").contains(scope));
    text(output, "reason", 4000);
    JsonNode input = JSON.readTree(j.input);
    var record =
        study
            .records()
            .findByOwnerIdAndKindAndRecordKey(
                j.ownerId, "FEEDBACK", input.path("feedbackId").asString())
            .orElseThrow();
    var feedback = object(record.payload);
    feedback
        .put("state", type.equals("correctness_dispute") ? "needs_question_review" : "analyzed")
        .put("classification", type)
        .put("analysisReason", output.path("reason").asString());
    record.payload = feedback.toString();
    if (type.equals("policy_change")) {
      JsonNode changes = output.path("changes");
      fields(changes, "format", "explanation", "questionFormat");
      require(changes.size() > 0);
      // Approval checks the latest audit version; effective policy values are shown separately.
      ObjectNode
          before =
              study.records().findByOwnerIdAndKind(j.ownerId, "POLICY").stream()
                  .map(r -> object(r.payload))
                  .max(Comparator.comparingInt(p -> p.path("version").asInt()))
                  .orElseThrow(),
          after = (ObjectNode) input.path("policy").deepCopy();
      if (changes.has("format"))
        require(Set.of("classic", "case").contains(changes.path("format").asString()));
      if (changes.has("explanation"))
        require(Set.of("standard", "intuitive").contains(changes.path("explanation").asString()));
      if (changes.has("questionFormat")) validateFormat(changes.path("questionFormat"));
      changes.properties().forEach(e -> after.set(e.getKey(), e.getValue()));
      var monday =
          LocalDate.now(clock.withZone(KST))
              .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
      var start = scope.equals("this_week") ? monday : monday.plusWeeks(1);
      after
          .put("scope", scope)
          .put("effectiveWeek", start.toString())
          .put("version", before.path("version").asInt() + 1)
          .put("reason", output.path("reason").asString());
      if (!scope.equals("ongoing")) after.put("expiresWeek", start.plusWeeks(1).toString());
      else after.remove("expiresWeek");
      StudyRecord proposal = new StudyRecord();
      proposal.ownerId = j.ownerId;
      proposal.kind = "PROPOSAL";
      proposal.recordKey = UUID.randomUUID().toString();
      var p =
          JSON.createObjectNode()
              .put("id", proposal.recordKey)
              .put("status", "pending")
              .put("feedbackId", input.path("feedbackId").asString())
              .put("originalFeedback", input.path("text").asString())
              .put("publishedWeekBehavior", "future_or_explicit_new_version_only");
      p.set("before", before);
      p.set("after", after);
      proposal.payload = p.toString();
      study.records().save(proposal);
    } else require(output.path("changes").isObject() && output.path("changes").isEmpty());
    j.receipt =
        JSON.createObjectNode()
            .put("classification", type)
            .put("policyAutoApproved", false)
            .toString();
    study.touch(study.spaces().findById(j.ownerId).orElseThrow());
  }

  public void run(UUID id) {
    UUID owner = study.owner();
    var j = claim(owner, id, null, Set.of("PLAN", "INDEX", "RENDER"));
    if (j != null) execute(j);
  }

  void execute(StudyEngineJob job) {
    try {
      if (job.kind.equals("INDEX")) io.index(this, job);
      else if (job.kind.equals("PLAN")) {
        tx(
            () -> {
              var j = owned(job.ownerId, job.id);
              lease(j, job.leaseToken);
              JsonNode p = JSON.readTree(j.input);
              plan(j.ownerId, LocalDate.parse(p.path("date").asString()), 7, j.jobKey);
              j.state = "READY";
              j.receipt = "{\"days\":7,\"modelExecution\":\"queued_for_worker\"}";
              return null;
            });
      } else io.render(this, job);
    } catch (Exception e) {
      tx(
          () -> {
            var j = owned(job.ownerId, job.id);
            if (j.state.equals("RUNNING") && Objects.equals(j.leaseToken, job.leaseToken)) {
              j.state = e instanceof StudyException s && s.status == 503 ? "BLOCKED" : "PARTIAL";
              j.receipt = "{\"error\":\"ENGINE_IO_FAILED_RETRY_AVAILABLE\"}";
              j.updatedAt = Instant.now(clock);
            }
            return null;
          });
    }
  }

  public void tick(Instant now) {
    if (!schedulerEnabled) return;
    // Triggering creates durable work even without a connected laptop. Never claims AI ran.
    var owners =
        tx(
            () ->
                study.records().findAll().stream()
                    .filter(
                        r ->
                            r.kind.equals("AUTOMATION")
                                && JSON.readTree(r.payload).path("enabled").asBoolean())
                    .toList());
    var z = now.atZone(KST);
    for (var setting : owners) {
      JsonNode s = JSON.readTree(setting.payload);
      String time = s.path("time").asString("20:00");
      LocalDate sunday = z.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
      Instant due = sunday.atTime(LocalTime.parse(time)).atZone(KST).toInstant();
      if (!now.isBefore(due) && !setting.createdAt.isAfter(due))
        tx(
            () -> {
              workspace(setting.ownerId);
              return enqueue(
                  setting.ownerId,
                  "PLAN",
                  "scheduled/" + sunday.plusDays(1),
                  JSON.createObjectNode()
                      .put("date", sunday.plusDays(1).toString())
                      .put("week", sunday.plusDays(1).toString()));
            });
    }
    var candidates =
        tx(
            () ->
                jobs.findByKindInAndStateInOrderByCreatedAtAsc(
                    Set.of("PLAN", "INDEX", "RENDER"),
                    Set.of("QUEUED", "RUNNING", "PARTIAL"),
                    PageRequest.of(0, 20)));
    for (var j : candidates) {
      var claimed = claim(j.ownerId, j.id, null, Set.of("PLAN", "INDEX", "RENDER"));
      if (claimed != null) {
        execute(claimed);
        break;
      }
    }
  }
}
