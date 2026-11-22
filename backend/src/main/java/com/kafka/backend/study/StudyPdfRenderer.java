package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.*;

import java.io.*;
import java.time.*;
import java.util.*;
import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import tools.jackson.databind.*;

/** Deterministic A4 layout. Font binaries are licensed build resources, never model outputs. */
final class StudyPdfRenderer implements AutoCloseable {
  final PDDocument doc = new PDDocument();
  final PDType0Font font;
  PDPageContentStream stream;
  float y;
  int pages;
  boolean privateDraft;
  String rendererVersion = StudyEngineRules.VERSION;
  static final float LEFT = 46, WIDTH = 503, BOTTOM = 50, SIZE = 10, LINE = 16;

  StudyPdfRenderer(InputStream source) throws IOException {
    font = PDType0Font.load(doc, source, true);
  }

  void page() throws IOException {
    if (stream != null) {
      footer();
      stream.close();
    }
    if (++pages > 200) throw new IOException("PDF_PAGE_LIMIT");
    var p = new PDPage(PDRectangle.A4);
    doc.addPage(p);
    stream = new PDPageContentStream(doc, p);
    y = 790;
  }

  void footer() throws IOException {
    stream.beginText();
    stream.setFont(font, 9);
    stream.newLineAtOffset(LEFT, 30);
    stream.showText("STUDY  |  " + pages + "  |  " + rendererVersion);
    stream.endText();
  }

  void line(String s) throws IOException {
    if (stream == null || y < BOTTOM) page();
    stream.beginText();
    stream.setFont(font, SIZE);
    stream.newLineAtOffset(LEFT, y);
    stream.showText(s);
    stream.endText();
    y -= LINE;
  }

  void text(String text) throws IOException {
    for (String paragraph : text.replace("\t", "    ").split("\\R", -1)) {
      StringBuilder row = new StringBuilder();
      float width = 0;
      for (int point : paragraph.codePoints().toArray()) {
        if (Character.isISOControl(point)) continue;
        String ch = new String(Character.toChars(point));
        float w;
        try {
          w = font.getStringWidth(ch) / 1000 * SIZE;
        } catch (IllegalArgumentException unsupported) {
          // Compatibility glyphs such as circled list numbers retain their text meaning.
          // A genuinely missing character still fails the pair instead of becoming a blank box.
          String plain = java.text.Normalizer.normalize(ch, java.text.Normalizer.Form.NFKC);
          if (plain.equals(ch)) {
            if (!privateDraft) throw unsupported;
            plain = "[U+" + Integer.toHexString(point).toUpperCase(Locale.ROOT) + "]";
          }
          ch = plain;
          w = font.getStringWidth(ch) / 1000 * SIZE;
        }
        if (width + w > WIDTH && row.length() > 0) {
          line(row.toString());
          row.setLength(0);
          width = 0;
        }
        row.append(ch);
        width += w;
      }
      line(row.toString());
    }
  }

  void space(int rows) throws IOException {
    for (int i = 0; i < rows; i++) {
      if (y < BOTTOM) page();
      y -= LINE;
    }
  }

  byte[] build(JsonNode book, JsonNode keys, String kind) throws IOException {
    return build(book, keys, kind, null);
  }

  byte[] build(JsonNode book, JsonNode keys, String kind, JsonNode hints) throws IOException {
    var info = doc.getDocumentInformation();
    info.setTitle("STUDY " + book.path("date").asString() + " " + kind);
    if (hints != null) rendererVersion = StudyEngineRules.QUALITY_VERSION;
    info.setProducer(rendererVersion);
    if (hints != null) {
      info.setCustomMetadataValue("StudyWorkbookId", book.path("id").asString());
      info.setCustomMetadataValue("StudyWorkbookVersion", book.path("version").asString());
      info.setCustomMetadataValue("StudyDocumentKind", kind);
      info.setCustomMetadataValue("StudyContentDigest", contentDigest(book, keys, hints));
    } else {
    for (var e :
        Map.of(
                "StudyWorkbookId",
                book.path("id").asString(),
                "StudyWorkbookVersion",
                book.path("version").asString(),
                "StudyDocumentKind",
                kind)
            .entrySet()) info.setCustomMetadataValue(e.getKey(), e.getValue());
    }
    var date =
        GregorianCalendar.from(
            LocalDate.parse(book.path("date").asString()).atStartOfDay(ZoneOffset.UTC));
    info.setCreationDate(date);
    info.setModificationDate(date);
    var ids = new COSArray();
    String digest =
        StudyEngineRules.hash(book.toString() + keys.toString() + kind
            + (hints == null ? StudyEngineRules.VERSION : hints.toString() + StudyEngineRules.QUALITY_VERSION));
    ids.add(new COSString(digest));
    ids.add(new COSString(digest));
    doc.getDocument().setDocumentID(ids);
    page();
    text("STUDY · " + book.path("date").asString() + " · v" + book.path("version").asInt());
    if (privateDraft) text("소유자 검토 초안 · 글꼴에 없는 문자는 유니코드 번호로 표시합니다. 원문은 자료 보기에서 확인하세요.");
    text(kind.equals("question") ? "학습 문제집 · 이름: __________________" : "정답·해설 · 소유자 명시적 검토용");
    text(book.path("topic").asString());
    space(1);
    for (String part : List.of("required", "extension")) {
      if (!part.equals("required")) page();
      text(part.equals("required") ? "필수 학습 · 약 15분" : "선택 확장 · 추가 약 30분");
      for (JsonNode q : book.path(part)) {
        if (y < 160) page();
        text(
            q.path("order").asInt()
                + ". ["
                + q.path("kind").asString()
                + "] "
                + q.path("prompt").asString());
        if (q.has("context")) text(q.path("context").asString());
        for (JsonNode o : q.path("options"))
          text("  " + o.path("id").asString() + ") " + o.path("text").asString());
        text(
            "출처: "
                + (hints == null ? q.path("source").path("materialId").asString() + " · " : "")
                + q.path("source").path("section").asString());
        if (q.has("guidance")) text(q.path("guidance").asString());
        if (kind.equals("question"))
          space(
              q.path("kind").asString().endsWith("choice")
                      || q.path("kind").asString().equals("true_false")
                  ? 3
                  : 10);
        else
          for (JsonNode key : keys)
            if (key.path("binding").path("part").asString().equals(part)
                && key.path("binding").path("questionId").equals(q.path("id"))) {
              text("정답·모범 답안: " + key.path("model").asString());
              text("해설: " + key.path("explanation").asString());
              key.path("incorrectReasons")
                  .properties()
                  .forEach(
                      e -> {
                        try {
                          text("오답 " + e.getKey() + ": " + e.getValue().asString());
                        } catch (IOException x) {
                          throw new UncheckedIOException(x);
                        }
                      });
              for (JsonNode r : key.path("rubric")) text("평가 기준: " + r.asString());
              for (JsonNode citation : key.path("citations"))
                text("근거 · " + citation.path("label").asString() + " · " + citation.path("quote").asString());
              if (hints == null) reflections(key.path("followUp"));
              if (hints == null || y - 2 * LINE >= BOTTOM) space(2);
            }
      }
    }
    if (hints != null && kind.equals("question")) {
      page();
      text("선택 부록 · 단계별 힌트");
      text("막힌 문항의 1단계부터 필요한 만큼 참고하세요.");
      for (String part : List.of("required", "extension")) {
        space(1);
        text(part.equals("required") ? "필수 학습" : "선택 확장");
        for (JsonNode q : book.path(part)) {
          if (y < 160) page();
          int stage = 0;
          for (JsonNode hint : hints.path(part).path(q.path("id").asString()))
            text(q.path("order").asInt() + "번 · 힌트 " + (++stage) + "  " + hint.asString());
          space(1);
        }
      }
    }
    if (hints != null && kind.equals("answer")) {
      for (JsonNode key : keys)
        if (!key.path("followUp").isEmpty()) {
          if (y < 260) page();
          else space(2);
          reflections(key.path("followUp"));
          break;
        }
    }
    footer();
    stream.close();
    stream = null;
    var out = new ByteArrayOutputStream();
    doc.save(out);
    return out.toByteArray();
  }

  static String contentDigest(JsonNode book, JsonNode keys, JsonNode hints) {
    return StudyEngineRules.hash(book.toString() + "\\n" + keys + "\\n" + hints);
  }

  private void reflections(JsonNode questions) throws IOException {
    text("AI에게 더 물어볼 질문 (선택)");
    int index = 0;
    for (JsonNode question : questions) text((++index) + ") " + question.asString());
  }

  @Override
  public void close() throws IOException {
    if (stream != null) stream.close();
    doc.close();
  }
}
