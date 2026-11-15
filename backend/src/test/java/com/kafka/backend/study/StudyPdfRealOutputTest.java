package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.*;
import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named = "STUDY_REAL_OUTPUT_TEST", matches = "true")
class StudyPdfRealOutputTest {
  @Test
  void realSyntheticModelOutputRendersBothPdfs() throws Exception {
    var input = JSON.readTree(Files.readString(Path.of("../.qa/study-v2/actual-generated.json")));
    for (String kind : java.util.List.of("question", "answer"))
      try (var font =
              StudyEngineIO.class.getResourceAsStream("/study-font/NanumGothic-Regular.ttf");
          var renderer = new StudyPdfRenderer(font)) {
        byte[] pdf = renderer.build(input.path("workbook"), input.path("answerKeys"), kind);
        assertThat(pdf.length).isGreaterThan(1000);
        Files.write(Path.of("../.qa/study-v2/synthetic-" + kind + ".pdf"), pdf);
      }
  }
}
