package com.kafka.backend.log;

import static org.assertj.core.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class LogImageValidationTest {
  static byte[] raster(String format) throws Exception {
    var output = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB), format, output);
    return output.toByteArray();
  }

  @Test
  void supportedRasterFormatsDecode() throws Exception {
    LogImageValidation.verify(raster("png"), "image/png");
    LogImageValidation.verify(raster("jpeg"), "image/jpeg");
    LogImageValidation.verify(
        java.util.Base64.getDecoder()
            .decode("UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQxYrUvP+BiOh/AAA="),
        "image/webp");
  }

  @Test
  void magicOnlyTruncatedAndMimeSpoofedImagesFail() throws Exception {
    byte[] png = raster("png"), jpg = raster("jpeg");
    for (byte[] invalid :
        new byte[][] {new byte[0], Arrays.copyOf(png, 8), Arrays.copyOf(png, png.length - 12)})
      assertThatThrownBy(() -> LogImageValidation.verify(invalid, "image/png"))
          .isInstanceOf(LogException.class);
    assertThatThrownBy(
            () -> LogImageValidation.verify(Arrays.copyOf(jpg, jpg.length - 2), "image/jpeg"))
        .isInstanceOf(LogException.class);
    assertThatThrownBy(() -> LogImageValidation.verify(png, "image/jpeg"))
        .isInstanceOf(LogException.class);
    byte[] damaged = png.clone();
    damaged[damaged.length - 20] ^= 0x7f;
    assertThatThrownBy(() -> LogImageValidation.verify(damaged, "image/png"))
        .isInstanceOf(LogException.class);
  }

  @Test
  void excessiveDimensionsRejectBeforeRasterAllocation() throws Exception {
    byte[] png = raster("png");
    ByteBuffer.wrap(png, 16, 8).putInt(100_000).putInt(100_000);
    var crc = new java.util.zip.CRC32();
    crc.update(png, 12, 17);
    ByteBuffer.wrap(png, 29, 4).putInt((int) crc.getValue());
    assertThatThrownBy(() -> LogImageValidation.verify(png, "image/png"))
        .isInstanceOfSatisfying(LogException.class, e -> assertThat(e.status).isEqualTo(422));
  }
}
