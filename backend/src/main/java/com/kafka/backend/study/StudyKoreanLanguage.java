package com.kafka.backend.study;

import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Conservative Korean-language gate for newly generated learner-facing text.
 * Verbatim textbook excerpts, code and approved English Golden fixtures are excluded.
 */
final class StudyKoreanLanguage {
  private static final Pattern CODE_AND_URL = Pattern.compile(
      "(?s)\\x60{3}.*?\\x60{3}|\\x60[^\\x60]*\\x60|https?://\\S+");
  private static final Pattern TECHNICAL_ID = Pattern.compile(
      "(?i)(?<!\\w)(?:[A-Za-z_$][\\w$]*[./_:#]){1,}[A-Za-z_$][\\w$.-]*(?!\\w)");
  private static final Pattern ACRONYM = Pattern.compile("\\b[A-Z][A-Z0-9]{1,12}\\b");
  private static final Pattern ENGLISH_WORD = Pattern.compile("[A-Za-z]{2,}");

  private static final Pattern SHORT_ENGLISH = Pattern.compile(
      "(?i)\\b(?:yes|no|true|false|correct|incorrect|always|never|choose|check|use|compare|because|retry|try|restart|add|remove|read|only|skip|both|neither|the|what|why|how|which|is|are|does|do|should|must)\\b");

  static boolean hasEnglishLearnerProse(JsonNode question, JsonNode key) {
    for (String field : new String[]{"prompt", "context", "guidance"})
      if (englishOutsideCitations(question.path(field).asString(""), key)) return true;
    for (var option : question.path("options"))
      if (englishOutsideCitations(option.path("text").asString(""), key)) return true;

    for (String field : new String[]{"model", "explanation", "feedback"})
      if (englishOutsideCitations(key.path(field).asString(""), key)) return true;
    for (var hint : key.path("hints"))
      if (englishOutsideCitations(hint.asString(""), key)) return true;
    for (var criterion : key.path("rubric"))
      if (englishOutsideCitations(criterion.asString(""), key)) return true;
    for (var reason : key.path("incorrectReasons").properties())
      if (englishOutsideCitations(reason.getValue().asString(""), key)) return true;
    // Choice IDs, source citations and exact text quotes are not translated.
    return false;
  }

  private static boolean englishOutsideCitations(String value, JsonNode key) {
    for (var citation : key.path("citations")) {
      String quote=citation.path("quote").asString("");
      if (!quote.isBlank()) value=value.replace(quote, " ");
    }
    return englishDominant(value);
  }

  static boolean hasEnglishFollowUps(JsonNode assembly) {
    for (var question : assembly.path("followUps"))
      if (englishDominant(question.asString(""))) return true;
    return false;
  }

  /**
   * Detect clearly English-dominant natural-language prose, not technical
   * vocabulary embedded in Korean. Ambiguous cases remain for semantic review.
   */
  static boolean englishDominant(String raw) {
    if (raw == null || raw.isBlank()) return false;
    String prose = CODE_AND_URL.matcher(raw).replaceAll(" ");
    prose = TECHNICAL_ID.matcher(prose).replaceAll(" ");
    boolean shortEnglish = SHORT_ENGLISH.matcher(prose).find();
    prose = ACRONYM.matcher(prose).replaceAll(" ");
    int hangul = 0, latin = 0;
    for (int i = 0; i < prose.length(); i++) {
      char c = prose.charAt(i);
      if (c >= '\uAC00' && c <= '\uD7A3') hangul++;
      else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) latin++;
    }
    long englishWords = ENGLISH_WORD.matcher(prose).results().count();
    if (hangul == 0 && shortEnglish) return true;
    return (hangul == 0 && englishWords >= 2) || latin >= 24 && englishWords >= 4
        && (hangul < 3 || (latin >= 80 && hangul * 6 < latin));
  }

  private StudyKoreanLanguage() {}
}
