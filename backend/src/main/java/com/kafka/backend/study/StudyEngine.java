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
    var recentJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(owner, PageRequest.of(0, 301));
    if (recentJobs.stream()
            .filter(j -> j.createdAt.isAfter(Instant.now(clock).minusSeconds(86400)))
            .count()
        >= 100) throw new StudyException(429, "ENGINE_BUDGET", "일일 작업 100개 제한입니다.");
    if (recentJobs.stream()
            .filter(j -> j.createdAt.isAfter(Instant.now(clock).minusSeconds(7 * 86400)))
            .count()
        >= 300) throw new StudyException(429, "ENGINE_WEEKLY_BUDGET", "최근 7일 작업 300개 제한입니다.");
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
            .put("createdAt", j.createdAt.toString())
            .put("updatedAt", j.updatedAt.toString());
    JsonNode input = JSON.readTree(j.input);
    for (String f :
        List.of(
            "date", "week", "materialId", "materialVersion", "assetId", "batchId", "workbookId", "workbookVersion"))
      if (input.has(f)) n.set(f, input.path(f));
    // Receipts contain no answer key, token, object key, model response or source textbook text.
    n.set("receipt", object(j.receipt).without("privateReviewAttempts"));
    if (j.kind.equals("INDEX") && j.state.equals("READY"))
      n.put("usableExcerptCount", excerpts.countByOwnerIdAndJobIdAndQuality(j.ownerId, j.id, "usable"));
    if (j.kind.equals("GENERATE"))
      n.set("plan", ((ObjectNode) input.deepCopy()).without("passages").without("recentQuestionPrompts"));
    return n;
  }

  public ObjectNode status() {
    UUID owner = study.owner();
    return tx(
        () -> {
          ObjectNode out =
              JSON.createObjectNode()
                  .put("engineEnabled", schedulerEnabled)
                  .put("version", QUALITY_VERSION)
                  .put("provider", "local_worker_pull")
                  .put("paidProvider", "disabled")
                  .put("ocr", "embedded_text_only")
                  .put("pdf", io.fontAvailable() ? "ready" : "BLOCKED_FONT")
                  .put("email", "disabled");
          var a = out.putArray("jobs");
          jobs.findByOwnerIdOrderByCreatedAtDesc(owner, PageRequest.of(0, 100))
              .forEach(j -> a.add(publicJob(j)));
          out.put("jobsTruncated", jobs.findByOwnerId(owner, PageRequest.of(0, 1)).getTotalElements() > 100);
          out.set("sources", sourceStatus(owner));
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
                .put("lastSeenAt", w.lastSeen == null ? null : w.lastSeen.toString())
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

  /** Read-only summaries use the same current-version READY index rule as planning. */
  ArrayNode sourceStatus(UUID owner) {
    var indices = jobs.findByOwnerIdAndKindOrderByCreatedAtDesc(owner, "INDEX");
    var assets = study.assets().findByOwnerId(owner);
    ArrayNode out = JSON.createArrayNode();
    for (var material : study.records().findByOwnerIdAndKind(owner, "MATERIAL")) {
      JsonNode meta = JSON.readTree(material.payload);
      var current = indices.stream().filter(j -> {
        JsonNode input = JSON.readTree(j.input);
        return input.path("materialId").asString().equals(material.recordKey)
            && input.path("materialVersion").asInt() == meta.path("version").asInt();
      }).toList();
      var ready = current.stream().filter(j -> j.state.equals("READY")).findFirst();
      var selected = ready.or(() -> current.stream().findFirst());
      var row = out.addObject().put("materialId", material.recordKey)
          .put("materialVersion", meta.path("version").asInt())
          .put("included", meta.path("included").asBoolean())
          .put("active", meta.path("active").asBoolean(true));
      if (selected.isPresent()) {
        var job = selected.get();
        long usable = excerpts.countByOwnerIdAndJobIdAndQuality(owner, job.id, "usable");
        String state = switch (job.state) {
          case "READY" -> usable > 0 ? "ready" : "needs_source_check";
          case "QUEUED" -> "queued";
          case "RUNNING", "VALIDATING" -> "processing";
          default -> "failed";
        };
        row.put("jobId", job.id.toString()).put("assetId", JSON.readTree(job.input).path("assetId").asString())
            .put("state", state).put("usableExcerptCount", usable)
            .put("physicalPages", JSON.readTree(job.receipt).path("pages").asInt());
      } else {
        row.put("state", "missing").put("usableExcerptCount", 0);
        assets.stream().filter(a -> material.id.equals(a.materialRow)
            && Set.of("READY", "ATTACHED").contains(a.state)).findFirst()
            .ifPresent(a -> row.put("assetId", a.id.toString()));
      }
    }
    return out;
  }

  public ObjectNode history(int page, String kind, String state, String date, String week) {
    require(page >= 0 && page <= 100000);
    require(kind.isEmpty() || Set.of("PLAN", "INDEX", "GENERATE", "COACH", "RENDER").contains(kind));
    require(state.isEmpty() || Set.of("QUEUED", "RUNNING", "PARTIAL", "VALIDATING", "READY", "PUBLISHED", "FAILED", "BLOCKED", "CANCELLED").contains(state));
    if (!date.isEmpty()) LocalDate.parse(date);
    if (!week.isEmpty()) require(LocalDate.parse(week).getDayOfWeek() == DayOfWeek.MONDAY);
    String weekEnd = week.isEmpty() ? "" : LocalDate.parse(week).plusDays(6).toString();
    UUID owner = study.owner();
    return tx(() -> {
      var result = jobs.history(owner, kind, state, date, week, weekEnd, PageRequest.of(page, 50));
      var out = JSON.createObjectNode().put("page", page).put("totalPages", result.getTotalPages())
          .put("totalElements", result.getTotalElements());
      var rows = out.putArray("jobs");
      result.forEach(j -> rows.add(publicJob(j)));
      return out;
    });
  }

  public ObjectNode preview(LocalDate date) {
    require(!date.isBefore(LocalDate.now(clock.withZone(KST)))
        && !date.isAfter(LocalDate.now(clock.withZone(KST)).plusDays(90)));
    UUID owner = study.owner();
    return tx(() -> {
      var policy = effective(study.records().findByOwnerIdAndKind(owner, "POLICY"), date);
      var out = JSON.createObjectNode().put("date", date.toString()).put("sourceLimit", StudySourceSelection.DAILY_LIMIT);
      out.set("policy", policy);
      out.set("questionFormat", format(policy));
      out.putObject("minutes").put("required", 15).put("extension", 30);
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
    return index(assetId, null);
  }

  public ObjectNode index(UUID assetId, Integer expectedMaterialVersion) {
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
          if (expectedMaterialVersion != null && m.path("version").asInt() != expectedMaterialVersion)
            throw new StudyException(409, "MATERIAL_VERSION_CHANGED", "자료 설정이 바뀌었습니다. 현재 버전을 확인한 뒤 다시 분석하세요.");
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
    fields(request, "date", "days", "operationId", "materialIds", "sourceRanges");
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
    TreeSet<String> materialIds = null;
    if (request.has("materialIds")) {
      require(request.path("materialIds").isArray() && request.path("materialIds").size() > 0 && request.path("materialIds").size() <= 100);
      materialIds = new TreeSet<>();
      for (JsonNode id : request.path("materialIds")) { require(id.isString() && !id.asString().isBlank() && id.asString().length() <= 180); require(materialIds.add(id.asString())); }
    }
    final Set<String> selection = materialIds;
    var ranges = new TreeMap<String, StudySourceSelection.PageRange>();
    if (request.has("sourceRanges")) {
      require(selection != null && request.path("sourceRanges").isObject());
      for (var entry : request.path("sourceRanges").properties()) {
        require(selection.contains(entry.getKey()));
        var range = entry.getValue();
        fields(range, "firstPage", "lastPage");
        int first = positive(range, "firstPage"), last = positive(range, "lastPage");
        require(first <= last && last <= StudySourceSelection.MAX_PAGES);
        ranges.put(entry.getKey(), new StudySourceSelection.PageRange(first, last));
      }
    }
    return tx(() -> plan(owner, date, days, "manual/" + op, selection, ranges));
  }

  List<ObjectNode> plan(UUID owner, LocalDate date, int days, String key) {
    return plan(owner, date, days, key, null);
  }

  List<ObjectNode> plan(UUID owner, LocalDate date, int days, String key, Set<String> materialIds) {
    return plan(owner, date, days, key, materialIds, Map.of());
  }

  List<ObjectNode> plan(UUID owner, LocalDate date, int days, String key, Set<String> materialIds,
      Map<String, StudySourceSelection.PageRange> ranges) {
    workspace(owner);
    ObjectNode rangeSnapshot = JSON.createObjectNode();
    ranges.forEach((id, range) -> rangeSnapshot.putObject(id)
        .put("firstPage", range.firstPage()).put("lastPage", range.lastPage()));
    var previous = jobs.findByOwnerIdAndKindAndJobKey(owner, "GENERATE", key + "/0");
    if (previous.isPresent()) {
      JsonNode old = JSON.readTree(previous.get().input);
      require(
          old.path("date").asString().equals(date.toString())
              && old.path("batchDays").asInt() == days);
      var oldSelection = new TreeSet<String>();
      old.path("selectedMaterialIds").forEach(id -> oldSelection.add(id.asString()));
      require(materialIds == null ? !old.has("selectedMaterialIds") : old.has("selectedMaterialIds") && oldSelection.equals(materialIds));
      require(old.has("sourceRanges") ? old.path("sourceRanges").equals(rangeSnapshot) : ranges.isEmpty());
      var result = new ArrayList<ObjectNode>();
      for (int i = 0; i < days; i++)
        result.add(
            publicJob(
                jobs.findByOwnerIdAndKindAndJobKey(owner, "GENERATE", key + "/" + i)
                    .orElseThrow()));
      return result;
    }
    List<StudySourceSelection.Candidate> candidates = new ArrayList<>();
    ObjectNode sourceInventory = JSON.createObjectNode();
    var indices = jobs.findByOwnerIdAndKindOrderByCreatedAtDesc(owner, "INDEX").stream().filter(j -> j.state.equals("READY")).toList();
    var eligibleSelection = new HashSet<String>();
    for (StudyRecord m : study.records().findByOwnerIdAndKind(owner, "MATERIAL")) {
      JsonNode meta = JSON.readTree(m.payload);
      if (!meta.path("active").asBoolean(true) || (materialIds == null ? !meta.path("included").asBoolean() : !materialIds.contains(m.recordKey))) continue;
      var latest =
          indices.stream()
              .filter(
                  j -> {
                    JsonNode p = JSON.readTree(j.input);
                    return p.path("materialId").asString().equals(m.recordKey)
                        && p.path("materialVersion").asInt() == meta.path("version").asInt();
                  })
              .findFirst();
      if (latest.isPresent()) {
        var range = ranges.getOrDefault(m.recordKey, StudySourceSelection.PageRange.ALL);
        JsonNode indexing = JSON.readTree(latest.get().receipt);
        int pages = indexing.path("pages").asInt();
        if (ranges.containsKey(m.recordKey) && pages > 0 && range.lastPage() > pages)
          throw new StudyException(422, "NEEDS_SOURCE_REVIEW", "선택 범위가 PDF의 " + pages + "쪽을 넘습니다.");
        var inventory = StudySourceSelection.load(excerpts, owner, latest.get().id, range);
        ObjectNode summary = sourceInventory.putObject(m.recordKey)
            .put("physicalPages", pages)
            .put("eligiblePages", inventory.candidates.size())
            .put("materialVersion", meta.path("version").asInt());
        var counts = summary.putObject("classifications");
        inventory.diagnostics.forEach(counts::put);
        if (inventory.candidates.size() >= 2 || inventory.candidates.stream()
            .anyMatch(c -> c.excerpt().body.length() >= 420)) {
          candidates.addAll(inventory.candidates);
          eligibleSelection.add(m.recordKey);
        } else if (materialIds != null) {
          throw new StudyException(409, "NEEDS_SOURCE_REVIEW",
              "출제할 본문 부족 (신뢰 가능한 PDF 페이지 " + inventory.candidates.size()
                  + "개). 본문 장의 범위를 넓히거나 색인과 PDF 텍스트를 확인하세요.");
        }
      }
    }
    if (materialIds != null && !eligibleSelection.equals(materialIds))
      throw new StudyException(409, "SOURCE_INDEX_REQUIRED", "선택한 자료의 현재 버전에 사용 가능한 분석 결과가 필요합니다.");
    if (candidates.isEmpty()) {
      if (!sourceInventory.isEmpty()) throw new StudyException(409, "NEEDS_SOURCE_REVIEW",
          "출제할 본문 부족. PDF 본문 범위를 선택하거나 텍스트가 있는 자료로 교체하세요.");
      throw new StudyException(409, "SOURCE_INDEX_REQUIRED", "포함된 자료의 현재 버전을 색인한 뒤 생성하세요.");
    }
    candidates.sort(Comparator.comparing((StudySourceSelection.Candidate c) -> c.excerpt().materialId)
        .thenComparingInt(c -> c.excerpt().pageIndex));
    var passageConcepts = new HashMap<String, String>();
    candidates.forEach(c -> passageConcepts.put(c.excerpt().id.toString(), c.conceptId()));
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
            for (var answerKey : JSON.readTree(b.answerKeys))
              if (answerKey.path("binding").path("part").asString().equals(part)
                  && answerKey.path("binding").path("questionId").equals(q.path("id")))
                answerKey.path("citations").forEach(ref -> {
                  String concept = passageConcepts.get(ref.path("excerptId").asString());
                  if (concept != null) learned.add(concept);
                });
            passageConcepts.forEach((id, concept) -> {
              if (section.contains(id)) learned.add(concept);
            });
          }
    }
    var reviewPassages = candidates.stream().filter(c -> learned.contains(c.conceptId())).toList();
    var newPassages = candidates.stream().filter(c -> !learned.contains(c.conceptId())).toList();
    boolean history = !reviewPassages.isEmpty();
    var policies = study.records().findByOwnerIdAndKind(owner, "POLICY");
    List<ObjectNode> result = new ArrayList<>();
    boolean explicitDayRange = days == 1 && materialIds != null && materialIds.size() == 1
        && ranges.size() == 1;
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
      var pool = review ? reviewPassages : newPassages.isEmpty() ? candidates : newPassages;
      var selectedPassages = explicitDayRange ? StudySourceSelection.acrossRange(pool)
          : StudySourceSelection.daily(pool, i, days, goalSnapshot);
      ObjectNode p = StudyEngineRules.plan(day, effective(policies, day),
          selectedPassages.stream().map(StudySourceSelection.Candidate::excerpt).toList(), i, history);
      p.set("sourceRanges", rangeSnapshot);
      p.set("sourceInventory", sourceInventory);
      if (materialIds != null) { var selected = p.putArray("selectedMaterialIds"); new TreeSet<>(materialIds).forEach(selected::add); }
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
      p.put("plannedTopic", engineTopic(owner, p));
      StudyQuality.blueprint(p, selectedPassages, i);
      var old =
          study.books().findByOwnerIdOrderByCreatedAtAsc(owner).stream()
              .filter(b -> b.studyDate.equals(day))
              .max(Comparator.comparingInt(b -> b.workbookVersion));
      p.put("workbookId", old.map(b -> b.workbookId).orElse("study-" + day));
      p.put("workbookVersion", old.map(b -> b.workbookVersion + 1).orElse(1));
      p.put("batchId", hash(owner + "/" + key).substring(0, 32))
          .put("batchDays", days);
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
      p.put("inputDigest", hash(p.toString()));
      result.add(publicJob(enqueue(owner, "GENERATE", key + "/" + i, p)));
    }
    return result;
  }

  String engineTopic(UUID owner, JsonNode plan) {
    if (plan.has("plannedTopic")) return text(plan, "plannedTopic", 300);
    JsonNode primary = plan.path("passages").get(0);
    var material =
        study
            .records()
            .findByOwnerIdAndKindAndRecordKey(
                owner,
                "MATERIAL_VERSION",
                primary.path("materialId").asString()
                    + "/"
                    + primary.path("materialVersion").asInt())
            .orElseThrow(StudyException::missing);
    String title = JSON.readTree(material.payload).path("title").asString();
    String label =
        switch (plan.path("tag").asString()) {
          case "review" -> "복습";
          case "application" -> "통합 적용";
          default -> "새 개념";
        };
    return title.substring(0, Math.min(180, title.length()))
        + " · "
        + label
        + " · "
        + plan.path("date").asString();
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
          int limit = j.kind.equals("GENERATE") && StudyQuality.enabled(JSON.readTree(j.input))
              ? 3 : 3 + j.manualRetries;
          if (j.attempts >= limit) {
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
    return claimWorker(worker, null);
  }

  public JsonNode claimWorker(StudyEngineWorker worker, UUID jobId) {
    tx(
        () -> {
          var w = workers.findById(worker.id).orElseThrow();
          w.lastSeen = Instant.now(clock);
          return null;
        });
    var kinds = Set.of("GENERATE", "COACH");
    if (jobId != null) return workerClaim(claim(worker.ownerId, jobId, worker.id, kinds));
    var candidates =
        tx(
            () ->
                jobs.findByOwnerIdAndKindInAndStateInOrderByCreatedAtAsc(
                    worker.ownerId,
                    kinds,
                    Set.of("QUEUED", "PARTIAL", "RUNNING"),
                    PageRequest.of(0, 100)));
    for (var j : candidates) {
      var claimed = claim(worker.ownerId, j.id, worker.id, kinds);
      if (claimed != null) return workerClaim(claimed);
    }
    return workerClaim(null);
  }

  private JsonNode workerClaim(StudyEngineJob claimed) {
    if (claimed == null) return JSON.createObjectNode().put("state", "IDLE");
    ObjectNode response = JSON.createObjectNode()
        .put("id", claimed.id.toString())
        .put("kind", claimed.kind)
        .put("leaseToken", claimed.leaseToken.toString())
        .put("leaseUntil", claimed.leaseUntil.toString())
        .set("input", workerInput(claimed));
    var feedback = response.path("input").path("repairFeedback");
    if (feedback.has("planDigest") && feedback.path("questions").isArray()
        && !feedback.path("issues").valueStream().anyMatch(code -> code.asString().equals("DAILY_REFLECTION_DIVERSITY"))
        && claimed.result != null && hash(claimed.result).equals(JSON.readTree(claimed.receipt).path("outputDigest").asString())) {
      var draft = object(claimed.result).without("independentReview").without("provenance");
      response.set("previousCandidate", draft);
      if (response.toString().length() > 1499000) response.remove("previousCandidate");
    }
    return response;
  }

  JsonNode workerInput(StudyEngineJob job) {
    var input = object(job.input);
    var receipt = JSON.readTree(job.receipt);
    var quality = receipt.path("quality");
    if (StudyQuality.enabled(input) && quality.has("issues")) {
      var feedback = object(quality.toString());
      var history = receipt.path("privateReviewAttempts");
      var latest = history.path(history.size() - 1);
      if (latest.path("questions").isArray() && latest.path("planDigest").equals(input.path("inputDigest"))
          && latest.path("outputDigest").equals(receipt.path("outputDigest"))) {
        feedback.set("previousAttempt", latest.path("attempt"));
        feedback.set("reviewVersion", latest.path("reviewVersion"));
        feedback.set("planDigest", latest.path("planDigest"));
        var findings = feedback.putArray("reviewFindings");
        latest.path("questions").valueStream().filter(finding -> finding.has("code")).forEach(finding -> {
          long occurrences = history.valueStream()
              .flatMap(attempt -> attempt.path("questions").valueStream())
              .filter(prior -> prior.path("part").equals(finding.path("part"))
                  && prior.path("order").equals(finding.path("order"))
                  && prior.path("code").equals(finding.path("code")))
              .count();
          findings.add(finding.deepCopy().asObject().put("occurrences", occurrences));
        });
      }
      input.set("repairFeedback", feedback);
    }
    return input;
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
            if (Set.of("READY", "PUBLISHED", "PARTIAL", "BLOCKED").contains(j.state)
                && Objects.equals(j.leaseToken, token)
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
      var repair = tx(() -> {
        var j = owned(worker.ownerId, id);
        if (!j.kind.equals("GENERATE") || !StudyQuality.enabled(JSON.readTree(j.input))) return null;
        require(worker.id.equals(j.workerId));
        lease(j, token);
        ObjectNode details = JSON.createObjectNode();
        ObjectNode privateReview = JSON.createObjectNode();
        if (e instanceof StudyQuality.Rejected rejected) {
          details = rejected.evaluation;
          privateReview = rejected.privateReview;
        } else details.putArray("issues").add(e.code);
        var receipt = object(j.receipt);
        receipt.withArrayProperty("qualityAttempts").add(details);
        String digest = hash(output.toString());
        receipt.put("error", "QUALITY_REVIEW_REQUIRED").put("outputDigest", digest);
        privateReview.put("attempt", j.attempts).put("outputDigest", digest)
            .put("planDigest", JSON.readTree(j.input).path("inputDigest").asString());
        receipt.withArrayProperty("privateReviewAttempts").add(privateReview);
        receipt.set("quality", details);
        j.result = output.toString();
        j.state = j.attempts < 3 ? "PARTIAL" : "BLOCKED";
        j.updatedAt = Instant.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        j.receipt = receipt.toString();
        return publicJob(j);
      });
      if (repair != null) return repair;
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
    var previousReceipt = JSON.readTree(j.receipt);
    for (String field : List.of("qualityAttempts", "privateReviewAttempts"))
      if (previousReceipt.path(field).isArray()) receipt.set(field, previousReceipt.path(field));
    boolean quality = StudyQuality.enabled(p);
    var sourceById = new HashMap<String, JsonNode>();
    if (quality) p.path("passages").forEach(ref -> sourceById.put(ref.path("id").asString(), ref));
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
            .put("topic", engineTopic(j.ownerId, p))
            .put("policyVersion", p.path("policy").path("version").asInt());
    pkg.set("required", output.path("required"));
    pkg.set("extension", output.path("extension"));
    var keys = JSON.createArrayNode();
    var hintPayload = JSON.createObjectNode();
    boolean dailyReflectionsStored = false;
    for (JsonNode k : output.path("keys")) {
      String part = part(k);
      var key = keys.addObject();
      key.putObject("binding")
          .put("workbookId", pkg.path("id").asString())
          .put("workbookVersion", pkg.path("version").asInt())
          .put("part", part)
          .put("questionId", k.path("questionId").asString())
          .put("questionVersion", 1);
      key.set("rubric", k.path("rubric"));
      if (k.has("incorrectReasons")) key.set("incorrectReasons", k.path("incorrectReasons"));
      if (quality) {
        JsonNode q = question(pkg, key.path("binding"));
        var source = q.path("source").asObject();
        var primary = sourceById.get(source.path("section").asString());
        source.put("section", StudyQuality.citationLabel(primary));
        hintPayload.withObjectProperty(part).set(q.path("id").asString(), k.path("hints"));
        key.put("model", StudyQuality.modelAnswer(q, k))
            .put("explanation", k.path("explanation").asString());
        var proof = key.putArray("citations");
        for (JsonNode ref : k.path("citations")) {
          var evidence = sourceById.get(ref.path("excerptId").asString());
          proof.addObject().put("excerptId", ref.path("excerptId").asString())
              .put("quote", ref.path("quote").asString())
              .put("label", StudyQuality.citationLabel(evidence));
        }
        if (!dailyReflectionsStored && part.equals("required")) {
          key.set("followUp", output.path("followUps"));
          dailyReflectionsStored = true;
        } else key.putArray("followUp");
      } else {
        key.put("model", k.path("model").asString() + "\n정답: " + k.path("answer").toString())
            .put("explanation", k.path("explanation").asString() + "\n근거: " + k.path("citations").toString());
        key.set("followUp", k.path("followUp"));
      }
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
    if (quality) b.hintPayload = hintPayload.toString();
    study.books().saveAndFlush(b);
    receipt.put("workbookId", b.workbookId).put("workbookVersion", b.workbookVersion);
    j.receipt = receipt.toString();
    // Engine results append immutable versions under the owner commit lock. They do not
    // invalidate a learner's unrelated draft revision; user commands retain V1 revision guards.
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
          var reviewedParts = new HashSet<String>();
          study.records().findByOwnerIdAndKind(owner, "REVIEW").stream()
              .filter(r -> book.rowId.equals(r.workbookRow))
              .forEach(r -> reviewedParts.add(JSON.readTree(r.payload).path("part").asString()));
          require(StudyQuality.enabled(input)
              ? reviewedParts.containsAll(Set.of("required", "extension"))
              : !reviewedParts.isEmpty());
          var render = enqueue(owner, "RENDER", id.toString(), input);
          return publicJob(render);
        });
  }

  public ObjectNode reissue(UUID id, JsonNode request) {
    fields(request, "operationId");
    String operation = text(request, "operationId", 36);
    UUID.fromString(operation);
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var original = owned(owner, id);
          require(
              original.kind.equals("GENERATE")
                  && Set.of("READY", "PUBLISHED").contains(original.state));
          String key = "reissue/" + id + "/" + operation;
          var previous = jobs.findByOwnerIdAndKindAndJobKey(owner, "GENERATE", key);
          if (previous.isPresent()) return publicJob(previous.get());
          ObjectNode input = object(original.input);
          var old =
              study
                  .books()
                  .findByOwnerIdAndWorkbookIdAndWorkbookVersion(
                      owner,
                      input.path("workbookId").asString(),
                      input.path("workbookVersion").asInt())
                  .orElseThrow(StudyException::missing);
          int version =
              study.books().findByOwnerIdOrderByCreatedAtAsc(owner).stream()
                      .filter(b -> b.workbookId.equals(old.workbookId))
                      .mapToInt(b -> b.workbookVersion)
                      .max()
                      .orElseThrow()
                  + 1;
          ObjectNode payload = object(old.payload);
          payload.put("version", version).put("topic", engineTopic(owner, input));
          JsonNode answerKeys = JSON.readTree(old.answerKeys);
          for (JsonNode answer : answerKeys)
            answer.path("binding").asObject().put("workbookVersion", version);
          var book = new StudyWorkbook();
          book.ownerId = owner;
          book.workbookId = old.workbookId;
          book.workbookVersion = version;
          book.studyDate = old.studyDate;
          book.payload = payload.toString();
          book.answerKeys = answerKeys.toString();
          book.hintPayload = old.hintPayload;
          study.books().saveAndFlush(book);
          input
              .put("workbookVersion", version)
              .put("plannedTopic", payload.path("topic").asString())
              .put("reissueOf", id.toString());
          var next = enqueue(owner, "GENERATE", key, input);
          next.state = "READY";
          next.result = original.result;
          next.receipt =
              object(original.receipt)
                  .put("state", "needs_owner_review")
                  .put("reissueOf", id.toString())
                  .put("questionData", "unchanged_new_workbook_version")
                  .put("modelInvoked", false)
                  .toString();
          return publicJob(next);
        });
  }

  public ObjectNode retry(UUID id) {
    UUID owner = study.owner();
    return tx(
        () -> {
          workspace(owner);
          var j = owned(owner, id);
          require(Set.of("FAILED", "BLOCKED", "PARTIAL").contains(j.state));
          if (j.kind.equals("GENERATE") && StudyQuality.enabled(JSON.readTree(j.input))
              && j.attempts >= 3)
            throw new StudyException(409, "QUALITY_REVIEW_REQUIRED", "검토 내역을 확인하고 새 생성 요청을 시작하세요.");
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
              if (e instanceof StudyException s && Set.of("NEEDS_SOURCE_REVIEW", "SOURCE_INDEX_REQUIRED").contains(s.code)) {
                j.state = "BLOCKED";
                j.receipt = JSON.createObjectNode().put("error", s.code).put("reason", s.getMessage()).toString();
              } else {
                j.state = e instanceof StudyException s && s.status == 503 ? "BLOCKED" : "PARTIAL";
                j.receipt = "{\"error\":\"ENGINE_IO_FAILED_RETRY_AVAILABLE\"}";
              }
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
