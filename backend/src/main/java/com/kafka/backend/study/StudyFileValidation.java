package com.kafka.backend.study;

import static com.kafka.backend.study.StudyException.*;

import com.kafka.backend.shareddesk.storage.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.io.IOUtils;

/** Format screening only, not malware certification. Private original bytes are attachment-only. */
final class StudyFileValidation {
  static void inspect(Path path, StudyAsset asset, StudyWorkbook book) throws IOException {
    try (InputStream in = Files.newInputStream(path)) {
      FilePolicy.verify(
          in, new FilePolicy.Claim(asset.displayName, asset.sizeBytes, asset.sha256, asset.mime));
    }
    if (asset.mime.equals("application/pdf")) {
      byte[] tail;
      try (var file = new RandomAccessFile(path.toFile(), "r")) {
        file.seek(Math.max(0, file.length() - 1024));
        tail = new byte[(int) Math.min(1024, file.length())];
        file.readFully(tail);
      }
      require(new String(tail, StandardCharsets.ISO_8859_1).stripTrailing().endsWith("%%EOF"));
      try (var pdf = Loader.loadPDF(path.toFile(), IOUtils.createTempFileOnlyStreamCache())) {
        require(!pdf.isEncrypted() && pdf.getNumberOfPages() > 0 && pdf.getNumberOfPages() <= 5000);
        // Reject executable/embedded content, including nested action dictionaries.
        Set<COSBase> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Deque<COSBase> queue = new ArrayDeque<>();
        queue.add(pdf.getDocumentCatalog().getCOSObject());
        int count = 0;
        Set<String> forbidden =
            Set.of(
                "JS",
                "JavaScript",
                "OpenAction",
                "AA",
                "EmbeddedFiles",
                "EF",
                "Launch",
                "RichMedia",
                "XFA",
                "SubmitForm",
                "ImportData");
        while (!queue.isEmpty()) {
          COSBase value = queue.remove();
          if (!visited.add(value)) continue;
          require(++count <= 200000);
          if (value instanceof COSObject object) {
            if (object.getObject() != null) queue.add(object.getObject());
          } else if (value instanceof COSDictionary dictionary) {
            for (COSName key : dictionary.keySet()) {
              require(!forbidden.contains(key.getName()));
              COSBase child = dictionary.getItem(key);
              if (child instanceof COSName name) require(!forbidden.contains(name.getName()));
              if (child != null) queue.add(child);
            }
          } else if (value instanceof COSArray array)
            for (COSBase child : array) if (child != null) queue.add(child);
        }
        if (Set.of("question", "answer").contains(asset.purpose)) {
          var info = pdf.getDocumentInformation();
          require(
              book != null
                  && book.workbookId.equals(info.getCustomMetadataValue("StudyWorkbookId"))
                  && String.valueOf(book.workbookVersion)
                      .equals(info.getCustomMetadataValue("StudyWorkbookVersion"))
                  && asset.purpose.equals(info.getCustomMetadataValue("StudyDocumentKind")));
        }
      }
    } else {
      try (var input = ImageIO.createImageInputStream(path.toFile())) {
        var readers = ImageIO.getImageReaders(input);
        require(readers.hasNext());
        var reader = readers.next();
        try {
          reader.setInput(input, true, true);
          long width = reader.getWidth(0), height = reader.getHeight(0);
          require(width > 0 && height > 0 && width * height <= 40000000);
          require(reader.read(0) != null);
        } finally {
          reader.dispose();
        }
      }
      // A valid terminal marker also rejects common silent ImageIO truncation recovery.
      try (var file = new RandomAccessFile(path.toFile(), "r")) {
        if (asset.mime.equals("image/jpeg")) {
          require(file.length() > 4);
          file.seek(file.length() - 2);
          require(file.readUnsignedShort() == 0xffd9);
        } else {
          require(file.length() > 20);
          file.seek(file.length() - 12);
          require(
              file.readInt() == 0 && file.readInt() == 0x49454e44 && file.readInt() == 0xae426082);
        }
      }
    }
  }

  private StudyFileValidation() {}
}
