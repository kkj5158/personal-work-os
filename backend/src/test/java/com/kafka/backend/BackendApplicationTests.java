package com.kafka.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

// This smoke test loads the real DEV datasource. Schema migration is an explicit,
// serialized operation; running the default unit suite must never apply migrations.
@SpringBootTest(properties = {"spring.flyway.enabled=false", "app.absence-backfill-cron=-"})
@ActiveProfiles("dev")
class BackendApplicationTests {

    @Test
    void contextLoads() {
    }

}
