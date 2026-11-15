package com.kafka.backend.log;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.env.MockEnvironment;

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
    try (var storage = new LogStorage(env)) {
      if (!storage.objects.enabled()) throw new IllegalStateException("DEV storage unavailable");
      for (var pair : keys)
        for (String name : List.of("staging", "final")) {
          String key = pair.path(name).asText();
          if (!key.matches("log/dev/" + owner + "/(staging|final)/[a-f0-9-]{36}"))
            throw new IllegalStateException("Synthetic cleanup scope mismatch");
          storage.objects.delete(owner, key);
        }
    }
  }
}
