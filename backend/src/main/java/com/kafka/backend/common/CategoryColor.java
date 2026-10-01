package com.kafka.backend.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Server-persisted Calendar category color policy (see V66).
 *
 * Root categories always persist a color; children persist NULL to inherit
 * their root. A generated color depends only on the domain and normalized
 * name — never the environment-specific UUID or the sort order — and is
 * persisted at creation, so a later rename or reorder never recolors it.
 * {@link #initialColor} must stay identical to V66's SQL backfill.
 */
public final class CategoryColor {
    public static final List<String> PALETTE = List.of("#4b89dc", "#9674cf", "#48a78a", "#d5a344", "#d97991", "#679aa7");
    private static final Pattern HEX = Pattern.compile("^#[0-9a-f]{6}$");

    private CategoryColor() {}

    public static String initialColor(String domain, String name) {
        String key = domain + ":" + Normalizer.normalize(name, Normalizer.Form.NFC).strip().toLowerCase(Locale.ROOT);
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(key.getBytes(StandardCharsets.UTF_8));
            long head = ((digest[0] & 0xffL) << 24) | ((digest[1] & 0xffL) << 16) | ((digest[2] & 0xffL) << 8) | (digest[3] & 0xffL);
            return PALETTE.get((int) (head % PALETTE.size()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Lower-cased '#rrggbb', or an InvalidRequestException. */
    public static String normalize(String color) {
        String value = color == null ? "" : color.strip().toLowerCase(Locale.ROOT);
        if (!HEX.matcher(value).matches()) throw new InvalidRequestException("색상은 #rrggbb 형식이어야 합니다.");
        return value;
    }
}
