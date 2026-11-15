package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyValidation.*;
import static org.assertj.core.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.*;

class StudyEngineGroundingTest {
  static final String A = "00000000-0000-4000-8000-000000000001",
      B = "00000000-0000-4000-8000-000000000002";

  ObjectNode plan() {
    var p = JSON.createObjectNode();
    var passages = p.putArray("passages");
    passages
        .addObject()
        .put("id", A)
        .put("materialId", "primary")
        .put("text", "Primary source has grounded evidence.");
    passages
        .addObject()
        .put("id", B)
        .put("materialId", "secondary")
        .put("text", "Secondary source supports a synthesis.");
    p.putObject("questionFormat").putObject("required").put("true_false", 1);
    p.withObject("questionFormat").putObject("extension").put("essay", 1);
    p.putObject("minutes").put("required", 15).put("extension", 30);
    return p;
  }

  ObjectNode output() {
    var out = JSON.createObjectNode().put("topic", "Synthetic grounded synthesis");
    var keys = out.putArray("keys");
    for (String part : List.of("required", "extension")) {
      var q =
          out.putArray(part)
              .addObject()
              .put("id", part)
              .put("version", 1)
              .put("order", 1)
              .put("kind", part.equals("required") ? "true_false" : "essay")
              .put("responseSchema", part.equals("required") ? "boolean" : "text")
              .put("prompt", part + " Explain the grounded concept.");
      q.putObject("source").put("materialId", "primary").put("section", "PDF 1 / " + A);
      var k =
          keys.addObject()
              .put("part", part)
              .put("questionId", part)
              .put("model", "Synthetic model")
              .put("explanation", "Synthetic explanation");
      if (part.equals("required")) k.put("answer", false);
      else k.put("answer", "Synthetic text answer");
      k.putArray("rubric").add("Explain the cited concept.");
      var f = k.putArray("followUp");
      for (int i = 0; i < 10; i++) f.add("Optional follow-up " + i);
      k.putArray("citations")
          .addObject()
          .put("excerptId", A)
          .put("quote", "Primary source has grounded evidence.");
      k.withArray("citations")
          .addObject()
          .put("excerptId", B)
          .put("quote", "Secondary source supports a synthesis.");
    }
    out.putObject("provenance")
        .put("provider", "codex_cli")
        .put("model", "synthetic-boundary")
        .put("promptVersion", VERSION);
    return out;
  }

  @Test
  void primaryCitationAndVerifiedSecondarySourceCanSupportCrossBookSynthesis() {
    assertThat(validate(output(), plan(), new HashSet<>()).path("state").asString())
        .isEqualTo("needs_owner_review");
  }

  @Test
  void secondarySourceDoesNotReplaceTheQuestionsPrimaryBinding() {
    var n = output();
    n.withArray("keys").get(0).withArray("citations").remove(0);
    assertThatThrownBy(() -> validate(n, plan(), new HashSet<>()))
        .isInstanceOfSatisfying(
            StudyException.class, e -> assertThat(e.code).isEqualTo("PRIMARY_CITATION_REQUIRED"));
  }

  @Test
  void fabricatedSecondaryQuotationIsRejected() {
    var n = output();
    n.withArray("keys")
        .get(0)
        .withArray("citations")
        .get(1)
        .asObject()
        .put("quote", "A fabricated quote absent from the source.");
    assertThatThrownBy(() -> validate(n, plan(), new HashSet<>()))
        .isInstanceOfSatisfying(
            StudyException.class, e -> assertThat(e.code).isEqualTo("SOURCE_QUOTE_MISMATCH"));
  }

  @Test
  void nonexistentSecondaryExcerptIsRejected() {
    var n = output();
    n.withArray("keys")
        .get(0)
        .withArray("citations")
        .get(1)
        .asObject()
        .put("excerptId", UUID.randomUUID().toString());
    assertThatThrownBy(() -> validate(n, plan(), new HashSet<>()))
        .isInstanceOf(StudyException.class);
  }
}
