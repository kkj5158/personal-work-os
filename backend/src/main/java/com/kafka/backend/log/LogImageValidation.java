package com.kafka.backend.log;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;

/**
 * Decode before READY, with dimensions checked before allocating a raster. Originals stay private.
 */
final class LogImageValidation {
  static final long MAX_PIXELS = 40_000_000;
  static final int MAX_DIMENSION = 20_000;
  private static final Semaphore DECODER = new Semaphore(1, true);

  static void verify(byte[] bytes, String mime) {
    boolean acquired = false;
    try {
      acquired = DECODER.tryAcquire(15, TimeUnit.SECONDS);
      if (!acquired) throw LogService.error(429, "사진을 확인 중입니다. 잠시 후 다시 시도해주세요.");
      if (bytes.length == 0 || bytes.length > LogService.MAX_IMAGE_BYTES || !hasEnd(bytes, mime))
        throw invalid();
      if (mime.equals("image/png")) verifyPngChunks(bytes);
      try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
        var readers = ImageIO.getImageReaders(input);
        if (!readers.hasNext()) throw invalid();
        var reader = readers.next();
        try {
          reader.setInput(input, true, true);
          String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
          if (!(mime.equals("image/png") && format.equals("png")
              || mime.equals("image/jpeg") && (format.equals("jpeg") || format.equals("jpg"))
              || mime.equals("image/webp") && format.equals("webp"))) throw invalid();
          long width = reader.getWidth(0), height = reader.getHeight(0);
          if (width < 1
              || height < 1
              || width > MAX_DIMENSION
              || height > MAX_DIMENSION
              || width * height > MAX_PIXELS)
            throw LogService.error(422, "사진은 가로·세로 20,000픽셀, 전체 4천만 픽셀 이하만 지원합니다.");
          reader.addIIOReadWarningListener((source, warning) -> {
            throw invalid();
          });
          var raster = reader.read(0);
          if (raster == null) throw invalid();
          raster.flush();
        } finally {
          reader.dispose();
        }
      }
    } catch (LogException invalid) {
      throw invalid;
    } catch (IOException | RuntimeException invalid) {
      throw invalid();
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw LogService.error(503, "사진 확인이 중단되었습니다. 다시 시도해주세요.");
    } finally {
      if (acquired) DECODER.release();
    }
  }

  private static boolean hasEnd(byte[] b, String mime) {
    int n = b.length;
    return switch (mime) {
      case "image/jpeg" -> n > 4 && (b[n - 2] & 255) == 255 && (b[n - 1] & 255) == 217;
      case "image/png" ->
          n > 20
              && ByteBuffer.wrap(b, n - 12, 12).getInt() == 0
              && ByteBuffer.wrap(b, n - 8, 8).getLong() == 0x49454e44ae426082L;
      case "image/webp" ->
          n >= 20
              && Integer.toUnsignedLong(
                          ByteBuffer.wrap(b, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt())
                      + 8
                  == n;
      default -> false;
    };
  }

  private static void verifyPngChunks(byte[] b) {
    int offset = 8;
    while (offset < b.length) {
      if (b.length - offset < 12) throw invalid();
      long length = Integer.toUnsignedLong(ByteBuffer.wrap(b, offset, 4).getInt());
      if (length > b.length - offset - 12) throw invalid();
      var crc = new java.util.zip.CRC32();
      crc.update(b, offset + 4, (int) length + 4);
      long expected =
          Integer.toUnsignedLong(ByteBuffer.wrap(b, offset + 8 + (int) length, 4).getInt());
      if (crc.getValue() != expected) throw invalid();
      offset += (int) length + 12;
    }
    if (offset != b.length) throw invalid();
  }

  private static LogException invalid() {
    return LogService.error(422, "손상되었거나 지원하지 않는 사진입니다. PNG·JPEG·WebP 파일을 확인해주세요.");
  }

  private LogImageValidation() {}
}
