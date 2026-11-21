package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.hash;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/** Classifies text-layer pages without editing their quotation text or requesting OCR. */
final class StudySourceSelection {
  static final int MAX_PAGES = 2000;
  static final int BATCH = 128;
  static final int DAILY_LIMIT = 7;
  private static final Pattern BIBLIO = Pattern.compile(
      "(?i)\\b(?:ISBN(?:-1[03])?|all rights reserved|copyright)\\b|판권|발행일|저작권자");
  private static final Pattern LIST_ENTRY = Pattern.compile(
      "(?m)^.{3,110}(?:[.·…]{2,}\\s*|\\s{2,})\\d{1,4}\\s*$");
  private static final Pattern HEADING = Pattern.compile(
      "(?im)^\\s*((?:chapter|part|section)\\s+\\d+[.:\\s].{0,70}|(?:제\\s*)?\\d+\\s*장\\s+.{2,65}|\\d+\\.\\d+(?:\\.\\d+)?\\s+.{2,65})\\s*$");
  private static final Pattern TOC = Pattern.compile(
      "(?im)^\\s*(?:table of contents|contents|index|foreword|preface|about the author|머리말|들어가며|책을 펴내며|목\\s*차|차\\s*례|찾아보기|색인)\\s*$");

  record PageRange(int firstPage, int lastPage) {
    static final PageRange ALL = new PageRange(1, MAX_PAGES);
  }

  static String classify(String text) {
    if (StudyEngineIO.quality(text).equals("textless")) return "TEXTLESS";
    long entries = LIST_ENTRY.matcher(text).results().limit(4).count();
    if (entries >= 4 || TOC.matcher(text).find()) return "CONTENTS_OR_INDEX";
    if (BIBLIO.matcher(text).find()
        && (text.length() < 1200 || BIBLIO.matcher(text).results().limit(2).count() > 1))
      return "BIBLIOGRAPHIC";
    if (!StudyEngineIO.quality(text).equals("usable")
        || text.codePoints().filter(c -> c >= 0xe000 && c <= 0xf8ff || c == 0x25a1).count()
            > Math.max(4, text.length() / 40)) return "OCR_UNCERTAIN";
    long letters = text.codePoints().filter(Character::isLetter).count();
    long words = Arrays.stream(text.split("\\s+"))
        .filter(word -> word.codePoints().filter(Character::isLetter).count() >= 2).count();
    long proseLines = text.lines().filter(line -> line.codePoints().filter(Character::isLetter).count() >= 28).count();
    return letters >= 110 && words >= 14 && (proseLines >= 2 || text.matches("(?s).*\\S[.!?。].*"))
        ? "SUBSTANTIVE" : "TOO_LITTLE_PROSE";
  }

  static String heading(String text) {
    var match = HEADING.matcher(text);
    return match.find() ? match.group(1).strip() : "";
  }

  record Candidate(StudySourceExcerpt excerpt, String section, String conceptId) {}

  /** One representative passage per page, with the section inherited from the nearest heading. */
  static final class Inventory {
    final List<Candidate> candidates = new ArrayList<>();
    final Map<String, Integer> diagnostics = new TreeMap<>();
    private final Set<String> seen = new HashSet<>();
    private String heading = "";
    private int sectionPage = 1;

    void add(List<StudySourceExcerpt> page, PageRange range) {
      var first = page.getFirst();
      String text = String.join("", page.stream().map(e -> e.body).toList());
      String kind = classify(text);
      if (kind.equals("SUBSTANTIVE")) {
        String next = heading(text);
        if (!next.isBlank() && !next.equals(heading)) {
          heading = next;
          sectionPage = first.pageIndex;
        }
      }
      if (first.pageIndex < range.firstPage || first.pageIndex > range.lastPage) return;
      diagnostics.merge(kind, 1, Integer::sum);
      if (!kind.equals("SUBSTANTIVE")) return;
      String fingerprint = StudyEngineRules.normalized(text).replaceAll("\\d+", "");
      if (!seen.add(fingerprint)) {
        diagnostics.merge("REPEATED_PAGE", 1, Integer::sum);
        return;
      }
      var representative = page.stream()
          .filter(e -> e.quality.equals("usable") && classify(e.body).equals("SUBSTANTIVE"))
          .findFirst().orElse(null);
      if (representative == null) return;
      int neighborhood = Math.max(sectionPage, range.firstPage);
      int anchor = neighborhood + (first.pageIndex - neighborhood) / 2 * 2;
      candidates.add(new Candidate(representative, heading,
          hash(first.sourceHash + "/" + sectionPage + "/" + anchor).substring(0, 16)));
    }
  }

  static Inventory load(StudySourceExcerpts repository, UUID owner, UUID job, PageRange range) {
    var inventory = new Inventory();
    var page = new ArrayList<StudySourceExcerpt>();
    int cursorPage = 0, cursorOrdinal = 0;
    while (cursorPage <= range.lastPage) {
      var batch = repository.scan(owner, job, cursorPage, cursorOrdinal, range.lastPage, BATCH);
      if (batch.isEmpty()) break;
      for (var excerpt : batch) {
        if (!page.isEmpty() && page.getFirst().pageIndex != excerpt.pageIndex) {
          inventory.add(page, range);
          page.clear();
        }
        page.add(excerpt);
      }
      var last = batch.getLast();
      cursorPage = last.pageIndex;
      cursorOrdinal = last.ordinal;
      if (batch.size() < BATCH) break;
    }
    if (!page.isEmpty()) inventory.add(page, range);
    return inventory;
  }

  static List<Candidate> daily(List<Candidate> candidates, int day, int days, JsonNode goals) {
    int slot = (int) ((day + 0.5) * candidates.size() / days);
    var center = candidates.get(Math.min(slot, candidates.size() - 1));
    Set<String> interests = new HashSet<>();
    for (String term : goals.path("interests").asString("").toLowerCase(Locale.ROOT).split("[,\\s]+"))
      if (term.length() >= 3) interests.add(term);
    return candidates.stream()
        .filter(c -> c.excerpt.materialId.equals(center.excerpt.materialId))
        .sorted(Comparator.<Candidate>comparingInt(c -> {
          int distance = Math.abs(c.excerpt.pageIndex - center.excerpt.pageIndex);
          String body = (c.section + " " + c.excerpt.body).toLowerCase(Locale.ROOT);
          return distance * 3 + (c.section.equals(center.section) ? 0 : 2)
              - (interests.stream().anyMatch(body::contains) ? 2 : 0);
        }))
        .limit(DAILY_LIMIT)
        .sorted(Comparator.comparingInt(c -> c.excerpt.pageIndex))
        .toList();
  }

  private StudySourceSelection() {}
}
