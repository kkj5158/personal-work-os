package com.kafka.backend.log;

import com.kafka.backend.shareddesk.storage.*;
import java.net.URI;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Same private provider; keys are log/{environment}/{owner}, never Shared Desk keys. */
@Component
class LogStorage implements AutoCloseable {
  final ObjectStorage objects;

  @org.springframework.beans.factory.annotation.Autowired
  LogStorage(Environment env) {
    ObjectStorage storage = new DisabledObjectStorage();
    if (env.getProperty(
        "LOG_STORAGE_ENABLED",
        Boolean.class,
        env.getProperty("SHARED_DESK_STORAGE_ENABLED", Boolean.class, false))) {
      try {
        String scope = env.getRequiredProperty("SHARED_DESK_STORAGE_ENVIRONMENT");
        if (!scope.equals(env.getProperty("app.db-environment", "")))
          throw new IllegalArgumentException();
        storage =
            new S3ObjectStorage(
                new StorageSettings(
                    scope,
                    URI.create(env.getRequiredProperty("SHARED_DESK_STORAGE_ENDPOINT")),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_REGION"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_BUCKET"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"),
                    env.getProperty("SHARED_DESK_STORAGE_PATH_STYLE", Boolean.class, false)),
                "log");
      } catch (IllegalArgumentException | IllegalStateException unavailable) {
        storage = new DisabledObjectStorage();
      }
    }
    objects = storage;
  }

  LogStorage(ObjectStorage objects) {
    this.objects = objects;
  }

  @jakarta.annotation.PreDestroy
  public void close() {
    objects.close();
  }
}
