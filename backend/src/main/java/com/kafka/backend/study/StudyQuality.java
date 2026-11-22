package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyValidation.*;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Deterministic checks flag inspectable risks. Only the owner decides teaching accuracy. */
final class StudyQuality {
  private static final Pattern TRIVIA = Pattern.compile(
      "(?i)\\bISBN\\b|\\b(?:cover subtitle|copyright page|publisher name|table of contents)\\b|발행일|판권|표지\\s*(?:문구|제목|부제)|목차\\s*(?:에|에서)|출판사\\s*(?:이름|명)");
  private static final Pattern INTERNAL = Pattern.compile(
      "(?i)excerptId\\s*=|pageIndex\\s*=|구절 식별자|\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b");
  private static final Pattern ANSWER_MARKER = Pattern.compile(
      "(?im)(?:^|[.!?]\\s+)(?:\\s*(?:정답|답안|answer)\\s*[:：]|\\s*[A-F]\\s*(?:번이 정답|가 정답|를 고르| is (?:the )?(?:correct|answer)))");
  private static final String[] FOCI = {
      "원인 진단", "근거 비교", "조건 검증", "대안의 비용 비교", "실패 조건 예측", "현실 사례에 적용", "검증 절차 설계"
  };

  static boolean enabled(JsonNode plan) {
    return QUALITY_VERSION.equals(plan.path("schemaVersion").asString());
  }

  static void blueprint(ObjectNode plan, List<StudySourceSelection.Candidate> passages, int day) {
    plan.put("schemaVersion", QUALITY_VERSION).put("promptVersion", QUALITY_VERSION);
    var blueprint = plan.putObject("blueprint")
        .put("learningObjective", plan.path("plannedTopic").asString() + "의 근거를 해석하고 사례의 해결책을 비교·설계한다.")
        .put("decisionStandard", "학습자가 관찰이나 자료의 역할을 해석하고, 같은 제약 아래 가능해 보이는 대응을 비교해야 한다. 관찰 근거는 제시하되 승패를 결정하는 판단은 미리 내려 주지 않는다.")
        .put("knowledgeDifficulty", 3)
        .put("reasoningDemand", 4);
    blueprint.set("questionFormat", plan.path("questionFormat"));
    blueprint.set("targetMinutes", plan.path("minutes"));
    var concepts = blueprint.putObject("testedConcepts");
    for (var c : passages) {
      var e = c.excerpt();
      var concept = concepts.withObjectProperty(c.conceptId());
      concept.put("section", c.section()).put("sourceVersion", e.materialVersion);
      concept.withArrayProperty("sourcePageRefs").addObject()
          .put("excerptId", e.id.toString()).put("pdfPage", e.pageIndex)
          .put("printedPage", e.pageLabel).put("sourceHash", e.sourceHash);
    }
    var ids = new ArrayList<>(concepts.propertyNames());
    var slots = blueprint.putObject("slots");
    for (String part : List.of("required", "extension")) {
      var partSlots = slots.putArray(part);
      int order = 0;
      for (var format : plan.path("questionFormat").path(part).properties()) {
        for (int i = 0; i < format.getValue().asInt(); i++) {
          int position = order + (part.equals("required") ? 0 : 3);
          partSlots.addObject().put("order", ++order).put("kind", format.getKey())
              .put("conceptId", ids.get(Math.floorMod(position + day, ids.size())))
              .put("noveltyFocus", FOCI[Math.floorMod(position + day * 3, FOCI.length)])
              .putArray("expectedReasoningMoves").add("상황에서 중요한 제약 또는 누락된 근거를 식별")
              .add("출처 개념을 적용해 대안 선택이나 해결책을 정당화");
        }
      }
    }
  }

  static final class Rejected extends StudyException {
    final ObjectNode evaluation;
    final ObjectNode privateReview;
    Rejected(ObjectNode evaluation, ObjectNode privateReview) {
      super(422, "QUALITY_REVIEW_REQUIRED", "출제 품질을 다시 검토해야 합니다.");
      this.evaluation = evaluation;
      this.privateReview = privateReview;
    }
  }

  private record ReviewVerdict(String issue, String evidence, String answerCue, String revisedJudgment) {}

  static String modelAnswer(JsonNode question, JsonNode key) {
    JsonNode answer = key.path("answer");
    if (question.path("kind").asString().endsWith("choice")) {
      var selected = new TreeSet<String>();
      if (answer.isArray()) answer.forEach(a -> selected.add(a.asString()));
      else selected.add(answer.asString());
      return String.join(", ", selected) + " · " + key.path("model").asString();
    }
    if (answer.isBoolean()) return (answer.asBoolean() ? "참" : "거짓") + " · " + key.path("model").asString();
    return key.path("model").asString();
  }

  static String citationLabel(JsonNode excerpt) {
    String physical = "PDF " + excerpt.path("pageIndex").asInt() + "쪽";
    String label = excerpt.path("pageLabel").asString("");
    return label.isBlank() || label.equals(excerpt.path("pageIndex").asString())
        ? physical : "인쇄 " + label + "쪽 (" + physical + ")";
  }

  static boolean repeats(String first, String second) {
    String a = normalized(first).replaceAll("\\d+", ""), b = normalized(second).replaceAll("\\d+", "");
    if (a.isBlank() || b.isBlank()) return false;
    if (a.equals(b)) return true;
    var x = grams(a);
    var y = grams(b);
    int union = x.size() + y.size();
    x.retainAll(y);
    return union > 0 && x.size() >= 8 && (double) x.size() / (union - x.size()) >= 0.73;
  }

  private static Set<String> grams(String value) {
    Set<String> out = new HashSet<>();
    for (int i = 0; i + 3 <= value.length(); i++) out.add(value.substring(i, i + 3));
    return out;
  }

  static List<String> questionIssues(JsonNode q, JsonNode k) {
    List<String> issues = new ArrayList<>();
    String stem = q.path("prompt").asString();
    String context = q.path("context").asString("");
    var moves = k.path("reasoningMoves");
    if (TRIVIA.matcher(stem).find() || TRIVIA.matcher(context).find()) issues.add("FRONT_MATTER_TRIVIA");
    if (stem.length() + context.length() < 65 || !moves.isArray() || moves.size() < 2
        || moves.size() > 3 || !distinct(moves) || anyShort(moves, 8)) issues.add("REASONING_DEPTH");
    if (INTERNAL.matcher(stem + " " + context + " " + q.path("guidance").asString("")).find()
        || INTERNAL.matcher(k.path("model").asString() + " " + k.path("explanation").asString()).find()
        || ANSWER_MARKER.matcher(k.path("model").asString()).find())
      issues.add("PRESENTATION_INTEGRITY");
    if (k.path("explanation").asString().length() < 30 || k.path("rubric").size() < 2)
      issues.add("EXPLANATION_TOO_THIN");

    var answers = new HashSet<String>();
    JsonNode answer = k.path("answer");
    if (answer.isArray()) answer.forEach(a -> answers.add(a.asString()));
    else if (answer.isString()) answers.add(answer.asString());
    var solutions = new ArrayList<String>();
    boolean weakAlternative = false;
    for (JsonNode option : q.path("options")) {
      String id = option.path("id").asString(), value = option.path("text").asString();
      if (answers.contains(id)) solutions.add(value);
      else if (value.length() < 10 || k.path("incorrectReasons").path(id).asString().length() < 10
          || TRIVIA.matcher(value).find()) weakAlternative = true;
    }
    if (weakAlternative || !distinct(k.path("incorrectReasons"))) issues.add("WEAK_DISTRACTORS");
    if (solutions.isEmpty() && answer.isString()) solutions.add(answer.asString());
    solutions.add(k.path("model").asString());

    var hints = k.path("hints");
    if (!hints.isArray() || hints.size() != 3 || !distinct(hints) || anyShort(hints, 10)
        || hints.valueStream().anyMatch(h -> h.asString().length() > 700)) {
      issues.add("HINT_PROGRESSION");
    } else if (hints.valueStream().anyMatch(h -> {
      String value = h.asString();
      String clean = normalized(value);
      return ANSWER_MARKER.matcher(value).find() || INTERNAL.matcher(value).find()
          || solutions.stream().anyMatch(s -> {
            String solution = normalized(s);
            return (solution.length() >= 6 && clean.contains(solution)) || repeats(value, s);
          }) || repeats(value, k.path("explanation").asString());
    })) issues.add("HINT_ANSWER_LEAK");

    if (q.path("kind").asString().equals("case_analysis")
        && (stem.length() + context.length() < 130 || moves.size() < 3 || k.path("rubric").size() < 3))
      issues.add("CASE_WORKLOAD_TOO_LOW");
    return issues;
  }

  private static boolean anyShort(JsonNode entries, int min) {
    return entries.valueStream().anyMatch(e -> !e.isString() || e.asString().strip().length() < min);
  }

  private static boolean distinct(JsonNode entries) {
    List<String> seen = new ArrayList<>();
    for (JsonNode e : entries) {
      String value = e.asString();
      if (seen.stream().anyMatch(prior -> repeats(prior, value))) return false;
      seen.add(value);
    }
    return true;
  }

  static ObjectNode assess(JsonNode output, JsonNode plan, Map<String, JsonNode> questions, Set<String> recent) {
    var receipt = JSON.createObjectNode().put("rubricVersion", "study-v31-rubric-1")
        .put("ownerApprovalRequired", true)
        .put("limitations", "자동 검사는 인용·구조·중복·누설 신호를 확인합니다. 사실 해석, 오답의 타당성, 난이도는 소유자 검토가 필요합니다.");
    receipt.set("learningObjective", plan.path("blueprint").path("learningObjective"));
    receipt.set("sourceInventory", plan.path("sourceInventory"));
    receipt.set("generation", output.path("provenance"));
    var reviewed = new HashMap<String, ReviewVerdict>();
    var privateReview = JSON.createObjectNode();
    var review = output.path("independentReview");
    if (output.path("provenance").path("provider").asString().equals("codex_cli") || output.has("independentReview")) {
      String version = review.path("version").asString();
      boolean bound = version.equals("study-v31-review-2");
      StudyException.require((bound || version.equals("study-v31-review-1"))
          && review.path("verdicts").isArray() && review.path("verdicts").size() == questions.size());
      if (bound) fields(review, "version", "model", "verdicts");
      privateReview.put("reviewVersion", version);
      for (var verdict : review.path("verdicts")) {
        String id = text(verdict, "questionId", 180);
        String issue = text(verdict, "issue", 32);
        StudyException.require(Set.of("none", "uncertain", "ungrounded", "ambiguous_choice",
            "trivial_reasoning", "spoils_answer", "unrelated_distractor", "repeats_recent").contains(issue));
        if (bound) {
          fields(verdict, "questionId", "part", "order", "issue", "evidence", "answerCue", "revisedJudgment");
          var question = questions.get(part(verdict) + "/" + id);
          StudyException.require(question != null && positive(verdict, "order") == question.path("order").asInt());
        }
        var finding = new ReviewVerdict(issue, text(verdict, "evidence", 1000),
            bound ? text(verdict, "answerCue", 700) : null,
            bound ? text(verdict, "revisedJudgment", 1000) : null);
        StudyException.require(reviewed.put(id, finding) == null);
      }
      receipt.putObject("independentReview").put("version", review.path("version").asString())
          .put("model", text(review, "model", 180)).put("provider", "codex_cli")
          .put("humanApproval", false);
    } else receipt.put("independentReview", "not_run");
    var items = receipt.putArray("questions");
    var issues = receipt.putArray("issues");
    var previous = new ArrayList<>(recent);
    var times = new TreeMap<String, Double>();
    var refs = new HashMap<String, String>();
    plan.path("blueprint").path("testedConcepts").properties().forEach(c ->
        c.getValue().path("sourcePageRefs").forEach(ref -> refs.put(ref.path("excerptId").asString(), c.getKey())));
    for (JsonNode k : output.path("keys")) {
      String part = part(k), id = k.path("questionId").asString();
      JsonNode q = questions.get(part + "/" + id);
      var item = items.addObject().put("part", part).put("order", q.path("order").asInt());
      var codes = questionIssues(q, k);
      if (!reviewed.isEmpty()) {
        var finding = reviewed.get(id);
        StudyException.require(finding != null);
        String issue = finding.issue();
        item.put("independentReview", issue);
        var diagnostic = privateReview.withArrayProperty("questions").addObject()
            .put("part", part).put("order", q.path("order").asInt()).put("questionId", id)
            .put("issue", issue).put("evidence", finding.evidence());
        if (finding.answerCue() != null) diagnostic.put("answerCue", finding.answerCue());
        if (finding.revisedJudgment() != null) diagnostic.put("revisedJudgment", finding.revisedJudgment());
        if (issue.equals("uncertain"))
          receipt.withArrayProperty("warnings").add(part + " " + q.path("order").asInt() + "번 · 독립 검토에서 판단 보류");
        else if (!issue.equals("none")) {
          String code = "REVIEW_" + issue.toUpperCase(Locale.ROOT);
          codes.add(code);
          diagnostic.put("code", code);
        }
      }
      var slot = plan.path("blueprint").path("slots").path(part).path(q.path("order").asInt() - 1);
      var concepts = new TreeSet<String>();
      var pageRefs = item.putArray("pageRefs");
      for (var citation : k.path("citations")) {
        String excerptId = citation.path("excerptId").asString();
        if (refs.containsKey(excerptId)) concepts.add(refs.get(excerptId));
        plan.path("passages").valueStream()
            .filter(p -> p.path("id").asString().equals(excerptId))
            .findFirst().ifPresent(p -> pageRefs.add(citationLabel(p)));
      }
      if (!concepts.contains(slot.path("conceptId").asString())) codes.add("CONCEPT_COVERAGE");
      var actual = item.putArray("conceptIds");
      concepts.forEach(actual::add);

      String prompt = q.path("prompt").asString();
      if (previous.stream().anyMatch(old -> repeats(old, prompt))) codes.add("SEMANTIC_DUPLICATION");
      previous.add(prompt);
      double minutes = estimate(q, k);
      times.merge(part, minutes, Double::sum);
      item.put("estimatedMinutes", minutes).put("checks", codes.isEmpty() ? "pass" : "review");
      var itemIssues = item.putArray("issues");
      for (String code : codes) {
        itemIssues.add(code);
        if (issues.valueStream().noneMatch(n -> n.asString().equals(code))) issues.add(code);
      }
    }
    var durations = receipt.putObject("estimatedMinutes");
    times.forEach((part, minutes) -> {
      durations.put(part, Math.round(minutes * 10) / 10.0);
      int target = plan.path("minutes").path(part).asInt();
      if (minutes < target * 0.67 || minutes > target * 1.6)
        receipt.withArrayProperty("warnings").add(part + " 예상 풀이 시간 " + Math.round(minutes) + "분 · 목표 " + target + "분");
    });
    var followUps = output.path("followUps");
    if (!followUps.isArray() || followUps.size() != 10 || anyShort(followUps, 8) || !distinct(followUps))
      issues.add("DAILY_REFLECTION_DIVERSITY");
    receipt.put("result", issues.isEmpty() ? "needs_owner_review" : "quality_review_required");
    if (!issues.isEmpty()) throw new Rejected(receipt, privateReview);
    return receipt;
  }

  private static double estimate(JsonNode q, JsonNode k) {
    int reading = q.path("prompt").asString().length() + q.path("context").asString("").length();
    for (JsonNode option : q.path("options")) reading += option.path("text").asString().length();
    int moves = Math.min(3, k.path("reasoningMoves").size());
    double readMinutes = reading / 430.0;
    return switch (q.path("kind").asString()) {
      case "single_choice", "multiple_choice", "true_false" -> readMinutes + moves * 0.45;
      case "short_answer" -> readMinutes + moves * 0.85;
      case "essay" -> readMinutes + moves * 1.45 + Math.min(5, k.path("rubric").size()) * 0.45;
      default -> readMinutes + moves * 2.0 + Math.min(6, k.path("rubric").size()) * 1.05;
    };
  }

  private StudyQuality() {}
}
