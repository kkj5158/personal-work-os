package com.kafka.backend.study;

import static org.assertj.core.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class StudyFileValidationTest {
  @TempDir Path dir;

  StudyAsset asset(Path file, String name, String mime) throws Exception {
    byte[] bytes = Files.readAllBytes(file);
    StudyAsset a = new StudyAsset();
    a.displayName = name;
    a.mime = mime;
    a.sizeBytes = bytes.length;
    a.sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    a.purpose = "handwritten";
    return a;
  }

  @Test
  void pngAndJpegBytesValidateAndTruncatedOrSpoofedFilesReject() throws Exception {
    for (String format : List.of("png", "jpg")) {
      Path file = dir.resolve("valid." + format);
      assertThat(
              ImageIO.write(
                  new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), format, file.toFile()))
          .isTrue();
      String mime = format.equals("png") ? "image/png" : "image/jpeg";
      StudyFileValidation.inspect(file, asset(file, file.getFileName().toString(), mime), null);
      byte[] bytes = Files.readAllBytes(file);
      Files.write(file, Arrays.copyOf(bytes, bytes.length - 4));
      assertThatThrownBy(
              () ->
                  StudyFileValidation.inspect(
                      file, asset(file, file.getFileName().toString(), mime), null))
          .isInstanceOf(Exception.class);
    }
    Path fake = dir.resolve("fake.pdf");
    Files.writeString(fake, "<html>active content</html>");
    assertThatThrownBy(
            () ->
                StudyFileValidation.inspect(fake, asset(fake, "fake.pdf", "application/pdf"), null))
        .isInstanceOf(Exception.class);
  }

  @Test
  void activePdfAndDigestMismatchAreRejected() throws Exception {
    Path file = dir.resolve("active.pdf");
    try (var pdf = new PDDocument()) {
      pdf.addPage(new PDPage());
      pdf.getDocumentCatalog().setOpenAction(new PDActionJavaScript("app.alert('test')"));
      pdf.save(file.toFile());
    }
    assertThatThrownBy(
            () ->
                StudyFileValidation.inspect(
                    file, asset(file, "active.pdf", "application/pdf"), null))
        .isInstanceOf(StudyException.class);
    StudyAsset a = asset(file, "active.pdf", "application/pdf");
    a.sha256 = "0".repeat(64);
    assertThatThrownBy(() -> StudyFileValidation.inspect(file, a, null))
        .isInstanceOf(Exception.class);
  }
}
