package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.hash;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;

/** Validates the independent examiner's private coverage and evidence bindings, not semantic truth. */
final class StudyAnswerGrounding {
  static final String VERSION = "study-answer-grounding-1";
  record Inventory(SortedMap<String,String> visible, SortedMap<String,String> targets, String digest) {}

  static Inventory inventory(JsonNode plan, String part, JsonNode q, JsonNode key) {
    var visible = new TreeMap<String,String>();
    for (String f : List.of("prompt", "context", "guidance"))
      if (!q.path(f).asString("").isEmpty()) visible.put(f, q.path(f).asString());
    for (var o : q.path("options")) visible.put("option." + o.path("id").asString(), o.path("text").asString());
    for (var p : plan.path("passages"))
      if (p.path("id").equals(q.path("source").path("section")) && p.path("materialId").equals(q.path("source").path("materialId")))
        visible.put("source." + p.path("id").asString(), p.path("text").asString());
    var targets = new TreeMap<String,String>();
    for (String f : List.of("answer", "model", "explanation")) {
      var v = key.path(f);
      targets.put(f, v.isString() ? v.asString() : v.toString());
    }
    for (int i = 0; i < key.path("rubric").size(); i++) targets.put("rubric." + i, key.path("rubric").path(i).asString());
    for (int i = 0; i < key.path("reasoningMoves").size(); i++) targets.put("move." + i, key.path("reasoningMoves").path(i).asString());
    for (var e : key.path("incorrectReasons").properties()) targets.put("incorrect." + e.getKey(), e.getValue().asString());
    var values = new ArrayList<>(List.of(VERSION, plan.path("inputDigest").asString(), part,
        q.path("order").asString(), q.path("id").asString(), q.path("version").asString()));
    for (var group : List.of(visible, targets)) group.forEach((k,v) -> { values.add(k); values.add(v); });
    var encoded = new StringBuilder();
    values.forEach(v -> encoded.append(v.length()).append('#').append(v));
    return new Inventory(visible, targets, hash(encoded.toString()));
  }

  static ArrayNode inspect(Inventory in, JsonNode audit, boolean open) {
    var errors = JSON.createArrayNode();
    if (!VERSION.equals(audit.path("version").asString()) || !in.digest.equals(audit.path("digest").asString())) {
      error(errors, "binding", "STALE_OR_MISSING_AUDIT", "", "Review this exact version.");
      return errors;
    }
    var rows = audit.path("components");
    var seen = new HashSet<String>();
    if (!rows.isArray() || rows.size() != in.targets.size())
      error(errors, "coverage", "INCOMPLETE_KEY_COVERAGE", "", "Audit every component.");
    for (var row : rows) {
      String f = row.path("field").asString("");
      var claims = row.path("claims");
      if (!in.targets.containsKey(f) || !seen.add(f) || !claims.isArray() || claims.isEmpty() || claims.size() > 12) {
        error(errors, "coverage", "INVALID_COMPONENT", "", "Bind each component once.");
        continue;
      }
      for (var c : claims) {
        String anchor = c.path("anchor").asString("");
        String why = claimIssue(in, f, c, anchor);
        if (why != null) error(errors, f, why, anchor, c.path("justification").asString("") + " / " + c.path("repair").asString(""));
      }
    }
    String rubric = audit.path("rubric").asString("");
    if (!(rubric.equals("grounded") || (!open && rubric.equals("not_applicable"))) || !bounded(audit.path("rubricEvidence")))
      error(errors, "rubric", "UNSUPPORTED_GRADING_REQUIREMENT", "", audit.path("rubricEvidence").asString(""));
    return errors;
  }

  private static String claimIssue(Inventory in, String f, JsonNode c, String anchor) {
    if (!bounded(c.path("anchor")) || !in.targets.get(f).contains(anchor)) return "CLAIM_SPAN_MISMATCH";
    if (!bounded(c.path("justification")) || !bounded(c.path("repair"))) return "MISSING_JUSTIFICATION";
    if (!"supported".equals(c.path("verdict").asString())) return "UNSUPPORTED_CLAIM";
    String basis = c.path("basis").asString(""), use = c.path("treatment").asString("");
    if (!Set.of("asserted","conditional","unresolved").contains(use)
        || !Set.of("DIRECTLY_GIVEN","SOURCE_SUPPORTED","DERIVED","CONDITIONAL","UNKNOWN").contains(basis))
      return "UNKNOWN_CLASSIFICATION";
    if (basis.equals("UNKNOWN") && !use.equals("unresolved") || basis.equals("CONDITIONAL") && !use.equals("conditional"))
      return "HIDDEN_PREMISE";
    var refs = c.path("premises");
    if (!references(in.visible, refs, 5) || refs.isEmpty()) return "PREMISE_BINDING";
    if (basis.equals("SOURCE_SUPPORTED") && refs.valueStream().noneMatch(v -> v.path("field").asString().startsWith("source."))) return "SOURCE_BINDING";
    if (basis.equals("DIRECTLY_GIVEN") && refs.valueStream().noneMatch(v -> !v.path("field").asString().startsWith("source."))) return "SCENARIO_BINDING";
    var scope = c.path("scope");
    if (!c.path("negativeFact").isBoolean() || !references(in.visible, scope, 2)
        || c.path("negativeFact").asBoolean() && use.equals("asserted") && scope.isEmpty()) return "OBSERVATION_SCOPE";
    return null;
  }

  private static boolean references(Map<String,String> visible, JsonNode refs, int max) {
    return refs.isArray() && refs.size() <= max && refs.valueStream().allMatch(r -> {
      String original = visible.get(r.path("field").asString(""));
      return original != null && bounded(r.path("quote")) && original.contains(r.path("quote").asString());
    });
  }

  private static boolean bounded(JsonNode v) { return v.isString() && !v.asString().isBlank() && v.asString().length() <= 750; }
  private static void error(ArrayNode errors, String field, String reason, String anchor, String repair) {
    if (errors.size() < 45) errors.addObject().put("field", field).put("reason", reason)
        .put("anchor", anchor.substring(0, Math.min(180,anchor.length())))
        .put("repair", repair.substring(0, Math.min(550,repair.length())));
  }
  private StudyAnswerGrounding() {}
}
