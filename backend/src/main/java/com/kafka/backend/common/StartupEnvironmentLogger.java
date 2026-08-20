package com.kafka.backend.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Logs which Spring profile and logical database environment (DEV/PROD)
 * the application started with. Must never log a URL, username, password,
 * token, or key — only the active profile name(s) and the app.db-environment
 * marker.
 */
@Component
public class StartupEnvironmentLogger {

    private static final Logger log = LoggerFactory.getLogger(StartupEnvironmentLogger.class);

    private final Environment environment;

    @Value("${app.db-environment:UNKNOWN}")
    private String dbEnvironment;

    public StartupEnvironmentLogger(Environment environment) {
        this.environment = environment;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logStartupEnvironment() {
        String[] activeProfiles = environment.getActiveProfiles();
        String profiles = activeProfiles.length == 0 ? "(none)" : String.join(",", activeProfiles);
        log.info("Application ready. active_profile={} db_environment={}", profiles, dbEnvironment);
    }
}
