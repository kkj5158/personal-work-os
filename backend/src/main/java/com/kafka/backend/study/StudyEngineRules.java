package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;
import static com.kafka.backend.study.StudyValidation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Pure policy, planning and validation rules shared by manual and scheduled execution. */
final class StudyEngineRules {
  static final ZoneId KST = ZoneId.of("Asia/Seoul");
  static final String VERSION = "study-engine-v2.1";

  static String hash(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  static String hash(String s) {
    return hash(s.getBytes(StandardCharsets.UTF_8));
  }

  static ObjectNode object(String s) {
    return (ObjectNode) JSON.readTree(s);
  }

  static ObjectNode effective(List<StudyRecord> records, LocalDate target) {
    String week = target.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();
    return records.stream()
        .map(r -> object(r.payload))
        .filter(p -> p.path("effectiveWeek").asString().compareTo(week) <= 0)
        .filter(p -> !p.has("expiresWeek") || p.path("expiresWeek").asString().compareTo(week) > 0)
        .max(Comparator.comparingInt(p -> p.path("version").asInt()))
        .orElseThrow(StudyException::missing);
  }

  static Instant nextRun(Instant now, String time) {
    var z = now.atZone(KST);
    var due =
        z.toLocalDate()
            .with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
            .atTime(LocalTime.parse(time))
            .atZone(KST);
    if (!due.toInstant().isAfter(now)) due = due.plusWeeks(1);
    return due.toInstant();
  }

  static ObjectNode format(JsonNode policy) {
    if (policy.has("questionFormat")) return (ObjectNode) policy.path("questionFormat").deepCopy();
    ObjectNode f = JSON.createObjectNode();
    f.putObject("required")
        .put("single_choice", policy.path("format").asString().equals("case") ? 3 : 5)
        .put(
            policy.path("format").asString().equals("case") ? "case_analysis" : "essay",
            policy.path("format").asString().equals("case") ? 2 : 1);
    f.putObject("extension").put("case_analysis", 2);
    return f;
  }

  static void validateFormat(JsonNode f) {
    fields(f, "required", "extension");
    for (String part : List.of("required", "extension")) {
      require(f.path(part).isObject());
      int total = 0;
      for (var e : f.path(part).properties()) {
        require(SCHEMAS.containsKey(e.getKey()));
        require(
            e.getValue().isIntegralNumber()
                && e.getValue().asDouble() >= 0
                && e.getValue().asDouble() <= 40);
        total += e.getValue().asInt();
      }
      require(total > 0 && total <= 40);
    }
  }

  static ObjectNode excerpt(StudySourceExcerpt e) {
    return JSON.createObjectNode()
        .put("id", e.id.toString())
        .put("materialId", e.materialId)
        .put("materialVersion", e.materialVersion)
        .put("assetId", e.assetId.toString())
        .put("sourceHash", e.sourceHash)
        .put("pageIndex", e.pageIndex)
        .put("ordinal", e.ordinal)
        .put("pageLabel", e.pageLabel)
        .put("text", e.body)
        .put("quality", e.quality)
        .put("parserVersion", e.parserVersion);
  }

  static ObjectNode plan(
      LocalDate date,
      ObjectNode policy,
      List<StudySourceExcerpt> passages,
      int day,
      boolean history) {
    require(!passages.isEmpty());
    ObjectNode p =
        JSON.createObjectNode()
            .put("schemaVersion", VERSION)
            .put("date", date.toString())
            .put("week", date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString())
            .put("history", history ? "recorded_history" : "no_history")
            .put("promptVersion", VERSION)
            .put("interestEvidence", "registered_materials_only");
    p.set("policy", policy);
    p.set("questionFormat", format(policy));
    validateFormat(p.path("questionFormat"));
    p.putObject("minutes").put("required", 15).put("extension", 30);
    var ratio = p.putObject("weeklyTarget");
    ratio.put("new", history ? 60 : 85).put("review", history ? 25 : 0).put("application", 15);
    p.putArray("prerequisites");
    p.put(
        "prerequisiteEvidence",
        "No explicit prerequisite graph registered; follow source page order.");
    var a = p.putArray("passages");
    for (int i = 0; i < Math.min(passages.size(), 4); i++)
      a.add(excerpt(passages.get((day * 3 + i) % passages.size())));
    p.put("tag", history && day % 4 == 3 ? "review" : day == 6 ? "application" : "new");
    return p;
  }

  static String normalized(String s) {
    return s.toLowerCase(Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
  }

  static void safeText(JsonNode n) {
    if (n.isString())
      require(!n.asString().matches("(?is).*(<[^>]+>|```|javascript:|data:text/html|<script).*"));
    else if (n.isContainer()) n.forEach(StudyEngineRules::safeText);
  }

  /** Reject structural errors; honest review warnings never certify semantic correctness. */
  static ObjectNode validate(JsonNode output, JsonNode plan, Set<String> recent) {
    fields(output, "topic", "required", "extension", "keys", "provenance");
    safeText(output);
    text(output, "topic", 1000);
    fields(output.path("provenance"), "provider", "model", "promptVersion");
    text(output.path("provenance"), "provider", 100);
    text(output.path("provenance"), "model", 180);
    require(text(output.path("provenance"), "promptVersion", 100).equals(VERSION));
    Set<String> sources = new HashSet<>();
    Map<String, JsonNode> excerpts = new HashMap<>();
    for (JsonNode s : plan.path("passages")) {
      sources.add(s.path("materialId").asString());
      excerpts.put(s.path("id").asString(), s);
    }
    var receipt =
        JSON.createObjectNode()
            .put("schema", "automatically_checked")
            .put("grounding", "citation_and_exact_excerpt_checked")
            .put("logic", "structurally_checked_not_independent_truth")
            .put("state", "needs_owner_review");
    var warnings = receipt.putArray("warnings");
    warnings.add(
        "Review factual correctness, ambiguity, difficulty and semantic duplicates before"
            + " approval.");
    int total = 0;
    Set<String> qids = new HashSet<>();
    Map<String, JsonNode> qs = new HashMap<>();
    for (String part : List.of("required", "extension")) {
      questions(output.path(part), sources);
      Map<String, Integer> actual = new TreeMap<>();
      int order = 0;
      for (JsonNode q : output.path(part)) {
        require(q.path("version").asInt() == 1);
        require(q.path("order").asInt() == ++order && qids.add(q.path("id").asString()));
        require(recent.add(normalized(q.path("prompt").asString())));
        actual.merge(q.path("kind").asString(), 1, Integer::sum);
        qs.put(part + "/" + q.path("id").asString(), q);
        total++;
      }
      Map<String, Integer> requested = new TreeMap<>();
      plan.path("questionFormat")
          .path(part)
          .properties()
          .forEach(
              e -> {
                if (e.getValue().asInt() > 0) requested.put(e.getKey(), e.getValue().asInt());
              });
      require(actual.equals(requested));
      int estimated =
          actual.entrySet().stream()
              .mapToInt(
                  e ->
                      e.getValue()
                          * (e.getKey().endsWith("choice") || e.getKey().equals("true_false")
                              ? 1
                              : e.getKey().equals("short_answer") ? 2 : 7))
              .sum();
      int target = plan.path("minutes").path(part).asInt();
      if (estimated < target / 2 || estimated > target * 3 / 2)
        warnings.add(
            part
                + ": estimated "
                + estimated
                + " min differs from target "
                + target
                + "; time is approximate.");
    }
    require(output.path("keys").isArray() && output.path("keys").size() == total);
    Set<String> seen = new HashSet<>();
    for (JsonNode k : output.path("keys")) {
      fields(
          k,
          "part",
          "questionId",
          "model",
          "explanation",
          "rubric",
          "incorrectReasons",
          "followUp",
          "answer",
          "citations");
      String key = part(k) + "/" + text(k, "questionId", 180);
      require(seen.add(key) && qs.containsKey(key));
      JsonNode q = qs.get(key);
      text(k, "model", 16000);
      text(k, "explanation", 16000);
      strings(k.path("rubric"), 30);
      require(k.path("rubric").size() > 0);
      strings(k.path("followUp"), 10);
      require(k.path("followUp").size() == 10);
      require(
          k.path("citations").isArray()
              && k.path("citations").size() > 0
              && k.path("citations").size() <= 4);
      boolean primaryGrounded = false;
      for (JsonNode c : k.path("citations")) {
        fields(c, "excerptId", "quote");
        JsonNode e = excerpts.get(text(c, "excerptId", 36));
        require(e != null);
        String quote = text(c, "quote", 3000);
        if (!e.path("text").asString().contains(quote) || quote.length() < 12)
          throw new StudyException(422, "SOURCE_QUOTE_MISMATCH", "인용문이 고정된 원문 구절과 일치하지 않습니다.");
        if (e.path("materialId").asString().equals(q.path("source").path("materialId").asString())
            && q.path("source").path("section").asString().contains(e.path("id").asString()))
          primaryGrounded = true;
      }
      if (!primaryGrounded)
        throw new StudyException(422, "PRIMARY_CITATION_REQUIRED", "문항의 주 출처 구절을 인용해야 합니다.");
      String kind = q.path("kind").asString();
      JsonNode answer = k.path("answer");
      Set<String> optionIds = new HashSet<>();
      Set<String> optionTexts = new HashSet<>();
      q.path("options")
          .forEach(
              o -> {
                require(optionTexts.add(normalized(o.path("text").asString())));
                optionIds.add(o.path("id").asString());
              });
      if (kind.equals("single_choice"))
        require(answer.isString() && optionIds.contains(answer.asString()));
      else if (kind.equals("multiple_choice")) {
        require(answer.isArray() && !answer.isEmpty());
        Set<String> answers = new HashSet<>();
        answer.forEach(
            a ->
                require(
                    a.isString() && optionIds.contains(a.asString()) && answers.add(a.asString())));
      } else if (kind.equals("true_false")) require(answer.isBoolean());
      else
        require(
            answer.isString()
                && !answer.asString().isBlank()
                && answer.asString().length() <= 16000);
      if (kind.endsWith("choice")) {
        require(k.path("incorrectReasons").isObject());
        for (String id : optionIds) {
          boolean correct =
              answer.isString()
                  ? answer.asString().equals(id)
                  : java.util.stream.StreamSupport.stream(answer.spliterator(), false)
                      .anyMatch(a -> a.asString().equals(id));
          if (!correct) text(k.path("incorrectReasons"), id, 16000);
        }
        k.path("incorrectReasons").propertyNames().forEach(id -> require(optionIds.contains(id)));
      }
    }
    return receipt.put("questionCount", total).put("validatedAt", Instant.now().toString());
  }

  private StudyEngineRules() {}
}
