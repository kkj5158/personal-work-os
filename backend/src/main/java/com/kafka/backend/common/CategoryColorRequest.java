package com.kafka.backend.common;

/**
 * color: '#rrggbb', or null to reset (root → generated color, child → inherit).
 * legacyImport: one-time upload of a pre-V65 browser-local override; applied
 * only while the stored color is still generated, never over an owner edit.
 */
public record CategoryColorRequest(String color, Boolean legacyImport) {
}
