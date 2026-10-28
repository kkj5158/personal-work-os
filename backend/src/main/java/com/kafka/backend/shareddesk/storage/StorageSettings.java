package com.kafka.backend.shareddesk.storage;

import java.net.URI;
import java.util.Locale;

/** Values belong to service-scoped Railway references. Never serialize or log this object. */
public record StorageSettings(String environment, URI endpoint, String region, String bucket,
                              String accessKeyId, String secretAccessKey, boolean pathStyle) {
    public StorageSettings {
        if (environment == null || !environment.matches("DEV|PROD") || endpoint == null
            || !"https".equalsIgnoreCase(endpoint.getScheme()) || endpoint.getHost() == null
            || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
            || !(endpoint.getPath().isEmpty() || endpoint.getPath().equals("/"))
            || region == null || !region.matches("[a-zA-Z0-9-]{1,50}")
            || bucket == null || !bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")
            || accessKeyId == null || accessKeyId.isBlank() || secretAccessKey == null || secretAccessKey.isBlank())
            throw new IllegalArgumentException("Invalid Shared Desk storage configuration");
        environment = environment.toLowerCase(Locale.ROOT);
    }
    @Override public String toString() { return "StorageSettings[redacted]"; }
}
