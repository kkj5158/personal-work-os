package com.kafka.backend.common;

import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfigurationSource;
import static org.assertj.core.api.Assertions.assertThat;

class AttentionCorsTest {
    @Test void browserConditionalSnapshotsCanReadEtagsWithoutWideningOrigins() throws Exception {
        for (Object config : new Object[]{new DevSecurityConfig(), new ProdSecurityConfig("https://issuer.example/jwks","https://issuer.example",java.util.List.of("https://approved.example"))}) {
            ReflectionTestUtils.setField(config,"allowedOrigins",java.util.List.of("https://approved.example"));
            Method factory=config.getClass().getDeclaredMethod("corsConfigurationSource");factory.setAccessible(true);
            var cors=((CorsConfigurationSource)factory.invoke(config)).getCorsConfiguration(new MockHttpServletRequest("GET","/api/workflow/attention/snapshot"));
            assertThat(cors.getExposedHeaders()).containsExactly("ETag");
            assertThat(cors.checkOrigin("https://approved.example")).isEqualTo("https://approved.example");
            assertThat(cors.checkOrigin("https://unapproved.example")).isNull();
        }
    }
}
