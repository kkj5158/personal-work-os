package com.kafka.backend.shareddesk.storage;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.*;
import java.util.*;
import static com.kafka.backend.shareddesk.storage.StorageFailure.Code.*;

/** Conservative attachment-only policy. This is format screening, not a malware scanner. */
public final class FilePolicy {
    public static final long MAX_BYTES = 100L * 1024 * 1024;
    private static final Map<String, Set<String>> TYPES = Map.of(
        "apk", Set.of("application/vnd.android.package-archive", "application/octet-stream"),
        "zip", Set.of("application/zip", "application/x-zip-compressed", "application/octet-stream"),
        "pdf", Set.of("application/pdf"), "md", Set.of("text/markdown", "text/plain"),
        "json", Set.of("application/json", "text/json"), "txt", Set.of("text/plain"),
        "png", Set.of("image/png"), "jpg", Set.of("image/jpeg"),
        "jpeg", Set.of("image/jpeg"), "webp", Set.of("image/webp"));

    public record Claim(String displayName, long sizeBytes, String sha256, String claimedMime) {
        public Claim {
            displayName = safeName(displayName);
            if (sizeBytes < 1 || sizeBytes > MAX_BYTES || sha256 == null || !sha256.matches("[a-fA-F0-9]{64}"))
                throw new StorageFailure(INVALID_FILE);
            sha256 = sha256.toLowerCase(Locale.ROOT);
            if (claimedMime == null) throw new StorageFailure(INVALID_FILE);
            claimedMime = claimedMime.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
            if (!TYPES.getOrDefault(extension(displayName), Set.of()).contains(claimedMime))
                throw new StorageFailure(TYPE_MISMATCH);
        }
        @Override public String toString() { return "FileClaim[redacted]"; }
    }
    public record Verified(long sizeBytes, String sha256, String detectedMime) {}

    public static String safeName(String name) {
        if (name == null || name.isBlank() || name.length() > 180 || !name.equals(name.strip())
                || name.equals(".") || name.equals("..") || name.contains("/") || name.contains("\\")
                || name.endsWith(".") || name.indexOf(':') >= 0 || name.codePoints().anyMatch(c ->
                    Character.isISOControl(c) || Character.getType(c) == Character.FORMAT))
            throw new StorageFailure(INVALID_FILE);
        return name;
    }
    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 1 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
    /** Reads at most claimed length + 1 with a fixed 64 KiB buffer; never buffers an entire file. */
    public static Verified verify(InputStream input, Claim claim) throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        byte[] buffer = new byte[64 * 1024];
        ByteArrayOutputStream prefix = new ByteArrayOutputStream(4096);
        long total = 0;
        String ext = extension(claim.displayName());
        boolean text = Set.of("txt", "md", "json").contains(ext);
        Utf8 utf8 = text ? new Utf8() : null;
        for (;;) {
            int count = input.read(buffer, 0, (int)Math.min(buffer.length, claim.sizeBytes() - total + 1));
            if (count == -1) break;
            if (count == 0) continue;
            total += count;
            if (total > claim.sizeBytes() || total > MAX_BYTES) throw new StorageFailure(SIZE_MISMATCH);
            digest.update(buffer, 0, count);
            if (utf8 != null) utf8.accept(buffer, count);
            prefix.write(buffer, 0, Math.min(count, 4096 - prefix.size()));
        }
        if (total != claim.sizeBytes()) throw new StorageFailure(SIZE_MISMATCH);
        String actualHash = HexFormat.of().formatHex(digest.digest());
        if (!MessageDigest.isEqual(actualHash.getBytes(StandardCharsets.US_ASCII), claim.sha256().getBytes(StandardCharsets.US_ASCII)))
            throw new StorageFailure(DIGEST_MISMATCH);
        if (utf8 != null) utf8.finish();
        byte[] bytes = prefix.toByteArray();
        String detected = detect(ext, bytes);
        if (detected == null) throw new StorageFailure(TYPE_MISMATCH);
        return new Verified(total, actualHash, detected);
    }
    private static String detect(String ext, byte[] b) {
        return switch (ext) {
            case "zip", "apk" -> starts(b, 0x50,0x4b,0x03,0x04) || starts(b,0x50,0x4b,0x05,0x06)
                    ? (ext.equals("apk") ? "application/vnd.android.package-archive" : "application/zip") : null;
            case "pdf" -> starts(b,0x25,0x50,0x44,0x46,0x2d) ? "application/pdf" : null;
            case "png" -> starts(b,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a) ? "image/png" : null;
            case "jpg", "jpeg" -> starts(b,0xff,0xd8,0xff) ? "image/jpeg" : null;
            case "webp" -> b.length >= 12 && starts(b,0x52,0x49,0x46,0x46)
                    && b[8]=='W' && b[9]=='E' && b[10]=='B' && b[11]=='P' ? "image/webp" : null;
            case "txt", "md", "json" -> {
                String s = new String(b, StandardCharsets.UTF_8).replace("\uFEFF", "").stripLeading().toLowerCase(Locale.ROOT);
                if (s.startsWith("<!doctype") || s.startsWith("<html") || s.startsWith("<svg")
                    || s.startsWith("<?xml") || s.startsWith("<script") || s.startsWith("mz") || s.indexOf('\0') >= 0) yield null;
                if (ext.equals("json") && !s.startsWith("{") && !s.startsWith("[")) yield null;
                yield ext.equals("json") ? "application/json" : ext.equals("md") ? "text/markdown" : "text/plain";
            }
            default -> null;
        };
    }
    private static boolean starts(byte[] b, int... expected) {
        if (b.length < expected.length) return false;
        for (int i=0;i<expected.length;i++) if ((b[i]&255)!=expected[i]) return false;
        return true;
    }
    private static final class Utf8 {
        private final CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT);
        private final ByteBuffer pending = ByteBuffer.allocate(64 * 1024 + 4);
        private final java.nio.CharBuffer output = java.nio.CharBuffer.allocate(64 * 1024 + 4);
        void accept(byte[] bytes, int count) {
            for(int i=0;i<count;i++) if(bytes[i]==0) throw new StorageFailure(TYPE_MISMATCH);
            pending.put(bytes, 0, count).flip();
            output.clear();
            if (decoder.decode(pending, output, false).isError()) throw new StorageFailure(TYPE_MISMATCH);
            pending.compact();
        }
        void finish() {
            pending.flip();output.clear();
            if(decoder.decode(pending,output,true).isError() || decoder.flush(output).isError()) throw new StorageFailure(TYPE_MISMATCH);
        }
    }
    private FilePolicy() {}
}
