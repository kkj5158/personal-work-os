package com.kafka.backend.log;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.env.MockEnvironment;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

@EnabledIfEnvironmentVariable(named = "LOG_CLEANUP_OWNER", matches = "[a-f0-9-]{36}")
class LogProviderCleanupTest {
  @Test
  void removeOnlyExactSyntheticLogKeys() throws Exception {
    var env = new MockEnvironment();
    System.getenv()
        .forEach((key, value) -> {
          if (key.startsWith("SHARED_DESK_STORAGE_")) env.setProperty(key, value);
        });
    env.setProperty("app.db-environment", "DEV");
    env.setProperty("LOG_STORAGE_ENABLED", "true");
    UUID owner = UUID.fromString(System.getenv("LOG_CLEANUP_OWNER"));
    var keys = new ObjectMapper().readTree(System.getenv("LOG_CLEANUP_KEYS"));
    if (!keys.isArray() || keys.size() > 50)
      throw new IllegalStateException("Cleanup manifest bound");
    String nonce = System.getenv("LOG_CLEANUP_NONCE");
    Path acknowledgement =
        System.getenv("LOG_CLEANUP_ACK_FILE") == null
            ? null
            : Path.of(System.getenv("LOG_CLEANUP_ACK_FILE"));
    if ((nonce == null) != (acknowledgement == null))
      throw new IllegalStateException("Cleanup acknowledgement required");
    int absent = 0;
    try (var storage = new LogStorage(env);
        var client =
            S3Client.builder()
                .endpointOverride(
                    URI.create(env.getRequiredProperty("SHARED_DESK_STORAGE_ENDPOINT")))
                .region(Region.of(env.getRequiredProperty("SHARED_DESK_STORAGE_REGION")))
                .credentialsProvider(
                    StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(
                            env.getRequiredProperty("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),
                            env.getRequiredProperty("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"))))
                .serviceConfiguration(
                    S3Configuration.builder()
                        .pathStyleAccessEnabled(
                            env.getProperty("SHARED_DESK_STORAGE_PATH_STYLE", Boolean.class, false))
                        .build())
                .overrideConfiguration(
                    software.amazon.awssdk.core.client.config.ClientOverrideConfiguration.builder()
                        .apiCallTimeout(Duration.ofSeconds(45))
                        .apiCallAttemptTimeout(Duration.ofSeconds(20))
                        .build())
                .build()) {
      if (!storage.objects.enabled()) throw new IllegalStateException("DEV storage unavailable");
      for (var pair : keys)
        for (String name : List.of("staging", "final")) {
          String key = pair.path(name).asText();
          if (!key.matches("log/dev/" + owner + "/(staging|final)/[a-f0-9-]{36}"))
            throw new IllegalStateException("Synthetic cleanup scope mismatch");
          storage.objects.delete(owner, key);
          try {
            client.headObject(
                HeadObjectRequest.builder()
                    .bucket(env.getRequiredProperty("SHARED_DESK_STORAGE_BUCKET"))
                    .key(key)
                    .build());
            throw new IllegalStateException("Cleanup object remains");
          } catch (S3Exception missing) {
            if (missing.statusCode() != 404)
              throw new IllegalStateException("Cleanup absence check failed");
          }
          absent++;
        }
    }
    if (acknowledgement != null) {
      var digest =
          HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(
                          System.getenv("LOG_CLEANUP_KEYS")
                              .getBytes(java.nio.charset.StandardCharsets.UTF_8)));
      Files.writeString(
          acknowledgement,
          new ObjectMapper()
              .writeValueAsString(
                  Map.of(
                      "owner",
                      owner.toString(),
                      "nonce",
                      nonce,
                      "inputSha256",
                      digest,
                      "absentCount",
                      absent,
                      "checkedAt",
                      Instant.now().toString(),
                      "status",
                      "PASS")));
    }
  }
}
