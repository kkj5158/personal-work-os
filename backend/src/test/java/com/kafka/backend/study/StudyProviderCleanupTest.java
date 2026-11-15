package com.kafka.backend.study;

import static org.assertj.core.api.Assertions.*;

import com.kafka.backend.shareddesk.storage.*;
import java.net.URI;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Exact run-owned namespace keys only. No account mutation, bucket scan, or infrastructure changes.
 */
@EnabledIfEnvironmentVariable(named = "STUDY_CLEANUP_OWNER", matches = "[0-9a-f-]{36}")
class StudyProviderCleanupTest {
  @Test
  void deleteOnlyRunOwnedSyntheticKeys() {
    assertThat(System.getenv("SHARED_DESK_STORAGE_ENVIRONMENT")).isEqualTo("DEV");
    UUID owner = UUID.fromString(System.getenv("STUDY_CLEANUP_OWNER"));
    var settings =
        new StorageSettings(
            "DEV",
            URI.create(env("SHARED_DESK_STORAGE_ENDPOINT")),
            env("SHARED_DESK_STORAGE_REGION"),
            env("SHARED_DESK_STORAGE_BUCKET"),
            env("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),
            env("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"),
            Boolean.parseBoolean(env("SHARED_DESK_STORAGE_PATH_STYLE")));
    int count = 0;
    try (var storage = new S3ObjectStorage(settings, "study")) {
      for (String key : env("STUDY_CLEANUP_KEYS").split("\\s+")) {
        if (key.isBlank()) continue;
        assertThat(key).startsWith("study/dev/" + owner + "/");
        try {
          storage.delete(owner, key);
          count++;
        } catch (Exception e) {
          throw new AssertionError(
              "Owned synthetic provider cleanup failed; provider details withheld");
        }
      }
    }
    System.out.println("STUDY_OWNED_PROVIDER_DELETE_ACKS=" + count);
  }

  static String env(String k) {
    return System.getenv().getOrDefault(k, "");
  }
}
