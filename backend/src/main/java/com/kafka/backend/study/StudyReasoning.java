package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.require;
import static com.kafka.backend.study.StudyValidation.*;
import java.util.*;
import tools.jackson.databind.JsonNode;


/** Private worker contract. Return only fixed reason codes and slot coordinates in public receipts. */
final class StudyReasoning {
  static final String VERSION = "study-reasoning-blueprint-v1";
  static final String REVIEW = "study-blueprint-review-1";
  static final Set<String> ISSUES = Set.of("SINGLE_CLUE_SHORTCUT", "COUNTERFACTUAL_FAILED",
      "AMBIGUOUS_CHOICE", "ABLATION_FAILED", "NEEDS_SOURCE_REVIEW", "TRIVIAL_REASONING",
      "SPOILS_ANSWER", "UNRELATED_DISTRACTOR", "UNSUPPORTED_INFERENCE", "UNCERTAIN",
      "INVALID_CASE", "DUPLICATE_CASE", "CONTRADICTORY_CASE");

  static boolean enabled(JsonNode plan) { return VERSION.equals(plan.path("reasoningContract").asString()); }

  static void check(JsonNode plan, JsonNode output) {
    var proof = output.path("preflight");
    require(VERSION.equals(proof.path("version").asString()) && REVIEW.equals(proof.path("reviewVersion").asString())
        && plan.path("inputDigest").isString() && proof.path("inputDigest").equals(plan.path("inputDigest")));
    var slots = plan.path("blueprint").path("slots");
    var records = proof.path("slots");
    require(records.isArray() && records.size() == slots.path("required").size() + slots.path("extension").size());
    var seen = new HashSet<String>();
    var summary = JSON.createObjectNode();
    var codes = summary.putArray("issues");
    var items = summary.putArray("questions");
    var diagnostic = JSON.createObjectNode().put("reviewVersion", REVIEW);
    var findings = diagnostic.putArray("questions");
    boolean candidate = output.has("required");
    for (var r : records) {
      String part = part(r);
      int order = positive(r, "order");
      var slot = slots.path(part).path(order - 1);
      require(slot.isObject() && slot.path("kind").equals(r.path("kind")) && seen.add(part + "/" + order));
      if (r.path("issue").isString()) {
        String code = r.path("issue").asString();
        require(!candidate && ISSUES.contains(code));
        if (codes.valueStream().noneMatch(n -> code.equals(n.asString()))) codes.add(code);
        items.addObject().put("part", part).put("order", order).putArray("issues").add(code);
        var f = findings.addObject().put("part", part).put("order", order).put("code", code);
        String evidence = r.path("review").path("evidence").asString("");
        f.put("evidence", evidence.isBlank() ? code : evidence.substring(0, Math.min(800, evidence.length())));
        continue;
      }
      require(r.path("issue").isNull());
      var d = r.path("design");
      var review = r.path("review");
      for (var v : List.of(d, review))
        require(v.path("part").equals(r.path("part")) && v.path("order").equals(r.path("order")));
      require(Set.of("diagnose", "compare_remedies", "source_authority", "predict_failure", "next_test", "sequence", "counterexample").contains(text(d, "pattern", 32)));
      require(Set.of("multi_evidence", "conditional_action").contains(text(d, "target", 32)));
      text(d, "scenario", 800);
      text(d, "objective", 800); text(d, "criteria", 800); text(d, "rationale", 800);
      require(d.path("hintPolicy").size() == 3 && d.path("notGiven").size() > 0);
      require(review.path("issue").asString().equals("none"));
      text(review, "evidence", 800);
      var binding = r.path("binding");
      var concept = plan.path("blueprint").path("testedConcepts").path(slot.path("conceptId").asString());
      require( concept.path("sourceVersion").equals(binding.path("materialVersion"))
          && concept.path("sourcePageRefs").valueStream().anyMatch(ref ->
              ref.path("excerptId").equals(d.path("excerptId")) && ref.path("excerptId").equals(binding.path("excerptId"))
              && ref.path("sourceHash").equals(binding.path("sourceHash")) && ref.path("pdfPage").equals(binding.path("pdfPage"))
              && ref.path("printedPage").equals(binding.path("printedPage"))));
      require(plan.path("passages").valueStream().anyMatch(p -> p.path("id").equals(binding.path("excerptId"))
          && p.path("materialVersion").equals(binding.path("materialVersion")) && p.path("sourceHash").equals(binding.path("sourceHash"))
          && p.path("pageIndex").equals(binding.path("pdfPage")) && p.path("quality").asString().equals("usable")));
      checkDecisions(d, review, slot.path("kind").asString());
      if (candidate) {
        var q = output.path(part).path(order - 1);
        require(q.isObject() && q.path("kind").equals(r.path("kind")) && q.path("id").equals(r.path("questionId"))
            && q.path("version").equals(r.path("questionVersion")) && q.path("source").path("section").equals(binding.path("excerptId")));
      }
    }
    if (!codes.isEmpty()) {
      summary.put("result", codes.valueStream().anyMatch(n -> n.asString().equals("NEEDS_SOURCE_REVIEW"))
          ? "BLUEPRINT_BLOCKED" : "BLUEPRINT_REPAIR_REQUIRED");
      throw new StudyQuality.Rejected(summary, diagnostic);
    }
    require(candidate && "study-v31-review-2".equals(output.path("independentReview").path("version").asString()));
  }

  private static void checkDecisions(JsonNode d, JsonNode review, String kind) {
    int n = d.path("factors").size(), choices = d.path("alternatives").size();
    var cases = d.path("cases");
    var answers = review.path("answers");
    boolean multi = "multi_evidence".equals(d.path("target").asString());
    for (String field : List.of("factors", "alternatives", "hintPolicy", "notGiven")) {
      var values = new HashSet<String>();
      require(d.path(field).isArray());
      for (var v : d.path(field)) require(v.isString() && !v.asString().isBlank() && v.asString().length() <= 800 && values.add(v.asString()));
    }
    require(n >= 1 && n <= 3 && choices >= 2 && choices <= 6 && cases.size() >= 2 && cases.size() <= 8
        && answers.size() == cases.size() + n && (!multi || n >= 2) && (multi || !kind.equals("single_choice")));
    var seen = new HashSet<JsonNode>();
    var base = cases.path(0);
    for (int i = 0; i < cases.size(); i++) {
      var c = cases.path(i);
      var best = c.path("best");
      require(c.path("values").size() == n && seen.add(c.path("values")) && best.isIntegralNumber()
          && best.asInt() >= 0 && best.asInt() < choices && answers.path(i).isArray()
          && answers.path(i).valueStream().anyMatch(best::equals));
      var strongest = new HashSet<Integer>();
      for (var a : answers.path(i)) require(a.isIntegralNumber() && a.asInt() >= 0 && a.asInt() < choices && strongest.add(a.asInt()));
      if (kind.equals("single_choice")) require(strongest.size() == 1);
      if (i > 0 && !best.equals(base.path("best"))) require(strongest.size() != answers.path(0).size()
          || answers.path(0).valueStream().anyMatch(a -> !strongest.contains(a.asInt())));
    }
    for (int axis = 0; axis < n; axis++) {
      boolean witness = false, sharedClue = false;
      var plausible = answers.path(cases.size() + axis);
      var ids = new HashSet<Integer>();
      for (var a : plausible) require(a.isIntegralNumber() && a.asInt() >= 0 && a.asInt() < choices && ids.add(a.asInt()));
      for (var c : cases) {
        boolean sameOthers = true;
        for (int j = 0; j < n; j++)
          if (j != axis && !base.path("values").path(j).equals(c.path("values").path(j))) sameOthers = false;
        boolean otherAnswer = !base.path("best").equals(c.path("best"));
        if (sameOthers) {
          require(ids.contains(c.path("best").asInt()));
          witness |= otherAnswer;
        }
        sharedClue |= otherAnswer && base.path("values").path(axis).equals(c.path("values").path(axis));
      }
      require(ids.stream().anyMatch(id -> answers.path(0).valueStream().noneMatch(a -> id == a.asInt())));
      require(witness && (!multi || sharedClue));
    }
  }

  /** Check immutable parts on the server even if a worker sends a full replacement. */
  static void preserve(JsonNode previous, JsonNode quality, JsonNode next) {
    if (!next.has("required")) return;
    var draft = previous.has("previousCandidate") ? previous.path("previousCandidate") : previous;
    var targets = previous.has("repairTargets") ? previous.path("repairTargets") : quality.path("questions");
    if (!draft.has("required") || !targets.isArray() || targets.isEmpty()) return;
    boolean daily = quality.path("issues").valueStream().anyMatch(n -> n.asString().equals("DAILY_REFLECTION_DIVERSITY"));
    if (!daily) unchanged(draft.path("followUps").equals(next.path("followUps")));
    for (var item : targets) {
      String part = part(item);
      int order = item.path("order").asInt();
      var old = draft.path(part).path(order - 1);
      var replacement = next.path(part).path(order - 1);
      for (String name : List.of("id", "version", "order", "kind")) unchanged(old.path(name).equals(replacement.path(name)));
      if (!item.path("issues").isEmpty()) continue;
      unchanged(old.equals(replacement));
      var key = draft.path("keys").valueStream().filter(k -> k.path("part").equals(item.path("part"))
          && k.path("questionId").equals(old.path("id"))).findFirst().orElseThrow();
      unchanged(next.path("keys").valueStream().anyMatch(key::equals));
    }
  }

  private static void unchanged(boolean condition) {
    if (!condition) throw new StudyException(422, "PROTECTED_SLOT_CHANGED", "통과한 문항이나 일일 후속 질문이 바뀌었습니다.");
  }

  private StudyReasoning() {}
}
