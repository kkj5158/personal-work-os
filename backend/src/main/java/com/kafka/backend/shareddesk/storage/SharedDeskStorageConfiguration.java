package com.kafka.backend.shareddesk.storage;

import java.net.URI;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class SharedDeskStorageConfiguration {
    @Bean(destroyMethod="close")
    ObjectStorage sharedDeskObjectStorage(Environment env) {
        if (!env.getProperty("SHARED_DESK_STORAGE_ENABLED", Boolean.class, false)) return new DisabledObjectStorage();
        try {
            StorageSettings settings = new StorageSettings(
                env.getProperty("SHARED_DESK_STORAGE_ENVIRONMENT", env.getProperty("app.db-environment", "")),
                URI.create(env.getRequiredProperty("SHARED_DESK_STORAGE_ENDPOINT")),
                env.getRequiredProperty("SHARED_DESK_STORAGE_REGION"),
                env.getRequiredProperty("SHARED_DESK_STORAGE_BUCKET"),
                env.getRequiredProperty("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),
                env.getRequiredProperty("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"),
                env.getProperty("SHARED_DESK_STORAGE_PATH_STYLE", Boolean.class, false));
            return new S3ObjectStorage(settings);
        } catch (IllegalArgumentException | IllegalStateException invalid) {
            // No provider exception detail: endpoint/credential values may occur in SDK messages.
            return new DisabledObjectStorage();
        }
    }
}
