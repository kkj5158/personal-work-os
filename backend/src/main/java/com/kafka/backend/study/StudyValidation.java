package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

/** Mirrors the public renderer contract; rejects answer/executable fields at the trust boundary. */
final class StudyValidation {
  static final JsonMapper JSON = JsonMapper.builder().build();
  static final Map<String, String> SCHEMAS =
      Map.of(
          "single_choice",
          "option",
          "multiple_choice",
          "options",
          "true_false",
          "boolean",
          "short_answer",
          "text",
          "essay",
          "text",
          "case_analysis",
          "text",
          "diagram",
          "attachment");

  static String text(JsonNode n, String field, int max) {
    JsonNode v = n.path(field);
    require(v.isString() && !v.asString().isBlank() && v.asString().length() <= max);
    return v.asString();
  }

  static int positive(JsonNode n, String field) {
    require(
        n.path(field).isIntegralNumber()
            && n.path(field).asDouble() > 0
            && n.path(field).asDouble() <= Integer.MAX_VALUE
            && n.path(field).asInt() > 0);
    return n.path(field).asInt();
  }

  static void fields(JsonNode n, String... allowed) {
    require(n.isObject());
    Set<String> keys = Set.of(allowed);
    n.propertyNames().forEach(k -> require(keys.contains(k)));
  }

  static String week(Clock clock) {
    return LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")))
        .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        .toString();
  }

  static String nextWeek(Clock clock) {
    return LocalDate.parse(week(clock)).plusDays(7).toString();
  }

  static String binding(JsonNode pkg, String part, JsonNode q) {
    return JSON.writeValueAsString(
        List.of(
            pkg.path("id").asString(),
            pkg.path("version").asInt(),
            part,
            q.path("id").asString(),
            q.path("version").asInt()));
  }

  static String binding(JsonNode b) {
    return JSON.writeValueAsString(
        List.of(
            text(b, "workbookId", 180),
            positive(b, "workbookVersion"),
            part(b),
            text(b, "questionId", 180),
            positive(b, "questionVersion")));
  }

  static String part(JsonNode n) {
    String p = text(n, "part", 20);
    require(Set.of("required", "extension").contains(p));
    return p;
  }

  static JsonNode question(JsonNode pkg, JsonNode b) {
    String p = part(b);
    for (JsonNode q : pkg.path(p))
      if (q.path("id").equals(b.path("questionId"))
          && q.path("version").equals(b.path("questionVersion"))) return q;
    throw invalid();
  }

  static void questions(JsonNode list, Set<String> sources) {
    require(list.isArray() && list.size() >= 1 && list.size() <= 40);
    Set<String> ids = new HashSet<>();
    Set<Integer> orders = new HashSet<>();
    for (JsonNode q : list) {
      fields(
          q,
          "id",
          "version",
          "order",
          "kind",
          "prompt",
          "context",
          "options",
          "responseSchema",
          "source",
          "guidance",
          "rows");
      require(ids.add(text(q, "id", 180)) && orders.add(positive(q, "order")));
      positive(q, "version");
      text(q, "prompt", 16000);
      String kind = text(q, "kind", 30);
      require(SCHEMAS.containsKey(kind) && SCHEMAS.get(kind).equals(text(q, "responseSchema", 30)));
      fields(q.path("source"), "materialId", "section");
      require(sources.contains(text(q.path("source"), "materialId", 180)));
      text(q.path("source"), "section", 16000);
      if (kind.equals("case_analysis") || q.has("context")) text(q, "context", 16000);
      if (q.has("guidance")) text(q, "guidance", 16000);
      if (q.has("rows")) require(positive(q, "rows") <= 30);
      if (kind.endsWith("choice")) {
        JsonNode options = q.path("options");
        require(options.isArray() && options.size() >= 2 && options.size() <= 6);
        Set<String> optionIds = new HashSet<>();
        for (JsonNode o : options) {
          fields(o, "id", "text");
          require(optionIds.add(text(o, "id", 180)));
          text(o, "text", 16000);
        }
      } else require(!q.has("options"));
    }
  }

  static boolean empty(JsonNode q, JsonNode r) {
    return r.isObject()
        && r.size() == 1
        && ((r.has("text") && r.path("text").isString() && r.path("text").asString().isBlank())
            || (q.path("kind").asString().equals("multiple_choice")
                && r.path("selected").isArray()
                && r.path("selected").isEmpty()));
  }

  static void response(JsonNode q, JsonNode r) {
    require(r.isObject() && r.size() == 1);
    Set<String> options = new HashSet<>();
    q.path("options").forEach(o -> options.add(o.path("id").asString()));
    switch (q.path("kind").asString()) {
      case "single_choice" ->
          require(
              r.has("selected")
                  && r.path("selected").isString()
                  && options.contains(r.path("selected").asString()));
      case "multiple_choice" -> {
        JsonNode s = r.path("selected");
        require(s.isArray() && !s.isEmpty() && s.size() <= 6);
        Set<String> seen = new HashSet<>();
        s.forEach(
            v -> require(v.isString() && options.contains(v.asString()) && seen.add(v.asString())));
      }
      case "true_false" -> require(r.has("value") && r.path("value").isBoolean());
      case "short_answer", "essay", "case_analysis" -> text(r, "text", 16000);
      default -> throw invalid();
    }
  }

  static void workbook(JsonNode p, JsonNode keys, Set<String> sources, Set<Integer> policies) {
    fields(p, "id", "version", "date", "topic", "policyVersion", "required", "extension");
    text(p, "id", 180);
    positive(p, "version");
    text(p, "topic", 1000);
    require(policies.contains(positive(p, "policyVersion")));
    String date = text(p, "date", 10);
    try {
      require(LocalDate.parse(date).toString().equals(date));
    } catch (DateTimeException e) {
      throw invalid();
    }
    questions(p.path("required"), sources);
    questions(p.path("extension"), sources);
    Map<String, JsonNode> expected = new HashMap<>();
    for (String part : List.of("required", "extension"))
      for (JsonNode q : p.path(part)) expected.put(binding(p, part, q), q);
    require(keys.isArray() && keys.size() == expected.size());
    Set<String> seen = new HashSet<>();
    for (JsonNode k : keys) {
      fields(k, "binding", "model", "explanation", "rubric", "incorrectReasons", "followUp");
      JsonNode b = k.path("binding");
      fields(b, "workbookId", "workbookVersion", "part", "questionId", "questionVersion");
      String key = binding(b);
      require(expected.containsKey(key) && seen.add(key));
      text(k, "model", 16000);
      text(k, "explanation", 16000);
      strings(k.path("rubric"), 30);
      strings(k.path("followUp"), 30);
      if (k.has("incorrectReasons")) {
        require(k.path("incorrectReasons").isObject());
        Set<String> options = new HashSet<>();
        expected.get(key).path("options").forEach(o -> options.add(o.path("id").asString()));
        k.path("incorrectReasons")
            .properties()
            .forEach(
                e -> {
                  require(options.contains(e.getKey()));
                  require(
                      e.getValue().isString()
                          && !e.getValue().asString().isBlank()
                          && e.getValue().asString().length() <= 16000);
                });
      }
    }
  }

  static void strings(JsonNode n, int max) {
    require(n.isArray() && n.size() <= max);
    n.forEach(
        v -> require(v.isString() && !v.asString().isBlank() && v.asString().length() <= 16000));
  }

  private StudyValidation() {}
}
