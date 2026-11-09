package com.kafka.backend.study;

import com.kafka.backend.shareddesk.storage.*;
import java.net.URI;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Same approved POS provider, separate study/{dev|prod}/{owner} namespace. No infrastructure
 * changes.
 */
@Component
class StudyStorage implements AutoCloseable {
  final ObjectStorage objects;

  StudyStorage(Environment env) {
    ObjectStorage candidate = new DisabledObjectStorage();
    if (env.getProperty("STUDY_STORAGE_ENABLED", Boolean.class, false))
      try {
        String scope = env.getProperty("SHARED_DESK_STORAGE_ENVIRONMENT", "");
        if (!scope.equals(env.getProperty("app.db-environment", "")))
          throw new IllegalArgumentException();
        candidate =
            new S3ObjectStorage(
                new StorageSettings(
                    scope,
                    URI.create(env.getRequiredProperty("SHARED_DESK_STORAGE_ENDPOINT")),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_REGION"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_BUCKET"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),
                    env.getRequiredProperty("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"),
                    env.getProperty("SHARED_DESK_STORAGE_PATH_STYLE", Boolean.class, false)),
                "study");
      } catch (IllegalArgumentException | IllegalStateException unavailable) {
        candidate = new DisabledObjectStorage();
      }
    objects = candidate;
  }

  @jakarta.annotation.PreDestroy
  public void close() {
    objects.close();
  }
}
